import { createServer } from "node:http";
import { once } from "node:events";
import { createHmac, randomUUID } from "node:crypto";
import { stripeVersion, stable } from "../../server/launch/fundraising.ts";

// An owned HTTP peer exercises the selected Stripe wire contract. It never
// contacts Stripe, collects a card or sends an email. Keys stay in this closure.
export async function createStripeFixture(runId: string) {
  const secret = randomUUID() + randomUUID(),
    key = `owned-${runId}`,
    account = `acct_owned_${runId}`;
  const sessions = new Map<string, any>(),
    payments = new Map<string, any>(),
    events = new Map<string, any>(),
    keys = new Map<string, { fingerprint: string; session: any }>();
  const operations: any[] = [];
  let mode = "normal",
    origin = "",
    browserAt: number | undefined;
  const id = (prefix: string) =>
    `${prefix}_${randomUUID().replaceAll("-", "")}`;
  const event = (sessionId: string, type: string, changes: any = {}) => {
    const result = {
      id: id("evt"),
      object: "event",
      account,
      api_version: stripeVersion,
      livemode: false,
      type,
      created: Math.floor(Date.now() / 1000),
      data: { object: structuredClone(sessions.get(sessionId)) },
      ...changes,
    };
    events.set(result.id, result);
    return result;
  };
  function complete(sessionId: string, options: any = {}) {
    const session = sessions.get(sessionId);
    if (!session) throw new Error("Unknown owned checkout");
    const at = options.at ?? Math.floor(Date.now() / 1000) * 1000;
    const state = options.state ?? "succeeded";
    if (!session.payment_intent) session.payment_intent = id("pi");
    const payment = {
      id: session.payment_intent,
      object: "payment_intent",
      amount: session.amount_total,
      amount_received: state === "succeeded" ? session.amount_total : 0,
      currency: session.currency,
      livemode: false,
      status: state,
      created: Math.floor((at - 86400000) / 1000),
      capture_method: "automatic",
      metadata: {
        checkout: session.client_reference_id,
        purpose: "fundraising-donation",
      },
      latest_charge: {
        id: id("ch"),
        object: "charge",
        payment_method_details: { type: "card" },
        payment_intent: session.payment_intent,
        status: state,
        paid: state === "succeeded",
        captured: state === "succeeded",
        amount: session.amount_total,
        amount_captured: state === "succeeded" ? session.amount_total : 0,
        amount_refunded: options.refunds ?? 0,
        currency: session.currency,
        livemode: false,
        created: Math.floor((at - 3600000) / 1000),
        balance_transaction: null as any,
      },
    };
    if (options.fee !== undefined)
      payment.latest_charge.balance_transaction = {
        id: id("txn"),
        object: "balance_transaction",
        source: payment.latest_charge.id,
        currency: "usd",
        amount: session.amount_total,
        fee: options.fee,
      };
    payments.set(payment.id, payment);
    session.payment_status = state === "succeeded" ? "paid" : "unpaid";
    session.status = "complete";
    if (state === "succeeded") {
      const success = {
        id: id("evt"),
        object: "event",
        account,
        api_version: stripeVersion,
        livemode: false,
        type: "payment_intent.succeeded",
        created: Math.floor(at / 1000),
        data: { object: structuredClone(payment) },
      };
      events.set(success.id, success);
    }
    return event(
      sessionId,
      state === "succeeded"
        ? "checkout.session.async_payment_succeeded"
        : state === "processing"
          ? "checkout.session.completed"
          : "checkout.session.async_payment_failed",
    );
  }
  async function deliver(value: any, webhook: string, options: any = {}) {
    const raw = options.raw ?? JSON.stringify(value),
      timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
    const signature =
      options.signature ??
      `t=${timestamp},v1=${createHmac("sha256", secret)
        .update(`${timestamp}.${options.signedRaw ?? raw}`)
        .digest("hex")}`;
    return fetch(webhook, {
      method: "POST",
      body: raw,
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": signature,
      },
      redirect: "error",
    });
  }
  const server = createServer((req, res) => {
    void (async () => {
      const target = new URL(req.url ?? "/", origin),
        json = (body: any, status = 200) => {
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(body));
        };
      if (target.pathname.startsWith("/owned/checkout/")) {
        const session = sessions.get(target.pathname.split("/").at(-1)!);
        if (!session) return json({ error: "Missing owned checkout" }, 404);
        if (req.method === "POST") {
          const value = complete(session.id, { at: browserAt });
          const webhook = new URL(
            "/api/fundraising?action=webhook",
            session.success_url,
          );
          if (webhook.hostname !== "127.0.0.1")
            throw new Error("Owned callback only");
          const result = await deliver(value, webhook.href);
          if (!result.ok)
            return json({ error: "Controlled confirmation is held" }, 409);
          res.writeHead(303, { Location: session.success_url });
          res.end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/html",
          "Cache-Control": "no-store",
        });
        res.end(
          `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Controlled Stripe checkout</title><main style="max-width:36rem;margin:3rem auto;padding:1rem;font-family:system-ui"><h1>Controlled Stripe checkout</h1><p>Unvalidated owned transport. No card, real payment or email.</p><p>Fundraising donation: $${(session.amount_total / 100).toFixed(2)} USD to adoption.is</p><form method="post"><button>Confirm controlled donation</button></form><p><a href="${session.cancel_url.replaceAll("&", "&amp;")}">Return without confirmation</a></p></main></html>`,
        );
        return;
      }
      if (
        req.headers.authorization !== `Bearer ${key}` ||
        req.headers["stripe-account"] !== account ||
        req.headers["stripe-version"] !== stripeVersion
      )
        return json({ error: "Owned Stripe scope denied" }, 403);
      if (mode === "redirect") {
        res.writeHead(307, {
          Location: "https://api.stripe.com/v1/checkout/sessions",
        });
        res.end();
        return;
      }
      if (
        target.pathname === "/v1/checkout/sessions" &&
        req.method === "POST"
      ) {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 16384) throw new Error("Oversized owned request");
        }
        const body = new URLSearchParams(raw),
          providerKey = String(req.headers["idempotency-key"] ?? "");
        operations.push({
          method: "POST",
          path: target.pathname,
          providerKey,
          body: Object.fromEntries(body),
        });
        const prior = keys.get(providerKey);
        if (!providerKey || (prior && prior.fingerprint !== raw))
          return json({ error: "idempotency_error" }, 409);
        let session = prior?.session;
        if (!session) {
          const sessionId = id("cs");
          session = {
            id: sessionId,
            object: "checkout.session",
            mode: body.get("mode"),
            client_reference_id: body.get("client_reference_id"),
            currency: body.get("line_items[0][price_data][currency]"),
            amount_total: Number(
              body.get("line_items[0][price_data][unit_amount]"),
            ),
            payment_status: "unpaid",
            status: "open",
            livemode: false,
            payment_intent: null,
            metadata: {
              purpose: body.get("metadata[purpose]"),
              nonprofit: body.get("metadata[nonprofit]"),
              origin: body.get("metadata[origin]"),
            },
            url: `${origin}/owned/checkout/${sessionId}`,
            success_url: body.get("success_url"),
            cancel_url: body.get("cancel_url"),
            created: Math.floor(Date.now() / 1000),
          };
          sessions.set(sessionId, session);
          keys.set(providerKey, { fingerprint: raw, session });
        }
        if (mode === "lost-response") {
          req.socket.destroy();
          return;
        }
        return json(session);
      }
      if (target.pathname === "/v1/events")
        return json({
          object: "list",
          has_more: mode === "incomplete-history",
          data: [...events.values()].filter(
            (e) => e.type === target.searchParams.get("type"),
          ),
        });
      const [kind, resourceId] = target.pathname.slice(4).split("/");
      const value =
        kind === "events"
          ? events.get(resourceId)
          : kind === "payment_intents"
            ? payments.get(resourceId)
            : kind === "checkout" && resourceId === "sessions"
              ? sessions.get(target.pathname.split("/").at(-1)!)
              : null;
      return value
        ? json(value)
        : json({ error: "Owned resource unavailable" }, 404);
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end("Owned Stripe fixture failure");
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
  return {
    origin,
    key,
    webhookSecret: secret,
    account,
    complete,
    event,
    deliver,
    browserClock: (value: number) => {
      browserAt = value;
    },
    mode: (value: string) => {
      mode = value;
    },
    sessions: () => structuredClone([...sessions.values()]),
    operations: () => structuredClone(operations),
    mutateSession: (sessionId: string, changes: any) =>
      Object.assign(sessions.get(sessionId), changes),
    mutatePayment: (paymentId: string, change: (p: any) => void) =>
      change(payments.get(paymentId)),
    mutateEvent: (eventId: string, changes: any) =>
      Object.assign(events.get(eventId), changes),
    duplicateTransition: (paymentId: string, created: number) => {
      const original = [...events.values()].find(
        (e) =>
          e.type === "payment_intent.succeeded" &&
          e.data.object.id === paymentId,
      );
      const e = { ...structuredClone(original), id: id("evt"), created };
      events.set(e.id, e);
    },
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

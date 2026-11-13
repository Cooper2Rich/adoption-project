import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const stripeVersion = "2026-10-28.endive";
export function stable(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function verifyStripeSignature(
  raw: string,
  header: string,
  secret: string,
  now = Date.now(),
) {
  const entries = header.split(",").map((p) => p.split("=")),
    times = entries.filter((p) => p[0] === "t");
  if (times.length !== 1 || !/^\d+$/.test(times[0][1] ?? ""))
    throw new Error("FUNDRAISING_SIGNATURE: Invalid Stripe signature");
  const t = Number(times[0][1]);
  if (!Number.isSafeInteger(t) || Math.abs(now / 1000 - t) > 300)
    throw new Error("FUNDRAISING_SIGNATURE: Stale Stripe signature");
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest();
  if (
    !entries.some(
      ([key, value]) =>
        key === "v1" &&
        /^[a-f0-9]{64}$/.test(value ?? "") &&
        timingSafeEqual(Buffer.from(value, "hex"), expected),
    )
  )
    throw new Error("FUNDRAISING_SIGNATURE: Invalid Stripe signature");
}
type Configuration = {
  url?: string;
  secret?: string;
  fixtureRunId?: string;
  stripeOrigin?: string;
  stripeKey?: string;
  webhookSecret?: string;
  applicationOrigin?: string;
};
export function createFundraisingService(config: Configuration) {
  const { url, secret, fixtureRunId, stripeOrigin, stripeKey, webhookSecret } =
    config;
  const scope = {
    transportBinding: digest(
      stable({ origin: stripeOrigin ?? "", credential: stripeKey ?? "" }),
    ),
    account: `acct_owned_${fixtureRunId}`,
    route: "owned-fundraising-v1",
    apiVersion: stripeVersion,
    fixtureRunId: fixtureRunId ?? "",
  };
  // This adapter cannot address a real provider. Production activation needs an
  // independently reviewed fundraiser-specific capability/time-mapping producer.
  const enabled = !!(
    url &&
    secret &&
    secret.length >= 32 &&
    fixtureRunId &&
    stripeKey === `owned-${fixtureRunId}` &&
    webhookSecret &&
    stripeOrigin &&
    /^http:\/\/127\.0\.0\.1:\d+$/.test(stripeOrigin)
  );
  const client = url ? new ConvexHttpClient(url) : null;
  async function operation(name: string, input: any) {
    const value = { ...input, scope, at: Date.now() };
    return client!.mutation(
      makeFunctionReference<"mutation">(`fundraising:${name}`),
      {
        value,
        signature: createHmac("sha256", secret!)
          .update(stable(value))
          .digest("hex"),
      },
    );
  }
  async function stripe(path: string, body?: URLSearchParams, key?: string) {
    if (!enabled || !path.startsWith("/v1/"))
      throw new Error("FUNDRAISING_HELD: Fundraising collection unavailable");
    const response = await fetch(`${stripeOrigin}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Stripe-Account": scope.account,
        "Stripe-Version": stripeVersion,
        ...(key ? { "Idempotency-Key": key } : {}),
        ...(body
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      body,
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(
        "FUNDRAISING_PROVIDER: Provider outcome unavailable; retry this same checkout",
      );
    return response.json();
  }
  const invalid = () => {
    throw new Error(
      "FUNDRAISING_FACTS: Provider evidence does not match the original checkout",
    );
  };
  function eventScope(event: any) {
    if (
      !event ||
      event.object !== "event" ||
      !/^evt_[A-Za-z0-9_-]+$/.test(event.id) ||
      event.account !== scope.account ||
      event.context ||
      event.livemode !== false ||
      event.api_version !== stripeVersion
    )
      invalid();
  }
  return async (request: Request): Promise<Response> => {
    const json = (body: any, status = 200) =>
      Response.json(body, {
        status,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    const target = new URL(request.url),
      action = target.searchParams.get("action");
    if (request.method === "GET" && action === "capability")
      return json({
        checkout: enabled ? "controlled" : "unavailable",
        synthetic: enabled,
        validatedForProduction: false,
        reason:
          "Actual fundraising account, route, payment-method and successful-payment-time evidence pending",
      });
    if (!enabled)
      return json(
        {
          error:
            "FUNDRAISING_HELD: Donation checkout is not available yet. Actual fundraising collection evidence is required",
        },
        503,
      );
    try {
      if (action === "checkout" && request.method === "POST") {
        if (
          request.headers.get("origin") &&
          request.headers.get("origin") !== target.origin
        )
          throw new Error("FORBIDDEN: Checkout origin denied");
        const input = await request.json();
        if (
          !input ||
          typeof input.operationId !== "string" ||
          typeof input.token !== "string" ||
          !/^[a-f0-9]{64}$/.test(input.token) ||
          !Number.isSafeInteger(input.amountCents) ||
          input.amountCents < 50 ||
          input.amountCents > 99999999
        )
          throw new Error(
            "FUNDRAISING_AMOUNT: Choose a USD donation from 50 cents through 999,999.99 dollars",
          );
        const row = await operation("begin", {
          operationId: input.operationId,
          amountCents: input.amountCents,
          applicationOrigin: config.applicationOrigin ?? target.origin,
          tokenHash: digest(input.token),
          ...(input.entryId ? { entryId: input.entryId } : {}),
        });
        if (row.sessionId)
          return json({
            url: row.checkoutUrl,
            synthetic: true,
            validatedForProduction: false,
          });
        if (Date.now() >= row.retryBefore)
          return json(
            {
              error:
                "FUNDRAISING_UNCERTAIN: The original checkout must be reconciled; a replacement write is held",
            },
            409,
          );
        // The immutable journal already exists before this first external write.
        const returnPath = row.originEntryId
          ? `/fundraise/${row.originEntryId}`
          : "/fundraise";
        const appOrigin = row.applicationOrigin;
        const body = new URLSearchParams({
          mode: "payment",
          "payment_method_types[0]": "card",
          "payment_intent_data[capture_method]": "automatic",
          "line_items[0][price_data][currency]": "usd",
          "line_items[0][price_data][unit_amount]": String(row.amountCents),
          "line_items[0][price_data][product_data][name]":
            "Fundraising donation to adoption.is",
          "line_items[0][quantity]": "1",
          client_reference_id: row._id,
          "metadata[purpose]": "fundraising-donation",
          "metadata[nonprofit]": row.nonprofitId,
          "metadata[origin]": row.originEntryId ?? "",
          "payment_intent_data[metadata][checkout]": row._id,
          "payment_intent_data[metadata][purpose]": "fundraising-donation",
          success_url: `${appOrigin}${returnPath}?donation=returned`,
          cancel_url: `${appOrigin}${returnPath}?donation=pending`,
        });
        try {
          const session = await stripe(
            "/v1/checkout/sessions",
            body,
            row.providerKey,
          );
          if (
            session.object !== "checkout.session" ||
            session.client_reference_id !== row._id ||
            session.amount_total !== row.amountCents ||
            session.currency !== "usd" ||
            session.livemode !== false ||
            !/^cs_[A-Za-z0-9_-]+$/.test(session.id) ||
            !session.url ||
            new URL(session.url).origin !== stripeOrigin
          )
            invalid();
          await operation("dispatch", {
            checkoutId: row._id,
            sessionId: session.id,
            checkoutUrl: session.url,
            state: "dispatched",
          });
          return json({
            url: session.url,
            synthetic: true,
            validatedForProduction: false,
          });
        } catch (error) {
          await operation("dispatch", {
            checkoutId: row._id,
            state: "uncertain",
          });
          throw error;
        }
      }
      if (action === "status" && request.method === "POST") {
        const input = await request.json();
        if (
          typeof input.token !== "string" ||
          !/^[a-f0-9]{64}$/.test(input.token)
        )
          throw new Error("FORBIDDEN: Checkout status unavailable");
        return json(
          await client!.query(
            makeFunctionReference<"query">("fundraising:status"),
            { operationId: input.operationId, tokenHash: digest(input.token) },
          ),
        );
      }
      if (action === "webhook" && request.method === "POST") {
        const raw = await request.text();
        if (raw.length > 262144)
          throw new Error("FUNDRAISING_SIGNATURE: Oversized Stripe event");
        verifyStripeSignature(
          raw,
          request.headers.get("stripe-signature") ?? "",
          webhookSecret!,
        );
        const event = JSON.parse(raw);
        eventScope(event);
        const refundEvent = [
          "refund.created",
          "refund.updated",
          "refund.failed",
          "charge.refunded",
        ].includes(event.type);
        const checkoutEvent = [
          "checkout.session.completed",
          "checkout.session.async_payment_succeeded",
          "checkout.session.async_payment_failed",
        ].includes(event.type);
        if (!refundEvent && !checkoutEvent) invalid();
        const authoritativeEvent = await stripe(
          `/v1/events/${encodeURIComponent(event.id)}`,
        );
        if (stable(authoritativeEvent) !== stable(event)) invalid();
        let session: any, row: any, generation: number;
        if (refundEvent) {
          const object = event.data?.object;
          let paymentId: string;
          if (event.type === "charge.refunded") {
            if (
              object?.object !== "charge" ||
              !/^ch_[A-Za-z0-9_-]+$/.test(object.id)
            )
              invalid();
            const charge = await stripe(
              `/v1/charges/${encodeURIComponent(object.id)}`,
            );
            if (charge.id !== object.id || charge.object !== "charge")
              invalid();
            paymentId = charge.payment_intent;
          } else {
            if (
              object?.object !== "refund" ||
              !/^re_[A-Za-z0-9_-]+$/.test(object.id)
            )
              invalid();
            const refund = await stripe(
              `/v1/refunds/${encodeURIComponent(object.id)}`,
            );
            if (refund.id !== object.id || refund.object !== "refund")
              invalid();
            paymentId = refund.payment_intent;
          }
          if (!/^pi_[A-Za-z0-9_-]+$/.test(paymentId)) invalid();
          const preliminary = await stripe(
            `/v1/payment_intents/${encodeURIComponent(paymentId)}`,
          );
          const read = await operation("refundRead", {
            checkoutId: preliminary.metadata?.checkout,
            eventId: event.id,
            digest: digest(raw),
          });
          row = read.row;
          generation = read.generation;
          if (!row.sessionId) invalid();
          session = await stripe(
            `/v1/checkout/sessions/${encodeURIComponent(row.sessionId)}`,
          );
          if (session.payment_intent !== paymentId) invalid();
        } else {
          if (
            event.data?.object?.object !== "checkout.session" ||
            !/^cs_[A-Za-z0-9_-]+$/.test(event.data.object.id)
          )
            invalid();
          session = await stripe(
            `/v1/checkout/sessions/${encodeURIComponent(event.data.object.id)}`,
          );
          row = await operation("resolve", { sessionId: session.id });
          const read = await operation("refundRead", {
            checkoutId: row._id,
            eventId: event.id,
            digest: digest(raw),
          });
          generation = read.generation;
        }
        if (
          session.id !== row.sessionId ||
          session.object !== "checkout.session" ||
          session.mode !== "payment" ||
          session.livemode !== false ||
          session.currency !== "usd" ||
          session.amount_total !== row.amountCents ||
          session.client_reference_id !== row._id ||
          session.metadata?.purpose !== "fundraising-donation" ||
          session.metadata?.nonprofit !== row.nonprofitId ||
          session.metadata?.origin !== (row.originEntryId ?? "")
        )
          invalid();
        if (session.payment_status !== "paid")
          return json(
            { accepted: true, status: "pending", synthetic: true },
            202,
          );
        if (!/^pi_[A-Za-z0-9_-]+$/.test(session.payment_intent)) invalid();
        const payment = await stripe(
            `/v1/payment_intents/${encodeURIComponent(session.payment_intent)}?expand[]=latest_charge.balance_transaction`,
          ),
          charge = payment.latest_charge;
        if (
          payment.id !== session.payment_intent ||
          payment.object !== "payment_intent" ||
          payment.status !== "succeeded" ||
          payment.capture_method !== "automatic" ||
          payment.livemode !== false ||
          payment.currency !== "usd" ||
          payment.amount !== row.amountCents ||
          payment.amount_received !== row.amountCents ||
          payment.metadata?.checkout !== row._id ||
          payment.metadata?.purpose !== "fundraising-donation" ||
          !charge ||
          charge.object !== "charge" ||
          !/^ch_[A-Za-z0-9_-]+$/.test(charge.id) ||
          charge.payment_intent !== payment.id ||
          charge.livemode !== false ||
          charge.currency !== "usd" ||
          charge.status !== "succeeded" ||
          charge.payment_method_details?.type !== "card" ||
          charge.paid !== true ||
          charge.captured !== true ||
          charge.amount !== row.amountCents ||
          charge.amount_captured !== row.amountCents
        )
          invalid();
        if (
          !Number.isSafeInteger(charge.amount_refunded) ||
          charge.amount_refunded < 0 ||
          charge.amount_refunded > row.amountCents
        )
          invalid();
        // Complete bounded refund history plus independent object reads. Partial history
        // is held rather than treated as zero; charge.amount_refunded is not proof.
        const list = await stripe(
          `/v1/refunds?charge=${encodeURIComponent(charge.id)}&limit=100`,
        );
        if (
          list.object !== "list" ||
          list.has_more !== false ||
          !Array.isArray(list.data) ||
          list.data.length > 100
        )
          throw new Error(
            "FUNDRAISING_REFUND_HELD: Complete refund history required",
          );
        const refunds: any[] = [],
          seen = new Set<string>();
        for (const listed of list.data) {
          if (!/^re_[A-Za-z0-9_-]+$/.test(listed.id) || seen.has(listed.id))
            invalid();
          seen.add(listed.id);
          const r = await stripe(
            `/v1/refunds/${encodeURIComponent(listed.id)}`,
          );
          if (
            r.id !== listed.id ||
            r.object !== "refund" ||
            r.charge !== charge.id ||
            r.payment_intent !== payment.id ||
            r.currency !== "usd" ||
            !Number.isSafeInteger(r.amount) ||
            r.amount < 1 ||
            r.amount > row.amountCents ||
            ![
              "pending",
              "requires_action",
              "succeeded",
              "failed",
              "canceled",
            ].includes(r.status) ||
            !Number.isSafeInteger(r.created) ||
            r.created < 0 ||
            r.created * 1000 > Date.now() + 5000 ||
            (r.balance_transaction != null &&
              !/^txn_[A-Za-z0-9_-]+$/.test(r.balance_transaction)) ||
            (r.failure_balance_transaction != null &&
              !/^txn_[A-Za-z0-9_-]+$/.test(r.failure_balance_transaction))
          )
            invalid();
          refunds.push({
            refundId: r.id,
            paymentId: r.payment_intent,
            chargeId: r.charge,
            amountCents: r.amount,
            status: r.status,
            createdAt: r.created * 1000,
            balanceTransactionId: r.balance_transaction ?? null,
            failureBalanceTransactionId: r.failure_balance_transaction ?? null,
          });
        }
        if (
          refundEvent &&
          event.type !== "charge.refunded" &&
          !seen.has(event.data.object.id)
        )
          throw new Error(
            "FUNDRAISING_REFUND_HELD: Event refund missing from complete history",
          );
        if (
          refundEvent &&
          event.type === "charge.refunded" &&
          event.data.object.id !== charge.id
        )
          invalid();
        const reconcile = () =>
          operation("observeRefunds", {
            checkoutId: row._id,
            generation,
            paymentId: payment.id,
            chargeId: charge.id,
            eventId: event.id,
            digest: digest(raw),
            refunds,
          });
        if (refundEvent)
          return json({
            ...(await reconcile()),
            synthetic: true,
            validatedForProduction: false,
          });
        // Explicitly controlled mapping, NOT validated real successful-payment time.
        // Use the original success-transition event, never checkout/PI/charge
        // creation, callback/event delivery order, receipt time or fee availability.
        // Incomplete/expired event history holds instead of inventing a timestamp.
        const events = await stripe(
          "/v1/events?type=payment_intent.succeeded&limit=100",
        );
        if (
          events.object !== "list" ||
          events.has_more !== false ||
          !Array.isArray(events.data)
        )
          throw new Error(
            "FUNDRAISING_TIME_HELD: Original success transition is unavailable",
          );
        const transitions = events.data.filter(
          (e: any) =>
            e.type === "payment_intent.succeeded" &&
            e.data?.object?.id === payment.id,
        );
        for (const e of transitions) {
          eventScope(e);
          if (
            !Number.isSafeInteger(e.created) ||
            e.data.object.status !== "succeeded" ||
            e.data.object.amount_received !== row.amountCents
          )
            invalid();
        }
        const transition = transitions.sort(
          (a: any, b: any) => a.created - b.created || a.id.localeCompare(b.id),
        )[0];
        if (!transition)
          throw new Error(
            "FUNDRAISING_TIME_HELD: Original success transition is unavailable",
          );
        const balance = charge.balance_transaction;
        if (
          balance &&
          (balance.object !== "balance_transaction" ||
            balance.source !== charge.id ||
            balance.currency !== "usd" ||
            balance.amount !== row.amountCents ||
            !Number.isSafeInteger(balance.fee) ||
            balance.fee < 0)
        )
          invalid();
        const normalized = {
          sessionId: session.id,
          paymentId: payment.id,
          chargeId: charge.id,
          successEventId: transition.id,
          completedAt: transition.created * 1000,
          grossCents: payment.amount_received,
          currency: "usd",
          feeCents: balance ? balance.fee : null,
          balanceTransactionId: balance?.id ?? null,
          refundedCents: 0,
          timeBasis: "controlled-success-transition-v1",
        };
        const facts = {
          ...normalized,
          checkoutId: row._id,
          eventId: event.id,
          digest: digest(raw),
          factsDigest: digest(stable(normalized)),
        };
        return json({
          ...(await operation("confirm", { facts })),
          refunds: await reconcile(),
          synthetic: true,
          validatedForProduction: false,
        });
      }
      return json({ error: "FUNDRAISING_ROUTE: Unsupported operation" }, 400);
    } catch (error) {
      const message = String(error),
        match = message.match(
          /(?:FORBIDDEN|OPERATION_CONFLICT|FUNDRAISING_[A-Z_]+):[^\r\n]*/,
        );
      return json(
        {
          error:
            match?.[0] ??
            "FUNDRAISING_UNAVAILABLE: Confirmation unavailable. Retry the original checkout",
        },
        message.includes("FORBIDDEN") ? 403 : 400,
      );
    }
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { servePhotoRequest } from "../../api/photos.ts";
import { createFundraisingService } from "../../server/launch/fundraising.ts";
import { attribution, commission } from "../../convex/fundraisingPolicy.ts";
import { mutation, query, preparePublicCreator } from "./public-fixtures.ts";
import { donationRules, fundraisingEntry } from "./fundraising-fixtures.ts";

test("T10 cents, half-open original periods and Chicago DST", async (t) => {
  await t.test(
    "Per-donation half-up gross commission, zero and overflow-safe multiplication",
    () => {
      assert.equal(commission(55, 1000), 6);
      assert.equal(commission(54, 1000), 5);
      assert.equal(commission(1, 5000), 1);
      assert.equal(commission(99999999, 0), 0);
      assert.equal(
        commission(Number.MAX_SAFE_INTEGER, 10000),
        Number.MAX_SAFE_INTEGER,
      );
      assert.throws(() => commission(Number.MAX_SAFE_INTEGER + 1, 1000));
      assert.throws(() => commission(-1, 1000));
      assert.throws(() => commission(1, 10001));
    },
  );
  await t.test(
    "Earning starts inclusive, end/cutoff exclusive, partial competition days and weeks excluded",
    () => {
      const start = Date.parse(donationRules.earningStart),
        end = Date.parse(donationRules.earningEnd);
      assert.equal(attribution(donationRules, start, start).eligible, true);
      assert.equal(attribution(donationRules, start - 1, 0).eligible, false);
      assert.equal(attribution(donationRules, end, 0).eligible, false);
      assert.equal(attribution(donationRules, end - 1, 0).eligible, true);
      assert.equal(attribution(donationRules, start, 0, start).eligible, false);
      assert.equal(attribution(donationRules, start, 0).dailyPeriod, null);
      const partial = {
        ...donationRules,
        campaignStart: "2026-10-01T12:00:00.000Z",
        campaignEnd: "2026-10-09T12:00:00.000Z",
      };
      const opening = attribution(
          partial,
          Date.parse("2026-10-01T15:00:00Z"),
          0,
        ),
        inside = attribution(partial, Date.parse("2026-10-07T15:00:00Z"), 0),
        closing = attribution(partial, Date.parse("2026-10-09T11:00:00Z"), 0);
      assert.equal(opening.eligible, true);
      assert.equal(opening.dailyPeriod, null);
      assert.equal(opening.weeklyPeriod, null);
      assert.equal(inside.dailyPeriod, "2026-10-07");
      assert.equal(inside.weeklyPeriod, null);
      assert.equal(closing.dailyPeriod, null);
    },
  );
  await t.test("Spring/fall days are23/25h and Monday weeks167/169h", () => {
    for (const [at, dayHours, weekHours] of [
      ["2026-03-08T12:00:00Z", 23, 167],
      ["2026-11-01T12:00:00Z", 25, 169],
    ] as const) {
      const result = attribution(donationRules, Date.parse(at), 0);
      assert.equal((result.dayEnd - result.dayStart) / 3600000, dayHours);
      assert.equal((result.weekEnd - result.weekStart) / 3600000, weekHours);
      assert.ok(result.dailyPeriod);
      assert.ok(result.weeklyPeriod);
    }
  });
});

test(
  "T10 actual Convex + signed owned Stripe HTTP, durable journal and private ledger",
  { timeout: 600000 },
  async (t) => {
    const backend = await createLocalBackend(),
      results: string[] = [];
    const server = createServer(
      (req, res) =>
        void servePhotoRequest(
          req.url?.startsWith("/api/fundraising")
            ? backend.fundraisingService
            : backend.photoService,
          req,
          res,
        ),
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as any).port}`,
      webhook = `${base}/api/fundraising?action=webhook`;
    const manager = backend.client("manager-a"),
      creator = backend.client("public-creator"),
      guest = backend.client(),
      scope = { campaignId: "adoption" };
    const ledger = () =>
      query(manager, "fundraising:ledger", { ...scope, audience: "manager" });
    const post = (action: string, body: any) =>
      fetch(`${base}/api/fundraising?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const input = (entryId?: string, amountCents = 55) => ({
      operationId: randomUUID(),
      token: randomBytes(32).toString("hex"),
      amountCents,
      ...(entryId ? { entryId } : {}),
    });
    async function checkout(body: any) {
      const response = await post("checkout", body);
      assert.equal(response.status, 200, await response.clone().text());
      const value = await response.json();
      return value.url.split("/").at(-1)!;
    }
    async function deliver(event: any, options: any = {}, status = 200) {
      const response = await backend.stripe.deliver(event, webhook, options);
      assert.equal(response.status, status, await response.clone().text());
      return response.json();
    }
    const at = Date.parse("2026-11-01T07:30:00Z");
    try {
      const entry = await fundraisingEntry(backend, base);
      await t.test(
        "AC01 missing/production/current-scope gates cannot enable collection",
        async () => {
          const held = createFundraisingService({
            url: backend.url,
            secret: "x".repeat(64),
          });
          assert.equal(
            (
              await held(
                new Request(`${base}/api/fundraising?action=checkout`, {
                  method: "POST",
                  body: "{}",
                }),
              )
            ).status,
            503,
          );
          const capability = await held(
            new Request(`${base}/api/fundraising?action=capability`),
          );
          assert.equal((await capability.json()).checkout, "unavailable");
          const wrongRun = backend.fundraisingServiceFor({
            fixtureRunId: "another-owned-run",
          });
          const wrongGate = await wrongRun(
            new Request(`${base}/api/fundraising?action=checkout`, {
              method: "POST",
              body: JSON.stringify(input(entry._id)),
            }),
          );
          assert.equal(wrongGate.status, 400);
          assert.match(await wrongGate.text(), /FUNDRAISING_HELD/);
          await assert.rejects(
            mutation(guest, "fundraising:begin", {
              value: {
                operationId: randomUUID(),
                amountCents: 55,
                applicationOrigin: base,
                entryId: entry._id,
                tokenHash: "a".repeat(64),
                scope: {
                  account: backend.stripe.account,
                  route: "owned-fundraising-v1",
                  apiVersion: "2026-10-28.endive",
                  transportBinding: "c".repeat(64),
                  fixtureRunId: backend.runId,
                },
                at: Date.now(),
              },
              signature: "forged",
            }),
            /FORBIDDEN: Invalid fundraising receipt/,
          );
          await assert.rejects(
            query(guest, "fundraising:ledger", {
              ...scope,
              audience: "manager",
            }),
            /FORBIDDEN/,
          );
          assert.equal(
            (await post("checkout", input("not-an-entry"))).status,
            400,
          );
          assert.equal(
            (await post("checkout", input(entry._id, 49))).status,
            400,
          );
          assert.equal(
            (await post("checkout", input(entry._id, 100000000))).status,
            400,
          );
          assert.equal(
            (await post("checkout", input(entry._id, 1.1))).status,
            400,
          );
          await checkout(input(entry._id, 50));
          await checkout(input(entry._id, 99999999));
          assert.equal((await ledger()).length, 0);
          const foreign = await fundraisingEntry(
            backend,
            base,
            "foreign-fundraising",
            "other",
          );
          assert.equal(
            (await post("checkout", input(foreign._id))).status,
            400,
          );
          results.push("gate-denials and Stripe USD amount boundaries");
        },
      );
      const request = input(entry._id),
        sessionId = await checkout(request);
      await t.test(
        "AC01 pending, failure and browser-return/status never confirm",
        async () => {
          const pending = backend.stripe.complete(sessionId, {
            at,
            state: "processing",
          });
          await deliver(pending, {}, 202);
          const failed = backend.stripe.complete(sessionId, {
            at,
            state: "requires_payment_method",
          });
          await deliver(failed, {}, 202);
          assert.equal(
            (await (await post("status", request)).json()).status,
            "pending",
          );
          assert.equal(
            (await post("status", { ...request, token: "a".repeat(64) }))
              .status,
            403,
          );
          assert.equal((await ledger()).length, 0);
          results.push("pending/failure/browser-return denial");
        },
      );
      const event = backend.stripe.complete(sessionId, { at });
      await t.test(
        "AC01 signature freshness/raw-byte replay and provider scope/object denial",
        async () => {
          await deliver(event, { signature: "t=0,v1=" + "0".repeat(64) }, 400);
          await deliver(
            event,
            {
              signature: `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}`,
            },
            400,
          );
          await deliver(
            event,
            {
              raw: JSON.stringify({ ...event, created: event.created + 1 }),
              signedRaw: JSON.stringify(event),
            },
            400,
          );
          await deliver(
            event,
            { timestamp: Math.floor(Date.now() / 1000) - 301 },
            400,
          );
          await deliver(
            event,
            { raw: JSON.stringify({ ...event, created: event.created + 1 }) },
            400,
          );
          for (const change of [
            { account: "acct_other" },
            { livemode: true },
            { api_version: "2020-01-01" },
            { context: "another-scope" },
          ])
            await deliver(
              backend.stripe.event(sessionId, event.type, change),
              {},
              400,
            );
          const session = backend.stripe
            .sessions()
            .find((s: any) => s.id === sessionId)!;
          for (const change of [
            { currency: "eur" },
            { amount_total: 56 },
            { metadata: { ...session.metadata, nonprofit: "nonprofit-b" } },
            { metadata: { ...session.metadata, origin: "changed" } },
            { payment_intent: "pi_missing" },
          ]) {
            backend.stripe.mutateSession(sessionId, change);
            await deliver(event, {}, 400);
            backend.stripe.mutateSession(sessionId, session);
          }
          const paymentId = session.payment_intent;
          for (const field of ["captured", "paid"] as const) {
            backend.stripe.mutatePayment(paymentId, (p: any) => {
              p.latest_charge[field] = false;
            });
            await deliver(event, {}, 400);
            backend.stripe.mutatePayment(paymentId, (p: any) => {
              p.latest_charge[field] = true;
            });
          }
          backend.stripe.mode("incomplete-history");
          await deliver(event, {}, 400);
          backend.stripe.mode("normal");
          assert.equal((await ledger()).length, 0);
          results.push(
            "raw signature/stale/cross-account/mode/version/scope/currency/amount/relation/capture/history denials",
          );
        },
      );
      await t.test(
        "AC01 concurrent same/distinct/reordered callbacks confirm one immutable payment",
        async () => {
          const other = backend.stripe.event(
            sessionId,
            "checkout.session.completed",
          );
          const session = backend.stripe
            .sessions()
            .find((s: any) => s.id === sessionId)!;
          backend.stripe.duplicateTransition(
            session.payment_intent,
            at / 1000 + 3600,
          );
          await Promise.all([
            deliver(other),
            deliver(event),
            deliver(event),
            deliver(other),
          ]);
          await deliver(event);
          await deliver(
            backend.stripe.event(sessionId, "checkout.session.completed"),
          );
          const rows = await ledger();
          assert.equal(rows.length, 1);
          assert.equal(rows[0].grossCents, 55);
          assert.equal(rows[0].commissionCents, 6);
          assert.equal(rows[0].completedAt, at);
          assert.equal(rows[0].dailyPeriod, "2026-11-01");
          assert.equal(rows[0].weeklyPeriod, "2026-10-26");
          assert.equal(
            rows[0].amounts.filter((a: any) => a.kind === "fees")[0].cents,
            null,
          );
          assert.equal(
            (await (await post("status", request)).json()).status,
            "confirmed",
          );
          const wire = backend.stripe
            .operations()
            .find((r: any) => r.body.client_reference_id)!;
          assert.equal(
            wire.body["payment_intent_data[capture_method]"],
            "automatic",
          );
          assert.equal(wire.body["metadata[purpose]"], "fundraising-donation");
          const history = await query(manager, "fundraising:history", {
            ...scope,
            donationId: rows[0].id,
          });
          assert.equal(history[0].action, "journaled-before-provider-write");
          assert.equal(
            history.filter((h: any) => h.action === "payment-confirmed-once")
              .length,
            1,
          );
          assert.ok(
            history.every(
              (h: any) => h.actor && h.source && h.at && h.version && h.digest,
            ),
          );
          results.push(
            "concurrent/reordered/event+payment dedup, canonical controlled transition, immutable audit",
          );
        },
      );
      await t.test(
        "AC03 late fee and cumulative refund observations remain separate without duplicate gross/commission",
        async () => {
          const session = backend.stripe
            .sessions()
            .find((s: any) => s.id === sessionId)!;
          backend.stripe.mutatePayment(session.payment_intent, (p: any) => {
            p.latest_charge.balance_transaction = {
              id: "txn_late",
              object: "balance_transaction",
              source: p.latest_charge.id,
              amount: p.amount,
              currency: "usd",
              fee: 32,
            };
            p.latest_charge.amount_refunded = 10;
          });
          await deliver(event);
          await deliver(event);
          const row = (await ledger())[0];
          assert.equal(
            row.amounts.filter((a: any) => a.kind === "gross").length,
            1,
          );
          assert.equal(
            row.amounts.filter((a: any) => a.kind === "commission").length,
            1,
          );
          assert.equal(
            row.amounts.filter((a: any) => a.kind === "fees").at(-1).cents,
            32,
          );
          assert.equal(
            row.amounts.filter((a: any) => a.kind === "refunds").at(-1).cents,
            10,
          );
          assert.equal(row.commissionCents, 6);
          const fees = row.amounts.filter((a: any) => a.kind === "fees");
          assert.equal(fees.at(-1).providerReference, "txn_late");
          assert.notEqual(fees[0].factsDigest, fees.at(-1).factsDigest);
          assert.equal(fees.at(-1).source, "fundraising:reconcile");
          results.push(
            "gross/refund/unknown→actual fee/locked commission separation",
          );
        },
      );
      await t.test(
        "AC01 a different payment cannot fork an already confirmed checkout",
        async () => {
          const session = backend.stripe
            .sessions()
            .find((s: any) => s.id === sessionId)!;
          backend.stripe.mutateSession(sessionId, { payment_intent: null });
          const fork = backend.stripe.complete(sessionId, { at, fee: 32 });
          await deliver(fork, {}, 400);
          backend.stripe.mutateSession(sessionId, session);
          assert.equal((await ledger()).length, 1);
          results.push("checkout→payment fork rejected");
        },
      );
      await t.test(
        "AC02 independent successful-payment earning boundaries and earning-only original periods",
        async () => {
          const original = await query(creator, "photos:entry", {
            ...scope,
            entryId: entry._id,
          });
          const fresh = await mutation(creator, "photos:submit", {
            ...scope,
            operationId: "boundary-entry",
            title: "Boundary creative",
            description: "Independent earning cutoff evidence.",
            photos: original.versions[0].photos,
          });
          await mutation(manager, "photos:review", {
            ...scope,
            entryId: fresh._id,
            expectedVersion: 1,
            operationId: "boundary-approve",
            decision: "approved",
            reason: "",
          });
          await backend.runOwnedInternal("fixtures:fundraisingControl", {
            entryId: fresh._id,
            approvedAt: Date.parse(donationRules.earningStart) - 10000,
          });
          const start = Date.parse(donationRules.earningStart),
            end = Date.parse(donationRules.earningEnd);
          for (const [time, amount, eligible, day] of [
            [start - 1000, 455, false, null],
            [start, 505, true, null],
            [end - 1000, 555, true, null],
            [end, 605, false, null],
            [Date.parse("2026-11-01T07:30:00Z"), 655, true, "2026-11-01"],
          ] as const) {
            const sid = await checkout(input(fresh._id, amount));
            await deliver(backend.stripe.complete(sid, { at: time, fee: 0 }));
            const row = (await ledger()).find(
              (r: any) => r.grossCents === amount,
            );
            assert.equal(row.eligible, eligible);
            assert.equal(
              row.commissionCents,
              eligible ? commission(amount, 1000) : 0,
            );
            assert.equal(row.dailyPeriod, day);
            assert.equal(row.completedAt, time);
          }
          results.push(
            "independent uncropped earning start-/start/end-/end and commission-only outside prize periods",
          );
        },
      );
      await t.test(
        "AC02/04 cutoff history hides creative, preserves earlier success and allows old-link/untracked nonprofit-only support",
        async () => {
          const delayedRequest = input(entry._id, 105),
            delayedId = await checkout(delayedRequest),
            delayed = backend.stripe.complete(delayedId, {
              at: at - 1000,
              fee: 0,
            });
          await backend.runOwnedInternal("fixtures:fundraisingControl", {
            entryId: entry._id,
            cutoff: at,
            reason: "withdrawal",
          });
          assert.equal(
            await query(guest, "publicViewer:entry", { entryId: entry._id }),
            null,
          );
          const origin = await query(guest, "publicViewer:fundraising", {
            entryId: entry._id,
          });
          assert.equal(origin.entry, null);
          assert.equal(origin.originEntryId, entry._id);
          assert.doesNotMatch(
            JSON.stringify(origin),
            /Families together|River Studio|Approved fundraising|subject/,
          );
          await deliver(delayed);
          assert.equal(
            (await ledger()).find((r: any) => r.grossCents === 105)
              .commissionCents,
            11,
          );
          const oldId = await checkout(input(entry._id, 155));
          await deliver(backend.stripe.complete(oldId, { at, fee: 0 }));
          const untrackedId = await checkout(input(undefined, 205));
          await deliver(
            backend.stripe.complete(untrackedId, { at: at - 1000, fee: 0 }),
          );
          for (const row of (await ledger()).filter((r: any) =>
            [155, 205].includes(r.grossCents),
          )) {
            assert.equal(row.commissionCents, 0);
            assert.equal(row.dailyPeriod, null);
            assert.equal(row.weeklyPeriod, null);
          }
          const endId = await checkout(input(entry._id, 255));
          await deliver(
            backend.stripe.complete(endId, {
              at: Date.parse(donationRules.earningEnd),
              fee: 0,
            }),
          );
          assert.equal(
            (await ledger()).find((r: any) => r.grossCents === 255)
              .commissionCents,
            0,
          );
          results.push(
            "old link hidden creative + true pre-cutoff delayed credit + cutoff/end/untracked nonprofit-only",
          );
        },
      );
      await t.test(
        "AC01 unknown writes use exact original provider identity and stop after retention/config changes",
        async () => {
          const unknown = input(entry._id, 305);
          backend.stripe.mode("lost-response");
          assert.equal((await post("checkout", unknown)).status, 400);
          const count = backend.stripe.sessions().length;
          backend.stripe.mode("normal");
          let alternativePosts = 0;
          const alternative = createServer((req, res) => {
            if (req.method === "POST") alternativePosts++;
            res.writeHead(500);
            res.end("Unexpected alternate transport request");
          });
          alternative.listen(0, "127.0.0.1");
          await once(alternative, "listening");
          try {
            const changedTransport = backend.fundraisingServiceFor({
              stripeOrigin: `http://127.0.0.1:${(alternative.address() as any).port}`,
            });
            const denied = await changedTransport(
              new Request(`${base}/api/fundraising?action=checkout`, {
                method: "POST",
                body: JSON.stringify(unknown),
              }),
            );
            assert.equal(denied.status, 400);
            assert.match(await denied.text(), /OPERATION_CONFLICT/);
            assert.equal(alternativePosts, 0);
            assert.equal(backend.stripe.sessions().length, count);
          } finally {
            await new Promise<void>((resolve) =>
              alternative.close(() => resolve()),
            );
          }
          const sid = await checkout(unknown);
          assert.equal(backend.stripe.sessions().length, count);
          assert.equal(await checkout(unknown), sid);
          assert.equal(
            (await post("checkout", { ...unknown, amountCents: 306 })).status,
            400,
          );
          const changedOrigin = backend.fundraisingServiceFor({
            applicationOrigin: "http://127.0.0.1:10001",
          });
          const changed = await changedOrigin(
            new Request(`${base}/api/fundraising?action=checkout`, {
              method: "POST",
              body: JSON.stringify(unknown),
            }),
          );
          assert.equal(changed.status, 400);
          assert.match(await changed.text(), /OPERATION_CONFLICT/);
          const changedCount = backend.stripe.operations().length;
          const changedAgain = await changedOrigin(
            new Request(`${base}/api/fundraising?action=checkout`, {
              method: "POST",
              body: JSON.stringify(unknown),
            }),
          );
          assert.equal(changedAgain.status, 400);
          assert.equal(backend.stripe.operations().length, changedCount);
          assert.equal(await checkout(unknown), sid);
          const expired = input(entry._id, 355);
          backend.stripe.mode("lost-response");
          assert.equal((await post("checkout", expired)).status, 400);
          backend.stripe.mode("normal");
          await backend.runOwnedInternal("fixtures:fundraisingControl", {
            operationId: expired.operationId,
            retryBefore: Date.now() - 1,
          });
          const operations = backend.stripe.operations().length;
          assert.equal((await post("checkout", expired)).status, 409);
          assert.equal(backend.stripe.operations().length, operations);
          backend.stripe.mode("redirect");
          assert.equal(
            (await post("checkout", input(entry._id, 405))).status,
            400,
          );
          backend.stripe.mode("normal");
          results.push(
            "lost response/exact retries/provider retention fence/redirect refusal",
          );
        },
      );
      await t.test(
        "Private manager/creator projections reject public, revoked and other-nonprofit access",
        async () => {
          const own = await query(creator, "fundraising:ledger", {
            ...scope,
            audience: "creator",
          });
          assert.ok(own.length);
          const secondCreator = backend.client("public-second");
          await preparePublicCreator(
            manager,
            secondCreator,
            "private-second",
            "adoption",
            "public-second",
          );
          assert.deepEqual(
            await query(secondCreator, "fundraising:ledger", {
              ...scope,
              audience: "creator",
            }),
            [],
          );
          assert.doesNotMatch(
            JSON.stringify(own),
            /paymentId|chargeId|acct_owned|tokenHash|checkoutUrl|creators.example/,
          );
          await assert.rejects(
            query(backend.client("manager-b"), "fundraising:ledger", {
              ...scope,
              audience: "manager",
            }),
            /FORBIDDEN/,
          );
          await assert.rejects(
            query(backend.client("uninvited"), "fundraising:ledger", {
              ...scope,
              audience: "creator",
            }),
            /FORBIDDEN/,
          );
          const rows = await ledger();
          await assert.rejects(
            query(manager, "fundraising:history", {
              campaignId: "other",
              donationId: rows[0].id,
            }),
            /FORBIDDEN/,
          );
          const workspace = await query(
            creator,
            "creatorAccess:workspace",
            scope,
          );
          await mutation(manager, "creatorAccess:revoke", {
            ...scope,
            invitationId: workspace.invitation._id,
            operationId: "revoke-fundraising",
          });
          await assert.rejects(
            query(creator, "fundraising:ledger", {
              ...scope,
              audience: "creator",
            }),
            /FORBIDDEN/,
          );
          assert.equal((await ledger()).length, rows.length);
          results.push(
            "current permission/revocation/nonprofit/privacy enforcement",
          );
        },
      );
      await t.test(
        "Two independent clients and actual backend restart preserve settled identity, ledger and exact retry",
        async () => {
          const before = await ledger(),
            second = backend.client("manager-a");
          assert.deepEqual(
            await query(second, "fundraising:ledger", {
              ...scope,
              audience: "manager",
            }),
            before,
          );
          await backend.restart();
          assert.deepEqual(await ledger(), before);
          await deliver(event);
          assert.deepEqual(await ledger(), before);
          assert.equal(await checkout(request), sessionId);
          results.push("two sessions + actual persistence restart + replay");
        },
      );
      await mkdir(".codex/ralph", { recursive: true });
      await writeFile(
        ".codex/ralph/t10-backend-evidence.json",
        JSON.stringify(
          {
            at: new Date().toISOString(),
            synthetic: true,
            validatedForProduction: false,
            results,
            actualDonations: (await ledger()).length,
            wirePostCount: backend.stripe.operations().length,
            backendVersion: await backend.backendVersion(),
          },
          null,
          2,
        ),
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await backend.stop();
    }
  },
);

import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { servePhotoRequest } from "../../api/photos.ts";
import { fundraisingEntry } from "./fundraising-fixtures.ts";
import { mutation, query } from "./public-fixtures.ts";
import {
  commission,
  sumCents,
  signedCents,
} from "../../convex/fundraisingPolicy.ts";

test("T11 cumulative cents and signed aggregates reject overflow", () => {
  assert.equal(commission(55, 1000), 6);
  assert.equal(commission(54, 1000), 5);
  assert.equal(commission(53, 1000), 5);
  assert.equal(commission(1, 1000) + commission(1, 1000), 0);
  assert.equal(sumCents([6, -7, 3]), 2);
  assert.throws(() => sumCents([Number.MAX_SAFE_INTEGER, 1]));
  assert.throws(() => sumCents([Number.MIN_SAFE_INTEGER, -1]));
  assert.throws(() => signedCents(0.5));
});
test(
  "T11 signed HTTP refunds, commission-only carry, finalized protection and durable scoped evidence",
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
      webhook = base + "/api/fundraising?action=webhook",
      manager = backend.client("manager-a"),
      creator = backend.client("public-creator"),
      scope = { campaignId: "adoption" };
    const ledger = () =>
      query(manager, "fundraising:ledger", { ...scope, audience: "manager" });
    const reconciliation = () =>
      query(manager, "fundraising:reconciliation", {
        ...scope,
        audience: "manager",
      });
    const balance = async () => (await reconciliation()).balances[0];
    const control = (donationId: string, action: string, facts: any = {}) =>
      backend.runOwnedInternal("fixtures:fundraisingEvidence", {
        donationId,
        action,
        facts,
      });
    const deliver = async (e: any, status = 200) => {
      const r = await backend.stripe.deliver(e, webhook);
      const body = await r.text();
      assert.equal(r.status, status, body);
      return JSON.parse(body);
    };
    let entry: any;
    async function checkout(amount = 55, tracked = true) {
      const r = await fetch(base + "/api/fundraising?action=checkout", {
        method: "POST",
        body: JSON.stringify({
          operationId: randomUUID(),
          token: randomBytes(32).toString("hex"),
          amountCents: amount,
          ...(tracked ? { entryId: entry._id } : {}),
        }),
      });
      assert.equal(r.status, 200, await r.clone().text());
      return new URL((await r.json()).url).pathname.split("/").at(-1)!;
    }
    const at = Date.parse("2026-11-01T07:30:00Z");
    try {
      entry = await fundraisingEntry(backend, base, "t11-refunds");
      await mutation(manager, "operatorIncidents:registerContact", scope);
      backend.email.mode("fail");
      const sid = await checkout(),
        success = backend.stripe.complete(sid, { at, fee: 32 });
      let first: any;
      await t.test(
        "refund before donation holds original success and pending/failed/canceled never earn reversal",
        async () => {
          const pending = backend.stripe.refund(sid, 1, "pending");
          assert.equal(
            (await deliver(pending)).status,
            "awaiting-original-donation",
          );
          assert.deepEqual(await ledger(), []);
          await deliver(success);
          first = (await ledger())[0];
          assert.equal(first.commissionCents, 6);
          assert.equal(first.current.refundedCents, 0);
          for (const status of ["failed", "canceled", "requires_action"]) {
            backend.stripe.mutateRefund(pending.data.object.id, { status });
            await deliver(
              backend.stripe.refundEvent(sid, pending.data.object.id),
            );
            assert.equal((await ledger())[0].current.refundedCents, 0);
          }
          await assert.rejects(
            control(first.id, "obligation", { source: "" }),
            /INVALID_INCIDENT_INPUT/,
          );
          await control(first.id, "obligation");
          const facts = {
            paymentId: "owned_paid_first",
            confirmedAt: at + 1000,
            status: "confirmed",
            evidence: "Owned confirmed commission; no bank call",
          };
          for (const status of ["approved", "pending", "unknown"]) {
            await assert.rejects(
              control(first.id, "paid", { ...facts, status }),
              /UNCONFIRMED/,
            );
          }
          for (const changed of [
            { amountCents: 7 },
            { creator: "other" },
            { route: "another" },
            { nonprofitId: "nonprofit-b" },
            { destinationBinding: "b".repeat(64) },
            { currency: "eur" },
            { source: "changed" },
            { revision: 2 },
          ])
            await assert.rejects(
              control(first.id, "paid", { ...facts, ...changed }),
              /BINDING/,
            );
          await Promise.all([
            control(first.id, "paid", facts),
            control(first.id, "paid", facts),
          ]);
          assert.equal((await balance()).paidCents, 6);
          const audit = await query(
            manager,
            "fundraising:paymentHistory",
            scope,
          );
          assert.equal(
            audit.obligations[0].approvalActor,
            "owned-payout-approval-owner",
          );
          assert.ok(audit.obligations[0].approvalEvidence);
          assert.equal(audit.obligations[0].version, 1);
          assert.ok(audit.obligations[0].source);
          assert.equal(
            audit.payments[0].actor,
            "owned-payment-reconciliation-owner",
          );
          assert.equal(
            audit.payments[0].confirmationSource,
            "owned-confirmed-payment-producer",
          );
          assert.ok(audit.payments[0].evidence);
          assert.equal(audit.payments[0].version, 1);
          assert.equal(audit.payments[0].confirmedAt, facts.confirmedAt);
          await control(first.id, "finalized");
          backend.stripe.mutateRefund(pending.data.object.id, {
            status: "succeeded",
            balance_transaction: "txn_confirmed_first",
          });
          await Promise.all([
            deliver(backend.stripe.refundEvent(sid, pending.data.object.id)),
            deliver(pending),
            deliver(success),
          ]);
          await deliver(
            backend.stripe.refundEvent(sid, pending.data.object.id),
          );
          first = (await ledger())[0];
          assert.equal(first.commissionCents, 6);
          assert.equal(first.current.recognizedCommissionCents, 5);
          assert.equal(first.current.refundedCents, 1);
          assert.equal(first.completedAt, at);
          assert.equal(first.dailyPeriod, "2026-11-01");
          assert.equal((await balance()).balanceCents, -1);
          assert.equal((await balance()).carryforwardCents, -1);
          assert.equal((await balance()).payableCents, 0);
          results.push(
            "refund-before-original pending held; faithful status confirmation; exact payment binding and paid-before-refund -1 carry",
          );
        },
      );
      await t.test(
        "cumulative threshold cents, original periods and retained fees; finalized original protected and manager notice independent of email",
        async () => {
          await mutation(manager, "operatorIncidents:registerContact", scope);
          const second = backend.stripe.refund(sid, 1);
          await Promise.all([
            deliver(second),
            deliver(second),
            deliver(success),
          ]);
          await deliver(second);
          const row = (await ledger())[0];
          assert.equal(row.current.refundedCents, 2);
          assert.equal(row.current.recognizedCommissionCents, 5);
          assert.equal(row.current.reversedCommissionCents, 1);
          const history = await query(manager, "fundraising:refundHistory", {
            ...scope,
            donationId: row.id,
          });
          assert.equal(history.corrections.length, 2);
          assert.deepEqual(
            history.corrections.map((c: any) => c.commissionAdjustmentCents),
            [-1, 0],
          );
          assert.equal(
            sumCents(
              history.corrections.map((c: any) => c.commissionAdjustmentCents),
            ),
            -1,
          );
          assert.ok(
            history.corrections.every(
              (c: any) =>
                c.actor &&
                c.source &&
                c.at &&
                c.version === 1 &&
                c.digest &&
                c.eventId,
            ),
          );
          assert.ok(
            history.reads.every(
              (r: any) => r.actor && r.source && r.at && r.version === 1,
            ),
          );
          await assert.rejects(
            query(backend.client("manager-b"), "fundraising:refundHistory", {
              ...scope,
              donationId: row.id,
            }),
            /FORBIDDEN/,
          );
          await assert.rejects(
            query(creator, "fundraising:refundHistory", {
              ...scope,
              donationId: row.id,
            }),
            /FORBIDDEN/,
          );
          assert.equal(row.grossCents, 55);
          assert.equal(row.commissionCents, 6);
          assert.equal(
            row.amounts.filter((a: any) => a.kind === "fees").at(-1).cents,
            32,
          );
          const r = await reconciliation(),
            period = r.periods[0];
          assert.equal(
            period.results.filter((p: any) => p.periodKind === "daily").at(-1)
              .eligibleGrossCents,
            53,
          );
          assert.equal(period.finalized[0].originalGrossCents, 55);
          assert.equal(period.finalized[0].fixedPrizeCents, 5000);
          assert.ok(period.finalized[0].discrepancies.length);
          const notices = await query(manager, "operatorIncidents:list", scope),
            incident = notices.find(
              (i: any) => i.kind === "fundraising-discrepancy",
            );
          assert.equal(incident.status, "open");
          assert.equal(
            incident.notices.filter((n: any) => n.kind === "detection").length,
            1,
          );
          assert.ok(incident.evidence.length >= 2);
          assert.ok(
            incident.notices.every((n: any) =>
              n.emails.every(
                (e: any) => e.recipientRole === "Campaign manager",
              ),
            ),
          );
          await control(first.id, "period", { eligibleGrossCents: 51 });
          await control(first.id, "period", { eligibleGrossCents: 52 });
          const after = await reconciliation();
          assert.equal(after.periods[0].finalized[0].fixedPrizeCents, 5000);
          assert.equal(after.periods[0].finalized[0].originalGrossCents, 55);
          await assert.rejects(
            control(first.id, "period", { entryId: "invalid" }),
            /ArgumentValidationError|ID|id|scope/i,
          );
          results.push(
            "cumulative1+1 cents reverses1 once, gross+fee retained, corrected original daily/week FUNDRAISING inputs; fixed5000 untouched; one manager-only durable discrepancy notice",
          );
        },
      );
      await t.test(
        "future commission offsets once and refund restores prior negative; late paid confirmation binds and persists",
        async () => {
          const future = await checkout();
          await deliver(
            backend.stripe.complete(future, { at: at + 86400000, fee: 0 }),
          );
          assert.equal((await balance()).balanceCents, 5);
          await deliver(backend.stripe.refund(future, 25));
          assert.equal((await balance()).balanceCents, 2);
          assert.equal((await balance()).payableCents, 2);
          await deliver(backend.stripe.refund(future, 30));
          assert.equal((await balance()).balanceCents, -1);
          const late = await checkout();
          await deliver(
            backend.stripe.complete(late, { at: at + 172800000, fee: 0 }),
          );
          const d = (await ledger()).at(-1);
          await control(d.id, "obligation");
          await deliver(backend.stripe.refund(late, 55));
          assert.equal((await balance()).balanceCents, -1);
          // A historical trusted snapshot arriving after correction still retains discrepancy.
          await control(d.id, "finalized");
          assert.ok(
            (await reconciliation()).periods[0].finalized.some(
              (f: any) => f.discrepancies.length,
            ),
          );
          const paid = {
            paymentId: "owned_paid_late",
            confirmedAt: at + 172800001,
            status: "confirmed",
            evidence:
              "Owned historical confirmed payment; actual integration held",
          };
          await Promise.all([
            control(d.id, "paid", paid),
            control(d.id, "paid", paid),
          ]);
          assert.equal((await balance()).balanceCents, -7);
          await control(d.id, "paid", paid);
          assert.equal((await balance()).paidCents, 12);
          assert.ok(
            (await reconciliation()).periods[0].finalized.every(
              (f: any) => f.fixedPrizeCents === 5000,
            ),
          );
          results.push(
            "future6→refund25 remaining3 earns net2; future full refund restores-1; late paid after full refund yields-7 without prize netting",
          );
        },
      );
      await t.test(
        "canonical object/scope/signature/history denials, unsupported returned-funds contradiction held",
        async () => {
          const e = backend.stripe.refund(sid, 1, "pending"),
            id = e.data.object.id;
          const before = (await ledger())[0].current;
          for (const changes of [
            { currency: "eur" },
            { amount: 56 },
            { amount: 0.5 },
            { charge: "ch_other" },
            { payment_intent: "pi_other" },
            { status: "unknown" },
            { balance_transaction: "bad" },
            { failure_balance_transaction: "bad" },
          ]) {
            backend.stripe.mutateRefund(id, changes);
            await deliver(e, 400);
            backend.stripe.mutateRefund(id, e.data.object);
          }
          for (const change of [
            { account: "acct_other" },
            { livemode: true },
            { api_version: "old" },
          ])
            await deliver({ ...e, ...change }, 400);
          assert.equal(
            (
              await backend.stripe.deliver(e, webhook, {
                timestamp: Math.floor(Date.now() / 1000) - 301,
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await backend.stripe.deliver(e, webhook, {
                signature: `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}`,
              })
            ).status,
            400,
          );
          backend.stripe.mode("incomplete-refunds");
          await deliver(e, 400);
          backend.stripe.mode("normal");
          assert.deepEqual((await ledger())[0].current, before);
          // The canonical HTTP JSON may omit either nullable reference. Neither
          // absence nor a pending request establishes confirmed principal.
          backend.stripe.mutateRefund(id, {
            balance_transaction: undefined,
            failure_balance_transaction: undefined,
          });
          await deliver(e);
          assert.deepEqual((await ledger())[0].current, before);
          const pendingHistory = await query(
            manager,
            "fundraising:refundHistory",
            { ...scope, donationId: first.id },
          );
          const pendingObservation = pendingHistory.observations.find(
            (r: any) => r.refundId === id && r.status === "pending",
          );
          assert.equal(pendingObservation.balanceTransactionId, null);
          assert.equal(pendingObservation.failureBalanceTransactionId, null);
          backend.stripe.mutateRefund(id, { status: "succeeded" });
          const known = backend.stripe.refundEvent(sid, id);
          await deliver(known);
          await deliver(known);
          assert.equal((await ledger())[0].current.refundedCents, 3);
          const succeededHistory = await query(
            manager,
            "fundraising:refundHistory",
            { ...scope, donationId: first.id },
          );
          assert.equal(
            succeededHistory.observations.filter(
              (r: any) => r.refundId === id && r.status === "succeeded",
            ).length,
            1,
          );
          results.push(
            "omitted optional refund transaction references normalize to null; pending unconfirmed, canonical success and replay recognized once; malformed non-null references denied",
          );
          backend.stripe.mutateRefund(known.data.object.id, {
            status: "failed",
            failure_balance_transaction: "txn_returned_funds",
          });
          assert.equal(
            (
              await deliver(
                backend.stripe.refundEvent(
                  sid,
                  known.data.object.id,
                  "refund.failed",
                ),
              )
            ).status,
            "correction-held",
          );
          assert.equal((await ledger())[0].current.refundedCents, 3);
          const incident = (
            await query(manager, "operatorIncidents:list", scope)
          ).find((i: any) => i.kind === "fundraising-refund-held");
          assert.equal(incident.status, "open");
          assert.ok(incident.notices.length);
          results.push(
            "valid-shape signature stale/account/mode/version/refund currency/amount/status/link/history denials; succeeded→failed retained/held with manager incident",
          );
        },
      );

      await t.test(
        "held facts cannot become financial authority; canonical generation fences and exact settled completion",
        async () => {
          const sid = await checkout(),
            success = backend.stripe.complete(sid, {
              at: at + 200000000,
              fee: 0,
            });
          const invalid = backend.stripe.refund(sid, 1, "succeeded", {
            failure_balance_transaction: "txn_contradictory",
          });
          assert.equal((await deliver(invalid)).status, "correction-held");
          await deliver(success);
          await deliver(success);
          const original = (await ledger()).at(-1);
          assert.equal(original.current.refundedCents, 0);
          assert.equal(original.current.recognizedCommissionCents, 6);
          backend.stripe.mutateRefund(invalid.data.object.id, {
            failure_balance_transaction: null,
          });
          await deliver(
            backend.stripe.refundEvent(sid, invalid.data.object.id),
          );
          assert.equal((await ledger()).at(-1).current.refundedCents, 1);
          // Incident is keyed by immutable checkout identity, not public donation identity.
          const recoveredRow = await backend.ownedFundraisingOperation(
            "resolve",
            { sessionId: sid },
          );
          const recoveredIncident = (
            await query(manager, "operatorIncidents:list", scope)
          ).find((i: any) => i.key === "refund-held:" + recoveredRow._id);
          assert.equal(recoveredIncident.status, "resolved");
          assert.equal(
            recoveredIncident.notices.filter((n: any) => n.kind === "recovery")
              .length,
            1,
          );
          const hold = backend.stripe.holdNextRefundList();
          const slow = deliver(
            backend.stripe.refundEvent(sid, invalid.data.object.id),
          );
          await hold.arrived;
          const next = backend.stripe.refund(sid, 1);
          await deliver(next);
          hold.release();
          assert.equal((await slow).status, "stale-read-held");
          assert.equal((await ledger()).at(-1).current.refundedCents, 2);
          const row = await backend.ownedFundraisingOperation("resolve", {
            sessionId: sid,
          });
          const read = await backend.ownedFundraisingOperation("refundRead", {
            checkoutId: row._id,
            eventId: "evt_owned_read_binding",
            digest: "a".repeat(64),
          });
          const input = {
            checkoutId: row._id,
            generation: read.generation,
            eventId: "evt_owned_read_binding",
            digest: "a".repeat(64),
            paymentId: original.paymentId,
            chargeId: original.chargeId,
            refunds: [],
          };
          assert.equal(
            (await backend.ownedFundraisingOperation("observeRefunds", input))
              .status,
            "correction-held",
          );
          assert.equal(
            (await backend.ownedFundraisingOperation("observeRefunds", input))
              .status,
            "correction-held",
          );
          await assert.rejects(
            backend.ownedFundraisingOperation("observeRefunds", {
              ...input,
              chargeId: "ch_changed",
            }),
            /READ_CONFLICT/,
          );
          assert.equal((await ledger()).at(-1).current.refundedCents, 2);
          const notices = await query(manager, "operatorIncidents:list", scope);
          assert.doesNotMatch(
            JSON.stringify(notices),
            /@|Bearer|providerBinding|payload|RESEND_API_KEY/,
          );
          for (let i = 0; i < 100; i++) {
            if (
              (await query(manager, "operatorIncidents:list", scope)).some(
                (n: any) =>
                  n.kind === "fundraising-discrepancy" &&
                  n.notices.some((n: any) =>
                    n.emails.some((e: any) => e.failures >= 1),
                  ),
              )
            )
              break;
            await delay(50);
          }
          const failure = (
            await query(manager, "operatorIncidents:list", scope)
          ).find((n: any) => n.kind === "fundraising-discrepancy");
          assert.equal(failure.status, "open");
          assert.ok(
            failure.notices.some((n: any) =>
              n.emails.some((e: any) => e.failures >= 1),
            ),
          );
          assert.ok(
            failure.notices.every((n: any) =>
              n.emails.every(
                (e: any) => e.recipientRole === "Campaign manager",
              ),
            ),
          );
          assert.ok(
            backend.email.requests.every((r: any) => {
              const p = JSON.parse(r.payload);
              return (
                p.to.length === 1 &&
                p.to[0].endsWith(".example") &&
                !p.cc &&
                !p.bcc
              );
            }),
          );
          results.push(
            "first contradictory success cannot enter later confirmation; coherent re-read recovers; slower canonical read fenced; exact settled generation replay/conflict; manager-only email failure leaves incident visible/private",
          );
        },
      );

      await t.test(
        "distinct creators retain independent commission groups and private filtering",
        async () => {
          const originalEntry = entry,
            before = await balance();
          entry = await fundraisingEntry(
            backend,
            base,
            "t11-second",
            "adoption",
            "public-second",
            "Oak Studio",
          );
          const sid = await checkout();
          await deliver(backend.stripe.complete(sid, { at, fee: 0 }));
          await deliver(backend.stripe.refund(sid, 1));
          const all = await reconciliation();
          assert.equal(all.balances.length, 2);
          assert.ok(
            all.balances.some((g: any) => g.creatorLabel === "River Studio"),
          );
          assert.ok(
            all.balances.some(
              (g: any) =>
                g.creatorLabel === "Oak Studio" && g.balanceCents === 5,
            ),
          );
          assert.equal(
            all.balances.find((g: any) => g.creator === "public-creator")
              .balanceCents,
            before.balanceCents,
          );
          const second = await query(
            backend.client("public-second"),
            "fundraising:reconciliation",
            { ...scope, audience: "creator" },
          );
          assert.equal(second.balances.length, 1);
          assert.equal(second.balances[0].recognizedCents, 5);
          assert.doesNotMatch(
            JSON.stringify(second),
            /River Studio|public-creator|owned_paid_first|acct_owned|prizeObligationId/,
          );
          entry = originalEntry;
          results.push(
            "two safe labeled creator balances; overpayment never offsets other creator and own reads filtered",
          );
        },
      );
      await t.test(
        "untracked and post-cutoff refunds never acquire commission; current scope and restart protect privacy",
        async () => {
          await backend.runOwnedInternal("fixtures:fundraisingControl", {
            entryId: entry._id,
            cutoff: at + 259200000,
            reason: "withdrawal",
          });
          for (const tracked of [true, false]) {
            const sid = await checkout(55, tracked);
            await deliver(
              backend.stripe.complete(sid, { at: at + 345600000, fee: 0 }),
            );
            await deliver(backend.stripe.refund(sid, 55));
            const d = (await ledger()).at(-1);
            assert.equal(d.commissionCents, 0);
            assert.equal(d.current.recognizedCommissionCents, 0);
            assert.equal(d.current.eligibleGrossCents, 0);
          }
          const own = await query(creator, "fundraising:reconciliation", {
            ...scope,
            audience: "creator",
          });
          assert.doesNotMatch(
            JSON.stringify(own),
            /acct_owned|paymentId|destinationBinding|prizeObligation|winner|refundId|digest|email/,
          );
          for (const [actor, audience] of [
            ["manager-b", "manager"],
            ["uninvited", "creator"],
          ])
            await assert.rejects(
              query(backend.client(actor), "fundraising:reconciliation", {
                ...scope,
                audience,
              }),
              /FORBIDDEN/,
            );
          const before = await ledger(),
            summary = await reconciliation();
          assert.deepEqual(
            await query(
              backend.client("manager-a"),
              "fundraising:reconciliation",
              { ...scope, audience: "manager" },
            ),
            summary,
          );
          await backend.restart();
          assert.deepEqual(await ledger(), before);
          assert.deepEqual(await reconciliation(), summary);
          await deliver(success);
          assert.deepEqual(await ledger(), before);
          assert.deepEqual(await reconciliation(), summary);
          const workspace = await query(
            creator,
            "creatorAccess:workspace",
            scope,
          );
          await mutation(manager, "creatorAccess:revoke", {
            ...scope,
            invitationId: workspace.invitation._id,
            operationId: "t11-revoke",
          });
          await assert.rejects(
            query(creator, "fundraising:reconciliation", {
              ...scope,
              audience: "creator",
            }),
            /FORBIDDEN/,
          );
          assert.ok(
            backend.stripe
              .operations()
              .every((o: any) => o.path === "/v1/checkout/sessions"),
          );
          results.push(
            "untracked/cutoff zero-commission refunds, scoped creator privacy/current revocation, two independent clients, actual persistence restart, no refund/payout/bank writes",
          );
        },
      );
      await writeFile(
        ".codex/ralph/t11-backend-evidence.json",
        JSON.stringify(
          {
            at: new Date().toISOString(),
            synthetic: true,
            validatedForProduction: false,
            results,
            ledger: await ledger(),
            reconciliation: await reconciliation(),
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

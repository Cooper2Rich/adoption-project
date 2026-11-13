import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import {
  promisedPrizes,
  replenishmentSchedule,
} from "../../convex/prizePolicy.ts";
import { mutation, query } from "./public-fixtures.ts";
import { fundraisingEntry } from "./fundraising-fixtures.ts";
import { donate } from "./standings-fixtures.ts";
import { servePhotoRequest } from "../../api/photos.ts";
import { controlledPrizeTransfer } from "../../convex/prizeTransport.ts";

import { prizeRules } from "./prize-fixtures.ts";
test("T15 full contained Chicago obligations, DST elapsed advance and gap/fold holds", () => {
  const p = promisedPrizes(prizeRules);
  assert.equal(p.periods.filter((p) => p.kind === "daily").length, 22);
  assert.equal(p.periods.filter((p) => p.kind === "weekly").length, 3);
  assert.equal(p.requiredCents, 370000);
  const s = replenishmentSchedule(prizeRules),
    spring = s.find((o) => o.local === "2026-03-15T00:00")!;
  assert.equal(spring.executionAt! - spring.advanceAt!, 86400000);
  assert.equal(
    new Date(
      s.find((o) => o.local === "2026-03-08T00:00")!.executionAt!,
    ).toISOString(),
    "2026-03-08T06:00:00.000Z",
  );
  const afterSpring = replenishmentSchedule({
    ...prizeRules,
    weeklyReplenishmentSchedule: { weekday: 1, time: "00:00" },
  }).find((o) => o.local === "2026-03-09T00:00")!;
  assert.equal(
    new Date(afterSpring.advanceAt!).toISOString(),
    "2026-03-08T05:00:00.000Z",
  );
  assert.match(
    replenishmentSchedule({
      ...prizeRules,
      weeklyReplenishmentSchedule: { weekday: 0, time: "02:30" },
    }).find((o) => o.local === "2026-03-08T02:30")!.hold!,
    /nonexistent/,
  );
  const fall = replenishmentSchedule({
    ...prizeRules,
    campaignStart: "2026-10-25T05:00:00.000Z",
    campaignEnd: "2026-11-09T06:00:00.000Z",
    weeklyReplenishmentSchedule: { weekday: 0, time: "01:30" },
  }).find((o) => o.local === "2026-11-01T01:30")!;
  assert.equal(fall.executionAt, null);
  assert.match(fall.hold!, /Ambiguous/);
  const gapRules = {
    ...prizeRules,
    weeklyReplenishmentSchedule: { weekday: 0, time: "02:30" },
  };
  assert.ok(
    !replenishmentSchedule({
      ...gapRules,
      campaignStart: "2026-03-08T17:00:00.000Z",
    }).some((o) => o.local === "2026-03-08T02:30"),
  );
  assert.ok(
    !replenishmentSchedule({
      ...gapRules,
      campaignEnd: "2026-03-08T07:00:00.000Z",
    }).some((o) => o.local === "2026-03-08T02:30"),
  );
  const foldRules = {
    ...prizeRules,
    campaignStart: "2026-11-01T06:45:00.000Z",
    campaignEnd: "2026-11-01T07:15:00.000Z",
    weeklyReplenishmentSchedule: { weekday: 0, time: "01:30" },
  };
  assert.equal(replenishmentSchedule(foldRules).length, 0);
  const partial = promisedPrizes({
    ...prizeRules,
    campaignStart: "2026-03-01T12:00:00.000Z",
    campaignEnd: "2026-03-22T12:00:00.000Z",
  });
  assert.equal(partial.periods.filter((p) => p.kind === "daily").length, 20);
  assert.equal(partial.requiredCents, 300000);
});

test(
  "T15 actual Convex protected purposes, journaled exact-once replenishment, failures and restarted reconciliation",
  { timeout: 360000 },
  async (t) => {
    const backend = await createLocalBackend(),
      manager = backend.client("manager-a"),
      scope = { campaignId: "adoption" };
    const read = () => query(manager, "prizeFunds:inspect", scope);
    const clock = (now: number, advance = false) =>
      backend.runOwnedInternal("fixtures:prizeControl", {
        ...scope,
        now,
        advance,
      });
    const evidence = (facts: any = {}) =>
      backend.runOwnedInternal("fixtures:prizeEvidence", { ...scope, facts });
    const job = (transfer: any) =>
      backend.runOwnedInternal("prizeJobs:run", {
        transferId: transfer._id,
        generation: transfer.generation,
      });
    const bridge = createServer(
      (req, res) =>
        void servePhotoRequest(
          req.url?.startsWith("/api/fundraising")
            ? backend.fundraisingService
            : backend.photoService,
          req,
          res,
        ),
    );
    bridge.listen(0, "127.0.0.1");
    await once(bridge, "listening");
    const base = `http://127.0.0.1:${(bridge.address() as import("node:net").AddressInfo).port}`;
    try {
      await clock(Date.parse("2026-02-27T06:00:00Z"));
      await mutation(manager, "campaignSetup:create", {
        ...scope,
        operationId: "t15-rules",
        rules: prizeRules,
      });
      const required = promisedPrizes(prizeRules).requiredCents;
      await mutation(manager, "operatorIncidents:registerContact", scope);
      await t.test(
        "manager-only reads/retries and producer boundary deny guest, creator, foreign nonprofit and administrator",
        async () => {
          const first = (await read()).occurrences[0];
          for (const subject of [
            undefined,
            "creator-a",
            "manager-b",
            "administrator",
          ]) {
            const c = backend.client(subject);
            await assert.rejects(
              query(c, "prizeFunds:inspect", scope),
              /FORBIDDEN/,
            );
            await assert.rejects(
              mutation(c, "prizeFunds:retry", {
                ...scope,
                occurrenceId: first._id,
              }),
              /FORBIDDEN/,
            );
          }
          await assert.rejects(
            mutation(manager, "prizeFunds:recordTrustedPrizeEvidence", {}),
            /not find|Could not find/,
          );
          assert.equal((await read()).covered, false);
          assert.equal((await read()).transfers.length, 0);
        },
      );
      await t.test(
        "all promised periods required; abundant advertising and future replenishment cannot fund prizes or source shortage",
        async () => {
          await evidence({
            fundraisingCents: 5000,
            prizeCents: required - 1,
            advertisingCents: 99999999,
            advertisingObligationsCents: 99999999,
            reservedCreatorCents: 3000,
            refundHoldCents: 1000,
          });
          const r = await read();
          assert.equal(r.requiredCents, 370000);
          assert.equal(r.covered, false);
          assert.equal(r.balances.availableCents, 1000);
          assert.equal(r.balances.advertisingCents, 99999999);
          const readiness = await query(manager, "readiness:read", scope);
          assert.equal(readiness.prizeCoverage.covered, false);
          assert.match(readiness.prizeCoverage.coverageReason, /full promised/);
          await assert.rejects(
            evidence({ nonprofitId: "nonprofit-b" }),
            /SCOPE/,
          );
          await assert.rejects(
            evidence({ beneficiary: "nonprofit-b" }),
            /SCOPE/,
          );
          await assert.rejects(evidence({ fundraisingCents: 0.5 }), /CENTS/);
          await evidence({ fundraisingCents: 100000, prizeCents: required });
          assert.equal((await read()).covered, true);
          await evidence({ fundraisingCents: null, prizeCents: required });
          assert.match((await read()).reason, /unknown/);
          assert.equal(
            (await query(manager, "readiness:read", scope)).prizeCoverage
              .covered,
            false,
          );
          await evidence({ fundraisingCents: -1, prizeCents: required });
          assert.equal((await read()).balances.availableCents, -1);
          assert.match((await read()).reason, /Negative/);
        },
      );
      let first: any;
      await t.test(
        "24 elapsed hour advance warning/outbox is manager-only and execution rechecks; hourly shortages transfer nothing",
        async () => {
          first = (await read()).occurrences.find(
            (o: any) => o.local === "2026-03-01T00:00",
          );
          await evidence({ fundraisingCents: 9999, prizeCents: required });
          await clock(first.advanceAt - 1, true);
          backend.email.mode("fail");
          assert.equal(
            (await read()).occurrences[0].advanceCheckedAt,
            undefined,
          );
          await clock(first.advanceAt, true);
          let r = await read();
          first = r.occurrences.find((o: any) => o._id === first._id);
          assert.equal(first.advanceCheckedAt, first.advanceAt);
          assert.equal(r.transfers.length, 0);
          const incidents = await query(
              manager,
              "operatorIncidents:list",
              scope,
            ),
            notice = incidents.find((i: any) => i.key === "prize:" + first._id);
          assert.match(
            notice.reason,
            /Scheduled 10000.*available 9999; shortfall 1/,
          );
          assert.equal(notice.resolutionRole, "manager");
          assert.ok(notice.notices.length);
          let failedEmails: any[] = [];
          for (let attempt = 0; attempt < 100; attempt++) {
            const current = (
              await query(manager, "operatorIncidents:list", scope)
            ).find((i: any) => i.key === "prize:" + first._id);
            failedEmails = current.notices.flatMap((n: any) => n.emails);
            if (
              failedEmails.some(
                (e) =>
                  e.failures === 1 &&
                  e.attempts.some((a: any) => a.state === "failed"),
              )
            )
              break;
            await delay(50);
          }
          assert.ok(
            failedEmails.some(
              (e) =>
                e.failures === 1 &&
                e.attempts.some((a: any) => a.state === "failed"),
            ),
          );
          assert.ok(
            failedEmails.every(
              (e) => !["accepted", "delivered"].includes(e.state),
            ),
          );
          backend.email.mode("delivered");
          assert.ok(
            notice.notices
              .flatMap((n: any) => n.emails)
              .every((e: any) => e.recipientRole === "Campaign manager"),
          );
          await evidence({ fundraisingCents: 50000, prizeCents: required });
          await clock(first.executionAt - 1, true);
          assert.equal((await read()).transfers.length, 0);
          await evidence({ fundraisingCents: 9999, prizeCents: required });
          await clock(first.executionAt, true);
          r = await read();
          assert.equal(r.transfers.length, 0);
          assert.equal(r.occurrences[0].state, "shortage");
          assert.equal(r.occurrences[0].nextAt, first.executionAt + 3600000);
          await evidence({ fundraisingCents: 10000, prizeCents: required });
          await clock(first.executionAt + 3599999, true);
          assert.equal((await read()).transfers.length, 0);
        },
      );
      await t.test(
        "concurrent/reordered jobs journal fixed amount before signed HTTP, lost response reserves source and no replacement",
        async () => {
          await clock(first.executionAt + 3600000);
          await Promise.all([
            mutation(manager, "prizeFunds:retry", {
              ...scope,
              occurrenceId: first._id,
            }),
            mutation(backend.client("manager-a"), "prizeFunds:retry", {
              ...scope,
              occurrenceId: first._id,
            }),
          ]);
          let r = await read();
          assert.equal(r.transfers.length, 1);
          let tr = r.transfers[0];
          assert.equal(tr.state, "journaled");
          assert.equal(tr.amountCents, 10000);
          assert.equal(r.balances.availableCents, 0);
          assert.equal(r.balances.prizeCents, required);
          assert.equal(backend.prize.calls.length, 0);
          backend.prize.setMode("lost");
          await Promise.all([job(tr), job(tr)]);
          r = await read();
          tr = r.transfers[0];
          assert.equal(tr.state, "unknown");
          assert.equal(
            backend.prize.calls.filter((c: any) => c.method === "POST").length,
            1,
          );
          assert.equal(backend.prize.records.size, 1);
          await evidence({ fundraisingCents: 10000, prizeCents: required });
          r = await read();
          assert.equal(r.balances.availableCents, 0);
          assert.equal(r.balances.reservedSourceCents, 10000);
          assert.equal(r.balances.prizeCents, required);
          assert.equal((await job(tr)).dispatched, false);
          backend.prize.setMode("lookup-failed");
          await clock(tr.nextAt);
          await job(tr);
          r = await read();
          assert.equal(r.transfers[0].state, "unknown");
          assert.equal(
            backend.prize.calls.filter((c: any) => c.method === "POST").length,
            1,
          );
        },
      );
      await t.test(
        "restart and revoked approving manager still allow system read-only reconciliation, with original key and exact settlement once",
        async () => {
          let r = await read(),
            tr = r.transfers[0];
          await backend.restart();
          await backend.runOwnedInternal("fixtures:readinessControl", {
            ...scope,
            managerActive: false,
          });
          await assert.rejects(
            mutation(manager, "prizeFunds:retry", {
              ...scope,
              occurrenceId: first._id,
            }),
            /FORBIDDEN/,
          );
          await backend.runOwnedInternal("fixtures:prizeControl", {
            ...scope,
            replacementManager: "replacement-manager",
          });
          await mutation(
            backend.client("replacement-manager"),
            "prizeFunds:retry",
            { ...scope, occurrenceId: first._id },
          );
          tr = (
            await query(
              backend.client("replacement-manager"),
              "prizeFunds:inspect",
              scope,
            )
          ).transfers[0];
          await clock(tr.nextAt);
          backend.prize.setMode("settled");
          await job(tr);
          await backend.runOwnedInternal("fixtures:readinessControl", {
            ...scope,
            managerActive: true,
          });
          r = await read();
          tr = r.transfers[0];
          assert.equal(tr.state, "settled");
          assert.equal(r.occurrences[0].state, "fulfilled");
          assert.equal(r.balances.prizeCents, required + 10000);
          assert.equal(r.balances.availableCents, 0);
          assert.equal(
            backend.prize.calls.filter((c: any) => c.method === "POST").length,
            1,
          );
          await job(tr);
          await backend.runOwnedInternal("prizeFunds:wake", {
            occurrenceId: first._id,
          });
          assert.equal((await read()).transfers.length, 1);
          await evidence({
            fundraisingCents: 0,
            prizeCents: required + 10000,
            reflectedTransfers: [tr._id],
          });
          r = await read();
          assert.equal(r.balances.reservedSourceCents, 0);
          assert.equal(r.balances.prizeCents, required + 10000);
          assert.equal(r.balances.availableCents, 0);
          await assert.rejects(
            evidence({
              fundraisingCents: 999999,
              prizeCents: required,
              reflectedTransfers: [],
            }),
            /HISTORY/,
          );
        },
      );
      await t.test(
        "current revision/approval fences stop journal dispatch and pending outcome has no prize credit",
        async () => {
          let r = await read();
          const second = r.occurrences.find(
              (o: any) => o.local === "2026-03-08T00:00",
            ),
            settled = r.transfers[0];
          await clock(second.advanceAt);
          await evidence({
            fundraisingCents: 20000,
            prizeCents: required + 10000,
            reflectedTransfers: [settled._id],
          });
          await clock(second.advanceAt, true);
          await clock(second.executionAt, true);
          r = await read();
          let tr = r.transfers.find((x: any) => x.occurrenceId === second._id);
          assert.ok(tr);
          await backend.runOwnedInternal("fixtures:readinessControl", {
            ...scope,
            financeRevision: "t15-changed",
          });
          assert.equal((await job(tr)).dispatched, false);
          assert.equal(
            backend.prize.calls.filter((c: any) => c.method === "POST").length,
            1,
          );
          assert.match((await read()).reason, /obsolete/);
          // A journaled transfer's approval cannot be silently rewritten after a revision.
          await backend.runOwnedInternal("fixtures:readinessControl", {
            ...scope,
            financeRevision: "finance-1",
          });
          tr = (await read()).transfers.find((x: any) => x._id === tr._id);
          await clock(tr.nextAt);
          backend.prize.setMode("pending");
          await job(tr);
          r = await read();
          tr = r.transfers.find((x: any) => x._id === tr._id);
          assert.equal(tr.state, "pending");
          assert.equal(r.balances.prizeCents, required + 10000);
          assert.equal(r.balances.availableCents, 10000);
          await evidence({
            fundraisingCents: 10000,
            prizeCents: required + 10000,
            reflectedTransfers: [settled._id],
            sourceReflectedTransfers: [settled._id, tr._id],
          });
          r = await read();
          assert.equal(r.balances.availableCents, 10000);
          assert.equal(r.balances.prizeCents, required + 10000);
          assert.equal(r.balances.reservedSourceCents, 0);
          const oldGeneration = tr.generation;
          await clock(tr.nextAt);
          await backend.runOwnedInternal("prizeFunds:watchdog", {
            transferId: tr._id,
            generation: tr.generation,
          });
          backend.prize.settle(tr.key);
          const late = await controlledPrizeTransfer({
            origin: backend.prize.origin,
            secret: backend.prize.secret,
            reconcile: true,
            transfer: tr,
          });
          assert.equal(late.outcome, "settled");
          await backend.runOwnedInternal("prizeFunds:settle", {
            transferId: tr._id,
            generation: oldGeneration,
            ...late,
          });
          r = await read();
          tr = r.transfers.find((x: any) => x._id === tr._id);
          assert.equal(tr.state, "settled");
          assert.equal(r.balances.prizeCents, required + 20000);
          assert.equal(
            backend.prize.calls.filter((c: any) => c.method === "POST").length,
            2,
          );
          await backend.runOwnedInternal("prizeFunds:settle", {
            transferId: tr._id,
            generation: oldGeneration,
            ...late,
          });
          assert.equal((await read()).balances.prizeCents, required + 20000);
        },
      );
      await t.test(
        "multiple overdue obligations compete for one fixed amount without borrowing or fabricated advance history",
        async () => {
          await clock(Date.parse("2026-03-22T05:00:00Z"));
          const before = await read();
          await evidence({
            fundraisingCents: 10000,
            prizeCents: required,
            reflectedTransfers: before.transfers.map((x: any) => x._id),
          });
          await backend.runOwnedInternal("fixtures:prizeControl", {
            ...scope,
            advance: true,
          });
          const r = await read(),
            late = r.occurrences.find(
              (o: any) => o.local === "2026-03-15T00:00",
            ),
            last = r.occurrences.find(
              (o: any) => o.local === "2026-03-22T00:00",
            );
          assert.equal(r.transfers.length, 3);
          assert.equal(late.state, "journaled");
          assert.equal(last.state, "shortage");
          assert.equal(last.availableCents, 0);
          assert.equal(
            late.advanceCheckedAt,
            Date.parse("2026-03-22T05:00:00Z"),
          );
          assert.notEqual(late.advanceCheckedAt, late.advanceAt);
          assert.ok(
            r.audit.some((a: any) => a.action === "advance-check-late"),
          );
          const notices = await query(manager, "operatorIncidents:list", scope);
          assert.ok(
            notices
              .find((i: any) => i.key === "prize:" + late._id)
              .notices.some((n: any) => n.hold),
          );
        },
      );
      await t.test(
        "confirmed donation gross/current commission and unpaid approval protect source; later canonical refund read invalidates coverage",
        async () => {
          const before = await read(),
            reflected = before.transfers
              .filter((t: any) => t.state === "settled")
              .map((t: any) => t._id);
          await backend.runOwnedInternal("fixtures:terms", {
            campaignSlug: "adoption",
            synthetic: true,
          });
          const entry = await fundraisingEntry(backend, base, "t15-protection");
          const sessionId = await donate(
            backend,
            base,
            entry._id,
            10000,
            Date.parse("2026-03-01T07:00:00Z"),
            null,
          );
          assert.match((await read()).reason, /obsolete/);
          await evidence({
            fundraisingCents: 11000,
            prizeCents: required,
            reflectedTransfers: reflected,
          });
          let r = await read();
          assert.equal(r.balances.requiredCreatorCents, 1000);
          assert.equal(r.balances.reservedCreatorCents, 1000);
          assert.equal(r.balances.availableCents, 0);
          await assert.rejects(
            evidence({
              reservedCreatorCents: 999,
              reflectedTransfers: reflected,
            }),
            /INVALID/,
          );
          const rows = await query(manager, "fundraising:ledger", {
            ...scope,
            audience: "manager",
          });
          assert.equal(rows[0].grossCents, 10000);
          assert.equal(rows[0].commissionCents, 1000);
          await backend.runOwnedInternal("fixtures:fundraisingEvidence", {
            donationId: rows[0].id,
            action: "obligation",
            facts: {},
          });
          await evidence({
            fundraisingCents: 11000,
            prizeCents: required,
            reflectedTransfers: reflected,
          });
          assert.equal((await read()).balances.requiredCreatorCents, 1000);
          const priorRevision = (await read()).revision,
            session = backend.stripe
              .sessions()
              .find((s: any) => s.id === sessionId);
          backend.stripe.mutatePayment(session.payment_intent, (p: any) => {
            p.latest_charge.balance_transaction = {
              id: "txn_t15_late",
              object: "balance_transaction",
              source: p.latest_charge.id,
              amount: p.amount,
              currency: "usd",
              fee: 32,
            };
          });
          const delivered = await backend.stripe.deliver(
            backend.stripe.event(
              sessionId,
              "checkout.session.async_payment_succeeded",
            ),
            base + "/api/fundraising?action=webhook",
          );
          assert.equal(delivered.status, 200, await delivered.text());
          assert.notEqual((await read()).revision, priorRevision);
          assert.match((await read()).reason, /obsolete/);
          const pending = (await read()).transfers.find(
            (t: any) => t.state === "journaled",
          );
          assert.equal((await job(pending)).dispatched, false);
          assert.equal(
            backend.prize.calls.filter((c: any) => c.method === "POST").length,
            2,
          );
          const pendingEvent = backend.stripe.refund(sessionId, 600, "pending"),
            refundId = pendingEvent.data.object.id;
          const deliverRefund = async (event: any) => {
            const response = await backend.stripe.deliver(
              event,
              base + "/api/fundraising?action=webhook",
            );
            assert.equal(response.status, 200, await response.text());
          };
          await deliverRefund(pendingEvent);
          await assert.rejects(
            evidence({
              fundraisingCents: 11600,
              prizeCents: required,
              reflectedTransfers: reflected,
              refundHoldCents: 599,
            }),
            /REFUND_RESERVE/,
          );
          await evidence({
            fundraisingCents: 11600,
            prizeCents: required,
            reflectedTransfers: reflected,
            refundHoldCents: 600,
          });
          assert.equal((await read()).balances.availableCents, 0);
          assert.equal((await read()).balances.requiredRefundCents, 600);
          const reflectedRefund = {
            account: backend.stripe.account,
            refundId,
            amountCents: 600,
          };
          await evidence({
            fundraisingCents: 11000,
            prizeCents: required,
            reflectedTransfers: reflected,
            reflectedRefunds: [reflectedRefund],
          });
          assert.equal((await read()).balances.availableCents, 0);
          assert.equal((await read()).balances.refundHoldCents, 0);
          await assert.rejects(
            evidence({
              reflectedTransfers: reflected,
              reflectedRefunds: [{ ...reflectedRefund, amountCents: 599 }],
            }),
            /REFLECTION_SCOPE/,
          );
          await assert.rejects(
            evidence({
              reflectedTransfers: reflected,
              reflectedRefunds: [
                { ...reflectedRefund, account: "another-account" },
              ],
            }),
            /REFLECTION_SCOPE/,
          );
          backend.stripe.mutateRefund(refundId, { status: "requires_action" });
          await deliverRefund(backend.stripe.refundEvent(sessionId, refundId));
          await evidence({
            fundraisingCents: 11000,
            prizeCents: required,
            reflectedTransfers: reflected,
            reflectedRefunds: [reflectedRefund],
          });
          assert.equal((await read()).balances.requiredRefundCents, 600);
          assert.equal((await read()).balances.availableCents, 0);
          backend.stripe.mutateRefund(refundId, { status: "failed" });
          await deliverRefund(backend.stripe.refundEvent(sessionId, refundId));
          await evidence({
            fundraisingCents: 11600,
            prizeCents: required,
            reflectedTransfers: reflected,
          });
          assert.equal((await read()).balances.requiredRefundCents, 0);
          assert.equal((await read()).balances.availableCents, 600);
          const canceled = backend.stripe.refund(sessionId, 200, "pending");
          await deliverRefund(canceled);
          backend.stripe.mutateRefund(canceled.data.object.id, {
            status: "canceled",
          });
          await deliverRefund(
            backend.stripe.refundEvent(sessionId, canceled.data.object.id),
          );
          await evidence({
            fundraisingCents: 11600,
            prizeCents: required,
            reflectedTransfers: reflected,
          });
          assert.equal((await read()).balances.requiredRefundCents, 0);
          const preserved = await query(manager, "fundraising:ledger", {
            ...scope,
            audience: "manager",
          });
          assert.equal(preserved[0].grossCents, 10000);
          assert.equal(preserved[0].current.recognizedCommissionCents, 1000);
          const stored = await backend.ownedFundraisingOperation("resolve", {
            sessionId,
          });
          await backend.ownedFundraisingOperation("refundRead", {
            checkoutId: stored._id,
            eventId: "evt_t15_unfinished",
            digest: "a".repeat(64),
          });
          r = await read();
          assert.equal(r.covered, false);
        },
      );
      await t.test(
        "unknown/expired scope stays held; full schedule and settled history survive restart",
        async () => {
          const r = await read(),
            snapshot = r.evidence!;
          await clock(snapshot.input.expiresAt);
          assert.equal((await read()).covered, false);
          assert.match((await read()).reason, /obsolete|stale/);
          await backend.restart();
          assert.equal((await read()).transfers.length, 3);
          assert.equal((await read()).requiredCents, required);
          await mkdir(".codex/ralph/t15", { recursive: true });
          await writeFile(
            ".codex/ralph/t15/backend-evidence.json",
            JSON.stringify(
              {
                synthetic: true,
                actualFinancialAuthority: "held",
                snapshot: await read(),
                providerWrites: backend.prize.calls.filter(
                  (c: any) => c.method === "POST",
                ).length,
              },
              null,
              2,
            ) + "\n",
            "utf8",
          );
        },
      );
      await t.test(
        "DST gap holds current coverage/readiness and exact account reconfiguration invalidates purpose evidence",
        async () => {
          const other = { campaignId: "other" },
            otherManager = backend.client("manager-b");
          await backend.runOwnedInternal("fixtures:prizeControl", {
            ...other,
            now: Date.parse("2026-02-27T06:00:00Z"),
          });
          await mutation(otherManager, "campaignSetup:create", {
            ...other,
            operationId: "t15-gap",
            rules: {
              ...prizeRules,
              weeklyReplenishmentSchedule: { weekday: 0, time: "02:30" },
            },
          });
          await backend.runOwnedInternal("fixtures:prizeEvidence", {
            ...other,
            facts: { fundraisingCents: 999999, prizeCents: required },
          });
          let r = await query(otherManager, "prizeFunds:inspect", other);
          assert.equal(r.covered, false);
          assert.match(r.reason, /2026-03-08T02:30/);
          assert.ok(
            r.occurrences.some((o: any) => o.state === "schedule-held"),
          );
          await mutation(
            backend.client("administrator"),
            "readiness:configureScope",
            {
              ...other,
              expectedVersion: 0,
              accounts: { stripe: "a".repeat(64) },
              selectedProviders: [],
            },
          );
          r = await query(otherManager, "prizeFunds:inspect", other);
          assert.match(r.reason, /obsolete/);
          await assert.rejects(
            backend.runOwnedInternal("fixtures:prizeEvidence", {
              ...other,
              facts: { financialAccountBinding: "b".repeat(64) },
            }),
            /ACCOUNT/,
          );
          assert.equal(
            (await query(otherManager, "readiness:read", other)).prizeCoverage
              .covered,
            false,
          );
        },
      );
    } finally {
      await new Promise<void>((r) => bridge.close(() => r()));
      await backend.stop();
    }
  },
);

import type { DemoRecords } from "./demo-types.ts";
import {
  checked,
  initialPosition,
  positionProjection,
} from "./finance-money.ts";
import { operationId } from "./finance-operations.ts";

// Rebuild as-of facts from bounded indexed source pages. Current projections cannot
// answer historical cutoffs because a later refund must not rewrite a closed week.
export function historicalEarnings(
  records: DemoRecords,
  campaignId: any,
  creatorId: any,
  period: any,
) {
  const out: Record<string, any> = {
    capturedAccrualCents: 0,
    settledEligibleCommissionCents: 0,
    periodBaseCents: 0,
    heldCents: 0,
    heldReasons: [] as any[],
    journalSourceIds: [] as any[],
    adjustments: [] as any[],
  };
  let cursor: any = null;
  do {
    const page = records.page("contributions", {
      campaignId,
      cursor,
      limit: 100,
      through: period.endsAt,
    });
    cursor = page.nextCursor;
    for (const c of page.items) {
      if (c.purpose !== "public") continue;
      const intent = records.get("gift_intents", c.intentId);
      let p = initialPosition(c),
        sequence = 0,
        completedAt: any = null;
      const sourceIds: any[] = [],
        late: any[] = [];
      for (;;) {
        const events = records.appliedEventPage(c.id, sequence);
        for (const { sequence: n, result } of events.slice(0, 100)) {
          sequence = n;
          const e = records.get("source_events", result.sourceRecordId);
          if (
            result.effectiveAt > period.cutoff ||
            e.effectiveAt > period.cutoff
          )
            continue;
          if (e.type === "capture") {
            p.capturedCents = Math.max(p.capturedCents, e.amountCents);
            p.failed = false;
            completedAt ||= e.effectiveAt;
          }
          if (e.type === "failed" && !p.capturedCents) p.failed = true;
          if (e.type === "settlement")
            p.settledCents = Math.max(p.settledCents, e.amountCents);
          if (["refund", "dispute_loss"].includes(e.type))
            p.refundedCents = Math.max(p.refundedCents, e.amountCents);
          if (
            ["dispute", "dispute_release", "dispute_loss"].includes(e.type) &&
            (!p.disputeEffectiveAt || e.effectiveAt >= p.disputeEffectiveAt)
          ) {
            p.disputed = e.type === "dispute";
            p.disputeEffectiveAt = e.effectiveAt;
          }
          const tx = records.get(
            "journal_transactions",
            result.lastTransactionId || "",
          );
          if (tx?.attribution) {
            p.eligibility = tx.attribution;
            p.creatorId = tx.creatorId;
          }
          sourceIds.push(e.id);
          const original = completedAt
            ? records.periodAt(campaignId, completedAt)
            : null;
          const receiptPeriod = records.periodAt(
            campaignId,
            result.effectiveAt,
          );
          if (
            original &&
            original.id !== period.id &&
            receiptPeriod?.id === period.id &&
            (result.effectiveAt > original.cutoff ||
              e.effectiveAt >= original.endsAt)
          )
            late.push({
              sourceRecordId: e.id,
              contributionId: c.id,
              originalPeriodId: original.id,
              adjustmentPeriodId: period.id,
            });
        }
        if (events.length <= 100) break;
      }
      p.conflicted = records.hasFinanceConflict(c.id, period.cutoff);
      p = positionProjection(c, p);
      if (p.creatorId !== creatorId && intent?.binding?.creatorId !== creatorId)
        continue;
      if (!completedAt || completedAt >= period.endsAt) {
        if (!completedAt && !p.failed && c.effectiveAt < period.endsAt)
          out.heldReasons.push("PENDING_CAPTURE_OR_ELIGIBILITY");
        continue;
      }
      out.capturedAccrualCents += p.creatorCents;
      out.settledEligibleCommissionCents += p.availableCreatorCents;
      out.heldCents += p.creatorCents - p.availableCreatorCents;
      if (!p.eligibility?.eligible)
        out.heldReasons.push("ATTRIBUTION_ELIGIBILITY_PENDING");
      if (p.disputed || p.conflicted)
        out.heldReasons.push("SOURCE_OR_DISPUTE_HOLD");
      if (p.capturedCents > p.settledCents && p.creatorCents)
        out.heldReasons.push("CAPTURED_UNSETTLED");
      if (completedAt >= period.startsAt) out.periodBaseCents += p.creatorCents;
      out.journalSourceIds.push(...sourceIds);
      out.adjustments.push(...late);
    }
  } while (cursor);
  for (const key of [
    "capturedAccrualCents",
    "settledEligibleCommissionCents",
    "periodBaseCents",
    "heldCents",
  ])
    checked(BigInt(out[key]));
  out.heldReasons = [...new Set(out.heldReasons)];
  out.journalSourceIds = [...new Set(out.journalSourceIds)].sort();
  return out;
}

export function creatorStatement(
  records: DemoRecords,
  campaignId: any,
  creatorId: any,
  period: any,
) {
  const e = historicalEarnings(records, campaignId, creatorId, period);
  const totals = records.operationTotals(campaignId, { creatorId });
  const guaranteeId = operationId(
    campaignId,
    "seed_commitment",
    `guarantee:${creatorId}:${period.startsAt}`,
  );
  const guarantee = records.get("reservations", guaranteeId);
  const seed = records.financeTotals(campaignId),
    commitments = records.operationTotals(campaignId);
  let topUpCents = 0,
    guaranteePending = false;
  const guaranteeAdjustments: any[] = [];
  let cursor = "";
  for (;;) {
    const page = records.subjectPage(
      "reservations",
      campaignId,
      "creatorId",
      creatorId,
      cursor,
    );
    for (const r of page) {
      if (r.kind !== "guarantee" || r.periodEnd > period.endsAt) continue;
      const original = records.periodAt(campaignId, r.periodStart);
      const evidence = historicalEarnings(records, campaignId, creatorId, {
        id: original?.id || period.id,
        startsAt: r.periodStart,
        endsAt: r.periodEnd,
        cutoff: period.cutoff,
      });
      let pending =
        evidence.heldReasons.length > 0 || records.pendingCount(campaignId) > 0;
      if (
        !original ||
        original.endsAt !== r.periodEnd ||
        original.cutoff !== r.cutoff ||
        r.cutoff > period.cutoff
      ) {
        pending = true;
        e.heldReasons.push("GUARANTEE_PERIOD_CONFIG_MISMATCH");
      }
      if (
        seed.availableSeedGuaranteeCents <
        commitments.reservedGuaranteeCents + commitments.usedGuaranteeCents
      ) {
        pending = true;
        e.heldReasons.push("SEED_SHORTFALL_HOLD");
      }
      guaranteePending ||= pending;
      e.heldReasons.push(...evidence.heldReasons);
      const required = pending
        ? 0
        : Math.max(0, r.amountCents - evidence.periodBaseCents);
      const used = records.operationTotals(campaignId, {
        reservationId: r.id,
      }).usedGuaranteeCents;
      guaranteeAdjustments.push({
        reservationId: r.id,
        originalPeriodId: original?.id || null,
        floorCents: r.amountCents,
        baseCommissionCents: evidence.periodBaseCents,
        topUpCents: required,
        newTopUpCents: Math.max(0, required - used),
        pending,
      });
      topUpCents += required;
    }
    if (page.length < 100) break;
    cursor = page.at(-1).id;
  }
  if (records.pendingCount(campaignId))
    e.heldReasons.push("PENDING_RECONCILIATION");
  const recoveryCents = Math.max(
    0,
    totals.paidBaseCents - e.capturedAccrualCents,
  );
  const baseCents = Math.max(
    0,
    e.settledEligibleCommissionCents -
      totals.reservedBaseCents -
      totals.paidBaseCents,
  );
  if (
    totals.reservedBaseCents > 0 &&
    totals.reservedBaseCents + totals.paidBaseCents >
      e.settledEligibleCommissionCents
  )
    e.heldReasons.push("APPROVED_BATCH_RECONCILIATION_HOLD");
  const unpaidTopUpCents = Math.max(
    0,
    totals.usedGuaranteeCents -
      totals.paidTopUpCents -
      totals.reservedTopUpCents,
  );
  const newTopUpCents = checked(
    guaranteeAdjustments.reduce(
      (n: any, a: any) => n + BigInt(a.newTopUpCents),
      0n,
    ),
  );
  checked(BigInt(topUpCents));
  e.heldReasons = [...new Set(e.heldReasons)];
  const held =
    e.heldReasons.length > 0 || guaranteePending || recoveryCents > 0;
  return {
    campaignId,
    creatorId,
    mode: "simulated",
    currency: "USD",
    periodId: period.id,
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    cutoff: period.cutoff,
    ...e,
    creatorCommissionBps: 1000,
    guaranteeCents: guarantee?.amountCents || null,
    guaranteeReservationId: guarantee?.id || null,
    guaranteePending,
    guaranteeAdjustments,
    topUpCents,
    newTopUpCents,
    unpaidTopUpCents,
    priorPaymentsCents: totals.paidBaseCents + totals.paidTopUpCents,
    priorBasePaymentsCents: totals.paidBaseCents,
    reservedBaseCents: totals.reservedBaseCents,
    reservedTopUpCents: totals.reservedTopUpCents,
    recoveryCents,
    recoveryHold: recoveryCents > 0,
    basePayableCents: held ? 0 : baseCents,
    topUpPayableCents: held ? 0 : newTopUpCents + unpaidTopUpCents,
    payableCents: held ? 0 : baseCents + newTopUpCents + unpaidTopUpCents,
  };
}

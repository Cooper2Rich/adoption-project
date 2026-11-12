import { rows } from "./analytics-common.ts";
import type { DemoRecords } from "./demo-types.ts";
import {
  checked,
  initialPosition,
  positionProjection,
} from "./finance-money.ts";

// Reconstruct from immutable applied facts, not today's mutable balance projection.
// A later refund can produce a correction without rewriting a published result.
export function giftEvidence(
  records: DemoRecords,
  campaignId: any,
  basis: any,
  creatorId: any,
  cutoff: any,
  distributionIds: any = [],
) {
  const out: Record<string, any> = {
    eligibleSettledGiftCount: 0,
    netSettledEligibleGrossCents: 0,
    grossGiftCents: 0,
    refundCents: 0,
    creditedCommissionCents: 0,
    beneficiaryBeforeFeesCents: 0,
    gifts: [] as any[],
    reasons: [] as any[],
  };
  for (const c of rows(records, "contributions", campaignId, basis.endsAt)) {
    if (c.purpose !== "public") continue;
    const intent = records.get("gift_intents", c.intentId);
    let binding = intent?.binding;
    let p = initialPosition(c),
      sequence = 0,
      completedAt: any = null;
    const sourceIds: any[] = [];
    for (;;) {
      const events = records.appliedEventPage(c.id, sequence);
      for (const { sequence: n, result } of events.slice(0, 100)) {
        sequence = n;
        const e = records.get("source_events", result.sourceRecordId);
        if (e.effectiveAt > cutoff || result.effectiveAt > cutoff) continue;
        if (e.type === "capture") {
          p.capturedCents = Math.max(p.capturedCents, e.amountCents);
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
          binding = tx.attribution.binding || binding;
        }
        sourceIds.push(e.id);
      }
      if (events.length <= 100) break;
    }
    p.conflicted = records.hasFinanceConflict(c.id, cutoff);
    p = positionProjection(c, p);
    // Audited suspense resolutions live in journal attribution, not the frozen intent.
    const d = records.get(
      "distributions",
      binding?.distributionId || p.eligibility?.distributionId || "",
    );
    if (!d) {
      if (
        completedAt &&
        completedAt >= basis.startsAt &&
        completedAt < basis.endsAt &&
        p.capturedCents > p.refundedCents
      )
        out.reasons.push("UNALLOCATED_DONATION_RECONCILIATION_PENDING");
      continue;
    }
    if (
      !distributionIds.includes(d.id) ||
      d.mode !== basis.mode ||
      d.channel !== basis.channel ||
      d.placement !== basis.placement ||
      d.paid !== basis.paid ||
      (creatorId && d.creatorId !== creatorId)
    )
      continue;
    if (!completedAt) {
      if (
        !p.failed &&
        c.effectiveAt >= basis.startsAt &&
        c.effectiveAt < basis.endsAt
      )
        out.reasons.push("DONATION_OUTCOMES_PENDING");
      continue;
    }
    if (completedAt < basis.startsAt || completedAt >= basis.endsAt) continue;
    if (
      p.disputed ||
      p.conflicted ||
      !p.eligibility?.eligible ||
      p.capturedCents !== p.settledCents
    )
      out.reasons.push("DONATION_RECONCILIATION_PENDING");
    const net = p.settledVotes
      ? Math.max(0, p.settledCents - p.refundedCents)
      : 0;
    out.eligibleSettledGiftCount += p.settledVotes;
    out.netSettledEligibleGrossCents += net;
    out.grossGiftCents += p.publicGrossCents;
    out.refundCents += p.publicRefundCents;
    out.creditedCommissionCents += p.creatorCents;
    out.beneficiaryBeforeFeesCents += p.beneficiaryCents;
    out.gifts.push({
      contributionId: c.id,
      distributionId: d.id,
      sourceIds,
      settledVote: p.settledVotes,
      netSettledEligibleGrossCents: net,
      state: p.state,
    });
  }
  for (const [key, value] of Object.entries(out))
    if (typeof value === "number") out[key] = checked(BigInt(value));
  out.reasons = [...new Set(out.reasons)];
  return out;
}

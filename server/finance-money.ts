import { AppError } from "./domain.ts";

export function cents(value: any) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new AppError("USD cents must be nonnegative safe integers.");
  return value;
}
export function checked(value: any) {
  const n = Number(value);
  return cents(n);
}
export function splitGift(grossCents: any) {
  const gross = BigInt(cents(grossCents));
  const creatorCents = checked((gross * 1000n + 5000n) / 10000n);
  return { creatorCents, beneficiaryCents: grossCents - creatorCents };
}
// Recompute entitlement from the remaining base, never round each refund.
export function refundSplit(grossCents: any, cumulativeRefundCents: any) {
  cents(grossCents);
  cents(cumulativeRefundCents);
  if (cumulativeRefundCents > grossCents)
    throw new AppError("REFUND_EXCEEDS_CAPTURE", 409);
  return splitGift(grossCents - cumulativeRefundCents);
}
export function recoveryBalance(earnedCents: any, paidCents: any) {
  return Math.max(0, cents(paidCents) - cents(earnedCents));
}
export function remainingAllocations(
  allocations: any,
  total: any,
  remaining: any,
) {
  cents(total);
  cents(remaining);
  if (
    total === 0 ||
    remaining > total ||
    allocations.reduce(
      (n: any, a: any) => n + BigInt(cents(a.amountCents)),
      0n,
    ) !== BigInt(total)
  )
    throw new AppError("Invalid remaining allocation base.");
  let assigned = 0;
  const result = allocations.map((a: any) => {
    const amountCents = checked(
      (BigInt(remaining) * BigInt(a.amountCents)) / BigInt(total),
    );
    assigned += amountCents;
    return { ...a, amountCents };
  });
  // Largest remainder with stable consent order as the tie breaker.
  const order = allocations
    .map((a: any, i: any) => ({
      i,
      remainder: (BigInt(remaining) * BigInt(a.amountCents)) % BigInt(total),
    }))
    .sort((a: any, b: any) =>
      a.remainder === b.remainder
        ? a.i - b.i
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  for (let i = 0; i < remaining - assigned; i++)
    result[order[i].i].amountCents++;
  return result;
}

export function initialPosition(contribution: any): Record<string, any> {
  return {
    id: contribution.id,
    campaignId: contribution.campaignId,
    mode: contribution.mode,
    effectiveAt: contribution.effectiveAt,
    capturedCents: 0,
    settledCents: 0,
    refundedCents: 0,
    disputed: false,
    conflicted: false,
    failed: false,
    eligibility: null,
    creatorId: null,
    lastTransactionId: null,
  };
}
export function positionProjection(contribution: any, position: any) {
  const p = { ...position };
  const net = p.capturedCents - p.refundedCents;
  const held = p.disputed || p.conflicted;
  const publicGift = contribution.purpose === "public";
  const eligible = publicGift && p.eligibility?.eligible;
  const available = Math.max(0, p.settledCents - p.refundedCents);
  const restricted = publicGift
    ? []
    : remainingAllocations(
        contribution.allocations,
        contribution.amountCents,
        net,
      );
  const settled = publicGift
    ? []
    : remainingAllocations(
        contribution.allocations,
        contribution.amountCents,
        available,
      );
  const amount = (list: any, key: any) =>
    list.find((a: any) => `${a.purpose}:${a.use}` === key)?.amountCents || 0;
  Object.assign(p, {
    state:
      p.refundedCents === p.capturedCents && p.capturedCents > 0
        ? "refunded"
        : p.refundedCents > 0
          ? "partially_refunded"
          : p.settledCents > 0
            ? "settled"
            : p.capturedCents > 0
              ? "captured"
              : p.failed
                ? "failed"
                : "pending",
    publicGrossCents: eligible ? p.capturedCents : 0,
    publicRefundCents: eligible ? p.refundedCents : 0,
    publicNetCents: eligible ? net : 0,
    unallocatedCents: publicGift && !eligible ? net : 0,
    pendingCents: p.failed ? 0 : contribution.amountCents - p.capturedCents,
    pendingPublicCents:
      publicGift && !p.failed ? contribution.amountCents - p.capturedCents : 0,
    creatorCents: eligible ? splitGift(net).creatorCents : 0,
    beneficiaryCents: eligible ? splitGift(net).beneficiaryCents : 0,
    availableCreatorCents:
      eligible && !held ? splitGift(available).creatorCents : 0,
    availableBeneficiaryCents:
      eligible && !held ? splitGift(available).beneficiaryCents : 0,
    votes: eligible && net > 0 && !held ? 1 : 0,
    settledVotes: eligible && available > 0 && !held ? 1 : 0,
    seedGuaranteeCents: amount(restricted, "seed:guarantee"),
    seedAppUseCents: amount(restricted, "seed:app_use"),
    mediaCents: amount(restricted, "media:ad_budget"),
    availableSeedGuaranteeCents: held ? 0 : amount(settled, "seed:guarantee"),
    availableSeedAppUseCents: held ? 0 : amount(settled, "seed:app_use"),
    availableMediaCents: held ? 0 : amount(settled, "media:ad_budget"),
    heldCents: held ? net : 0,
    publicHeldCents: publicGift && held ? net : 0,
  });
  return p;
}
export function targetAccounts(
  contribution: any,
  position: any,
): Record<string, number> {
  const p = positionProjection(contribution, position);
  const net = p.capturedCents - p.refundedCents;
  return {
    clearing: net - Math.max(0, p.settledCents - p.refundedCents),
    available: Math.max(0, p.settledCents - p.refundedCents),
    creator: -p.creatorCents,
    beneficiary: -p.beneficiaryCents,
    suspense: -p.unallocatedCents,
    "seed:guarantee": -p.seedGuaranteeCents,
    "seed:app_use": -p.seedAppUseCents,
    "media:ad_budget": -p.mediaCents,
  };
}

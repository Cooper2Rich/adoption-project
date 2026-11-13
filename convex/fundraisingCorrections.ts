import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { MutationCtx, QueryCtx, Doc } from "./functions.ts";
import type { GenericId as Id } from "convex/values";
import { stableRequest } from "./access.ts";
import { cents, commission, sumCents } from "./fundraisingPolicy.ts";
import { recordTrustedIncident, safeText } from "./operatorIncidents.ts";

type Provenance = {
  source: string;
  evidence: string;
  actor: string;
  synthetic: boolean;
};
export async function currentCommission(
  ctx: QueryCtx,
  donation: Doc<"fundraisingDonations">,
) {
  const corrections = await ctx.db
    .query("fundraisingCorrections")
    .withIndex("by_donation", (q) => q.eq("donationId", donation._id))
    .collect();
  return (
    corrections.at(-1) ?? {
      refundedCents: 0,
      eligibleGrossCents: donation.eligible ? donation.grossCents : 0,
      recognizedCommissionCents: donation.commissionCents,
    }
  );
}
export async function managerNotice(
  ctx: MutationCtx,
  campaignId: string,
  key: string,
  kind:
    | "fundraising-discrepancy"
    | "commission-overpayment"
    | "fundraising-refund-held",
  active: boolean,
  reason: string,
  evidence: string,
  synthetic = true,
) {
  const head = await ctx.db
    .query("incidentHeads")
    .withIndex("by_stream", (q) =>
      q.eq("campaignSlug", campaignId).eq("key", key),
    )
    .unique();
  return recordTrustedIncident(
    ctx,
    {
      campaignId,
      key,
      kind,
      sequence: (head?.sequence ?? 0) + 1,
      observedAt: Date.now(),
      active,
      reason,
      evidence: evidence.slice(0, 200),
      resolutionRole: "manager",
    },
    {
      producer: "fundraising:trusted-corrections-v1",
      actor: "fundraising-service",
      synthetic,
    },
  );
}
export async function commissionBalances(
  ctx: QueryCtx,
  rows: Doc<"fundraisingDonations">[],
) {
  const groups = new Map<
    string,
    {
      creator: string;
      account: string;
      route: string;
      campaignSlug: string;
      nonprofitId: string;
      recognizedCents: number;
      paidCents: number;
      balanceCents: number;
      carryforwardCents: number;
      payableCents: number;
      managerReview: boolean;
    }
  >();
  for (const row of rows) {
    if (!row.creator) continue;
    const key = stableRequest([
      row.nonprofitId,
      row.campaignSlug,
      row.creator,
      row.account,
      row.route,
    ]);
    let group = groups.get(key);
    if (!group) {
      group = {
        creator: row.creator,
        account: row.account,
        route: row.route,
        campaignSlug: row.campaignSlug,
        nonprofitId: row.nonprofitId,
        recognizedCents: 0,
        paidCents: 0,
        balanceCents: 0,
        carryforwardCents: 0,
        payableCents: 0,
        managerReview: false,
      };
      const payments = await ctx.db
        .query("fundraisingCommissionPayments")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", row.campaignSlug))
        .collect();
      group.paidCents = sumCents(
        payments
          .filter(
            (p) =>
              p.nonprofitId === row.nonprofitId &&
              p.creator === row.creator &&
              p.account === row.account &&
              p.route === row.route,
          )
          .map((p) => p.amountCents),
      );
      groups.set(key, group);
    }
    group.recognizedCents = sumCents([
      group.recognizedCents,
      (await currentCommission(ctx, row)).recognizedCommissionCents,
    ]);
  }
  return [...groups.values()].map((g) => {
    g.balanceCents = sumCents([g.recognizedCents, -g.paidCents]);
    g.carryforwardCents = Math.min(0, g.balanceCents);
    g.payableCents = Math.max(0, g.balanceCents);
    g.managerReview = g.balanceCents < 0;
    return g;
  });
}
export async function refreshCommissionNotice(
  ctx: MutationCtx,
  donation: Doc<"fundraisingDonations">,
) {
  const rows = await ctx.db
    .query("fundraisingDonations")
    .withIndex("by_campaign", (q) =>
      q.eq("campaignSlug", donation.campaignSlug),
    )
    .collect();
  const group = (await commissionBalances(ctx, rows)).find(
    (g) =>
      g.creator === donation.creator &&
      g.nonprofitId === donation.nonprofitId &&
      g.account === donation.account &&
      g.route === donation.route,
  );
  if (!group) return;
  const key =
    "commission:" +
    bytesToHex(
      sha256(
        new TextEncoder().encode(
          stableRequest([
            donation.nonprofitId,
            donation.campaignSlug,
            donation.creator ?? "",
            donation.account,
            donation.route,
          ]),
        ),
      ),
    );
  // Incident keys are bounded; all controlled identifiers fit. Production owner must retain this scope binding.
  await managerNotice(
    ctx,
    donation.campaignSlug,
    key,
    "commission-overpayment",
    group.managerReview,
    group.managerReview
      ? "Confirmed paid commission exceeds corrected earnings. Offset future commissions only; fixed prizes remain unchanged."
      : "Commission carryforward has been consumed by future commission earnings.",
    `Commission balance ${group.balanceCents} USD cents; commission-only scope`,
  );
}

// Nonregistered integration seam for the actual scoring/import/certified-correction owners.
// It preserves finalized snapshots for every source; it cannot award or pay prizes.
export async function recordTrustedFundraisingPeriod(
  ctx: MutationCtx,
  input: {
    entryId: Id<"photoEntries">;
    periodKind: "daily" | "weekly";
    period: string;
    eligibleGrossCents: number;
    originalGrossCents: number;
    donationIds: Id<"fundraisingDonations">[];
  },
  provenance: Provenance,
) {
  cents(input.eligibleGrossCents);
  cents(input.originalGrossCents);
  for (const [value, max] of [
    [provenance.source, 80],
    [provenance.evidence, 200],
    [provenance.actor, 128],
    [input.period, 32],
  ] as const)
    safeText(value, max);
  const entry = await ctx.db.get(input.entryId);
  const campaign =
    entry &&
    (await ctx.db
      .query("campaigns")
      .withIndex("by_slug", (q) => q.eq("slug", entry.campaignSlug))
      .unique());
  if (
    !entry ||
    !campaign ||
    !!campaign.fixtureRunId !== provenance.synthetic ||
    (provenance.synthetic &&
      campaign.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID)
  )
    throw new Error("FUNDRAISING_PERIOD_SCOPE_DENIED");
  if (new Set(input.donationIds).size !== input.donationIds.length)
    throw new Error("FUNDRAISING_PERIOD_INPUT_SCOPE_DENIED");
  for (const id of input.donationIds) {
    const donation = await ctx.db.get(id);
    if (
      !donation ||
      donation.originEntryId !== entry._id ||
      donation.nonprofitId !== entry.nonprofitId ||
      donation.campaignSlug !== entry.campaignSlug ||
      !donation.eligible ||
      (input.periodKind === "daily"
        ? donation.dailyPeriod
        : donation.weeklyPeriod) !== input.period
    )
      throw new Error("FUNDRAISING_PERIOD_INPUT_SCOPE_DENIED");
  }
  const results = await ctx.db
    .query("fundraisingPeriodResults")
    .withIndex("by_entry", (q) => q.eq("entryId", entry._id))
    .collect();
  const previous = results
    .filter(
      (r) => r.periodKind === input.periodKind && r.period === input.period,
    )
    .at(-1);
  if (
    previous &&
    previous.eligibleGrossCents === input.eligibleGrossCents &&
    previous.originalGrossCents === input.originalGrossCents &&
    stableRequest(previous.donationIds) === stableRequest(input.donationIds)
  )
    return previous._id;
  const resultId = await ctx.db.insert("fundraisingPeriodResults", {
    ...input,
    campaignSlug: entry.campaignSlug,
    nonprofitId: entry.nonprofitId,
    metric: "FUNDRAISING",
    ...provenance,
    at: Date.now(),
    version: 1,
  });
  const snapshots = await ctx.db
    .query("fundraisingFinalizedSnapshots")
    .withIndex("by_entry", (q) => q.eq("entryId", entry._id))
    .collect();
  for (const snapshot of snapshots.filter(
    (s) => s.period === input.period && s.periodKind === input.periodKind,
  )) {
    if (snapshot.originalGrossCents === input.eligibleGrossCents) continue;
    await ctx.db.insert("fundraisingPeriodDiscrepancies", {
      snapshotId: snapshot._id,
      resultId,
      originalGrossCents: snapshot.originalGrossCents,
      correctedGrossCents: input.eligibleGrossCents,
      source: provenance.source,
      evidence: provenance.evidence,
      actor: provenance.actor,
      at: Date.now(),
      version: 1,
    });
    await managerNotice(
      ctx,
      entry.campaignSlug,
      `finalized:${snapshot._id}`,
      "fundraising-discrepancy",
      true,
      "Corrected fundraising differs from a finalized result. Original winner and fixed prize obligation are preserved; manager review required.",
      provenance.evidence,
      provenance.synthetic,
    );
  }
  return resultId;
}
// Actual finalization owner supplies/verifies winner, immutable fixed obligation and result identity.
// This is an observation of existing authority, never an authority to finalize/pay.
export async function recordTrustedFinalizedFundraising(
  ctx: MutationCtx,
  input: {
    entryId: Id<"photoEntries">;
    periodKind: "daily" | "weekly";
    period: string;
    resultId: string;
    originalGrossCents: number;
    winner: string;
    prizeObligationId: string;
    fixedPrizeCents: number;
    currency: "usd";
  },
  provenance: Provenance,
) {
  cents(input.originalGrossCents);
  cents(input.fixedPrizeCents);
  for (const [value, max] of [
    [provenance.source, 80],
    [provenance.evidence, 200],
    [provenance.actor, 128],
    [input.resultId, 128],
    [input.prizeObligationId, 128],
    [input.winner, 128],
    [input.period, 32],
  ] as const)
    safeText(value, max);
  const entry = await ctx.db.get(input.entryId),
    campaign =
      entry &&
      (await ctx.db
        .query("campaigns")
        .withIndex("by_slug", (q) => q.eq("slug", entry.campaignSlug))
        .unique());
  if (
    !entry ||
    !campaign ||
    !!campaign.fixtureRunId !== provenance.synthetic ||
    (provenance.synthetic &&
      campaign.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID)
  )
    throw new Error("FUNDRAISING_FINAL_SCOPE_DENIED");
  const prior = await ctx.db
    .query("fundraisingFinalizedSnapshots")
    .withIndex("by_result", (q) => q.eq("resultId", input.resultId))
    .unique();
  const value = {
    ...input,
    campaignSlug: entry.campaignSlug,
    nonprofitId: entry.nonprofitId,
    ...provenance,
    version: 1 as const,
  };
  if (prior) {
    const { _id, _creationTime, at, ...original } = prior;
    if (stableRequest(value) !== stableRequest(original))
      throw new Error("FUNDRAISING_FINAL_CONFLICT");
    return _id;
  }
  const snapshotId = await ctx.db.insert("fundraisingFinalizedSnapshots", {
    ...value,
    at: Date.now(),
  });
  const results = await ctx.db
    .query("fundraisingPeriodResults")
    .withIndex("by_entry", (q) => q.eq("entryId", input.entryId))
    .collect();
  const current = results
    .filter(
      (r) => r.period === input.period && r.periodKind === input.periodKind,
    )
    .at(-1);
  if (current && current.eligibleGrossCents !== input.originalGrossCents) {
    await ctx.db.insert("fundraisingPeriodDiscrepancies", {
      snapshotId,
      resultId: current._id,
      originalGrossCents: input.originalGrossCents,
      correctedGrossCents: current.eligibleGrossCents,
      source: provenance.source,
      evidence: provenance.evidence,
      actor: provenance.actor,
      at: Date.now(),
      version: 1,
    });
    await managerNotice(
      ctx,
      entry.campaignSlug,
      "finalized:" + snapshotId,
      "fundraising-discrepancy",
      true,
      "Historical finalized fundraising differs from corrected source. Original winner and fixed prize obligation are preserved; manager review required.",
      provenance.evidence,
      provenance.synthetic,
    );
  }
  return snapshotId;
}
export async function refreshFundraisingPeriods(
  ctx: MutationCtx,
  donation: Doc<"fundraisingDonations">,
  evidence: string,
) {
  if (!donation.originEntryId || !donation.eligible) return;
  const rows = (
    await ctx.db
      .query("fundraisingDonations")
      .withIndex("by_campaign", (q) =>
        q.eq("campaignSlug", donation.campaignSlug),
      )
      .collect()
  ).filter(
    (r) =>
      r.originEntryId === donation.originEntryId &&
      r.nonprofitId === donation.nonprofitId &&
      r.eligible,
  );
  for (const periodKind of ["daily", "weekly"] as const) {
    const period =
      periodKind === "daily" ? donation.dailyPeriod : donation.weeklyPeriod;
    if (!period) continue;
    const selected = rows.filter(
      (r) =>
        (periodKind === "daily" ? r.dailyPeriod : r.weeklyPeriod) === period,
    );
    const current = await Promise.all(
      selected.map((r) => currentCommission(ctx, r)),
    );
    await recordTrustedFundraisingPeriod(
      ctx,
      {
        entryId: donation.originEntryId,
        periodKind,
        period,
        originalGrossCents: sumCents(selected.map((r) => r.grossCents)),
        eligibleGrossCents: sumCents(current.map((r) => r.eligibleGrossCents)),
        donationIds: selected.map((r) => r._id),
      },
      {
        source: "fundraising:original-period-correction",
        actor: "fundraising-service",
        evidence,
        synthetic: true,
      },
    );
  }
}
export async function reconcileRefunds(
  ctx: MutationCtx,
  donation: Doc<"fundraisingDonations">,
  eventId: string,
  digest: string,
) {
  const observations = await ctx.db
    .query("fundraisingRefundObservations")
    .withIndex("by_checkout", (q) => q.eq("checkoutId", donation.checkoutId))
    .collect();
  const succeeded = new Map<string, number>();
  for (const r of observations) {
    if (
      r.paymentId !== donation.paymentId ||
      r.chargeId !== donation.chargeId ||
      r.account !== donation.account
    )
      throw new Error("FUNDRAISING_REFUND_CONFLICT");
    if (
      r.accepted &&
      r.status === "succeeded" &&
      !r.failureBalanceTransactionId
    )
      succeeded.set(r.refundId, r.amountCents);
  }
  const refundedCents = sumCents([...succeeded.values()]);
  if (refundedCents > donation.grossCents)
    throw new Error("FUNDRAISING_REFUND_OVERFLOW");
  const current = await currentCommission(ctx, donation);
  const recognizedCommissionCents = donation.eligible
    ? commission(
        donation.grossCents - refundedCents,
        donation.commissionBasisPoints,
      )
    : 0;
  if (recognizedCommissionCents > donation.commissionCents)
    throw new Error("FUNDRAISING_COMMISSION_OVERFLOW");
  if (refundedCents !== current.refundedCents) {
    await ctx.db.insert("fundraisingCorrections", {
      donationId: donation._id,
      refundedCents,
      eligibleGrossCents: donation.eligible
        ? donation.grossCents - refundedCents
        : 0,
      recognizedCommissionCents,
      commissionAdjustmentCents: sumCents([
        recognizedCommissionCents,
        -current.recognizedCommissionCents,
      ]),
      refundIds: [...succeeded.keys()].sort(),
      eventId,
      digest,
      actor: "fundraising-service",
      source: "fundraising:cumulative-refund-v1",
      at: Date.now(),
      version: 1,
    });
    await ctx.db.insert("fundraisingLedger", {
      donationId: donation._id,
      kind: "refunds",
      cents: refundedCents,
      providerReference: eventId,
      digest,
      actor: "fundraising-service",
      source: "fundraising:cumulative-refund-v1",
      at: Date.now(),
      version: 1,
    });
  }
  await refreshFundraisingPeriods(ctx, donation, digest);
  await refreshCommissionNotice(ctx, donation);
}

type Obligation = {
  campaignSlug: string;
  nonprofitId: string;
  creator: string;
  account: string;
  route: string;
  obligationId: string;
  amountCents: number;
  currency: "usd";
  destinationBinding: string;
  revision: number;
  source: string;
  synthetic: boolean;
};
// Only trusted payout integration may supply already approved obligations. No public mutation or dispatch.
export async function recordTrustedCommissionObligation(
  ctx: MutationCtx,
  input: Obligation,
  provenance: Provenance,
) {
  safeText(provenance.actor, 128);
  safeText(provenance.source, 80);
  safeText(provenance.evidence, 200);
  if (
    provenance.synthetic !== input.synthetic ||
    provenance.source !== input.source
  )
    throw new Error("FUNDRAISING_PAYMENT_PROVENANCE");
  const value = {
    ...input,
    approvalActor: provenance.actor,
    approvalEvidence: provenance.evidence,
    version: 1 as const,
  };
  cents(input.amountCents, true);
  if (
    !Number.isSafeInteger(input.revision) ||
    input.revision < 1 ||
    !/^[a-f0-9]{64}$/.test(input.destinationBinding)
  )
    throw new Error("FUNDRAISING_PAYMENT_BINDING");
  const rows = await ctx.db
    .query("fundraisingDonations")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", input.campaignSlug))
    .collect();
  if (
    !rows.some(
      (r) =>
        r.nonprofitId === input.nonprofitId &&
        r.creator === input.creator &&
        r.account === input.account &&
        r.route === input.route &&
        r.synthetic === input.synthetic,
    )
  )
    throw new Error("FUNDRAISING_PAYMENT_SCOPE");
  const prior = await ctx.db
    .query("fundraisingCommissionObligations")
    .withIndex("by_obligation", (q) => q.eq("obligationId", input.obligationId))
    .unique();
  if (prior) {
    const { _id, _creationTime, at, ...original } = prior;
    if (stableRequest(original) !== stableRequest(value))
      throw new Error("FUNDRAISING_PAYMENT_CONFLICT");
    return _id;
  }
  return ctx.db.insert("fundraisingCommissionObligations", {
    ...value,
    at: Date.now(),
  });
}
// Confirmed facts must exactly match an immutable obligation, including destination and revision.
export async function recordTrustedCommissionPayment(
  ctx: MutationCtx,
  input: Obligation & {
    paymentId: string;
    evidence: string;
    confirmedAt: number;
    status: "confirmed";
  },
  provenance: Provenance,
) {
  safeText(provenance.actor, 128);
  safeText(provenance.source, 80);
  safeText(provenance.evidence, 200);
  if (
    provenance.synthetic !== input.synthetic ||
    provenance.evidence !== input.evidence
  )
    throw new Error("FUNDRAISING_PAYMENT_PROVENANCE");
  const { paymentId, evidence, confirmedAt, status, ...binding } = input;
  if (
    status !== "confirmed" ||
    !Number.isSafeInteger(confirmedAt) ||
    confirmedAt <= 0 ||
    confirmedAt > Date.now() + 5000
  )
    throw new Error("FUNDRAISING_PAYMENT_UNCONFIRMED");
  safeText(evidence, 200);
  safeText(paymentId, 128);
  const obligation = await ctx.db
    .query("fundraisingCommissionObligations")
    .withIndex("by_obligation", (q) => q.eq("obligationId", input.obligationId))
    .unique();
  if (!obligation) throw new Error("FUNDRAISING_PAYMENT_BINDING");
  const {
    _id,
    _creationTime,
    at,
    approvalActor,
    approvalEvidence,
    version,
    ...original
  } = obligation;
  if (stableRequest(original) !== stableRequest(binding))
    throw new Error("FUNDRAISING_PAYMENT_BINDING");
  const prior = await ctx.db
    .query("fundraisingCommissionPayments")
    .withIndex("by_payment", (q) =>
      q.eq("account", input.account).eq("paymentId", paymentId),
    )
    .unique();
  const value = {
    obligation: _id,
    campaignSlug: input.campaignSlug,
    nonprofitId: input.nonprofitId,
    creator: input.creator,
    account: input.account,
    route: input.route,
    paymentId,
    actor: provenance.actor,
    confirmationSource: provenance.source,
    amountCents: input.amountCents,
    currency: input.currency,
    source: input.source,
    evidence,
    confirmedAt,
    version: 1 as const,
    synthetic: input.synthetic,
  };
  if (prior) {
    const { _id, _creationTime, at, ...old } = prior;
    if (stableRequest(old) !== stableRequest(value))
      throw new Error("FUNDRAISING_PAYMENT_CONFLICT");
    return _id;
  }
  const payments = await ctx.db
    .query("fundraisingCommissionPayments")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", input.campaignSlug))
    .collect();
  if (payments.some((p) => p.obligation === obligation._id))
    throw new Error("FUNDRAISING_PAYMENT_CONFLICT");
  const id = await ctx.db.insert("fundraisingCommissionPayments", {
    ...value,
    at: Date.now(),
  });
  const row = (
    await ctx.db
      .query("fundraisingDonations")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", input.campaignSlug))
      .collect()
  ).find(
    (r) =>
      r.creator === input.creator &&
      r.account === input.account &&
      r.route === input.route &&
      r.nonprofitId === input.nonprofitId,
  )!;
  await refreshCommissionNotice(ctx, row);
  return id;
}

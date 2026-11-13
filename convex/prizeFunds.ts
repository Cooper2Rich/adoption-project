import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { makeFunctionReference } from "convex/server";
import { v, type Infer } from "convex/values";
import { stableRequest } from "./access.ts";
import {
  mutation,
  query,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
  type Doc,
} from "./functions.ts";
import { paidManager } from "./paidCorrections.ts";
import {
  commissionBalances,
  currentCommission,
} from "./fundraisingCorrections.ts";
import { sumCents } from "./fundraisingPolicy.ts";
import { recordTrustedIncident, safeText } from "./operatorIncidents.ts";
import { prizeEvidenceInput } from "./prizeSchema.ts";
import {
  elapsedHour,
  promisedPrizes,
  replenishmentSchedule,
} from "./prizePolicy.ts";

export const prizeDigest = (value: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(stableRequest(value as never))));
const wakeRef = makeFunctionReference<"mutation", { occurrenceId: string }>(
  "prizeFunds:wake",
);
const workRef = makeFunctionReference<
  "action",
  { transferId: string; generation: number }
>("prizeJobs:run");
const watchdogRef = makeFunctionReference<
  "mutation",
  { transferId: string; generation: number }
>("prizeFunds:watchdog");
const refreshRef = makeFunctionReference<"mutation", { campaignId: string }>(
  "readiness:refreshPrize",
);
const expireRef = makeFunctionReference<"mutation", { evidenceId: string }>(
  "prizeFunds:expire",
);
const safeAmount = (n: number) => Number.isSafeInteger(n) && n >= 0;
async function campaignFor(ctx: QueryCtx, slug: string) {
  const c = await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!c) throw new Error("PRIZE_SCOPE");
  return c;
}
export async function prizeNow(ctx: QueryCtx, campaign: Doc<"campaigns">) {
  if (
    campaign.fixtureRunId &&
    campaign.fixtureRunId === process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID
  ) {
    const clock = await ctx.db
      .query("prizeClocks")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .unique();
    if (clock) return clock.now;
  }
  return Date.now();
}
async function currentManager(
  ctx: QueryCtx,
  c: Doc<"campaigns">,
  subject: string,
) {
  const m = await ctx.db
    .query("memberships")
    .withIndex("by_subject_nonprofit", (q) =>
      q.eq("subject", subject).eq("nonprofitId", c.nonprofitId),
    )
    .unique();
  return !!(m?.active && m.role === "manager");
}
export async function prizeContext(ctx: QueryCtx, c: Doc<"campaigns">) {
  const financialScope = await ctx.db
    .query("readinessScopes")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
    .unique();
  const settings = await ctx.db
    .query("campaignSettings")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
    .unique();
  const donations = (
    await ctx.db
      .query("fundraisingDonations")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter((d) => d.nonprofitId === c.nonprofitId);
  const donationFacts = await Promise.all(
    donations.map(async (d) => {
      const checkout = await ctx.db.get(d.checkoutId);
      const reads = await ctx.db
        .query("fundraisingRefundReads")
        .withIndex("by_checkout", (q) => q.eq("checkoutId", d.checkoutId))
        .collect();
      const sourceLedger = await ctx.db
        .query("fundraisingLedger")
        .withIndex("by_donation", (q) => q.eq("donationId", d._id))
        .collect();
      const latest = reads.sort((a, b) => b.generation - a.generation)[0];
      const refundObservations = await ctx.db
        .query("fundraisingRefundObservations")
        .withIndex("by_checkout", (q) => q.eq("checkoutId", d.checkoutId))
        .collect();
      return {
        id: d._id,
        gross: d.grossCents,
        account: d.account,
        route: d.route,
        sourceLedger,
        refundObservations,
        current: await currentCommission(ctx, d),
        refundGeneration: checkout?.refundGeneration ?? 0,
        refundRead: latest
          ? { id: latest._id, outcome: latest.outcome ?? null }
          : null,
      };
    }),
  );
  const obligations = (
    await ctx.db
      .query("fundraisingCommissionObligations")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter((o) => o.nonprofitId === c.nonprofitId);
  const payments = (
    await ctx.db
      .query("fundraisingCommissionPayments")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter((p) => p.nonprofitId === c.nonprofitId);
  const reserves = new Map<string, { earned: number; approved: number }>();
  const key = (r: { creator: string; account: string; route: string }) =>
    stableRequest([r.creator, r.account, r.route]);
  for (const group of await commissionBalances(ctx, donations))
    reserves.set(key(group), { earned: group.payableCents, approved: 0 });
  for (const o of obligations.filter(
    (o) => !payments.some((p) => p.obligation === o._id),
  )) {
    const k = key(o),
      g = reserves.get(k) ?? { earned: 0, approved: 0 };
    g.approved = sumCents([g.approved, o.amountCents]);
    reserves.set(k, g);
  }
  const currentRefunds = new Map<
    string,
    { account: string; refundId: string; amountCents: number; status: string }
  >();
  for (const d of donationFacts)
    for (const r of d.refundObservations)
      if (r.accepted)
        currentRefunds.set(stableRequest([r.account, r.refundId]), {
          account: r.account,
          refundId: r.refundId,
          amountCents: r.amountCents,
          status: r.status,
        });
  const refundObligations = [...currentRefunds.values()].filter((r) =>
    ["pending", "requires_action"].includes(r.status),
  );
  return {
    refundObligations,
    financialScope,
    settings,
    donationFacts,
    creatorReserveCents: sumCents(
      [...reserves.values()].map((g) => Math.max(g.earned, g.approved)),
    ),
    refundHeld: donationFacts.some(
      (d) =>
        d.refundGeneration > 0 &&
        (!d.refundRead || d.refundRead.outcome !== "reconciled"),
    ),
    revision: prizeDigest({
      campaign: c._id,
      financialScope,
      nonprofit: c.nonprofitId,
      authority: c.authority,
      finance: c.reservationFinanceRevision,
      settings: settings?._id ?? null,
      donations: donationFacts,
      obligations,
      payments,
    }),
  };
}
async function audit(
  ctx: MutationCtx,
  c: Doc<"campaigns">,
  actor: string,
  action: string,
  reference: string,
  evidence: string,
) {
  await ctx.db.insert("prizeAudit", {
    campaignSlug: c.slug,
    nonprofitId: c.nonprofitId,
    actor,
    source: "prize-funds-v1",
    at: Date.now(),
    version: 1,
    action,
    reference,
    evidence,
  });
}
async function invalidate(ctx: MutationCtx, c: Doc<"campaigns">) {
  await ctx.scheduler.runAfter(0, refreshRef, { campaignId: c.slug });
}
export async function prizeCoverage(ctx: QueryCtx, c: Doc<"campaigns">) {
  const context = await prizeContext(ctx, c),
    now = await prizeNow(ctx, c);
  const history = await ctx.db
    .query("prizeEvidence")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
    .collect();
  const evidence =
    history.sort((a, b) => b.input.sequence - a.input.sequence)[0] ?? null;
  const transfers = (
    await ctx.db
      .query("prizeTransfers")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect()
  ).filter((t) => t.nonprofitId === c.nonprofitId);
  const obligation = context.settings
    ? promisedPrizes(context.settings.rules)
    : null;
  let reason: string | null = null;
  const input = evidence?.input;
  if (!context.settings) reason = "Locked campaign rules are missing";
  else if (!evidence || !input)
    reason =
      "Trusted purpose balance and transfer contract evidence is missing";
  else if (
    evidence.synthetic !== !!c.fixtureRunId ||
    evidence.source !==
      (evidence.synthetic
        ? "owned-prize-producer-v1"
        : "validated-prize-producer-v1")
  )
    reason = "Purpose evidence provenance is invalid";
  else if (
    input.nonprofitId !== c.nonprofitId ||
    input.campaignId !== c.slug ||
    input.revision !== context.revision
  )
    reason =
      "Purpose evidence belongs to another scope or obsolete financial revision";
  else if (
    context.financialScope?.accounts.stripe &&
    input.financialAccountBinding !== context.financialScope.accounts.stripe
  )
    reason = "Purpose evidence financial account binding changed";
  else if (evidence.expired || input.observedAt > now || input.expiresAt <= now)
    reason = "Purpose evidence is stale or not current";
  else if (!(await currentManager(ctx, c, input.manager)))
    reason = "Transfer approval manager authority is revoked";
  else if (context.refundHeld)
    reason = "Unfinished or held canonical fundraising refund evidence";
  else if (input.reservedCreatorCents < context.creatorReserveCents)
    reason = "Purpose evidence understates protected creator obligations";
  else if (
    input.refundHoldCents <
    sumCents(
      context.refundObligations
        .filter(
          (r) =>
            !input.reflectedRefunds.some(
              (f) =>
                f.account === r.account &&
                f.refundId === r.refundId &&
                f.amountCents === r.amountCents,
            ),
        )
        .map((r) => r.amountCents),
    )
  )
    reason = "Purpose evidence understates pending refund obligations";
  else if (
    [input.fundraisingCents, input.prizeCents, input.advertisingCents].some(
      (n) => n === null,
    )
  )
    reason = "Available purpose balances are unknown";
  else if (
    [input.fundraisingCents, input.prizeCents, input.advertisingCents].some(
      (n) => n !== null && n < 0,
    )
  )
    reason = "Negative purpose availability is a blocking deficit";
  else if (transfers.some((t) => t.conflict))
    reason = "Conflicting settlement evidence requires reconciliation";
  else if (
    transfers.some(
      (t) =>
        t.account !== input.account ||
        t.route !== input.route ||
        t.destination !== input.destination,
    )
  )
    reason =
      "Existing transfer reservations belong to a different financial account or route; reconciliation required";
  const unreflected = transfers.filter(
    (t) => !input?.reflectedTransfers.includes(t._id),
  );
  const reservedSourceCents = sumCents(
    transfers
      .filter((t) => !input?.sourceReflectedTransfers.includes(t._id))
      .map((t) => t.amountCents),
  );
  const fundraisingCents = input?.fundraisingCents ?? null;
  const availableCents =
    fundraisingCents === null
      ? null
      : sumCents([
          fundraisingCents,
          -(input?.reservedCreatorCents ?? 0),
          -(input?.refundHoldCents ?? 0),
          -(input?.otherFundraisingObligationsCents ?? 0),
          -reservedSourceCents,
        ]);
  const prizeCents =
    input?.prizeCents === null || !input
      ? null
      : sumCents([
          input.prizeCents,
          ...unreflected
            .filter((t) => t.state === "settled")
            .map((t) => t.amountCents),
        ]);
  if (!reason && availableCents !== null && availableCents < 0)
    reason = "Protected source obligations exceed fundraising availability";
  const scheduleHolds = context.settings
    ? replenishmentSchedule(context.settings.rules)
        .filter((o) => o.hold)
        .map((o) => o.hold!)
    : [];
  if (!reason && scheduleHolds.length) reason = scheduleHolds[0];
  const covered =
    !reason &&
    prizeCents !== null &&
    !!obligation &&
    prizeCents >= obligation.requiredCents;
  return {
    revision: context.revision,
    now,
    evidence,
    reason,
    covered,
    requiredCents: obligation?.requiredCents ?? null,
    periods: obligation?.periods ?? [],
    scheduleHolds,
    balances: {
      fundraisingCents,
      availableCents,
      reservedCreatorCents: input?.reservedCreatorCents ?? null,
      requiredCreatorCents: context.creatorReserveCents,
      requiredRefundCents: sumCents(
        context.refundObligations.map((r) => r.amountCents),
      ),
      refundHoldCents: input?.refundHoldCents ?? null,
      prizeCents,
      advertisingCents: input?.advertisingCents ?? null,
      advertisingObligationsCents: input?.advertisingObligationsCents ?? null,
      reservedSourceCents,
    },
    coverageReason:
      reason ??
      (covered
        ? null
        : "Prize funds do not cover the full promised daily and weekly schedule"),
    synthetic: !!c.fixtureRunId,
  };
}
// No application endpoint can supply financial evidence or transfer approval.
// Future producer must independently validate the actual #66/#20/#21 contract.
export async function recordTrustedPrizeEvidence(
  ctx: MutationCtx,
  input: Infer<typeof prizeEvidenceInput>,
  provenance: {
    actor: string;
    synthetic: boolean;
    source: "owned-prize-producer-v1" | "validated-prize-producer-v1";
  },
) {
  const c = await campaignFor(ctx, input.campaignId),
    context = await prizeContext(ctx, c),
    now = await prizeNow(ctx, c);
  if (
    provenance.synthetic !== !!c.fixtureRunId ||
    (c.fixtureRunId &&
      c.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID) ||
    provenance.source !==
      (provenance.synthetic
        ? "owned-prize-producer-v1"
        : "validated-prize-producer-v1")
  )
    throw new Error("PRIZE_PROVENANCE");
  if (
    input.nonprofitId !== c.nonprofitId ||
    input.revision !== context.revision ||
    input.beneficiary !== c.nonprofitId ||
    !(await currentManager(ctx, c, input.manager))
  )
    throw new Error("PRIZE_EVIDENCE_SCOPE");
  if (
    !/^[a-f0-9]{64}$/.test(input.financialAccountBinding) ||
    (context.financialScope?.accounts.stripe &&
      input.financialAccountBinding !== context.financialScope.accounts.stripe)
  )
    throw new Error("PRIZE_EVIDENCE_ACCOUNT");
  const reflectedRefundKeys = new Set<string>();
  for (const reflected of input.reflectedRefunds) {
    const key = stableRequest([reflected.account, reflected.refundId]);
    if (
      reflectedRefundKeys.has(key) ||
      !context.refundObligations.some(
        (r) =>
          r.account === reflected.account &&
          r.refundId === reflected.refundId &&
          r.amountCents === reflected.amountCents,
      )
    )
      throw new Error("PRIZE_REFUND_REFLECTION_SCOPE");
    reflectedRefundKeys.add(key);
  }
  const requiredRefundHold = sumCents(
    context.refundObligations
      .filter(
        (r) => !reflectedRefundKeys.has(stableRequest([r.account, r.refundId])),
      )
      .map((r) => r.amountCents),
  );
  if (input.refundHoldCents < requiredRefundHold)
    throw new Error("PRIZE_REFUND_RESERVE_REQUIRED");
  for (const n of [
    input.reservedCreatorCents,
    input.refundHoldCents,
    input.otherFundraisingObligationsCents,
    input.advertisingObligationsCents,
    input.approvedAmountCents,
  ])
    if (!safeAmount(n)) throw new Error("PRIZE_CENTS");
  for (const n of [
    input.fundraisingCents,
    input.prizeCents,
    input.advertisingCents,
  ])
    if (n !== null && !Number.isSafeInteger(n)) throw new Error("PRIZE_CENTS");
  for (const s of [
    input.account,
    input.route,
    input.destination,
    input.authorityRevision,
    input.evidence,
    provenance.actor,
  ])
    safeText(s, 200);
  if (
    !/^[a-f0-9]{64}$/.test(input.transportBinding) ||
    input.sourcePurpose !== "fundraising" ||
    input.destinationPurpose !== "prize" ||
    input.reservedCreatorCents < context.creatorReserveCents ||
    !context.settings ||
    input.approvedAmountCents !==
      context.settings.rules.weeklyReplenishmentCents ||
    !Number.isSafeInteger(input.sequence) ||
    input.sequence < 1 ||
    !Number.isSafeInteger(input.observedAt) ||
    input.observedAt > now ||
    !Number.isSafeInteger(input.expiresAt) ||
    input.expiresAt <= input.observedAt
  )
    throw new Error("PRIZE_EVIDENCE_INVALID");
  const rows = await ctx.db
      .query("prizeEvidence")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect(),
    latest = rows.sort((a, b) => b.input.sequence - a.input.sequence)[0];
  if (
    latest &&
    (input.sequence <= latest.input.sequence ||
      input.observedAt < latest.input.observedAt)
  )
    throw new Error("PRIZE_EVIDENCE_ORDER");
  if (
    new Set(input.reflectedTransfers).size !== input.reflectedTransfers.length
  )
    throw new Error("PRIZE_REFLECTED_CONFLICT");
  const transfers = await ctx.db
    .query("prizeTransfers")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
    .collect();
  for (const id of input.reflectedTransfers)
    if (
      !transfers.some(
        (t) =>
          t._id === id &&
          t.state === "settled" &&
          t.nonprofitId === c.nonprofitId &&
          t.account === input.account &&
          t.route === input.route,
      )
    )
      throw new Error("PRIZE_REFLECTED_SCOPE");
  if (
    new Set(input.sourceReflectedTransfers).size !==
    input.sourceReflectedTransfers.length
  )
    throw new Error("PRIZE_REFLECTED_CONFLICT");
  for (const id of input.sourceReflectedTransfers)
    if (
      !transfers.some(
        (t) =>
          t._id === id &&
          t.state !== "journaled" &&
          t.nonprofitId === c.nonprofitId &&
          t.account === input.account &&
          t.route === input.route,
      )
    )
      throw new Error("PRIZE_REFLECTED_SCOPE");
  if (
    input.reflectedTransfers.some(
      (id) => !input.sourceReflectedTransfers.includes(id),
    )
  )
    throw new Error("PRIZE_REFLECTED_SCOPE");
  if (
    latest?.input.reflectedTransfers.some(
      (id) => !input.reflectedTransfers.includes(id),
    )
  )
    throw new Error("PRIZE_REFLECTED_HISTORY");
  if (
    latest?.input.sourceReflectedTransfers.some(
      (id) => !input.sourceReflectedTransfers.includes(id),
    )
  )
    throw new Error("PRIZE_REFLECTED_HISTORY");
  const id = await ctx.db.insert("prizeEvidence", {
    campaignSlug: c.slug,
    nonprofitId: c.nonprofitId,
    input,
    ...provenance,
    at: Date.now(),
    version: 1,
    expired: false,
  });
  await audit(
    ctx,
    c,
    provenance.actor,
    "purpose-evidence-observed",
    id,
    input.evidence,
  );
  if (!c.fixtureRunId)
    await ctx.scheduler.runAt(input.expiresAt, expireRef, { evidenceId: id });
  await invalidate(ctx, c);
  return id;
}
export async function ensurePrizeSchedule(
  ctx: MutationCtx,
  c: Doc<"campaigns">,
) {
  const context = await prizeContext(ctx, c);
  if (!context.settings) return;
  const now = await prizeNow(ctx, c),
    existing = await ctx.db
      .query("prizeOccurrences")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", c.slug))
      .collect();
  for (const planned of replenishmentSchedule(context.settings.rules)) {
    if (
      existing.some(
        (o) =>
          o.settingsId === context.settings!._id && o.local === planned.local,
      )
    )
      continue;
    const id = await ctx.db.insert("prizeOccurrences", {
      campaignSlug: c.slug,
      nonprofitId: c.nonprofitId,
      settingsId: context.settings._id,
      local: planned.local,
      executionAt: planned.executionAt,
      advanceAt: planned.advanceAt,
      amountCents: context.settings.rules.weeklyReplenishmentCents,
      state: planned.hold ? "schedule-held" : "scheduled",
      reason: planned.hold ?? "Advance check pending",
      initializedAt: now,
      generation: 0,
      actor: context.settings.actor,
      source: "prize-scheduler-v1",
      at: Date.now(),
      version: 1,
      ...(planned.advanceAt !== null
        ? { nextAt: Math.max(now, planned.advanceAt) }
        : {}),
    });
    if (planned.advanceAt !== null && !c.fixtureRunId)
      await ctx.scheduler.runAt(Math.max(now, planned.advanceAt), wakeRef, {
        occurrenceId: id,
      });
  }
}
async function notice(
  ctx: MutationCtx,
  c: Doc<"campaigns">,
  o: Doc<"prizeOccurrences">,
  active: boolean,
  reason: string,
) {
  const key = "prize:" + o._id,
    head = await ctx.db
      .query("incidentHeads")
      .withIndex("by_stream", (q) =>
        q.eq("campaignSlug", c.slug).eq("key", key),
      )
      .unique();
  await recordTrustedIncident(
    ctx,
    {
      campaignId: c.slug,
      key,
      kind: "prize-replenishment",
      sequence: (head?.sequence ?? 0) + 1,
      observedAt: Date.now(),
      active,
      reason: reason.slice(0, 500),
      evidence: `Occurrence ${o._id}; locked settings ${o.settingsId}`,
      resolutionRole: "manager",
    },
    {
      producer: "prize-scheduler-v1",
      actor: "prize-scheduler",
      synthetic: !!c.fixtureRunId,
    },
  );
}
async function enqueueTransfer(
  ctx: MutationCtx,
  c: Doc<"campaigns">,
  t: Doc<"prizeTransfers">,
  at: number,
) {
  const generation = t.generation + 1;
  await ctx.db.patch(t._id, { generation, nextAt: at });
  if (!c.fixtureRunId)
    await ctx.scheduler.runAt(at, workRef, { transferId: t._id, generation });
}
export async function advancePrizeOccurrence(
  ctx: MutationCtx,
  id: Doc<"prizeOccurrences">["_id"],
) {
  let o = await ctx.db.get(id);
  if (!o) return;
  const c = await campaignFor(ctx, o.campaignSlug),
    now = await prizeNow(ctx, c);
  if (
    o.nonprofitId !== c.nonprofitId ||
    o.executionAt === null ||
    o.advanceAt === null ||
    o.state === "fulfilled" ||
    o.transferId
  )
    return;
  if (o.nextAt !== undefined && now < o.nextAt) return;
  const coverage = await prizeCoverage(ctx, c),
    available = coverage.reason ? null : coverage.balances.availableCents;
  const shortfall =
    available === null
      ? null
      : Math.max(0, sumCents([o.amountCents, -available]));
  const sufficient =
    !coverage.reason && available !== null && available >= o.amountCents;
  const detail = `Scheduled ${o.amountCents} USD cents at ${o.local} America/Chicago (${new Date(o.executionAt).toISOString()}); available ${available === null ? "unknown" : available}; shortfall ${shortfall === null ? "unknown" : shortfall}.`;
  if (o.advanceCheckedAt === undefined) {
    if (now < o.advanceAt) return;
    const missed = o.initializedAt > o.advanceAt || now >= o.executionAt;
    await ctx.db.patch(o._id, {
      advanceCheckedAt: now,
      advanceAvailableCents: available,
      state: "advance-checked",
      reason: missed
        ? `Missed exact 24 elapsed hour advance check; checked honestly at ${new Date(now).toISOString()}. ${detail}`
        : detail,
    });
    await audit(
      ctx,
      c,
      "prize-scheduler",
      missed ? "advance-check-late" : "advance-check-due-24h",
      o._id,
      `${detail} Due ${o.advanceAt}; actually checked ${now}`,
    );
    if (!sufficient || missed)
      await notice(
        ctx,
        c,
        o,
        true,
        `${missed ? "Missed exact advance check. " : ""}${detail} ${coverage.reason ?? ""}`,
      );
    o = (await ctx.db.get(o._id))!;
  }
  if (o.executionAt !== null && now < o.executionAt) {
    await ctx.db.patch(o._id, { nextAt: o.executionAt });
    if (!c.fixtureRunId)
      await ctx.scheduler.runAt(o.executionAt, wakeRef, {
        occurrenceId: o._id,
      });
    return;
  }
  if (!sufficient) {
    await ctx.db.patch(o._id, {
      state: "shortage",
      reason: `${detail} ${coverage.reason ?? "Insufficient unreserved fundraising funds; nothing transferred"}`,
      checkedAt: now,
      availableCents: available,
      nextAt: now + elapsedHour,
      generation: o.generation + 1,
    });
    await notice(
      ctx,
      c,
      o,
      true,
      `${detail} ${coverage.reason ?? "Insufficient unreserved fundraising funds; nothing transferred"}`,
    );
    await audit(
      ctx,
      c,
      "prize-scheduler",
      "shortage-no-transfer",
      o._id,
      detail,
    );
    if (!c.fixtureRunId)
      await ctx.scheduler.runAt(now + elapsedHour, wakeRef, {
        occurrenceId: o._id,
      });
    return;
  }
  if (o.amountCents === 0) {
    await ctx.db.patch(o._id, {
      state: "fulfilled",
      reason: "Locked zero replenishment; no transfer",
      nextAt: undefined,
    });
    return;
  }
  const e = coverage.evidence!,
    i = e.input;
  const transferId = await ctx.db.insert("prizeTransfers", {
    campaignSlug: c.slug,
    nonprofitId: c.nonprofitId,
    occurrenceId: o._id,
    evidenceId: e._id,
    key: prizeDigest([
      c.nonprofitId,
      c.slug,
      o.settingsId,
      o.local,
      i.account,
      i.route,
      i.authorityRevision,
    ]),
    amountCents: o.amountCents,
    currency: "USD",
    revision: coverage.revision,
    account: i.account,
    route: i.route,
    sourcePurpose: "fundraising",
    destinationPurpose: "prize",
    beneficiary: i.beneficiary,
    destination: i.destination,
    transportBinding: i.transportBinding,
    authorityRevision: i.authorityRevision,
    manager: i.manager,
    state: "journaled",
    generation: 0,
    nextAt: now,
    actor: i.manager,
    source: "prize-scheduler-v1",
    at: Date.now(),
    version: 1,
  });
  await ctx.db.patch(o._id, {
    state: "journaled",
    reason: "Fixed amount reserved; transfer journaled before dispatch",
    transferId,
    checkedAt: now,
    availableCents: available,
    nextAt: undefined,
  });
  await audit(
    ctx,
    c,
    i.manager,
    "transfer-journaled",
    transferId,
    prizeDigest(i),
  );
  await enqueueTransfer(ctx, c, (await ctx.db.get(transferId))!, now);
  await invalidate(ctx, c);
}
export const wake = internalMutation({
  args: { occurrenceId: v.id("prizeOccurrences") },
  handler: (ctx, { occurrenceId }) => advancePrizeOccurrence(ctx, occurrenceId),
});
export async function inspectPrize(ctx: QueryCtx, campaignId: string) {
  const { campaign } = await paidManager(ctx, campaignId),
    coverage = await prizeCoverage(ctx, campaign);
  const transfers = await ctx.db
    .query("prizeTransfers")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
    .collect();
  return {
    ...coverage,
    occurrences: await ctx.db
      .query("prizeOccurrences")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
      .collect(),
    transfers,
    observations: (
      await Promise.all(
        transfers.map((t) =>
          ctx.db
            .query("prizeObservations")
            .withIndex("by_transfer", (q) => q.eq("transferId", t._id))
            .collect(),
        ),
      )
    ).flat(),
    audit: await ctx.db
      .query("prizeAudit")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
      .collect(),
    productionAuthority: "held" as const,
  };
}
export const inspect = query({
  args: { campaignId: v.string() },
  handler: (ctx, { campaignId }) => inspectPrize(ctx, campaignId),
});
// A manager can request evaluation/reconciliation, never alter balances or mark paid.
export const retry = mutation({
  args: { campaignId: v.string(), occurrenceId: v.id("prizeOccurrences") },
  handler: async (ctx, { campaignId, occurrenceId }) => {
    const { campaign, subject } = await paidManager(ctx, campaignId),
      o = await ctx.db.get(occurrenceId);
    if (
      !o ||
      o.campaignSlug !== campaignId ||
      o.nonprofitId !== campaign.nonprofitId
    )
      throw new Error("FORBIDDEN: Prize occurrence unavailable");
    await audit(
      ctx,
      campaign,
      subject,
      "manager-recheck-requested",
      o._id,
      "Current manager; same scheduled obligation and transfer identity",
    );
    if (o.transferId) {
      const t = await ctx.db.get(o.transferId);
      if (t && !["settled", "dispatching", "reconciling"].includes(t.state))
        await enqueueTransfer(
          ctx,
          campaign,
          t,
          Math.max(await prizeNow(ctx, campaign), t.nextAt),
        );
    } else await advancePrizeOccurrence(ctx, o._id);
    return { requested: true };
  },
});
export const expire = internalMutation({
  args: { evidenceId: v.id("prizeEvidence") },
  handler: async (ctx, { evidenceId }) => {
    const e = await ctx.db.get(evidenceId);
    if (!e) return;
    const c = await campaignFor(ctx, e.campaignSlug);
    if ((await prizeNow(ctx, c)) >= e.input.expiresAt) {
      await ctx.db.patch(e._id, { expired: true });
      await invalidate(ctx, c);
    }
  },
});

// Internal claim is the final current-authority/revision fence before HTTP dispatch.
export const claim = internalMutation({
  args: { transferId: v.id("prizeTransfers"), generation: v.number() },
  handler: async (ctx, { transferId, generation }) => {
    const t = await ctx.db.get(transferId);
    if (
      !t ||
      t.generation !== generation ||
      t.state === "settled" ||
      ["dispatching", "reconciling"].includes(t.state)
    )
      return null;
    const c = await campaignFor(ctx, t.campaignSlug),
      now = await prizeNow(ctx, c);
    if (now < t.nextAt) return null;
    const p = await prizeCoverage(ctx, c),
      e = p.evidence?.input;
    const scopeMatches =
      !!e &&
      [
        "account",
        "route",
        "beneficiary",
        "destination",
        "transportBinding",
        "authorityRevision",
        "manager",
      ].every((k) => e[k as keyof typeof e] === t[k as keyof typeof t]);
    const productionHeld =
      !c.fixtureRunId ||
      c.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID;
    // Reads reconcile the original immutable scope even after a funding revision changes;
    // they still require current manager and bound transport. No replacement POST.
    const reconcile = t.state !== "journaled";
    const held =
      productionHeld ||
      (!reconcile &&
        (!(await currentManager(ctx, c, t.manager)) ||
          !scopeMatches ||
          !!p.reason ||
          p.revision !== t.revision));
    if (held) {
      await audit(
        ctx,
        c,
        "prize-dispatcher",
        "dispatch-held",
        t._id,
        productionHeld
          ? "Actual financial contract/transport approval #66/#20/#21 required"
          : "Current authority, revision or transport scope changed",
      );
      await enqueueTransfer(ctx, c, t, now + elapsedHour);
      return null;
    }
    const origin = process.env.PRIZE_FIXTURE_ORIGIN,
      secret = process.env.PRIZE_FIXTURE_SECRET;
    if (
      !origin ||
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
      !secret ||
      prizeDigest({ origin, credential: secret }) !== t.transportBinding
    ) {
      await enqueueTransfer(ctx, c, t, now + elapsedHour);
      return null;
    }
    await ctx.db.patch(t._id, {
      state: reconcile ? "reconciling" : "dispatching",
      nextAt: now + elapsedHour,
    });
    await ctx.db.patch(t.occurrenceId, {
      state: reconcile ? "reconciling" : "dispatched",
      reason: reconcile
        ? "Reconciling original transfer; no replacement write"
        : "Journal persisted; awaiting actual settlement",
    });
    await audit(
      ctx,
      c,
      t.manager,
      reconcile ? "reconciliation-claimed" : "dispatch-claimed",
      t._id,
      `Generation ${generation}; ${t.key}`,
    );
    if (!c.fixtureRunId)
      await ctx.scheduler.runAt(now + elapsedHour, watchdogRef, {
        transferId,
        generation,
      });
    return { transfer: t, origin, secret, reconcile };
  },
});
export const watchdog = internalMutation({
  args: { transferId: v.id("prizeTransfers"), generation: v.number() },
  handler: async (ctx, { transferId, generation }) => {
    const t = await ctx.db.get(transferId);
    if (!t || t.generation !== generation || t.state === "settled") return;
    const c = await campaignFor(ctx, t.campaignSlug),
      now = await prizeNow(ctx, c);
    if (now < t.nextAt) return;
    if (["dispatching", "reconciling"].includes(t.state)) {
      await ctx.db.patch(t._id, { state: "unknown" });
      await ctx.db.patch(t.occurrenceId, {
        state: "unknown",
        reason: "Dispatch result unknown; original identity retained",
      });
    }
    await enqueueTransfer(ctx, c, (await ctx.db.get(t._id))!, now);
  },
});
export const settle = internalMutation({
  args: {
    transferId: v.id("prizeTransfers"),
    generation: v.number(),
    outcome: v.union(
      v.literal("unknown"),
      v.literal("pending"),
      v.literal("settled"),
    ),
    digest: v.string(),
    providerId: v.optional(v.string()),
    settlementReference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.transferId);
    if (!t || args.generation > t.generation) return { applied: false };
    const c = await campaignFor(ctx, t.campaignSlug),
      now = await prizeNow(ctx, c);
    const previous = await ctx.db
      .query("prizeObservations")
      .withIndex("by_transfer", (q) => q.eq("transferId", t._id))
      .collect();
    if (
      previous.some(
        (p) => p.generation === args.generation && p.digest === args.digest,
      )
    )
      return { applied: false };
    const conflict =
      !!(t.providerId && args.providerId && t.providerId !== args.providerId) ||
      !!(
        t.settlementReference &&
        args.settlementReference &&
        t.settlementReference !== args.settlementReference
      );
    await ctx.db.insert("prizeObservations", {
      ...args,
      actor: "owned-prize-transport",
      source: "prize-settlement-v1",
      at: Date.now(),
      version: 1,
    });
    if (conflict) {
      await ctx.db.patch(t._id, { conflict: true });
      await audit(
        ctx,
        c,
        "prize-dispatcher",
        "settlement-conflict-held",
        t._id,
        args.digest,
      );
      await invalidate(ctx, c);
      return { applied: false };
    }
    if (t.state === "settled") return { applied: false };
    const settled =
      args.outcome === "settled" &&
      !!args.providerId &&
      !!args.settlementReference;
    await ctx.db.patch(t._id, {
      state: settled
        ? "settled"
        : args.outcome === "pending"
          ? "pending"
          : "unknown",
      ...(args.providerId ? { providerId: args.providerId } : {}),
      ...(settled
        ? { settlementReference: args.settlementReference, settledAt: now }
        : {}),
    });
    const o = await ctx.db.get(t.occurrenceId);
    if (!o) throw new Error("PRIZE_OCCURRENCE_MISSING");
    await ctx.db.patch(o._id, {
      state: settled ? "fulfilled" : args.outcome,
      reason: settled
        ? "Fixed replenishment settled once; no prize awarded or paid"
        : "Outcome held; original transfer requires reconciliation",
    });
    await audit(
      ctx,
      c,
      "prize-dispatcher",
      settled ? "settled-once" : "outcome-held",
      t._id,
      args.digest,
    );
    if (settled)
      await notice(
        ctx,
        c,
        o,
        false,
        `Scheduled ${t.amountCents} USD cents at ${o.local} America/Chicago fulfilled once; actual settlement reference retained`,
      );
    else {
      await notice(
        ctx,
        c,
        o,
        true,
        `Scheduled ${t.amountCents} USD cents at ${o.local} America/Chicago; transfer outcome ${args.outcome}; source funds reserved; settlement reconciliation required`,
      );
      await enqueueTransfer(
        ctx,
        c,
        (await ctx.db.get(t._id))!,
        now + elapsedHour,
      );
    }
    await invalidate(ctx, c);
    return { applied: true, settled };
  },
});

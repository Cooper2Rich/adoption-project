import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { v } from "convex/values";
import {
  authorizedCampaign,
  operationIdentity,
  stableRequest,
} from "./access.ts";
import { acceptedCreator } from "./creatorAccess.ts";
import { mutation, query, type MutationCtx, type Doc } from "./functions.ts";
import { attribution, cents, commission } from "./fundraisingPolicy.ts";
import {
  confirmation,
  fundraisingScope,
  refundFact,
} from "./fundraisingSchema.ts";
import {
  currentCommission,
  commissionBalances,
  reconcileRefunds,
  managerNotice,
} from "./fundraisingCorrections.ts";
import { sumCents } from "./fundraisingPolicy.ts";
import {
  fundraisingOrigin,
  publicCampaign,
  unnamedCreator,
} from "./publicViewer.ts";

function signature(value: any, supplied: string) {
  const secret = process.env.FUNDRAISING_RECEIPT_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("FORBIDDEN: Fundraising service unavailable");
  const expected = bytesToHex(
    hmac(
      sha256,
      new TextEncoder().encode(secret),
      new TextEncoder().encode(stableRequest(value)),
    ),
  );
  let difference = expected.length ^ supplied.length;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ (supplied.charCodeAt(i) || 0);
  if (difference || Math.abs(Date.now() - value.at) > 30000)
    throw new Error("FORBIDDEN: Invalid fundraising receipt");
}
async function gate(
  ctx: MutationCtx,
  scope: {
    account: string;
    route: string;
    apiVersion: string;
    transportBinding: string;
    fixtureRunId: string;
  },
) {
  const campaign = await publicCampaign(ctx);
  // No production approval producer/release controller is wired. Neither browser
  // state nor advertising crowdfunding evidence can authorize donation collection.
  if (
    !campaign?.fixtureRunId ||
    campaign.fixtureRunId !== scope.fixtureRunId ||
    scope.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID ||
    scope.account !== `acct_owned_${scope.fixtureRunId}` ||
    scope.route !== "owned-fundraising-v1" ||
    scope.apiVersion !== "2026-10-28.endive" ||
    !/^[a-f0-9]{64}$/.test(scope.transportBinding)
  )
    throw new Error(
      "FUNDRAISING_HELD: Actual fundraising account, route and successful-payment-time evidence required",
    );
  return campaign;
}
async function audit(
  ctx: MutationCtx,
  checkoutId: Doc<"fundraisingCheckouts">["_id"],
  action: string,
  digest: string,
) {
  await ctx.db.insert("fundraisingAudit", {
    checkoutId,
    action,
    digest,
    actor: "fundraising-service",
    source: "fundraising:stripe-adapter",
    at: Date.now(),
    version: 1,
  });
}
const beginValue = v.object({
  operationId: v.string(),
  amountCents: v.number(),
  applicationOrigin: v.string(),
  tokenHash: v.string(),
  entryId: v.optional(v.id("photoEntries")),
  scope: fundraisingScope,
  at: v.number(),
});
export const begin = mutation({
  args: { value: beginValue, signature: v.string() },
  handler: async (ctx, args) => {
    signature(args.value, args.signature);
    const { at: _at, ...input } = args.value,
      campaign = await gate(ctx, input.scope);
    operationIdentity(input.operationId);
    cents(input.amountCents, true);
    if (!/^[a-f0-9]{64}$/.test(input.tokenHash))
      throw new Error("FUNDRAISING_TOKEN: Invalid checkout capability");
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(input.applicationOrigin))
      throw new Error("FUNDRAISING_HELD: Owned application origin required");
    const fingerprint = stableRequest(input);
    const existing = await ctx.db
      .query("fundraisingCheckouts")
      .withIndex("by_operation", (q) => q.eq("operationId", input.operationId))
      .unique();
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new Error("OPERATION_CONFLICT: Checkout contents changed");
      return existing;
    }
    const origin = input.entryId
      ? await fundraisingOrigin(ctx, input.entryId)
      : null;
    if (input.entryId && !origin)
      throw new Error("FUNDRAISING_ORIGIN: This tracked link is unavailable");
    const settings = await ctx.db
      .query("campaignSettings")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .unique();
    if (!settings || settings.nonprofitId !== campaign.nonprofitId)
      throw new Error("FUNDRAISING_HELD: Locked rules required");
    const now = Date.now();
    const id = await ctx.db.insert("fundraisingCheckouts", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      operationId: input.operationId,
      fingerprint,
      tokenHash: input.tokenHash,
      ...(origin
        ? { originEntryId: origin.entry._id, creator: origin.entry.subject }
        : {}),
      rulesId: settings._id,
      amountCents: input.amountCents,
      applicationOrigin: input.applicationOrigin,
      scope: input.scope,
      state: "journaled",
      providerKey: `fundraising-${campaign._id}-${input.operationId}`,
      createdAt: now,
      retryBefore: now + 23 * 3600000,
      actor: "account-free-donor",
      source: "fundraising:begin",
      version: 1,
    });
    await audit(ctx, id, "journaled-before-provider-write", fingerprint);
    return await ctx.db.get(id);
  },
});
export const dispatch = mutation({
  args: {
    value: v.object({
      checkoutId: v.id("fundraisingCheckouts"),
      scope: fundraisingScope,
      at: v.number(),
      sessionId: v.optional(v.string()),
      checkoutUrl: v.optional(v.string()),
      state: v.union(v.literal("dispatched"), v.literal("uncertain")),
    }),
    signature: v.string(),
  },
  handler: async (ctx, { value, signature: supplied }) => {
    signature(value, supplied);
    await gate(ctx, value.scope);
    const row = await ctx.db.get(value.checkoutId);
    if (
      !row ||
      stableRequest(row.scope) !== stableRequest(value.scope) ||
      (row.sessionId && value.sessionId && row.sessionId !== value.sessionId)
    )
      throw new Error("FUNDRAISING_CONFLICT: Checkout identity changed");
    if (row.state !== "confirmed")
      await ctx.db.patch(row._id, {
        state: value.state,
        ...(value.sessionId
          ? { sessionId: value.sessionId, checkoutUrl: value.checkoutUrl }
          : {}),
      });
    await audit(ctx, row._id, value.state, stableRequest(value));
    return { retained: true };
  },
});
export const resolve = mutation({
  args: {
    value: v.object({
      sessionId: v.string(),
      scope: fundraisingScope,
      at: v.number(),
    }),
    signature: v.string(),
  },
  handler: async (ctx, { value, signature: supplied }) => {
    signature(value, supplied);
    await gate(ctx, value.scope);
    const row = await ctx.db
      .query("fundraisingCheckouts")
      .withIndex("by_session", (q) => q.eq("sessionId", value.sessionId))
      .unique();
    if (!row || stableRequest(row.scope) !== stableRequest(value.scope))
      throw new Error("FUNDRAISING_ORIGIN: Unknown checkout");
    return row;
  },
});
export const confirm = mutation({
  args: {
    value: v.object({
      facts: confirmation,
      scope: fundraisingScope,
      at: v.number(),
    }),
    signature: v.string(),
  },
  handler: async (ctx, { value, signature: supplied }) => {
    signature(value, supplied);
    await gate(ctx, value.scope);
    const f = value.facts,
      row = await ctx.db.get(f.checkoutId);
    if (
      !row ||
      stableRequest(row.scope) !== stableRequest(value.scope) ||
      row.sessionId !== f.sessionId ||
      row.amountCents !== f.grossCents
    )
      throw new Error(
        "FUNDRAISING_CONFLICT: Confirmation does not match journal",
      );
    cents(f.grossCents, true);
    cents(f.refundedCents);
    if (f.feeCents !== null) cents(f.feeCents);
    if (
      f.refundedCents !== 0 ||
      !Number.isSafeInteger(f.completedAt) ||
      f.completedAt <= 0 ||
      f.completedAt > Date.now() + 5000
    )
      throw new Error("FUNDRAISING_FACTS: Invalid successful payment");
    const priorEvent = await ctx.db
      .query("fundraisingEvents")
      .withIndex("by_event", (q) =>
        q.eq("account", value.scope.account).eq("eventId", f.eventId),
      )
      .unique();
    if (
      priorEvent &&
      (priorEvent.checkoutId !== row._id || priorEvent.digest !== f.digest)
    )
      throw new Error("FUNDRAISING_CONFLICT: Event contents changed");
    const checkoutDonation = await ctx.db
      .query("fundraisingDonations")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", row._id))
      .unique();
    if (checkoutDonation && checkoutDonation.paymentId !== f.paymentId)
      throw new Error(
        "FUNDRAISING_CONFLICT: Checkout payment identity changed",
      );
    let donation = await ctx.db
      .query("fundraisingDonations")
      .withIndex("by_payment", (q) =>
        q.eq("account", value.scope.account).eq("paymentId", f.paymentId),
      )
      .unique();
    if (
      donation &&
      (donation.checkoutId !== row._id ||
        donation.grossCents !== f.grossCents ||
        donation.completedAt !== f.completedAt ||
        donation.chargeId !== f.chargeId)
    )
      throw new Error(
        "FUNDRAISING_CONFLICT: Successful payment identity changed",
      );
    if (donation) {
      const amounts = await ctx.db
        .query("fundraisingLedger")
        .withIndex("by_donation", (q) => q.eq("donationId", donation!._id))
        .collect();
      const fee = amounts.filter((a) => a.kind === "fees").at(-1);
      if (
        fee?.cents !== null &&
        f.feeCents !== null &&
        fee?.cents !== f.feeCents
      )
        throw new Error("FUNDRAISING_CONFLICT: Confirmed fee changed");
      for (const [kind, amount, changed] of [
        ["fees", f.feeCents, fee?.cents === null && f.feeCents !== null],
      ] as const) {
        if (changed) {
          await ctx.db.insert("fundraisingLedger", {
            donationId: donation._id,
            kind,
            cents: amount,
            providerReference:
              kind === "fees" ? f.balanceTransactionId! : f.chargeId,
            digest: f.factsDigest,
            actor: "stripe-owned-transport",
            source: "fundraising:reconcile",
            at: Date.now(),
            version: 1,
          });
          await audit(
            ctx,
            row._id,
            `${kind}-evidence-reconciled`,
            f.factsDigest,
          );
        }
      }
    } else {
      const settings = await ctx.db.get(row.rulesId),
        entry = row.originEntryId ? await ctx.db.get(row.originEntryId) : null;
      if (
        !settings ||
        settings.nonprofitId !== row.nonprofitId ||
        (entry &&
          (entry.subject !== row.creator ||
            entry.nonprofitId !== row.nonprofitId))
      )
        throw new Error("FUNDRAISING_CONFLICT: Original scope changed");
      const cutoffs = row.originEntryId
        ? await ctx.db
            .query("fundraisingCutoffs")
            .withIndex("by_entry", (q) => q.eq("entryId", row.originEntryId!))
            .collect()
        : [];
      const cutoff = cutoffs.length
        ? Math.min(...cutoffs.map((c) => c.effectiveAt))
        : undefined;
      const a = attribution(
        settings.rules,
        f.completedAt,
        entry?.firstApprovedAt,
        cutoff,
      );
      const id = await ctx.db.insert("fundraisingDonations", {
        campaignSlug: row.campaignSlug,
        nonprofitId: row.nonprofitId,
        checkoutId: row._id,
        account: row.scope.account,
        route: row.scope.route,
        ...(row.originEntryId
          ? { originEntryId: row.originEntryId, creator: row.creator }
          : {}),
        rulesId: row.rulesId,
        sessionId: f.sessionId,
        paymentId: f.paymentId,
        chargeId: f.chargeId,
        successEventId: f.successEventId,
        completedAt: f.completedAt,
        grossCents: f.grossCents,
        commissionCents: a.eligible
          ? commission(f.grossCents, settings.rules.commissionBasisPoints)
          : 0,
        commissionBasisPoints: settings.rules.commissionBasisPoints,
        eligible: a.eligible,
        earningWeek: a.earningWeek,
        dailyPeriod: a.dailyPeriod,
        weeklyPeriod: a.weeklyPeriod,
        timeBasis: f.timeBasis,
        actor: "stripe-owned-transport",
        source: "fundraising:confirm",
        at: Date.now(),
        version: 1,
        synthetic: true,
      });
      donation = (await ctx.db.get(id))!;
      for (const [kind, amount, reference] of [
        ["gross", f.grossCents, f.paymentId],
        ["refunds", f.refundedCents, f.chargeId],
        ["fees", f.feeCents, f.balanceTransactionId ?? `unknown:${f.chargeId}`],
        ["commission", donation.commissionCents, f.successEventId],
      ] as const)
        await ctx.db.insert("fundraisingLedger", {
          donationId: id,
          kind,
          cents: amount,
          providerReference: reference,
          digest: f.factsDigest,
          actor: "stripe-owned-transport",
          source: "fundraising:confirm",
          at: Date.now(),
          version: 1,
        });
      await audit(ctx, row._id, "payment-confirmed-once", f.factsDigest);
    }
    if (!priorEvent)
      await ctx.db.insert("fundraisingEvents", {
        account: value.scope.account,
        eventId: f.eventId,
        checkoutId: row._id,
        donationId: donation._id,
        digest: f.digest,
        at: Date.now(),
        source: "stripe:verified-webhook",
        version: 1,
      });
    await reconcileRefunds(ctx, donation, f.eventId, f.factsDigest);
    await ctx.db.patch(row._id, { state: "confirmed" });
    return { confirmed: true, duplicate: !!priorEvent || !!checkoutDonation };
  },
});
export const status = query({
  args: { operationId: v.string(), tokenHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("fundraisingCheckouts")
      .withIndex("by_operation", (q) => q.eq("operationId", args.operationId))
      .unique();
    if (!row || row.tokenHash !== args.tokenHash)
      throw new Error("FORBIDDEN: Checkout status unavailable");
    return {
      status: row.state === "confirmed" ? "confirmed" : "pending",
      synthetic: true,
      validatedForProduction: false,
    };
  },
});
export const ledger = query({
  args: {
    campaignId: v.string(),
    audience: v.union(v.literal("manager"), v.literal("creator")),
  },
  handler: async (ctx, { campaignId, audience }) => {
    const access =
      audience === "manager"
        ? await authorizedCampaign(ctx, campaignId)
        : await acceptedCreator(ctx, campaignId);
    const rows = await ctx.db
      .query("fundraisingDonations")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
      .collect();
    return await Promise.all(
      rows
        .filter(
          (r) =>
            r.nonprofitId === access.campaign.nonprofitId &&
            (audience === "manager" || r.creator === access.subject),
        )
        .map(async (row) => {
          const amounts = await ctx.db
            .query("fundraisingLedger")
            .withIndex("by_donation", (q) => q.eq("donationId", row._id))
            .collect();
          const current = await currentCommission(ctx, row);
          return {
            current: {
              refundedCents: current.refundedCents,
              eligibleGrossCents: current.eligibleGrossCents,
              recognizedCommissionCents: current.recognizedCommissionCents,
              reversedCommissionCents:
                row.commissionCents - current.recognizedCommissionCents,
            },
            id: row._id,
            originEntryId: row.originEntryId ?? null,
            completedAt: row.completedAt,
            grossCents: row.grossCents,
            commissionCents: row.commissionCents,
            commissionBasisPoints: row.commissionBasisPoints,
            eligible: row.eligible,
            dailyPeriod: row.dailyPeriod,
            weeklyPeriod: row.weeklyPeriod,
            earningWeek: row.earningWeek,
            synthetic: row.synthetic,
            timeBasis: row.timeBasis,
            actor: row.actor,
            source: row.source,
            at: row.at,
            version: row.version,
            amounts: amounts.map((a) => ({
              kind: a.kind,
              cents: a.cents,
              ...(audience === "manager"
                ? {
                    providerReference: a.providerReference,
                    factsDigest: a.digest,
                    source: a.source,
                    at: a.at,
                    version: a.version,
                  }
                : {}),
            })),
            ...(audience === "manager"
              ? {
                  paymentId: row.paymentId,
                  chargeId: row.chargeId,
                  account: row.account,
                  successEventId: row.successEventId,
                }
              : {}),
          };
        }),
    );
  },
});
export const history = query({
  args: { campaignId: v.string(), donationId: v.id("fundraisingDonations") },
  handler: async (ctx, { campaignId, donationId }) => {
    const { campaign } = await authorizedCampaign(ctx, campaignId),
      row = await ctx.db.get(donationId);
    if (
      !row ||
      row.campaignSlug !== campaignId ||
      row.nonprofitId !== campaign.nonprofitId
    )
      throw new Error("FORBIDDEN: Donation history unavailable");
    return await ctx.db
      .query("fundraisingAudit")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", row.checkoutId))
      .collect();
  },
});
// Signed service only; generation is journaled before any canonical refund reads.
export const refundRead = mutation({
  args: {
    value: v.object({
      checkoutId: v.id("fundraisingCheckouts"),
      eventId: v.string(),
      digest: v.string(),
      scope: fundraisingScope,
      at: v.number(),
    }),
    signature: v.string(),
  },
  handler: async (ctx, { value, signature: supplied }) => {
    signature(value, supplied);
    await gate(ctx, value.scope);
    const row = await ctx.db.get(value.checkoutId);
    if (!row || stableRequest(row.scope) !== stableRequest(value.scope))
      throw new Error("FUNDRAISING_REFUND_SCOPE");
    const generation = sumCents([row.refundGeneration ?? 0, 1]);
    await ctx.db.patch(row._id, { refundGeneration: generation });
    await ctx.db.insert("fundraisingRefundReads", {
      actor: "fundraising-service",
      source: "fundraising:canonical-read-journal",
      version: 1,
      checkoutId: row._id,
      generation,
      eventId: value.eventId,
      digest: value.digest,
      at: Date.now(),
    });
    return { row, generation };
  },
});
export const observeRefunds = mutation({
  args: {
    value: v.object({
      checkoutId: v.id("fundraisingCheckouts"),
      generation: v.number(),
      paymentId: v.string(),
      chargeId: v.string(),
      eventId: v.string(),
      digest: v.string(),
      refunds: v.array(refundFact),
      scope: fundraisingScope,
      at: v.number(),
    }),
    signature: v.string(),
  },
  handler: async (ctx, { value, signature: supplied }) => {
    signature(value, supplied);
    await gate(ctx, value.scope);
    const row = await ctx.db.get(value.checkoutId);
    if (!row || stableRequest(row.scope) !== stableRequest(value.scope))
      throw new Error("FUNDRAISING_REFUND_SCOPE");
    const reads = await ctx.db
      .query("fundraisingRefundReads")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", row._id))
      .collect();
    const read = reads.find((r) => r.generation === value.generation);
    if (!read || read.eventId !== value.eventId || read.digest !== value.digest)
      throw new Error("FUNDRAISING_REFUND_BINDING");
    const factsDigest = bytesToHex(
      sha256(
        new TextEncoder().encode(
          stableRequest({
            paymentId: value.paymentId,
            chargeId: value.chargeId,
            refunds: value.refunds,
          }),
        ),
      ),
    );
    if (read.factsDigest) {
      if (read.factsDigest !== factsDigest)
        throw new Error("FUNDRAISING_REFUND_READ_CONFLICT");
      return { status: read.outcome!, applied: read.applied! };
    }
    if (value.generation !== row.refundGeneration) {
      await ctx.db.patch(read._id, {
        factsDigest,
        outcome: "stale-read-held",
        applied: false,
      });
      return { status: "stale-read-held", applied: false };
    }
    const donation = await ctx.db
      .query("fundraisingDonations")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", row._id))
      .unique();
    if (
      donation &&
      (donation.paymentId !== value.paymentId ||
        donation.chargeId !== value.chargeId)
    )
      throw new Error("FUNDRAISING_REFUND_CONFLICT");
    const previous = await ctx.db
      .query("fundraisingRefundObservations")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", row._id))
      .collect();
    let held = false;
    const ids = new Set<string>();
    const additions: typeof value.refunds = [];
    for (const r of value.refunds) {
      cents(r.amountCents, true);
      if (
        !/^re_[A-Za-z0-9_-]+$/.test(r.refundId) ||
        ids.has(r.refundId) ||
        r.paymentId !== value.paymentId ||
        r.chargeId !== value.chargeId ||
        ![
          "pending",
          "requires_action",
          "succeeded",
          "failed",
          "canceled",
        ].includes(r.status) ||
        !Number.isSafeInteger(r.createdAt) ||
        r.createdAt < 0 ||
        r.createdAt > Date.now() + 5000
      )
        throw new Error("FUNDRAISING_REFUND_FACTS");
      ids.add(r.refundId);
      const prior = await ctx.db
        .query("fundraisingRefundObservations")
        .withIndex("by_refund", (q) =>
          q.eq("account", value.scope.account).eq("refundId", r.refundId),
        )
        .collect();
      if (
        prior.some(
          (p) =>
            p.checkoutId !== row._id ||
            p.paymentId !== r.paymentId ||
            p.chargeId !== r.chargeId ||
            p.amountCents !== r.amountCents ||
            p.createdAt !== r.createdAt,
        )
      )
        throw new Error("FUNDRAISING_REFUND_CONFLICT");
      if (
        prior.some((p) => p.accepted && p.status === "succeeded") &&
        r.status !== "succeeded"
      )
        held = true;
      if (r.status === "succeeded" && r.failureBalanceTransactionId)
        held = true;
      const latest = prior.at(-1);
      if (
        !latest ||
        !latest.accepted ||
        latest.status !== r.status ||
        latest.balanceTransactionId !== r.balanceTransactionId ||
        latest.failureBalanceTransactionId !== r.failureBalanceTransactionId
      )
        additions.push(r);
    }
    if (previous.some((p) => !ids.has(p.refundId))) held = true;
    for (const r of additions)
      await ctx.db.insert("fundraisingRefundObservations", {
        ...r,
        accepted: !held,
        checkoutId: row._id,
        account: value.scope.account,
        eventId: value.eventId,
        digest: factsDigest,
        generation: value.generation,
        actor: "stripe-owned-transport",
        source: "fundraising:canonical-refund-read",
        at: Date.now(),
        version: 1,
      });
    const confirmed = new Map<string, number>();
    for (const r of [
      ...previous.filter((p) => p.accepted),
      ...(!held ? value.refunds : []),
    ])
      if (r.status === "succeeded" && !r.failureBalanceTransactionId)
        confirmed.set(r.refundId, r.amountCents);
    if (sumCents([...confirmed.values()]) > row.amountCents)
      throw new Error("FUNDRAISING_REFUND_OVERFLOW");
    await managerNotice(
      ctx,
      row.campaignSlug,
      "refund-held:" + row._id,
      "fundraising-refund-held",
      held,
      held
        ? "Refund evidence conflicts with retained confirmed history. Correction held for manager review; no automatic earnings restoration."
        : "Coherent complete refund evidence restored; retained observation history remains available.",
      value.digest,
    );
    await audit(
      ctx,
      row._id,
      donation
        ? "refund-evidence-reconciled"
        : "refund-awaiting-original-donation",
      value.digest,
    );
    if (donation)
      await reconcileRefunds(ctx, donation, value.eventId, value.digest);
    const outcome = held
      ? "correction-held"
      : donation
        ? "reconciled"
        : "awaiting-original-donation";
    await ctx.db.patch(read._id, {
      factsDigest,
      outcome,
      applied: !!donation && !held,
    });
    return { status: outcome, applied: !!donation && !held };
  },
});
export const reconciliation = query({
  args: {
    campaignId: v.string(),
    audience: v.union(v.literal("manager"), v.literal("creator")),
  },
  handler: async (ctx, { campaignId, audience }) => {
    const access =
      audience === "manager"
        ? await authorizedCampaign(ctx, campaignId)
        : await acceptedCreator(ctx, campaignId);
    const rows = (
      await ctx.db
        .query("fundraisingDonations")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
        .collect()
    ).filter(
      (r) =>
        r.nonprofitId === access.campaign.nonprofitId &&
        (audience === "manager" || r.creator === access.subject),
    );
    const balances = await Promise.all(
      (await commissionBalances(ctx, rows)).map(async (g) => {
        if (audience !== "manager")
          return {
            recognizedCents: g.recognizedCents,
            paidCents: g.paidCents,
            balanceCents: g.balanceCents,
            carryforwardCents: g.carryforwardCents,
            payableCents: g.payableCents,
            managerReview: g.managerReview,
          };
        const row = rows.find(
          (r) =>
            r.creator === g.creator &&
            r.account === g.account &&
            r.route === g.route,
        );
        const origin = row?.originEntryId
          ? await fundraisingOrigin(ctx, row.originEntryId)
          : null;
        return {
          ...g,
          creatorLabel:
            origin?.publicEntry?.creator ??
            unnamedCreator(access.campaign._id, g.creator),
        };
      }),
    );
    const entryIds = [
      ...new Set(
        rows.flatMap((r) => (r.originEntryId ? [r.originEntryId] : [])),
      ),
    ];
    const periods = await Promise.all(
      entryIds.map(async (entryId) => {
        const results = await ctx.db
          .query("fundraisingPeriodResults")
          .withIndex("by_entry", (q) => q.eq("entryId", entryId))
          .collect();
        const snapshots = await ctx.db
          .query("fundraisingFinalizedSnapshots")
          .withIndex("by_entry", (q) => q.eq("entryId", entryId))
          .collect();
        return {
          entryId,
          results: results.map((r) => ({
            periodKind: r.periodKind,
            period: r.period,
            metric: r.metric,
            eligibleGrossCents: r.eligibleGrossCents,
            originalGrossCents: r.originalGrossCents,
            source: r.source,
            at: r.at,
            version: r.version,
          })),
          finalized: await Promise.all(
            snapshots.map(async (s) => ({
              period: s.period,
              periodKind: s.periodKind,
              originalGrossCents: s.originalGrossCents,
              fixedPrizeCents: s.fixedPrizeCents,
              preserved: true,
              ...(audience === "manager"
                ? {
                    resultId: s.resultId,
                    winner: s.winner,
                    prizeObligationId: s.prizeObligationId,
                    source: s.source,
                    evidence: s.evidence,
                  }
                : {}),
              discrepancies: (
                await ctx.db
                  .query("fundraisingPeriodDiscrepancies")
                  .withIndex("by_snapshot", (q) => q.eq("snapshotId", s._id))
                  .collect()
              ).map((d) => ({
                originalGrossCents: d.originalGrossCents,
                correctedGrossCents: d.correctedGrossCents,
                at: d.at,
                version: d.version,
              })),
            })),
          ),
        };
      }),
    );
    return {
      balances,
      periods,
      synthetic: true,
      validatedForProduction: false,
    };
  },
});

export const paymentHistory = query({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    const { campaign } = await authorizedCampaign(ctx, campaignId);
    const obligations = (
      await ctx.db
        .query("fundraisingCommissionObligations")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
        .collect()
    ).filter((r) => r.nonprofitId === campaign.nonprofitId);
    const payments = (
      await ctx.db
        .query("fundraisingCommissionPayments")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
        .collect()
    ).filter((r) => r.nonprofitId === campaign.nonprofitId);
    return { obligations, payments };
  },
});
export const refundHistory = query({
  args: { campaignId: v.string(), donationId: v.id("fundraisingDonations") },
  handler: async (ctx, { campaignId, donationId }) => {
    const { campaign } = await authorizedCampaign(ctx, campaignId),
      donation = await ctx.db.get(donationId);
    if (
      !donation ||
      donation.campaignSlug !== campaignId ||
      donation.nonprofitId !== campaign.nonprofitId
    )
      throw new Error("FORBIDDEN: Refund history unavailable");
    return {
      observations: await ctx.db
        .query("fundraisingRefundObservations")
        .withIndex("by_checkout", (q) =>
          q.eq("checkoutId", donation.checkoutId),
        )
        .collect(),
      corrections: await ctx.db
        .query("fundraisingCorrections")
        .withIndex("by_donation", (q) => q.eq("donationId", donation._id))
        .collect(),
      reads: await ctx.db
        .query("fundraisingRefundReads")
        .withIndex("by_checkout", (q) =>
          q.eq("checkoutId", donation.checkoutId),
        )
        .collect(),
    };
  },
});

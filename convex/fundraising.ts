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
import { confirmation, fundraisingScope } from "./fundraisingSchema.ts";
import { fundraisingOrigin, publicCampaign } from "./publicViewer.ts";

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
      f.refundedCents > f.grossCents ||
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
      const fee = amounts.filter((a) => a.kind === "fees").at(-1),
        refunds = amounts.filter((a) => a.kind === "refunds").at(-1);
      if (
        fee?.cents !== null &&
        f.feeCents !== null &&
        fee?.cents !== f.feeCents
      )
        throw new Error("FUNDRAISING_CONFLICT: Confirmed fee changed");
      for (const [kind, amount, changed] of [
        ["fees", f.feeCents, fee?.cents === null && f.feeCents !== null],
        ["refunds", f.refundedCents, f.refundedCents > (refunds?.cents ?? 0)],
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
          return {
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

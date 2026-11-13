import { v } from "convex/values";
import {
  authorizedCampaign,
  operationIdentity,
  stableRequest,
} from "./access.ts";
import {
  batchPreparation,
  rulesValidator,
  validateRules,
} from "./campaignRules.ts";
import { mutation, query } from "./functions.ts";
import { ensurePrizeSchedule } from "./prizeFunds.ts";

export const workspace = query({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    const { campaign, subject, isAdministrator } = await authorizedCampaign(
      ctx,
      campaignId,
    );
    const settings = await ctx.db
      .query("campaignSettings")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
      .unique();
    return {
      name: campaign.name,
      slug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      subject,
      isAdministrator,
      settings,
      batchPreparation,
    };
  },
});

export const create = mutation({
  args: {
    campaignId: v.string(),
    operationId: v.string(),
    rules: rulesValidator,
  },
  handler: async (ctx, { campaignId, operationId, rules }) => {
    // Current authorization always precedes operation lookup, including exact retries.
    const { campaign, subject } = await authorizedCampaign(ctx, campaignId);
    operationIdentity(operationId);
    validateRules(rules);
    const fingerprint = stableRequest(rules);
    const existing = await ctx.db
      .query("campaignSettings")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
      .unique();
    if (existing) {
      if (existing.operationId === operationId) {
        if (existing.fingerprint !== fingerprint)
          throw new Error(
            "OPERATION_CONFLICT: Campaign creation contents changed",
          );
        return existing;
      }
      throw new Error(
        "RULES_LOCKED: Campaign rules cannot change after creation",
      );
    }
    const createdAt = Date.now();
    const settingsId = await ctx.db.insert("campaignSettings", {
      campaignSlug: campaignId,
      nonprofitId: campaign.nonprofitId,
      operationId,
      fingerprint,
      rules,
      version: 1,
      acceptedTermsVersion: "campaign-rules-v1",
      actor: subject,
      source: "campaignSetup:create",
      createdAt,
      batchPreparation,
    });
    await ctx.db.insert("campaignAudit", {
      campaignSlug: campaignId,
      nonprofitId: campaign.nonprofitId,
      settingsId,
      actor: subject,
      source: "campaignSetup:create",
      at: createdAt,
      version: 1,
      operationId,
      action: "rules-created-and-locked",
    });
    await ensurePrizeSchedule(ctx, campaign);
    return await ctx.db.get(settingsId);
  },
});

// Explicit denial gives clients an observable locked-rule result before invitations.
export const update = mutation({
  args: { campaignId: v.string(), rules: rulesValidator },
  handler: async (ctx, { campaignId }) => {
    await authorizedCampaign(ctx, campaignId);
    throw new Error(
      "RULES_LOCKED: No campaign rules amendment process is permitted",
    );
  },
});

export const audit = query({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    await authorizedCampaign(ctx, campaignId);
    return await ctx.db
      .query("campaignAudit")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
      .collect();
  },
});

// Administrator status is independently recorded; manager membership never grants it.
export const administratorAuthority = query({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    const { isAdministrator } = await authorizedCampaign(ctx, campaignId);
    if (!isAdministrator)
      throw new Error("FORBIDDEN: Platform administrator permission required");
    return { authorized: true };
  },
});

// Public projections contain scoped references only, never provider credentials.
// Connection provisioning and financial routes are owned by later launch slices.
export const resource = query({
  args: { campaignId: v.string(), resourceId: v.id("campaignResources") },
  handler: async (ctx, { campaignId, resourceId }) => {
    const { campaign } = await authorizedCampaign(ctx, campaignId);
    const record = await ctx.db.get(resourceId);
    if (
      !record ||
      record.campaignSlug !== campaignId ||
      record.nonprofitId !== campaign.nonprofitId
    )
      throw new Error("FORBIDDEN: Resource access denied");
    return { kind: record.kind, reference: record.reference };
  },
});

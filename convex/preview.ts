import { v } from "convex/values";
import {
  authorizedCampaign,
  operationIdentity,
  stableRequest,
} from "./access.ts";
import { recordSimulatedIncidents } from "./allocation/notifications.ts";
import { planAllocation } from "./allocation/planner.ts";
import { inputValidator } from "./allocation/validators.ts";
import { mutation, query } from "./functions.ts";

export const health = query({
  args: {},
  handler: () => ({ service: "allocation-preview", version: 1 }),
});

export const save = mutation({
  args: {
    campaignId: v.string(),
    operationId: v.string(),
    input: inputValidator,
  },
  handler: async (ctx, { campaignId, operationId, input }) => {
    const { campaign, subject } = await authorizedCampaign(
      ctx,
      campaignId,
      true,
    );
    operationIdentity(operationId);
    const fingerprint = stableRequest(input);
    const existing = await ctx.db
      .query("previews")
      .withIndex("by_operation", (q) =>
        q.eq("campaignSlug", campaignId).eq("operationId", operationId),
      )
      .unique();
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new Error(
          "OPERATION_CONFLICT: Changed inputs require a new operation identity",
        );
      return existing;
    }
    const authority = campaign.authority;
    if (input.authority.revision !== authority.revision)
      throw new Error(
        "AUTHORITY_CHANGED: Refresh current authority before saving",
      );
    if (
      input.authority.dailyLimitCents > authority.dailyLimitCents ||
      input.authority.totalLimitCents > authority.totalLimitCents ||
      input.authority.capacity !== authority.capacity ||
      input.authority.dailyCommittedCents !== authority.dailyCommittedCents ||
      input.authority.campaignCommittedCents !==
        authority.campaignCommittedCents
    )
      throw new Error(
        "AUTHORITY_CONFLICT: Preview cannot expand approved authority or hide commitments",
      );
    const result = planAllocation(input);
    const createdAt = Date.now();
    const id = await ctx.db.insert("previews", {
      campaignSlug: campaignId,
      operationId,
      fingerprint,
      actor: subject,
      createdAt,
      input,
      result,
    });
    await recordSimulatedIncidents(
      ctx,
      {
        campaignSlug: campaignId,
        nonprofitId: campaign.nonprofitId,
        previewId: id,
      },
      result,
      createdAt,
    );
    return await ctx.db.get(id);
  },
});

export const list = query({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    await authorizedCampaign(ctx, campaignId, true);
    return await ctx.db
      .query("previews")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
      .order("desc")
      .take(100);
  },
});

export const campaign = query({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    const { campaign, subject } = await authorizedCampaign(
      ctx,
      campaignId,
      true,
    );
    return {
      name: campaign.name,
      slug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      authority: campaign.authority,
      subject,
    };
  },
});

export const notifications = query({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    await authorizedCampaign(ctx, campaignId, true);
    return await ctx.db
      .query("notifications")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
      .order("desc")
      .take(100);
  },
});

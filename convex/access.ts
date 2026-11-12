import type { QueryCtx } from "./functions.ts";
import { convexToJson, type Value } from "convex/values";

export async function authorizedCampaign(ctx: QueryCtx, campaignId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("FORBIDDEN: Sign in is required");
  const campaign = await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", campaignId))
    .unique();
  if (!campaign) throw new Error("FORBIDDEN: Campaign access denied");
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_subject_nonprofit", (q) =>
      q.eq("subject", identity.subject).eq("nonprofitId", campaign.nonprofitId),
    )
    .unique();
  const operator = await ctx.db
    .query("operators")
    .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
    .unique();
  if (
    !(membership?.active && membership.role === "manager") &&
    !operator?.active
  )
    throw new Error("FORBIDDEN: Campaign access denied");
  // This first slice accepts synthetic evidence only inside an explicitly owned run.
  if (
    !process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID ||
    campaign.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID
  )
    throw new Error(
      "Fixture evidence is not accepted outside the isolated preview harness",
    );
  return { campaign, subject: identity.subject };
}

export function stableRequest(value: Value): string {
  return stableJson(convexToJson(value));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export function operationIdentity(value: string) {
  if (!value.trim() || value.length > 128 || value.trim() !== value)
    throw new Error("Invalid operation identity");
}

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const periodKind = v.union(v.literal("daily"), v.literal("weekly"));
export const standingsTables = {
  standingsSnapshots: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    kind: periodKind,
    period: v.string(),
    inputFingerprint: v.string(),
    settingsId: v.id("campaignSettings"),
    source: v.literal("standings-v1"),
    actor: v.string(),
    at: v.number(),
    version: v.literal(1),
    prizeEligible: v.boolean(),
    fixedPrizeCents: v.number(),
    rows: v.array(
      v.object({
        entryId: v.id("photoEntries"),
        creativeVersion: v.number(),
        createdAt: v.number(),
        impressions: v.number(),
        linkClicks: v.number(),
        fundraisingCents: v.number(),
        score: v.number(),
        rank: v.number(),
        proposedPrizeCents: v.number(),
      }),
    ),
  }).index("by_period", ["campaignSlug", "kind", "period"]),
  standingsRefreshes: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    kind: periodKind,
    period: v.string(),
    operationId: v.string(),
    requestFingerprint: v.string(),
    inputFingerprint: v.string(),
    snapshotId: v.union(v.id("standingsSnapshots"), v.null()),
    outcome: v.union(
      v.literal("stored"),
      v.literal("unchanged"),
      v.literal("held"),
    ),
    actor: v.string(),
    source: v.literal("standings-v1"),
    at: v.number(),
    version: v.literal(1),
  })
    .index("by_operation", ["campaignSlug", "actor", "operationId"])
    .index("by_campaign", ["campaignSlug"]),
};

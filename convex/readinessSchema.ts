import { defineTable } from "convex/server";
import { v } from "convex/values";

export const readinessAccounts = v.object({
  stripe: v.optional(v.string()),
  meta: v.optional(v.string()),
  tiktok: v.optional(v.string()),
  clerk: v.optional(v.string()),
  blob: v.optional(v.string()),
  mux: v.optional(v.string()),
  email: v.optional(v.string()),
});
export const readinessEvidence = {
  campaignId: v.string(),
  nonprofitId: v.string(),
  component: v.string(),
  revision: v.string(),
  account: v.string(),
  releaseTarget: v.optional(v.string()),
  sequence: v.number(),
  observedAt: v.number(),
  expiresAt: v.number(),
  reviewer: v.string(),
  digest: v.string(),
  outcome: v.union(v.literal("verified"), v.literal("failed")),
  // These are validated facts, never defaults or a browser approval checkbox.
  values: v.optional(
    v.object({
      availableCents: v.number(),
      requiredCents: v.number(),
    }),
  ),
  safety: v.optional(
    v.object({
      reserveCents: v.number(),
      freshnessMs: v.number(),
      releaseRuleDigest: v.string(),
    }),
  ),
};
export const readinessEvidenceValidator = v.object(readinessEvidence);
export const readinessRelease = {
  campaignId: v.string(),
  nonprofitId: v.string(),
  environmentDigest: v.string(),
  buildDigest: v.string(),
  sequence: v.number(),
  observedAt: v.number(),
};
export const readinessReleaseValidator = v.object(readinessRelease);
export const readinessTables = {
  readinessReleaseTargets: defineTable({
    ...readinessRelease,
    actor: v.string(),
    source: v.string(),
    synthetic: v.boolean(),
    at: v.number(),
    version: v.literal(1),
  }).index("by_campaign", ["campaignId"]),
  readinessScopes: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    version: v.number(),
    accounts: readinessAccounts,
    selectedProviders: v.array(v.union(v.literal("meta"), v.literal("tiktok"))),
    actor: v.string(),
    source: v.string(),
    at: v.number(),
  }).index("by_campaign", ["campaignSlug"]),
  readinessProofs: defineTable({
    ...readinessEvidence,
    source: v.string(),
    actor: v.string(),
    synthetic: v.boolean(),
    at: v.number(),
    version: v.literal(1),
  }).index("by_campaign", ["campaignId"]),
  readinessBlockers: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    component: v.string(),
    active: v.boolean(),
    reason: v.string(),
    revision: v.string(),
    sequence: v.number(),
    firstDetectedAt: v.number(),
    updatedAt: v.number(),
    actor: v.string(),
    source: v.string(),
    version: v.literal(1),
  }).index("by_campaign", ["campaignSlug"]),
  readinessAudit: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    actor: v.string(),
    source: v.string(),
    at: v.number(),
    version: v.literal(1),
    action: v.string(),
    revision: v.string(),
    // Immutable component/reason/proof digest history, with no raw provider data.
    details: v.string(),
  }).index("by_campaign", ["campaignSlug"]),
};

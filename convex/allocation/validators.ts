import { v } from "convex/values";

const metrics = v.object({
  impressions: v.union(v.number(), v.null()),
  clicks: v.union(v.number(), v.null()),
  raisedCents: v.union(v.number(), v.null()),
});
export const authorityValidator = v.object({
  revision: v.string(),
  dailyLimitCents: v.number(),
  totalLimitCents: v.number(),
  dailyCommittedCents: v.number(),
  campaignCommittedCents: v.number(),
  capacity: v.number(),
});
export const inputValidator = v.object({
  at: v.number(),
  authority: authorityValidator,
  settings: v.object({
    baselineCents: v.number(),
    boostPercent: v.number(),
    topCount: v.number(),
    metaPercent: v.number(),
    tiktokPercent: v.number(),
    targets: v.object({
      impressions: v.number(),
      clicks: v.number(),
      raisedCents: v.number(),
    }),
  }),
  finance: v.object({
    status: v.union(v.literal("verified"), v.literal("unknown")),
    source: v.string(),
    asOf: v.number(),
    availableCents: v.number(),
    remainingBaselineReserveCents: v.number(),
    obligations: v.array(
      v.object({
        id: v.string(),
        amountCents: v.number(),
        coverage: v.union(v.literal("provider"), v.literal("local")),
      }),
    ),
    safety: v.union(
      v.null(),
      v.object({
        revision: v.string(),
        reserveCents: v.number(),
        maximumAgeMs: v.number(),
      }),
    ),
  }),
  scoreCoverage: v.union(
    v.literal("complete"),
    v.literal("startup"),
    v.literal("incomplete"),
  ),
  providers: v.object({
    meta: v.union(v.literal("available"), v.literal("blocked")),
    tiktok: v.union(v.literal("available"), v.literal("blocked")),
  }),
  entries: v.array(
    v.object({
      id: v.string(),
      createdAt: v.number(),
      admittedAt: v.number(),
      state: v.union(
        v.literal("funded"),
        v.literal("paused"),
        v.literal("stopping"),
        v.literal("waiting"),
        v.literal("cut"),
      ),
      metrics,
    }),
  ),
});

export const resultValidator = v.object({
  status: v.union(
    v.literal("ready"),
    v.literal("boosts-held"),
    v.literal("blocked"),
  ),
  reasons: v.array(v.string()),
  day: v.string(),
  occupiedSlots: v.number(),
  eligibleEntries: v.number(),
  baselineCents: v.number(),
  boostCents: v.number(),
  headroomCents: v.number(),
  uncommittedCents: v.number(),
  selectedCount: v.number(),
  targets: v.array(
    v.object({
      entryId: v.string(),
      baselineCents: v.number(),
      boostCents: v.number(),
      metaCents: v.number(),
      tiktokCents: v.number(),
      heldMetaCents: v.number(),
      heldTiktokCents: v.number(),
      score: v.union(v.number(), v.null()),
    }),
  ),
});

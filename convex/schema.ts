import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  authorityValidator,
  inputValidator,
  resultValidator,
} from "./allocation/validators.ts";

export default defineSchema({
  campaigns: defineTable({
    slug: v.string(),
    nonprofitId: v.string(),
    name: v.string(),
    fixtureRunId: v.string(),
    authority: authorityValidator,
    reservationFundingCents: v.number(),
    reservedSlots: v.number(),
    reservedCents: v.number(),
    reservationFinanceRevision: v.string(),
  }).index("by_slug", ["slug"]),
  memberships: defineTable({
    subject: v.string(),
    nonprofitId: v.string(),
    role: v.union(v.literal("manager"), v.literal("creator")),
    active: v.boolean(),
  }).index("by_subject_nonprofit", ["subject", "nonprofitId"]),
  operators: defineTable({ subject: v.string(), active: v.boolean() }).index(
    "by_subject",
    ["subject"],
  ),
  previews: defineTable({
    campaignSlug: v.string(),
    operationId: v.string(),
    fingerprint: v.string(),
    actor: v.string(),
    createdAt: v.number(),
    input: inputValidator,
    result: resultValidator,
  })
    .index("by_operation", ["campaignSlug", "operationId"])
    .index("by_campaign", ["campaignSlug"]),
  notifications: defineTable({
    campaignSlug: v.string(),
    previewId: v.id("previews"),
    simulated: v.literal(true),
    nonprofitId: v.string(),
    recipients: v.array(v.string()),
    reasons: v.array(v.string()),
    incompleteEntryIds: v.array(v.string()),
    createdAt: v.number(),
    kind: v.union(v.literal("score-coverage"), v.literal("financial-plan")),
    status: v.union(v.literal("open"), v.literal("resolved")),
    history: v.array(
      v.object({
        previewId: v.id("previews"),
        state: v.union(
          v.literal("opened"),
          v.literal("updated"),
          v.literal("resolved"),
        ),
        at: v.number(),
      }),
    ),
  })
    .index("by_campaign", ["campaignSlug"])
    .index("by_kind", ["campaignSlug", "kind"]),
  reservations: defineTable({
    campaignSlug: v.string(),
    operationId: v.string(),
    entryId: v.string(),
    amountCents: v.number(),
    authorityRevision: v.string(),
    actor: v.string(),
    financeRevision: v.string(),
  })
    .index("by_operation", ["campaignSlug", "operationId"])
    .index("by_entry", ["campaignSlug", "entryId"]),
  reservationCandidates: defineTable({
    campaignSlug: v.string(),
    entryId: v.string(),
    authorized: v.boolean(),
    amountCents: v.number(),
  }).index("by_entry", ["campaignSlug", "entryId"]),
});

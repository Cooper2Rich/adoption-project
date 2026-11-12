import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { rulesValidator } from "./campaignRules.ts";
import {
  authorityValidator,
  inputValidator,
  resultValidator,
} from "./allocation/validators.ts";

export default defineSchema({
  clerkInvitationJournal: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    invitationId: v.id("creatorInvitations"),
    kind: v.union(v.literal("create"), v.literal("revoke")),
    state: v.union(
      v.literal("dispatched"),
      v.literal("unknown"),
      v.literal("confirmed"),
      v.literal("failed"),
    ),
    actor: v.string(),
    source: v.string(),
    version: v.literal(1),
    at: v.number(),
    updatedAt: v.number(),
    providerId: v.optional(v.string()),
    history: v.array(
      v.object({ state: v.string(), actor: v.string(), at: v.number() }),
    ),
  }).index("by_invitation_kind", ["invitationId", "kind"]),
  creatorInvitations: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    email: v.string(),
    providerState: v.union(v.literal("proposed"), v.literal("confirmed")),
    providerId: v.optional(v.string()),
    subject: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    actor: v.string(),
  })
    .index("by_campaign_email", ["campaignSlug", "email"])
    .index("by_campaign_subject", ["campaignSlug", "subject"]),
  participationTerms: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    version: v.string(),
    title: v.string(),
    body: v.string(),
    synthetic: v.boolean(),
    approvedBy: v.string(),
    approvedAt: v.number(),
  }).index("by_campaign", ["campaignSlug"]),
  participationAcceptances: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    invitationId: v.id("creatorInvitations"),
    subject: v.string(),
    termsId: v.id("participationTerms"),
    version: v.string(),
    termsTitle: v.string(),
    termsBody: v.string(),
    synthetic: v.boolean(),
    acceptedAt: v.number(),
    source: v.string(),
    operationId: v.string(),
  }).index("by_invitation", ["invitationId"]),
  creatorPrivateRecords: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    subject: v.string(),
    kind: v.union(v.literal("earnings"), v.literal("payment-setup")),
    summary: v.string(),
  }).index("by_owner", ["campaignSlug", "subject"]),
  creatorAudit: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    actor: v.string(),
    source: v.string(),
    at: v.number(),
    version: v.string(),
    operationId: v.string(),
    fingerprint: v.string(),
    invitationId: v.id("creatorInvitations"),
    action: v.union(
      v.literal("invited"),
      v.literal("revoked"),
      v.literal("accepted"),
    ),
  })
    .index("by_operation", ["campaignSlug", "actor", "operationId"])
    .index("by_campaign", ["campaignSlug"]),
  campaignResources: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    kind: v.union(v.literal("provider"), v.literal("finance")),
    reference: v.string(),
  }).index("by_campaign", ["campaignSlug"]),
  campaigns: defineTable({
    slug: v.string(),
    nonprofitId: v.string(),
    name: v.string(),
    fixtureRunId: v.optional(v.string()),
    authority: authorityValidator,
    reservationFundingCents: v.number(),
    reservedSlots: v.number(),
    reservedCents: v.number(),
    reservationFinanceRevision: v.string(),
  }).index("by_slug", ["slug"]),
  campaignSettings: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    operationId: v.string(),
    fingerprint: v.string(),
    rules: rulesValidator,
    version: v.literal(1),
    acceptedTermsVersion: v.string(),
    actor: v.string(),
    source: v.string(),
    createdAt: v.number(),
    batchPreparation: v.object({
      weekday: v.literal(3),
      time: v.literal("12:00"),
      timezone: v.literal("America/Chicago"),
    }),
  }).index("by_campaign", ["campaignSlug"]),
  campaignAudit: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    settingsId: v.id("campaignSettings"),
    actor: v.string(),
    source: v.string(),
    at: v.number(),
    version: v.number(),
    operationId: v.string(),
    action: v.literal("rules-created-and-locked"),
  }).index("by_campaign", ["campaignSlug"]),
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

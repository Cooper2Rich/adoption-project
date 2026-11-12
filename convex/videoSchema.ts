import { defineTable } from "convex/server";
import { v } from "convex/values";

export const videoTables = {
  originalArchives: defineTable({
    uploadId: v.id("videoUploads"),
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    sha256: v.string(),
    size: v.number(),
    generation: v.number(),
    storageIdentity: v.optional(v.string()),
    state: v.string(),
    requestedAt: v.number(),
    requestedBy: v.string(),
    purgeAt: v.number(),
    nonce: v.string(),
    dispatchAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
    message: v.optional(v.string()),
  })
    .index("by_upload", ["uploadId"])
    .index("by_campaign", ["campaignSlug"]),
  originalArchiveEvents: defineTable({
    uploadId: v.id("videoUploads"),
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    actor: v.string(),
    source: v.string(),
    at: v.number(),
    generation: v.number(),
    action: v.string(),
    operationId: v.string(),
    fingerprint: v.string(),
    confirmation: v.optional(v.string()),
    sha256: v.string(),
    size: v.number(),
    revisions: v.array(
      v.object({ entryId: v.id("photoEntries"), version: v.number() }),
    ),
  })
    .index("by_operation", ["campaignSlug", "actor", "operationId"])
    .index("by_upload", ["uploadId"]),
  originalDownloadGrants: defineTable({
    storageIdentity: v.optional(v.string()),
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    entryId: v.optional(v.id("photoEntries")),
    version: v.optional(v.number()),
    archiveVersion: v.literal(1),
    uploadId: v.id("videoUploads"),
    sha256: v.string(),
    size: v.number(),
    actor: v.string(),
    source: v.literal("originalDownloads:issue"),
    at: v.number(),
    expiresAt: v.number(),
    operationId: v.string(),
    fingerprint: v.string(),
  })
    .index("by_operation", ["campaignSlug", "actor", "operationId"])
    .index("by_upload", ["uploadId"]),
  videoUploads: defineTable({
    campaignSlug: v.string(),
    nonprofitId: v.string(),
    subject: v.string(),
    acceptanceId: v.id("participationAcceptances"),
    operationId: v.string(),
    fingerprint: v.string(),
    filename: v.string(),
    declaredSize: v.number(),
    pathname: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    sha256: v.optional(v.string()),
    size: v.optional(v.number()),
    duration: v.optional(v.number()),
    videoCodec: v.optional(v.string()),
    audioCodec: v.optional(v.string()),
    verifiedAt: v.optional(v.number()),
    storageIdentity: v.optional(v.string()),
    state: v.string(),
    error: v.optional(v.string()),
    attempt: v.number(),
    assetId: v.optional(v.string()),
    playbackId: v.optional(v.string()),
    dispatchAt: v.optional(v.number()),
    sourceExpiresAt: v.optional(v.number()),
    multipart: v.optional(
      v.object({
        key: v.string(),
        uploadId: v.string(),
        parts: v.array(
          v.object({
            partNumber: v.number(),
            etag: v.string(),
            sha256: v.string(),
          }),
        ),
      }),
    ),
  })
    .index("by_operation", ["campaignSlug", "subject", "operationId"])
    .index("by_campaign", ["campaignSlug"]),
  videoEvents: defineTable({
    uploadId: v.id("videoUploads"),
    actor: v.string(),
    source: v.string(),
    at: v.number(),
    attempt: v.number(),
    action: v.string(),
    eventId: v.optional(v.string()),
    fingerprint: v.string(),
  })
    .index("by_upload", ["uploadId"])
    .index("by_event", ["eventId"]),
};

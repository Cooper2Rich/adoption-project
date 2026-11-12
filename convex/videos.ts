import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { v } from "convex/values";
import {
  authorizedCampaign,
  operationIdentity,
  stableRequest,
} from "./access.ts";
import {
  acceptedCreator,
  requireSubmissionParticipant,
} from "./creatorAccess.ts";
import { mutation, query, type Doc, type QueryCtx } from "./functions.ts";

const uploadId = v.id("videoUploads"),
  scope = { campaignId: v.string() };
const denied = () => {
  throw new Error("FORBIDDEN: Private video access denied");
};
export function proof(
  value: Parameters<typeof stableRequest>[0],
  signature: string,
) {
  const secret = process.env.VIDEO_RECEIPT_SECRET;
  if (!secret || secret.length < 32)
    throw new Error(
      "VIDEO_UNAVAILABLE: Private video service is not configured",
    );
  const expected = bytesToHex(
    hmac(
      sha256,
      new TextEncoder().encode(secret),
      new TextEncoder().encode(stableRequest(value)),
    ),
  );
  let difference = signature.length ^ expected.length;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ (signature.charCodeAt(i) || 0);
  if (difference) denied();
}
export function fresh(at: number) {
  if (at > Date.now() + 1000 || at < Date.now() - 300_000) denied();
}
export async function videoReader(
  ctx: QueryCtx,
  campaignId: string,
  id: Doc<"videoUploads">["_id"],
  intake = false,
) {
  const viewer = intake
    ? {
        ...(await requireSubmissionParticipant(ctx, campaignId)),
        manager: false,
      }
    : await (async () => {
        try {
          return {
            ...(await authorizedCampaign(ctx, campaignId)),
            manager: true,
          };
        } catch {
          return {
            ...(await acceptedCreator(ctx, campaignId)),
            manager: false,
          };
        }
      })();
  const record = await ctx.db.get(id);
  if (
    !record ||
    record.campaignSlug !== campaignId ||
    record.nonprofitId !== viewer.campaign.nonprofitId ||
    (!viewer.manager && record.subject !== viewer.subject)
  )
    denied();
  return { record: record!, viewer };
}
export const reserve = mutation({
  args: {
    ...scope,
    operationId: v.string(),
    filename: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const { campaign, subject, acceptance } =
      await requireSubmissionParticipant(ctx, args.campaignId);
    operationIdentity(args.operationId);
    if (
      !Number.isSafeInteger(args.size) ||
      args.size < 1 ||
      args.size > 5_000_000_000
    )
      throw new Error(
        "VIDEO_SIZE: Choose 1 to 5,000,000,000 bytes (decimal 5 GB)",
      );
    if (!args.filename.trim() || args.filename.length > 255)
      throw new Error("VIDEO_FILENAME: Use a filename up to 255 characters");
    const fingerprint = stableRequest(args);
    const prior = await ctx.db
      .query("videoUploads")
      .withIndex("by_operation", (q) =>
        q
          .eq("campaignSlug", args.campaignId)
          .eq("subject", subject)
          .eq("operationId", args.operationId),
      )
      .unique();
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new Error("OPERATION_CONFLICT");
      return prior;
    }
    const id = await ctx.db.insert("videoUploads", {
      campaignSlug: args.campaignId,
      nonprofitId: campaign.nonprofitId,
      subject,
      acceptanceId: acceptance._id,
      operationId: args.operationId,
      fingerprint,
      filename: args.filename,
      declaredSize: args.size,
      pathname: "",
      expiresAt: Date.now() + 86_400_000,
      createdAt: Date.now(),
      state: "uploading",
      attempt: 0,
    });
    await ctx.db.patch(id, { pathname: `videos/${id}.mp4` });
    await ctx.db.insert("videoEvents", {
      uploadId: id,
      actor: subject,
      source: "videos:reserve",
      at: Date.now(),
      attempt: 0,
      action: "reserved",
      fingerprint,
    });
    return (await ctx.db.get(id))!;
  },
});
export const uploadAccess = query({
  args: { ...scope, uploadId },
  handler: async (ctx, args) => {
    const { record, viewer } = await videoReader(
      ctx,
      args.campaignId,
      args.uploadId,
      true,
    );
    if (record.expiresAt < Date.now() && !record.sha256)
      throw new Error("VIDEO_EXPIRED: Start a new upload");
    return { ...record, fixtureRunId: viewer.campaign.fixtureRunId ?? null };
  },
});
export const resource = query({
  args: { ...scope, uploadId },
  handler: async (ctx, args) => {
    const { record, viewer } = await videoReader(
      ctx,
      args.campaignId,
      args.uploadId,
    );
    return { ...record, fixtureRunId: viewer.campaign.fixtureRunId ?? null };
  },
});
export const workspace = query({
  args: scope,
  handler: async (ctx, { campaignId }) => {
    let viewer;
    try {
      viewer = {
        ...(await authorizedCampaign(ctx, campaignId)),
        manager: true,
      };
    } catch {
      viewer = { ...(await acceptedCreator(ctx, campaignId)), manager: false };
    }
    const records = await ctx.db
      .query("videoUploads")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
      .collect();
    return records
      .filter(
        (r) =>
          r.nonprofitId === viewer.campaign.nonprofitId &&
          (viewer.manager || r.subject === viewer.subject),
      )
      .map((r) => ({
        _id: r._id,
        filename: r.filename,
        subject: r.subject,
        state: r.state,
        error: r.error,
        size: r.size ?? r.declaredSize,
        sha256: r.sha256,
        duration: r.duration,
        attempt: r.attempt,
        createdAt: r.createdAt,
      }));
  },
});
export const multipart = mutation({
  args: {
    ...scope,
    uploadId,
    key: v.string(),
    providerUploadId: v.string(),
    parts: v.array(
      v.object({
        partNumber: v.number(),
        etag: v.string(),
        sha256: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { record } = await videoReader(
      ctx,
      args.campaignId,
      args.uploadId,
      true,
    );
    if (record.sha256 || record.expiresAt < Date.now())
      throw new Error("VIDEO_IMMUTABLE: Start a new upload");
    if (
      args.parts.length > 1000 ||
      args.key.length > 1000 ||
      args.providerUploadId.length > 1000 ||
      args.parts.some(
        (p) =>
          !Number.isInteger(p.partNumber) ||
          p.partNumber < 1 ||
          p.partNumber > 1000 ||
          p.etag.length > 255 ||
          !/^[a-f0-9]{64}$/.test(p.sha256),
      )
    )
      denied();
    if (
      record.multipart &&
      (record.multipart.key !== args.key ||
        record.multipart.uploadId !== args.providerUploadId)
    )
      throw new Error("OPERATION_CONFLICT");
    // A stale browser cannot erase already confirmed parts or change their bytes.
    for (const prior of record.multipart?.parts ?? [])
      if (!args.parts.some((p) => stableRequest(p) === stableRequest(prior)))
        throw new Error("OPERATION_CONFLICT");
    if (new Set(args.parts.map((p) => p.partNumber)).size !== args.parts.length)
      denied();
    await ctx.db.patch(record._id, {
      multipart: {
        key: args.key,
        uploadId: args.providerUploadId,
        parts: args.parts,
      },
    });
  },
});
const receipt = v.object({
  uploadId,
  at: v.number(),
  action: v.union(
    v.literal("invalid"),
    v.literal("verified"),
    v.literal("claim"),
    v.literal("event"),
  ),
  attempt: v.number(),
  error: v.optional(v.string()),
  state: v.optional(
    v.union(
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
      v.literal("unknown"),
      v.literal("deleted"),
    ),
  ),
  assetId: v.optional(v.string()),
  playbackId: v.optional(v.string()),
  eventId: v.optional(v.string()),
  size: v.optional(v.number()),
  sha256: v.optional(v.string()),
  duration: v.optional(v.number()),
  videoCodec: v.optional(v.string()),
  audioCodec: v.optional(v.string()),
});
export const record = mutation({
  args: { receipt, signature: v.string() },
  handler: async (ctx, { receipt: r, signature }) => {
    proof(r, signature);
    fresh(r.at);
    const upload = await ctx.db.get(r.uploadId);
    if (!upload) denied();
    const u = upload!;
    let actor = "mux:verified-provider";
    if (r.action !== "event") {
      if (r.action === "claim") {
        try {
          actor = (await authorizedCampaign(ctx, u.campaignSlug)).subject;
        } catch {
          actor = (await videoReader(ctx, u.campaignSlug, u._id, true)).viewer
            .subject;
        }
      } else
        actor = (await videoReader(ctx, u.campaignSlug, u._id, true)).viewer
          .subject;
    }
    const fingerprint = stableRequest(r);
    if (r.eventId) {
      const prior = await ctx.db
        .query("videoEvents")
        .withIndex("by_event", (q) => q.eq("eventId", r.eventId))
        .unique();
      if (prior) {
        if (prior.uploadId !== u._id || prior.attempt !== r.attempt) denied();
        return { claimed: false, record: u };
      }
    }
    if (r.action === "invalid") {
      if (u.sha256) return { claimed: false, record: u };
      if (!r.error || r.error.length > 1000) denied();
      await ctx.db.patch(u._id, { state: "invalid", error: r.error });
    } else if (r.action === "verified") {
      if (
        r.size !== u.declaredSize ||
        !r.sha256 ||
        !/^[a-f0-9]{64}$/.test(r.sha256) ||
        !r.duration ||
        r.duration > 60 ||
        r.duration <= 0 ||
        r.videoCodec !== "h264" ||
        !["aac", "none"].includes(r.audioCodec ?? "")
      )
        denied();
      if (u.sha256) {
        if (u.sha256 !== r.sha256) throw new Error("OPERATION_CONFLICT");
        return { claimed: false, record: u };
      }
      if (u.expiresAt < Date.now())
        throw new Error("VIDEO_EXPIRED: Start a new upload");
      await ctx.db.patch(u._id, {
        size: r.size,
        sha256: r.sha256,
        duration: r.duration,
        videoCodec: r.videoCodec,
        audioCodec: r.audioCodec,
        verifiedAt: r.at,
        state: "verified",
        error: undefined,
      });
    } else if (r.action === "claim") {
      if (!u.sha256)
        throw new Error("VIDEO_UNVERIFIED: Verify original bytes first");
      if (!["verified", "failed", "deleted"].includes(u.state))
        return { claimed: false, record: u };
      if (r.attempt !== u.attempt + 1)
        throw new Error("STALE_VERSION: Retry current processing state");
      await ctx.db.patch(u._id, {
        state: "dispatched",
        attempt: r.attempt,
        dispatchAt: r.at,
        sourceExpiresAt: r.at + 86_400_000,
        assetId: undefined,
        playbackId: undefined,
        error: undefined,
      });
    } else {
      if (!u.sha256 || r.attempt !== u.attempt)
        return { claimed: false, record: u };
      if (u.assetId && r.assetId && u.assetId !== r.assetId) denied();
      if (!r.state) denied();
      // Ready is only a server-retrieved, identity-matched provider asset, never
      // a browser notification. Older created/processing/failure cannot regress it.
      if (u.state !== "ready" || r.state === "deleted") {
        if (r.state === "ready" && (!r.assetId || !r.playbackId)) denied();
        if (!["failed", "deleted"].includes(u.state) || r.state === "deleted")
          await ctx.db.patch(u._id, {
            state: r.state,
            ...(r.assetId ? { assetId: r.assetId } : {}),
            playbackId: r.state === "ready" ? r.playbackId : undefined,
            error:
              r.state === "failed"
                ? "Processing failed. Retry this original or upload a corrected MP4."
                : r.state === "unknown"
                  ? "Provider outcome is unknown. Reconcile this attempt before retrying."
                  : r.state === "deleted"
                    ? "Processed playback was removed. The original remains preserved."
                    : undefined,
          });
      }
    }
    await ctx.db.insert("videoEvents", {
      uploadId: u._id,
      actor,
      source:
        r.action === "event"
          ? "mux:verified-asset"
          : "videos:private-byte-service",
      at: r.at,
      attempt: r.attempt,
      action: r.action === "event" ? r.state! : r.action,
      ...(r.eventId ? { eventId: r.eventId } : {}),
      fingerprint,
    });
    return {
      claimed: r.action === "claim",
      record: (await ctx.db.get(u._id))!,
    };
  },
});
export const providerAccess = query({
  args: { uploadId, at: v.number(), signature: v.string() },
  handler: async (ctx, args) => {
    proof({ uploadId: args.uploadId, at: args.at }, args.signature);
    fresh(args.at);
    const record = await ctx.db.get(args.uploadId);
    if (!record) denied();
    const campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_slug", (q) => q.eq("slug", record!.campaignSlug))
      .unique();
    return { ...record!, fixtureRunId: campaign?.fixtureRunId ?? null };
  },
});

// Permission-checked processing evidence is separate from source access grants.
export const history = query({
  args: { ...scope, uploadId },
  handler: async (ctx, args) => {
    await videoReader(ctx, args.campaignId, args.uploadId);
    return (
      await ctx.db
        .query("videoEvents")
        .withIndex("by_upload", (q) => q.eq("uploadId", args.uploadId))
        .collect()
    ).map((event) => ({
      actor: event.actor,
      source: event.source,
      at: event.at,
      attempt: event.attempt,
      action: event.action,
      eventId: event.eventId,
    }));
  },
});

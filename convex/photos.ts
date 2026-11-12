import { v } from "convex/values";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { query, mutation, type QueryCtx, type Doc } from "./functions.ts";
import {
  acceptedCreator,
  requireSubmissionParticipant,
} from "./creatorAccess.ts";
import {
  authorizedCampaign,
  operationIdentity,
  stableRequest,
} from "./access.ts";

const scope = { campaignId: v.string() };
const photoId = v.id("photoUploads");
const entryId = v.id("photoEntries");
const format = v.union(v.literal("image/jpeg"), v.literal("image/png"));
export const receiptValidator = v.object({
  uploadId: photoId,
  pathname: v.string(),
  size: v.number(),
  type: format,
  sha256: v.string(),
  subject: v.string(),
  verifiedAt: v.number(),
});
const forbidden = () => {
  throw new Error("FORBIDDEN: Photo access denied");
};
function text(title: string, description: string) {
  if (
    !title.trim() ||
    title.length > 160 ||
    !description.trim() ||
    description.length > 5000
  )
    throw new Error(
      "DESCRIPTION_REQUIRED: Enter a title (up to 160 characters) and description (up to 5000)",
    );
}
export function photoLimits(sizes: number[]) {
  if (!sizes.length || sizes.length > 10)
    throw new Error("PHOTO_COUNT: Choose 1 to 10 photos");
  if (sizes.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 100_000_000))
    throw new Error(
      "PHOTO_SIZE: Each JPEG/PNG photo must contain 1 to 100,000,000 bytes",
    );
  if (sizes.reduce((a, b) => a + b, 0) > 1_000_000_000)
    throw new Error(
      "PHOTO_TOTAL: Choose at most 1,000,000,000 photo bytes in total",
    );
}
async function ownedUpload(
  ctx: QueryCtx,
  campaignId: string,
  id: Doc<"photoUploads">["_id"],
) {
  const participant = await requireSubmissionParticipant(ctx, campaignId);
  const upload = await ctx.db.get(id);
  if (
    !upload ||
    upload.campaignSlug !== campaignId ||
    upload.nonprofitId !== participant.campaign.nonprofitId ||
    upload.subject !== participant.subject
  )
    forbidden();
  return { ...participant, upload: upload! };
}
async function reader(ctx: QueryCtx, campaignId: string) {
  try {
    return { ...(await authorizedCampaign(ctx, campaignId)), manager: true };
  } catch {
    return {
      ...(await acceptedCreator(ctx, campaignId)),
      manager: false,
    };
  }
}
async function visibleEntry(
  ctx: QueryCtx,
  campaignId: string,
  id: Doc<"photoEntries">["_id"],
) {
  const viewer = await reader(ctx, campaignId);
  const entry = await ctx.db.get(id);
  if (
    !entry ||
    entry.campaignSlug !== campaignId ||
    entry.nonprofitId !== viewer.campaign.nonprofitId ||
    (!viewer.manager && entry.subject !== viewer.subject)
  )
    forbidden();
  return { ...viewer, entry: entry! };
}
export const reserve = mutation({
  args: {
    ...scope,
    operationId: v.string(),
    filename: v.string(),
    size: v.number(),
    type: format,
  },
  handler: async (ctx, args) => {
    const { campaign, subject, acceptance } =
      await requireSubmissionParticipant(ctx, args.campaignId);
    operationIdentity(args.operationId);
    photoLimits([args.size]);
    if (!args.filename.trim() || args.filename.length > 255)
      throw new Error("FILENAME: Use a filename up to 255 characters");
    const fingerprint = stableRequest(args);
    const prior = await ctx.db
      .query("photoUploads")
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
    const id = await ctx.db.insert("photoUploads", {
      campaignSlug: args.campaignId,
      nonprofitId: campaign.nonprofitId,
      subject,
      acceptanceId: acceptance._id,
      operationId: args.operationId,
      fingerprint,
      filename: args.filename,
      declaredSize: args.size,
      type: args.type,
      pathname: "",
      expiresAt: Date.now() + 10 * 60_000,
      createdAt: Date.now(),
    });
    await ctx.db.patch(id, {
      pathname: `photos/${id}.${args.type === "image/png" ? "png" : "jpg"}`,
    });
    return (await ctx.db.get(id))!;
  },
});
export const uploadAccess = query({
  args: { ...scope, uploadId: photoId },
  handler: async (ctx, { campaignId, uploadId }) => {
    const { upload, campaign } = await ownedUpload(ctx, campaignId, uploadId);
    if (!upload.sha256 && upload.expiresAt < Date.now())
      throw new Error("UPLOAD_EXPIRED: Select the file again");
    return { ...upload, fixtureRunId: campaign.fixtureRunId ?? null };
  },
});
export const verify = mutation({
  args: { ...scope, receipt: receiptValidator, signature: v.string() },
  handler: async (ctx, { campaignId, receipt, signature }) => {
    const { upload, subject } = await ownedUpload(
      ctx,
      campaignId,
      receipt.uploadId,
    );
    const secret = process.env.PHOTO_RECEIPT_SECRET;
    if (!secret || secret.length < 32)
      throw new Error(
        "PHOTO_STORAGE_UNAVAILABLE: Verification is not configured",
      );
    const expected = bytesToHex(
      hmac(
        sha256,
        new TextEncoder().encode(secret),
        new TextEncoder().encode(stableRequest(receipt)),
      ),
    );
    // Compare every character rather than returning on the first differing byte.
    let difference = signature.length ^ expected.length;
    for (let i = 0; i < expected.length; i++)
      difference |= expected.charCodeAt(i) ^ (signature.charCodeAt(i) || 0);
    if (
      difference ||
      receipt.subject !== subject ||
      receipt.pathname !== upload.pathname ||
      receipt.type !== upload.type ||
      receipt.size !== upload.declaredSize ||
      !/^[a-f0-9]{64}$/.test(receipt.sha256)
    )
      forbidden();
    photoLimits([receipt.size]);
    if (upload.sha256) {
      if (upload.sha256 !== receipt.sha256)
        throw new Error("OPERATION_CONFLICT");
      return upload;
    }
    if (
      receipt.verifiedAt > Date.now() + 1000 ||
      receipt.verifiedAt < Date.now() - 300_000 ||
      upload.expiresAt < Date.now()
    )
      throw new Error("UPLOAD_EXPIRED: Select the file again");
    await ctx.db.patch(upload._id, {
      sha256: receipt.sha256,
      size: receipt.size,
      verifiedAt: receipt.verifiedAt,
      source: "photos:verified-private-bytes",
    });
    return (await ctx.db.get(upload._id))!;
  },
});
export const submit = mutation({
  args: {
    ...scope,
    operationId: v.string(),
    entryId: v.optional(entryId),
    expectedVersion: v.optional(v.number()),
    title: v.string(),
    description: v.string(),
    photos: v.array(photoId),
  },
  handler: async (ctx, args) => {
    const { campaign, subject, acceptance } =
      await requireSubmissionParticipant(ctx, args.campaignId);
    operationIdentity(args.operationId);
    text(args.title, args.description);
    const fingerprint = stableRequest(args);
    const prior = await ctx.db
      .query("photoEvents")
      .withIndex("by_operation", (q) =>
        q
          .eq("campaignSlug", args.campaignId)
          .eq("actor", subject)
          .eq("operationId", args.operationId),
      )
      .unique();
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new Error("OPERATION_CONFLICT");
      return (await ctx.db.get(prior.entryId))!;
    }
    photoLimits(args.photos.map(() => 1));
    if (new Set(args.photos).size !== args.photos.length)
      throw new Error("PHOTO_DUPLICATE: Choose distinct uploaded photos");
    const uploads = await Promise.all(args.photos.map((id) => ctx.db.get(id)));
    for (const upload of uploads)
      if (
        !upload ||
        upload.subject !== subject ||
        upload.campaignSlug !== args.campaignId ||
        upload.nonprofitId !== campaign.nonprofitId ||
        upload.acceptanceId !== acceptance._id ||
        !upload.sha256 ||
        !upload.size
      )
        forbidden();
    photoLimits(uploads.map((u) => u!.size!));
    let entry = args.entryId ? await ctx.db.get(args.entryId) : null;
    if (
      args.entryId &&
      (!entry ||
        entry.subject !== subject ||
        entry.campaignSlug !== args.campaignId ||
        entry.nonprofitId !== campaign.nonprofitId)
    )
      forbidden();
    if (entry && entry.version !== args.expectedVersion)
      throw new Error(
        "STALE_VERSION: Reopen the current submission before editing",
      );
    const current = entry
      ? await ctx.db
          .query("photoVersions")
          .withIndex("by_entry_version", (q) =>
            q.eq("entryId", entry!._id).eq("version", entry!.version),
          )
          .unique()
      : null;
    const previousUploads = current
      ? await Promise.all(current.photos.map((id) => ctx.db.get(id)))
      : [];
    const contentIdentity = (items: (Doc<"photoUploads"> | null)[]) =>
      items.map((u) => [u?.sha256, u?.type, u?.size]);
    const changedMedia =
      !current ||
      JSON.stringify(contentIdentity(previousUploads)) !==
        JSON.stringify(contentIdentity(uploads));
    const replacementOf =
      entry && entry.firstApprovedAt && changedMedia ? entry._id : undefined;
    if (replacementOf) entry = null;
    const at = Date.now();
    const nextVersion = (entry?.version ?? 0) + 1;
    const status = "pending" as const;
    const id =
      entry?._id ??
      (await ctx.db.insert("photoEntries", {
        campaignSlug: args.campaignId,
        nonprofitId: campaign.nonprofitId,
        subject,
        acceptanceId: acceptance._id,
        version: nextVersion,
        status,
        createdAt: at,
        ...(replacementOf ? { replacementOf } : {}),
      }));
    if (entry) await ctx.db.patch(id, { version: nextVersion, status });
    await ctx.db.insert("photoVersions", {
      entryId: id,
      version: nextVersion,
      title: args.title,
      description: args.description,
      photos: args.photos,
      acceptanceId: acceptance._id,
      actor: subject,
      source: "photos:submit",
      at,
      mediaChanged: changedMedia,
    });
    await ctx.db.insert("photoEvents", {
      campaignSlug: args.campaignId,
      nonprofitId: campaign.nonprofitId,
      entryId: id,
      version: nextVersion,
      actor: subject,
      source: "photos:submit",
      at,
      action: changedMedia ? "submitted" : "description-edited",
      operationId: args.operationId,
      fingerprint,
    });
    return (await ctx.db.get(id))!;
  },
});
export const review = mutation({
  args: {
    ...scope,
    entryId,
    expectedVersion: v.number(),
    operationId: v.string(),
    decision: v.union(
      v.literal("approved"),
      v.literal("revisions"),
      v.literal("rejected"),
    ),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { campaign, subject } = await authorizedCampaign(
      ctx,
      args.campaignId,
    );
    operationIdentity(args.operationId);
    const entry = await ctx.db.get(args.entryId);
    if (
      !entry ||
      entry.campaignSlug !== args.campaignId ||
      entry.nonprofitId !== campaign.nonprofitId
    )
      forbidden();
    const fingerprint = stableRequest(args);
    const prior = await ctx.db
      .query("photoEvents")
      .withIndex("by_operation", (q) =>
        q
          .eq("campaignSlug", args.campaignId)
          .eq("actor", subject)
          .eq("operationId", args.operationId),
      )
      .unique();
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new Error("OPERATION_CONFLICT");
      return (await ctx.db.get(args.entryId))!;
    }
    if (entry!.version !== args.expectedVersion)
      throw new Error("STALE_VERSION: Review the latest submitted version");
    if (args.decision !== "approved" && !args.reason.trim())
      throw new Error("REASON_REQUIRED: Tell the creator what needs to change");
    if (args.reason.length > 5000)
      throw new Error("REASON_SIZE: Use up to 5000 characters");
    if (entry!.status === "approved")
      throw new Error("ALREADY_APPROVED: This creative is already approved");
    const at = Date.now();
    await ctx.db.patch(args.entryId, {
      status: args.decision,
      ...(args.decision === "approved" && !entry!.firstApprovedAt
        ? { firstApprovedAt: at }
        : {}),
    });
    await ctx.db.insert("photoEvents", {
      campaignSlug: args.campaignId,
      nonprofitId: campaign.nonprofitId,
      entryId: args.entryId,
      version: entry!.version,
      actor: subject,
      source: "photos:review",
      at,
      action: args.decision,
      reason: args.reason.trim(),
      operationId: args.operationId,
      fingerprint,
    });
    return (await ctx.db.get(args.entryId))!;
  },
});
async function detail(ctx: QueryCtx, entry: Doc<"photoEntries">) {
  const versions = await ctx.db
    .query("photoVersions")
    .withIndex("by_entry_version", (q) => q.eq("entryId", entry._id))
    .collect();
  const events = await ctx.db
    .query("photoEvents")
    .withIndex("by_entry", (q) => q.eq("entryId", entry._id))
    .collect();
  return { ...entry, trackedPath: `/fundraise/${entry._id}`, versions, events };
}
export const workspace = query({
  args: scope,
  handler: async (ctx, { campaignId }) => {
    const viewer = await reader(ctx, campaignId);
    const entries = await ctx.db
      .query("photoEntries")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
      .collect();
    return await Promise.all(
      entries
        .filter(
          (e) =>
            e.nonprofitId === viewer.campaign.nonprofitId &&
            (viewer.manager || e.subject === viewer.subject),
        )
        .map((e) => detail(ctx, e)),
    );
  },
});
export const entry = query({
  args: { ...scope, entryId },
  handler: async (ctx, { campaignId, entryId }) =>
    detail(ctx, (await visibleEntry(ctx, campaignId, entryId)).entry),
});
export const resource = query({
  args: { ...scope, uploadId: photoId },
  handler: async (ctx, { campaignId, uploadId }) => {
    const viewer = await reader(ctx, campaignId);
    const upload = await ctx.db.get(uploadId);
    if (
      !upload ||
      upload.campaignSlug !== campaignId ||
      upload.nonprofitId !== viewer.campaign.nonprofitId ||
      (!viewer.manager && upload.subject !== viewer.subject) ||
      !upload.sha256
    )
      forbidden();
    return { ...upload!, fixtureRunId: viewer.campaign.fixtureRunId ?? null };
  },
});
export const publicEntry = query({
  args: { entryId },
  handler: async (ctx, { entryId }) => {
    const entry = await ctx.db.get(entryId);
    if (
      !entry ||
      entry.campaignSlug !== "adoption" ||
      entry.status !== "approved"
    )
      forbidden();
    const version = await ctx.db
      .query("photoVersions")
      .withIndex("by_entry_version", (q) =>
        q.eq("entryId", entryId).eq("version", entry!.version),
      )
      .unique();
    return {
      id: entry!._id,
      title: version!.title,
      description: version!.description,
      photos: version!.photos,
      trackedPath: `/fundraise/${entryId}`,
    };
  },
});

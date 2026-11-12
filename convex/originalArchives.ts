import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import {
  authorizedCampaign,
  operationIdentity,
  stableRequest,
} from "./access.ts";
import {
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
  type Doc,
} from "./functions.ts";
import { fresh, proof, videoReader } from "./videos.ts";

export const RECOVERY_MS = 30 * 24 * 60 * 60 * 1000;
const scope = { campaignId: v.string(), uploadId: v.id("videoUploads") };
type Upload = Doc<"videoUploads">;
export {
  archiveState,
  requireUsableOriginal,
} from "./originalArchivePolicy.ts";
import {
  archiveNow,
  archiveState,
  currentUse,
} from "./originalArchivePolicy.ts";
async function administrator(
  ctx: QueryCtx,
  campaignId: string,
  uploadId: Upload["_id"],
) {
  const viewer = await authorizedCampaign(ctx, campaignId);
  if (!viewer.isAdministrator)
    throw new Error("FORBIDDEN: Administrator confirmation required");
  const upload = await ctx.db.get(uploadId);
  if (
    !upload ||
    upload.campaignSlug !== campaignId ||
    upload.nonprofitId !== viewer.campaign.nonprofitId
  )
    throw new Error("FORBIDDEN: Original archive access denied");
  if (!upload.sha256 || !upload.size)
    throw new Error("VIDEO_UNVERIFIED: Verify original bytes first");
  return { ...viewer, upload };
}
async function event(
  ctx: MutationCtx,
  upload: Upload,
  generation: number,
  actor: string,
  action: string,
  operationId: string,
  fingerprint: string,
  confirmation?: string,
) {
  const { revisions } = await currentUse(ctx, upload);
  await ctx.db.insert("originalArchiveEvents", {
    uploadId: upload._id,
    campaignSlug: upload.campaignSlug,
    nonprofitId: upload.nonprofitId,
    actor,
    source: "originalArchives:" + action,
    at: Date.now(),
    generation,
    action,
    operationId,
    fingerprint,
    sha256: upload.sha256!,
    size: upload.size!,
    revisions,
    ...(confirmation ? { confirmation } : {}),
  });
}
const job = makeFunctionReference<"action">("archiveJobs:purge");
export const change = mutation({
  args: {
    ...scope,
    expectedGeneration: v.number(),
    operationId: v.string(),
    action: v.union(
      v.literal("request"),
      v.literal("restore"),
      v.literal("reconfirm"),
    ),
    confirmation: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { upload, subject } = await administrator(
      ctx,
      args.campaignId,
      args.uploadId,
    );
    operationIdentity(args.operationId);
    const fingerprint = stableRequest(args);
    const prior = await ctx.db
      .query("originalArchiveEvents")
      .withIndex("by_operation", (q) =>
        q
          .eq("campaignSlug", args.campaignId)
          .eq("actor", subject)
          .eq("operationId", args.operationId),
      )
      .unique();
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new Error("OPERATION_CONFLICT: Changed archive request");
      const current = await archiveState(ctx, upload._id);
      if (
        current?.generation !== prior.generation ||
        (args.action === "request" && current.state === "restored")
      )
        throw new Error(
          "STALE_VERSION: The archive has changed since this operation",
        );
      return;
    }
    const archive = await archiveState(ctx, upload._id);
    if ((archive?.generation ?? 0) !== args.expectedGeneration)
      throw new Error("STALE_VERSION: Refresh the archive state");
    const at = await archiveNow(ctx, upload);
    if (args.action === "restore") {
      if (
        !archive ||
        !["pending", "blocked"].includes(archive.state) ||
        archive.dispatchAt !== undefined ||
        at >= archive.purgeAt
      )
        throw new Error(
          "VIDEO_RECOVERY_CLOSED: Restore cannot be confirmed after the window or delete dispatch",
        );
      await ctx.db.patch(archive._id, {
        state: "restored",
        message: undefined,
      });
      await event(
        ctx,
        upload,
        archive.generation,
        subject,
        "restored",
        args.operationId,
        fingerprint,
      );
      return;
    }
    if (args.confirmation !== "DELETE ORIGINAL")
      throw new Error(
        "VIDEO_CONFIRMATION_REQUIRED: Type DELETE ORIGINAL to confirm",
      );
    const use = await currentUse(ctx, upload);
    if (use.reasons.length)
      throw new Error(
        "VIDEO_IN_USE: Original is active, publishing or has unresolved use",
      );
    if (args.action === "reconfirm") {
      if (
        !archive ||
        !["pending", "blocked"].includes(archive.state) ||
        archive.dispatchAt !== undefined
      )
        throw new Error(
          "VIDEO_RECOVERY_CLOSED: Dispatched deletion cannot be reauthorized",
        );
      await ctx.db.patch(archive._id, {
        requestedBy: subject,
        state: "pending",
        message: undefined,
      });
      await event(
        ctx,
        upload,
        archive.generation,
        subject,
        "reconfirmed",
        args.operationId,
        fingerprint,
        args.confirmation,
      );
      await ctx.scheduler.runAt(Math.max(Date.now(), archive.purgeAt), job, {
        uploadId: upload._id,
        generation: archive.generation,
      });
      return;
    }
    // A different request ID must never extend an existing recovery deadline.
    if (archive && archive.state !== "restored")
      throw new Error(
        "VIDEO_ALREADY_REQUESTED: Existing deletion deadline is unchanged",
      );
    const generation = (archive?.generation ?? 0) + 1;
    const values = {
      uploadId: upload._id,
      campaignSlug: upload.campaignSlug,
      nonprofitId: upload.nonprofitId,
      sha256: upload.sha256!,
      size: upload.size!,
      generation,
      state: "pending",
      requestedAt: at,
      requestedBy: subject,
      purgeAt: at + RECOVERY_MS,
      nonce: crypto.randomUUID(),
      ...(upload.storageIdentity
        ? { storageIdentity: upload.storageIdentity }
        : {}),
    };
    if (archive) await ctx.db.replace(archive._id, values);
    else await ctx.db.insert("originalArchives", values);
    await event(
      ctx,
      upload,
      generation,
      subject,
      "requested",
      args.operationId,
      fingerprint,
      args.confirmation,
    );
    await ctx.scheduler.runAt(at + RECOVERY_MS, job, {
      uploadId: upload._id,
      generation,
    });
  },
});
export const status = query({
  args: scope,
  handler: async (ctx, args) => {
    const { record: upload, viewer } = await videoReader(
      ctx,
      args.campaignId,
      args.uploadId,
    );
    const archive = await archiveState(ctx, upload._id);
    const { reasons } = await currentUse(ctx, upload);
    return {
      isAdministrator:
        "isAdministrator" in viewer && viewer.isAdministrator === true,
      state: archive?.state ?? "retained",
      generation: archive?.generation ?? 0,
      requestedAt: archive?.requestedAt,
      purgeAt: archive?.purgeAt,
      confirmedAt: archive?.confirmedAt,
      message: archive?.message,
      reasons,
      purgeAvailable: !!process.env.VIDEO_ARCHIVE_WORKER_URL,
      history: (
        await ctx.db
          .query("originalArchiveEvents")
          .withIndex("by_upload", (q) => q.eq("uploadId", upload._id))
          .collect()
      ).map(
        ({
          actor,
          source,
          at,
          generation,
          action,
          confirmation,
          sha256,
          size,
          revisions,
        }) => ({
          actor,
          source,
          at,
          generation,
          action,
          confirmation,
          sha256,
          size,
          revisions,
        }),
      ),
    };
  },
});
export const retry = mutation({
  args: scope,
  handler: async (ctx, args) => {
    const { upload } = await administrator(ctx, args.campaignId, args.uploadId);
    const archive = await archiveState(ctx, upload._id);
    if (archive && archive.state !== "restored" && archive.state !== "deleted")
      await ctx.scheduler.runAfter(0, job, {
        uploadId: upload._id,
        generation: archive.generation,
      });
  },
});
export const workerContext = query({
  args: {
    purpose: v.literal("archive-worker-context"),
    uploadId: v.id("videoUploads"),
    generation: v.number(),
    at: v.number(),
    signature: v.string(),
  },
  handler: async (ctx, { signature, ...request }) => {
    proof(request, signature);
    fresh(request.at);
    const upload = await ctx.db.get(request.uploadId),
      archive = await archiveState(ctx, request.uploadId);
    if (
      !upload ||
      !archive ||
      archive.generation !== request.generation ||
      ["restored", "deleted"].includes(archive.state) ||
      (await archiveNow(ctx, upload)) < archive.purgeAt
    )
      return null;
    const campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_slug", (q) => q.eq("slug", upload.campaignSlug))
      .unique();
    return {
      pathname: upload.pathname,
      storageIdentity: upload.storageIdentity,
      sha256: upload.sha256,
      size: upload.size,
      fixtureRunId: campaign?.fixtureRunId ?? null,
      reconcile: archive.dispatchAt !== undefined,
    };
  },
});
// Signed service-only operations. No caller-controlled clock, resource path or outcome authority.
const receipt = v.object({
  purpose: v.literal("archive-worker"),
  uploadId: v.id("videoUploads"),
  generation: v.number(),
  at: v.number(),
  action: v.union(v.literal("claim"), v.literal("finish")),
  available: v.optional(v.boolean()),
  nonce: v.optional(v.string()),
  outcome: v.optional(
    v.union(v.literal("absent"), v.literal("unknown"), v.literal("failed")),
  ),
});
export const worker = mutation({
  args: { receipt, signature: v.string() },
  handler: async (ctx, { receipt: r, signature }) => {
    proof(r, signature);
    fresh(r.at);
    const upload = await ctx.db.get(r.uploadId);
    const archive = await archiveState(ctx, r.uploadId);
    if (
      !upload ||
      !archive ||
      archive.generation !== r.generation ||
      archive.sha256 !== upload.sha256 ||
      archive.size !== upload.size ||
      archive.storageIdentity !== upload.storageIdentity ||
      ["restored", "deleted"].includes(archive.state)
    )
      return null;
    const campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_slug", (q) => q.eq("slug", upload.campaignSlug))
      .unique();
    if (r.action === "finish") {
      if (
        r.nonce !== archive.nonce ||
        archive.dispatchAt === undefined ||
        !r.outcome
      )
        return null;
      const state = r.outcome === "absent" ? "deleted" : r.outcome;
      await ctx.db.patch(archive._id, {
        state,
        ...(state === "deleted" ? { confirmedAt: Date.now() } : {}),
        message:
          state === "deleted"
            ? undefined
            : "External deletion is unconfirmed. Original remains fenced; reconcile before any further action.",
      });
      await event(
        ctx,
        upload,
        archive.generation,
        "archive:storage-worker",
        state,
        crypto.randomUUID(),
        stableRequest(r),
      );
      return null;
    }
    if ((await archiveNow(ctx, upload)) < archive.purgeAt) return null;
    if (archive.dispatchAt !== undefined)
      return {
        pathname: upload.pathname,
        storageIdentity: upload.storageIdentity,
        sha256: upload.sha256,
        size: upload.size,
        nonce: archive.nonce,
        reconcile: true,
        fixtureRunId: campaign?.fixtureRunId ?? null,
      };
    const operator = await ctx.db
      .query("operators")
      .withIndex("by_subject", (q) => q.eq("subject", archive.requestedBy))
      .unique();
    const use = await currentUse(ctx, upload);
    if (!upload.storageIdentity)
      use.reasons.push("Original storage identity is unverified");
    if (!operator?.active)
      use.reasons.push("Confirming administrator is no longer active");
    if (use.reasons.length || !r.available) {
      await ctx.db.patch(archive._id, {
        state: "blocked",
        message: !upload.storageIdentity
          ? "Purge held: original storage identity needs evidence-backed verification. No physical deletion has been dispatched."
          : !operator?.active
            ? "Purge held: the confirming administrator is no longer active. A current administrator must reconfirm the unchanged deadline."
            : use.reasons.length
              ? "Purge blocked by active or unresolved use. No physical deletion has been dispatched."
              : "Purge held: storage preflight, media evidence or configuration is unconfirmed. No physical deletion has been dispatched. Retry after resolving the hold; the deadline is unchanged.",
      });
      await event(
        ctx,
        upload,
        archive.generation,
        "archive:storage-worker",
        "blocked",
        crypto.randomUUID(),
        stableRequest(r),
      );
      return null;
    }
    // This transaction serializes with restore and all use-starting writers.
    await ctx.db.patch(archive._id, {
      state: "dispatched",
      dispatchAt: Date.now(),
      message: "Deletion dispatched. Restoration cannot be promised.",
    });
    await event(
      ctx,
      upload,
      archive.generation,
      "archive:storage-worker",
      "dispatched",
      crypto.randomUUID(),
      stableRequest(r),
    );
    return {
      pathname: upload.pathname,
      storageIdentity: upload.storageIdentity,
      sha256: upload.sha256,
      size: upload.size,
      nonce: archive.nonce,
      reconcile: false,
      fixtureRunId: campaign?.fixtureRunId ?? null,
    };
  },
});

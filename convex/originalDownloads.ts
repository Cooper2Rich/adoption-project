import { v } from "convex/values";
import { operationIdentity, stableRequest } from "./access.ts";
import { mutation, query, type Doc, type QueryCtx } from "./functions.ts";
import { fresh, proof, videoReader } from "./videos.ts";

function denied(): never {
  throw new Error("FORBIDDEN: Private original download denied");
}
async function boundRevision(
  ctx: QueryCtx,
  upload: Doc<"videoUploads">,
  entryId: Doc<"photoEntries">["_id"],
  version: number,
) {
  const entry = await ctx.db.get(entryId);
  const revision = await ctx.db
    .query("photoVersions")
    .withIndex("by_entry_version", (q) =>
      q.eq("entryId", entryId).eq("version", version),
    )
    .unique();
  if (
    !entry ||
    entry.campaignSlug !== upload.campaignSlug ||
    entry.nonprofitId !== upload.nonprofitId ||
    entry.subject !== upload.subject ||
    revision?.video !== upload._id
  )
    denied();
}
export const issue = mutation({
  args: {
    campaignId: v.string(),
    entryId: v.optional(v.id("photoEntries")),
    version: v.optional(v.number()),
    uploadId: v.id("videoUploads"),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    // Always recheck current authority, including exact retries. Historical
    // archive access does not depend on the current intake agreement or dates.
    const { record, viewer } = await videoReader(
      ctx,
      args.campaignId,
      args.uploadId,
    );
    operationIdentity(args.operationId);
    if ((args.entryId === undefined) !== (args.version === undefined)) denied();
    if (args.entryId !== undefined && args.version !== undefined)
      await boundRevision(ctx, record, args.entryId, args.version);
    if (!record.sha256 || !record.size)
      throw new Error("VIDEO_UNVERIFIED: Original archive is not verified");
    const fingerprint = stableRequest(args);
    const prior = await ctx.db
      .query("originalDownloadGrants")
      .withIndex("by_operation", (q) =>
        q
          .eq("campaignSlug", args.campaignId)
          .eq("actor", viewer.subject)
          .eq("operationId", args.operationId),
      )
      .unique();
    if (prior && prior.fingerprint !== fingerprint)
      throw new Error("OPERATION_CONFLICT: Start a new download request");
    const at = Date.now();
    const grantId =
      prior?._id ??
      (await ctx.db.insert("originalDownloadGrants", {
        campaignSlug: record.campaignSlug,
        nonprofitId: record.nonprofitId,
        entryId: args.entryId,
        version: args.version,
        archiveVersion: 1,
        uploadId: record._id,
        sha256: record.sha256,
        size: record.size,
        actor: viewer.subject,
        source: "originalDownloads:issue",
        at,
        expiresAt: at + 300_000,
        operationId: args.operationId,
        fingerprint,
      }));
    return { grantId, expiresAt: prior?.expiresAt ?? at + 300_000 };
  },
});

export const delivery = query({
  args: {
    grantId: v.id("originalDownloadGrants"),
    at: v.number(),
    signature: v.string(),
  },
  handler: async (ctx, { signature, ...request }) => {
    proof({ purpose: "original-download-delivery", ...request }, signature);
    fresh(request.at);
    const grant = await ctx.db.get(request.grantId);
    if (!grant || grant.expiresAt <= Date.now()) denied();
    const record = await ctx.db.get(grant.uploadId);
    if (
      !record ||
      record.campaignSlug !== grant.campaignSlug ||
      record.nonprofitId !== grant.nonprofitId ||
      record.sha256 !== grant.sha256 ||
      record.size !== grant.size
    )
      denied();
    if (grant.entryId !== undefined && grant.version !== undefined)
      await boundRevision(ctx, record!, grant.entryId, grant.version);
    const campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_slug", (q) => q.eq("slug", grant.campaignSlug))
      .unique();
    // This issued bearer capability remains valid until expiry. A later role
    // change blocks issuance, not an already-issued URL or in-flight stream.
    // No playback/entry status, campaign dates or intake expiry can purge bytes.
    return {
      pathname: record!.pathname,
      filename: record!.filename,
      size: grant.size,
      sha256: grant.sha256,
      expiresAt: grant.expiresAt,
      fixtureRunId: campaign?.fixtureRunId ?? null,
    };
  },
});

export const history = query({
  args: { campaignId: v.string(), uploadId: v.id("videoUploads") },
  handler: async (ctx, args) => {
    await videoReader(ctx, args.campaignId, args.uploadId);
    return (
      await ctx.db
        .query("originalDownloadGrants")
        .withIndex("by_upload", (q) => q.eq("uploadId", args.uploadId))
        .collect()
    ).map(
      ({
        actor,
        source,
        at,
        version,
        archiveVersion,
        entryId,
        uploadId,
        sha256,
        size,
        expiresAt,
        operationId,
      }) => ({
        actor,
        source,
        at,
        version,
        archiveVersion,
        entryId,
        uploadId,
        sha256,
        size,
        expiresAt,
        operationId,
      }),
    );
  },
});

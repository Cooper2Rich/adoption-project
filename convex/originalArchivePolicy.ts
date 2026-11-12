import type { QueryCtx, Doc } from "./functions.ts";
type Upload = Doc<"videoUploads">;
// Bounded time injection is stored only by the internal, nondeployed fixture
// module. Production callers never supply now/deadline/action authority.
export async function archiveNow(ctx: QueryCtx, upload: Upload) {
  const campaign = await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", upload.campaignSlug))
    .unique();
  if (
    campaign?.fixtureRunId &&
    campaign.fixtureRunId === process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID &&
    campaign.fixtureArchiveNow !== undefined
  )
    return campaign.fixtureArchiveNow;
  return Date.now();
}
export async function archiveState(ctx: QueryCtx, uploadId: Upload["_id"]) {
  return ctx.db
    .query("originalArchives")
    .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
    .unique();
}
// Every writer that starts/resumes use of archived bytes must read this fence
// in the same transaction as that write (including future paid-placement APIs).
export async function requireUsableOriginal(
  ctx: QueryCtx,
  uploadId: Upload["_id"],
) {
  const archive = await archiveState(ctx, uploadId);
  if (archive && archive.state !== "restored")
    throw new Error(
      "VIDEO_ARCHIVE_FENCED: Restore the original before using it; deletion may already be irreversible",
    );
  const revisions = await ctx.db
    .query("photoVersions")
    .withIndex("by_video", (q) => q.eq("video", uploadId))
    .collect();
  for (const revision of revisions)
    await requireEntryOriginalsAvailable(ctx, revision.entryId);
}
export async function requireEntryOriginalsAvailable(
  ctx: QueryCtx,
  entryId: Doc<"photoEntries">["_id"],
) {
  const revisions = await ctx.db
    .query("photoVersions")
    .withIndex("by_entry_version", (q) => q.eq("entryId", entryId))
    .collect();
  for (const revision of revisions)
    if (revision.video) {
      const archive = await archiveState(ctx, revision.video);
      if (archive && !["restored", "deleted"].includes(archive.state))
        throw new Error(
          "VIDEO_ARCHIVE_FENCED: Resolve this entry's historical original deletion before starting use",
        );
    }
}
export async function currentUse(ctx: QueryCtx, upload: Upload) {
  const reasons: string[] = [];
  if (
    ["dispatched", "unknown", "processing", "uploading"].includes(
      upload.state,
    ) ||
    (upload.sourceExpiresAt !== undefined &&
      upload.sourceExpiresAt > Date.now())
  )
    reasons.push("Live or uncertain source ingestion");
  if (
    ![
      "verified",
      "ready",
      "failed",
      "deleted",
      "invalid",
      "dispatched",
      "unknown",
      "processing",
      "uploading",
    ].includes(upload.state)
  )
    reasons.push("Unknown processing state");
  const revisions = await ctx.db
    .query("photoVersions")
    .withIndex("by_video", (q) => q.eq("video", upload._id))
    .collect();
  for (const revision of revisions) {
    const entry = await ctx.db.get(revision.entryId);
    if (
      !entry ||
      entry.campaignSlug !== upload.campaignSlug ||
      entry.nonprofitId !== upload.nonprofitId ||
      entry.subject !== upload.subject
    )
      reasons.push("Unresolved entry identity");
    else {
      if (entry.status === "approved")
        reasons.push("Approved entry including historical originals");
      const current = await ctx.db
        .query("photoVersions")
        .withIndex("by_entry_version", (q) =>
          q.eq("entryId", entry._id).eq("version", entry.version),
        )
        .unique();
      if (!current) reasons.push("Unresolved current entry revision");
      else if (current.video && current.video !== upload._id) {
        const source = await ctx.db.get(current.video);
        if (
          !source ||
          !["verified", "ready", "failed", "deleted", "invalid"].includes(
            source.state,
          ) ||
          (source.sourceExpiresAt !== undefined &&
            source.sourceExpiresAt > Date.now())
        )
          reasons.push("Entry publishing through another revision");
      }
    }
  }
  const campaign = await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", upload.campaignSlug))
    .unique();
  // Existing reservation primitives are campaign-level synthetic commitments;
  // unknown/unmapped entry IDs cannot establish that this original is inactive.
  const reservations = await ctx.db
    .query("reservations")
    .withIndex("by_operation", (q) => q.eq("campaignSlug", upload.campaignSlug))
    .collect();
  const candidates = (
    await ctx.db
      .query("reservationCandidates")
      .withIndex("by_entry", (q) => q.eq("campaignSlug", upload.campaignSlug))
      .collect()
  ).filter((r) => r.campaignSlug === upload.campaignSlug && r.authorized);
  const linked = new Set(revisions.map((r) => String(r.entryId)));
  for (const item of [...reservations, ...candidates]) {
    const entryId = ctx.db.normalizeId("photoEntries", item.entryId);
    const entry = entryId ? await ctx.db.get(entryId) : null;
    if (
      !entry ||
      linked.has(item.entryId) ||
      entry.campaignSlug !== upload.campaignSlug ||
      entry.nonprofitId !== upload.nonprofitId
    ) {
      reasons.push("Existing or unattributed advertising commitment");
      continue;
    }
    const current = await ctx.db
      .query("photoVersions")
      .withIndex("by_entry_version", (q) =>
        q.eq("entryId", entry._id).eq("version", entry.version),
      )
      .unique();
    if (!current) reasons.push("Unresolved committed entry revision");
  }
  if (
    !campaign ||
    campaign.reservedSlots !== reservations.length ||
    campaign.reservedCents !==
      reservations.reduce((total, item) => total + item.amountCents, 0) ||
    campaign.authority.dailyCommittedCents > 0 ||
    campaign.authority.campaignCommittedCents > 0
  )
    reasons.push("Unresolved campaign commitments");
  return {
    reasons: [...new Set(reasons)],
    revisions: revisions.map((r) => ({
      entryId: r.entryId,
      version: r.version,
    })),
  };
}

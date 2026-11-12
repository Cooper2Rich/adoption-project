import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { v } from "convex/values";
import { stableRequest } from "./access.ts";
import { query, type QueryCtx, type Doc } from "./functions.ts";

export async function publicCampaign(ctx: QueryCtx) {
  const campaign = await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", "adoption"))
    .unique();
  if (
    !campaign ||
    (campaign.fixtureRunId &&
      campaign.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID)
  )
    return null;
  return campaign;
}
export async function approvedEntry(
  ctx: QueryCtx,
  id: Doc<"photoEntries">["_id"],
) {
  const campaign = await publicCampaign(ctx);
  const entry = await ctx.db.get(id);
  if (
    !campaign ||
    !entry ||
    entry.campaignSlug !== campaign.slug ||
    entry.nonprofitId !== campaign.nonprofitId ||
    entry.status !== "approved"
  )
    return null;
  const version = await ctx.db
    .query("photoVersions")
    .withIndex("by_entry_version", (q) =>
      q.eq("entryId", id).eq("version", entry.version),
    )
    .unique();
  if (!version) return null;
  return { campaign, entry, version };
}
export const trackedPath = (id: string) => `/fundraise/${id}`;
// Stable, opaque attribution for an unnamed campaign participant. The digest
// binds the campaign's persistent identity and the creator's Clerk subject,
// never an email or a terms acceptance that can change on re-invitation.
export function unnamedCreator(
  campaignIdentity: string,
  creatorIdentity: string,
) {
  return `Campaign creator ${bytesToHex(hmac(sha256, new TextEncoder().encode(campaignIdentity), new TextEncoder().encode(creatorIdentity))).slice(0, 16)}`;
}
export async function projection(
  ctx: QueryCtx,
  id: Doc<"photoEntries">["_id"],
) {
  const record = await approvedEntry(ctx, id);
  if (!record) return null;
  const { campaign, entry, version } = record;
  return {
    id: entry._id,
    version: version.version,
    title: version.title,
    description: version.description,
    creator:
      version.publicCreatorName || unnamedCreator(campaign._id, entry.subject),
    photoCount: version.photos.length,
    video: !!version.video,
    trackedPath: trackedPath(id),
  };
}
export const campaign = query({
  args: {},
  handler: async (ctx) => {
    const campaign = await publicCampaign(ctx);
    if (!campaign) return null;
    const entries = await ctx.db
      .query("photoEntries")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .collect();
    const approved = await Promise.all(
      entries
        .filter(
          (e) =>
            e.status === "approved" && e.nonprofitId === campaign.nonprofitId,
        )
        .map((e) => projection(ctx, e._id)),
    );
    return {
      slug: campaign.slug,
      name: campaign.name,
      entries: approved.filter((e) => e !== null),
    };
  },
});
export const entry = query({
  args: { entryId: v.id("photoEntries") },
  handler: async (ctx, args) => projection(ctx, args.entryId),
});
// The donation integration consumes this origin, regardless of placement or share
// parameters. This never creates a competition entry or claims a donation.
export const fundraising = query({
  args: { entryId: v.id("photoEntries") },
  handler: async (ctx, args) => {
    const entry = await projection(ctx, args.entryId);
    return entry
      ? {
          campaignSlug: "adoption",
          originEntryId: entry.id,
          trackedPath: entry.trackedPath,
          entry,
          checkout: "unavailable" as const,
        }
      : null;
  },
});
// Only the media server can obtain private storage coordinates. A guest cannot
// turn an approved entry into a general upload/original lookup.
export const mediaAccess = query({
  args: {
    entryId: v.id("photoEntries"),
    kind: v.union(v.literal("photo"), v.literal("video")),
    index: v.number(),
    at: v.number(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const { signature, ...value } = args;
    const secret =
      process.env[
        args.kind === "photo" ? "PHOTO_RECEIPT_SECRET" : "VIDEO_RECEIPT_SECRET"
      ];
    if (!secret || secret.length < 32)
      throw new Error("FORBIDDEN: Public media unavailable");
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
    if (difference || Math.abs(Date.now() - args.at) > 30_000)
      throw new Error("FORBIDDEN: Public media unavailable");
    const record = await approvedEntry(ctx, args.entryId);
    if (!record || !Number.isInteger(args.index) || args.index < 0)
      throw new Error("FORBIDDEN: Public media unavailable");
    const id =
      args.kind === "video"
        ? args.index === 0
          ? record.version.video
          : undefined
        : record.version.photos[args.index];
    const upload = id ? await ctx.db.get(id) : null;
    if (
      !upload ||
      !upload.sha256 ||
      upload.subject !== record.entry.subject ||
      upload.nonprofitId !== record.campaign.nonprofitId ||
      upload.campaignSlug !== record.campaign.slug
    )
      throw new Error("FORBIDDEN: Public media unavailable");
    return {
      ...upload,
      publicVersion: record.version.version,
      fixtureRunId: record.campaign.fixtureRunId ?? null,
    };
  },
});

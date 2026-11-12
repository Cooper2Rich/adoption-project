import type { DemoState } from "../../server/demo-types.ts";
import { addActivity } from "../../server/domain.ts";
import { refreshEligibility, snapshotPost } from "../../server/eligibility.ts";
import { allocateAdFund } from "./ad-fund-policy.ts";
import { adoptionAds } from "./adoption-ads.ts";
import { adoptionCreatorId } from "./adoption-showcase.ts";

// Explicitly requested illustrative performance, separate from saved giving.
export const adoptionSampleMetrics = Object.freeze({
  impressions: 40000,
  clicks: 1600,
  donatedCents: 200000,
});

export function ensureAdoptionDemoData(state: DemoState) {
  if (state.adoptionDemoDataVersion === 1) return;
  const ad = adoptionAds[0];
  const post = state.posts.find((p: any) => p.id === ad.id);
  const project = state.projects.find((p: any) => p.id === post?.projectId);
  if (!post || !project || !state.sampleFinancials) return;
  let creator =
    state.creators.find((c: any) => c.name.trim().toLowerCase() === "yakira") ||
    state.creators.find((c: any) => c.id === adoptionCreatorId);
  if (!creator) {
    creator = { id: adoptionCreatorId, name: "Yakira" };
    state.creators.push(creator);
  }
  creator.name = "Yakira";
  if (post.creator !== creator.name || post.creatorId !== creator.id) {
    post.creator = creator.name;
    post.creatorId = creator.id;
    post.revision += 1;
    post.updatedAt = new Date().toISOString();
    const media = adoptionAds.find((entry: any) => entry.media === post.media);
    const evidence = media
      ? {
          verified: true,
          bytes: media.bytes,
          digest: media.digest,
          source: "bundled-user-import-sha256",
        }
      : post.snapshots?.find((s: any) => s.id === post.snapshotId)
          ?.mediaEvidence;
    snapshotPost(post, evidence);
    post.history.push({
      id: crypto.randomUUID(),
      action: "creator-credit-updated",
      actor: "Admin",
      note: "Creator credited as Yakira at the user's request.",
      at: post.updatedAt,
    });
  }
  if (
    [
      "The supplied 60-second adoption awareness film for the ACU ad competition. Individual creator credits have not yet been supplied.",
      "Two supplied 60-second adoption awareness films for the ACU ad competition. Individual creator credits have not yet been supplied.",
    ].includes(project.brief)
  )
    project.brief =
      "The supplied 60-second adoption awareness film by Yakira for the ACU ad competition.";
  const id = "sample-finance-v1-adoption-girl-in-the-middle";
  if (
    !state.sampleFinancials.contributions.some(
      (record: any) => record.id === id,
    )
  )
    state.sampleFinancials.contributions.push({
      id,
      viewerId: "fictional-sample-support",
      adId: post.id,
      title: post.title,
      projectId: project.id,
      campaignId: project.campaignId,
      creatorId: creator.id,
      amountCents: adoptionSampleMetrics.donatedCents,
      allocation: allocateAdFund(adoptionSampleMetrics.donatedCents),
      at: "2026-10-24T12:00:00.000Z",
    });
  refreshEligibility(state);
  state.adoptionDemoDataVersion = 1;
  addActivity(
    state,
    "project",
    "Added sample performance for The Girl in the Middle",
    "Creator: Yakira. Illustrative impressions, clicks, funding and earnings; no real money or transfers.",
    project.id,
  );
}

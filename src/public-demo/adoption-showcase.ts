import type { DemoState } from "../../server/demo-types.ts";
import { addActivity } from "../../server/domain.ts";
import {
  configurePolicy,
  refreshEligibility,
  snapshotPost,
} from "../../server/eligibility.ts";
import { adoptionAds } from "./adoption-ads.ts";

export const adoptionCampaignId = "adoption-is";
export const adoptionProjectId = "acu-ad-competition";
export const adoptionCreatorId = "acu-creator-credit-pending";

const projectDescription =
  "The Girl in the Middle, a full-length adoption awareness video ad.";
const projectBrief =
  "The supplied 60-second adoption awareness film for the ACU ad competition. Individual creator credits have not yet been supplied.";

function removeDuality(state: DemoState) {
  if (state.adoptionDualityRemovalVersion === 1) return;
  const removed = state.posts.filter(
    (post: any) => post.id === "adoption-duality",
  );
  if (removed.length) {
    state.removedDemoAds ||= [];
    for (const post of removed)
      if (!state.removedDemoAds.some((saved: any) => saved.id === post.id))
        state.removedDemoAds.push(post);
    state.posts = state.posts.filter(
      (post: any) => post.id !== "adoption-duality",
    );
    addActivity(
      state,
      "project",
      "Removed Duality",
      "Removed the ad from ACU ad competition. Saved funding and historical records were retained.",
      adoptionProjectId,
    );
  }
  const project = state.projects.find((p: any) => p.id === adoptionProjectId);
  if (
    project?.description ===
    "The Girl in the Middle and Duality, presented as two separate full-length video ads."
  )
    project.description = projectDescription;
  if (
    project?.brief ===
    "Two supplied 60-second adoption awareness films for the ACU ad competition. Individual creator credits have not yet been supplied."
  )
    project.brief = projectBrief;
  state.adoptionDualityRemovalVersion = 1;
}

// This explicit user-requested demo import adds presentation records only.
// Existing edits, archives, funding, requests and creator history stay intact.
export function addAdoptionShowcase(state: DemoState) {
  if (state.adoptionShowcaseVersion === 1) {
    removeDuality(state);
    return;
  }
  let owner = state.nonprofits.find(
    (n: any) => n.name === "Adoption Is An Option",
  );
  if (!owner) {
    owner = { id: "adoption-is-owner", name: "Adoption Is An Option" };
    state.nonprofits.push(owner);
  }
  if (!state.creators.some((c: any) => c.id === adoptionCreatorId))
    state.creators.push({
      id: adoptionCreatorId,
      name: "ACU entries · creator credit pending",
    });
  if (!state.managedCampaigns.some((c: any) => c.id === adoptionCampaignId))
    state.managedCampaigns.unshift({
      id: adoptionCampaignId,
      name: "Adoption Is",
      description: "Adoption awareness films for the ACU ad competition.",
      ownerOrganizationId: owner.id,
      ownerName: owner.name,
      status: "active",
      pricingStatus: "pending",
      createdAt: new Date().toISOString(),
    });
  let project = state.projects.find((p: any) => p.id === adoptionProjectId);
  if (!project) {
    project = {
      id: adoptionProjectId,
      campaignId: adoptionCampaignId,
      name: "ACU ad competition",
      nonprofit: owner.name,
      nonprofitId: owner.id,
      ownerOrganizationId: owner.id,
      beneficiaryOrganizationId: owner.id,
      category: "Adoption",
      description: projectDescription,
      brief: projectBrief,
      cover: "forest",
      coverMedia: adoptionAds[0].poster,
      color: "blue",
      status: "active",
      startDate: "2026-01-01",
      endDate: "2030-12-31",
      instagram: "",
      createdAt: new Date().toISOString(),
    };
    configurePolicy(project);
    state.projects.push(project);
  }
  const policy = project.eligibilityPolicy;
  for (const ad of adoptionAds) {
    if (state.posts.some((p: any) => p.id === ad.id)) continue;
    const now = new Date().toISOString();
    const post = {
      id: ad.id,
      projectId: project.id,
      title: ad.title,
      creator: "ACU entries · creator credit pending",
      creatorId: adoptionCreatorId,
      caption: ad.caption,
      format: "reel",
      media: ad.media,
      mediaType: "video",
      rights: true,
      channel: "instagram",
      destination: policy.destinations[0],
      disclosures: {
        compensation: policy.compensationDisclosure,
        beneficiary: policy.beneficiaryDisclosure,
      },
      factualClaims: [] as any[],
      acceptedTermsVersion: policy.termsVersion,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      feedback: "",
      history: [
        {
          id: crypto.randomUUID(),
          action: "imported",
          actor: "Admin",
          note: "Imported the supplied full-length ACU competition video.",
          at: now,
        },
      ],
    };
    snapshotPost(post, {
      verified: true,
      bytes: ad.bytes,
      digest: ad.digest,
      source: "bundled-user-import-sha256",
    });
    state.posts.push(post);
  }
  refreshEligibility(state);
  state.adoptionShowcaseVersion = 1;
  removeDuality(state);
  addActivity(
    state,
    "project",
    "Imported ACU ad competition",
    "Added The Girl in the Middle under Adoption Is. No setup charge or live payment was created.",
    project.id,
  );
}

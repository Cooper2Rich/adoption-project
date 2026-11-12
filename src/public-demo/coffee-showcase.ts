import {
  configurePolicy,
  refreshEligibility,
  snapshotPost,
} from "../../server/eligibility.ts";
import { coffeeAds, coffeeCreatorId, coffeeProjectId } from "./coffee-ads.ts";
import { mediaEvidence } from "./media.ts";

// Append to old browser workspaces once. Preserve uploads, identities and gifts.
export async function addCoffeeShowcase(value: any) {
  if (value.coffeeShowcaseVersion === 2) return;
  const ownerId = `${coffeeProjectId}-owner`;
  if (!value.creators.some((c: any) => c.id === coffeeCreatorId))
    value.creators.unshift({
      id: coffeeCreatorId,
      name: "Nocturne Studio · fictional",
    });
  if (!value.nonprofits.some((n: any) => n.id === ownerId))
    value.nonprofits.push({ id: ownerId, name: "Nocturne Coffee · fictional" });
  let project = value.projects.find((p: any) => p.id === coffeeProjectId);
  if (!project) {
    project = {
      id: coffeeProjectId,
      name: "Nocturne Coffee — after dark",
      nonprofit: "Nocturne Coffee · fictional",
      nonprofitId: ownerId,
      ownerOrganizationId: ownerId,
      beneficiaryOrganizationId: ownerId,
      category: "Coffee & culture",
      description:
        "Three finished films for a fictional neighborhood coffee shop. A midnight ritual, a carefully pulled espresso, and a place to stay awhile.",
      brief:
        "An atmospheric coffee shop campaign exploring the craft and rituals of coffee. Explore the finished 16-second films or create your own story.",
      cover: "forest",
      coverMedia: coffeeAds[0].poster,
      color: "purple",
      status: "active",
      startDate: "2026-01-01",
      endDate: "2030-12-31",
      instagram: "fictional.nocturne",
      createdAt: new Date().toISOString(),
    };
    configurePolicy(project);
    value.projects.unshift(project);
  }
  if (project.coverMedia === "/images/coffee-midnight.png")
    project.coverMedia = coffeeAds[0].poster;
  const created: any[] = [];
  for (const ad of coffeeAds) {
    const existing = value.posts.find((p: any) => p.id === ad.id);
    if (existing) {
      if (existing.media === `/videos/${ad.id}.webm`) {
        // A new media snapshot preserves the old evidence, user edits and any
        // withdrawal/hold. IDs and viewer contributions remain unchanged.
        const evidence = await mediaEvidence(ad.media);
        existing.media = ad.media;
        existing.revision += 1;
        existing.updatedAt = new Date().toISOString();
        snapshotPost(existing, evidence);
        existing.history.push({
          id: crypto.randomUUID(),
          action: "media-upgraded",
          actor: "Demo media upgrade",
          note: "Replaced the photo animation with continuous filmed coffee footage.",
          at: existing.updatedAt,
        });
      }
      continue;
    }
    const now = new Date().toISOString();
    const policy = project.eligibilityPolicy;
    const post = {
      id: ad.id,
      projectId: project.id,
      title: ad.title,
      creator: "Nocturne Studio · fictional",
      creatorId: coffeeCreatorId,
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
      history: [] as any[],
    };
    snapshotPost(post, await mediaEvidence(post.media));
    created.push(post);
  }
  value.posts.unshift(...created);
  value.coffeeShowcaseVersion = 2;
  refreshEligibility(value);
}

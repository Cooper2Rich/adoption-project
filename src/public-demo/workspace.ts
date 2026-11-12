import {
  ensureIdentity,
  migrateIdentities,
  requirePost,
  requireProject,
  scopedWorkspace,
} from "../../server/access.ts";
import {
  appealCreative,
  holdCreative,
  resolveAppeal,
} from "../../server/creative-exceptions.ts";
import type { DemoState } from "../../server/demo-types.ts";
import {
  addActivity,
  addSubmission,
  getProject,
  normalizeInstagram,
  projectSchema,
  readiness,
  revisePost,
} from "../../server/domain.ts";
import {
  bindEligibilityRecords,
  configurePolicy,
  currentEligibility,
  refreshEligibility,
  snapshotPost,
} from "../../server/eligibility.ts";
import { seedData } from "../../server/seed.ts";
import { adoptionAds } from "./adoption-ads.ts";
import {
  adoptionSampleMetrics,
  ensureAdoptionDemoData,
} from "./adoption-demo-data.ts";
import { addAdoptionShowcase } from "./adoption-showcase.ts";
import {
  campaignManagementRequest,
  ensureCampaignHierarchy,
  requireCampaign,
} from "./campaign-management.ts";
import { coffeeAds } from "./coffee-ads.ts";
import { addCoffeeShowcase } from "./coffee-showcase.ts";
import { samplePerformanceDays } from "./leaderboard-periods.ts";
import {
  mediaEvidence,
  mediaFile,
  prepareSamples,
  uploadMedia,
} from "./media.ts";
import { ensureSampleFinancials } from "./sample-finances.ts";

export const campaignId = "fictional-river-showcase-v1";
export const creatorId = `${campaignId}-creator`;
export const ownerId = `${campaignId}-owner`;
export const terms = {
  id: "preview-terms-v1",
  creatorCommissionBps: 1000,
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: "2030-12-31T23:59:59.000Z",
  attributionWindowDays: 7,
  refundHoldPolicy:
    "Illustrative terms only. No payments, live publishing or legally binding participation.",
  combinations: [{ channel: "instagram", placement: "feed", paid: false }],
  destinations: [`/campaigns/${campaignId}/give`],
};
const key = "slander-public-workspace-v1";
const uuid = () => crypto.randomUUID();
let preparing;

function save(state: DemoState) {
  localStorage.setItem(key, JSON.stringify(state));
}
function state() {
  const value = JSON.parse(localStorage.getItem(key) || "null");
  if (!value || value.version !== 1)
    throw new Error("The fictional workspace is still loading. Try again.");
  bindEligibilityRecords(value, {
    get(table: any, id: any) {
      if (table === "offer_versions" && id === terms.id) return terms;
      if (table === "participations" && value.participations.includes(id))
        return { id };
      return undefined;
    },
    restrictionFor() {
      return undefined;
    },
  });
  refreshEligibility(value);
  ensureCampaignHierarchy(value);
  return value;
}
export async function prepareWorkspace() {
  return (preparing ||= (async () => {
    await prepareSamples();
    const existing = JSON.parse(localStorage.getItem(key) || "null");
    if (existing?.version === 1) {
      if (existing.coffeeShowcaseVersion !== 2) {
        await addCoffeeShowcase(existing);
        save(existing);
      }
      if (!existing.sampleFinancials) {
        ensureCampaignHierarchy(existing);
        ensureSampleFinancials(existing);
        save(existing);
      }
      if (
        existing.adoptionShowcaseVersion !== 1 ||
        existing.adoptionDualityRemovalVersion !== 1
      ) {
        ensureCampaignHierarchy(existing);
        addAdoptionShowcase(existing);
        save(existing);
      }
      if (existing.adoptionDemoDataVersion !== 1) {
        ensureAdoptionDemoData(existing);
        save(existing);
      }
      return;
    }
    const value = seedData();
    value.version = 1;
    value.participations = [];
    value.distributions = [];
    value.uploads = [];
    value.creativeHolds = [];
    value.creativeAppeals = [];
    value.exports = [];
    migrateIdentities(value);
    value.nonprofits.unshift({
      id: ownerId,
      name: "Riverkind Collective · fictional",
    });
    value.creators.unshift({ id: creatorId, name: "Alex River · fictional" });
    value.projects.unshift({
      id: campaignId,
      name: "A little louder for living rivers",
      nonprofit: "Riverkind Collective · fictional",
      nonprofitId: ownerId,
      category: "Environment",
      description:
        "A fictional campaign for cleaner rivers and the communities that care for them.",
      brief:
        "Tell a hopeful story about caring for rivers. Include the supplied compensation and beneficiary disclosures, and use media you have permission to share.",
      cover: "forest",
      color: "green",
      status: "active",
      startDate: "2026-01-01",
      endDate: "2030-12-31",
      instagram: "fictional.riverkind",
      createdAt: new Date().toISOString(),
      offerVersionId: terms.id,
    });
    for (const p of value.projects) {
      p.ownerOrganizationId = p.nonprofitId;
      p.beneficiaryOrganizationId = p.nonprofitId;
      configurePolicy(p);
    }
    value.projects[0].eligibilityPolicy.termsVersion = terms.id;
    for (const p of value.posts) {
      p.history = [
        {
          id: uuid(),
          action: "submitted",
          actor: p.creator,
          note: "Fictional sample supplied for automatic eligibility checks.",
          at: p.createdAt,
        },
      ];
      snapshotPost(p, await mediaEvidence(p.media));
    }
    // Preserve the earlier public preview's consent and sample; never touch the
    // user's local Express database or any other website's browser storage.
    const prior = JSON.parse(
      localStorage.getItem("slander-public-preview-v1") || "null",
    );
    if (prior?.accepted) value.participations.push(`${creatorId}:${terms.id}`);
    for (const p of prior?.posts || []) {
      if (p.projectId !== campaignId) continue;
      const policy = value.projects[0].eligibilityPolicy;
      Object.assign(p, {
        creatorId,
        media: "/images/forest.jpg",
        rights: true,
        channel: "instagram",
        destination: policy.destinations[0],
        disclosures: {
          compensation: policy.compensationDisclosure,
          beneficiary: policy.beneficiaryDisclosure,
        },
        acceptedTermsVersion: terms.id,
        factualClaims: [] as any[],
        history: p.history || [],
      });
      snapshotPost(p, await mediaEvidence(p.media));
      value.posts.unshift(p);
    }
    save(value);
    const ready = state();
    // One plainly fictional hold makes the exception workflow discoverable.
    holdCreative(ready, "sample-4", {
      code: "EVIDENCE_CONFLICT",
      reason: "Fictional sample: confirm the image permission before new use.",
      evidence: "Demo fixture only; this is not a real complaint.",
    });
    await addCoffeeShowcase(ready);
    ensureCampaignHierarchy(ready);
    addAdoptionShowcase(ready);
    ensureSampleFinancials(ready);
    ensureAdoptionDemoData(ready);
    save(ready);
  })().catch((error: any) => {
    preparing = undefined;
    throw error;
  }));
}
function accessFor(value: any, access: any) {
  if (!access) throw new Error("Select a demo role first.");
  if (!["admin", "nonprofit", "creator"].includes(access.role))
    throw new Error("Choose a supported demo role.");
  if (
    access.role === "creator" &&
    !value.creators.some((c: any) => c.id === access.creatorId)
  )
    throw new Error("Choose a creator profile first.");
  if (
    access.role === "nonprofit" &&
    !value.nonprofits.some((n: any) => n.id === access.nonprofitId)
  )
    throw new Error("Choose an organization first.");
  return {
    ...access,
    role: access.role === "nonprofit" ? "owner" : access.role,
    organizationId: access.nonprofitId,
  };
}
function admin(access: any) {
  if (access.role !== "admin")
    throw new Error("Switch to Admin for this action.");
}
function creator(access: any) {
  if (access.role !== "creator")
    throw new Error("Switch to Creator and choose a profile first.");
}
function ownMedia(value: any, path: any, access: any) {
  if (
    coffeeAds.some(
      (ad: any) => path === ad.media || path === `/videos/${ad.id}.webm`,
    )
  )
    return;
  if (/^\/images\/(forest|food|education|seedling)\.jpg$/.test(path)) return;
  const uploaded = value.uploads.find((m: any) => m.media === path);
  if (
    !uploaded ||
    (access.role !== "admin" && uploaded.creatorId !== access.creatorId)
  )
    throw new Error("Choose one of your browser uploads or a sample image.");
}
function postInput(value: any, project: any, input: any, access: any) {
  const who =
    access.role === "creator"
      ? value.creators.find((c: any) => c.id === access.creatorId)
      : ensureIdentity(value, "creators", input.creator || "Demo creator");
  ownMedia(value, input.media, access);
  return { ...input, creatorId: who.id, creator: who.name };
}
function upsertProject(value: any, id: any, input: any, access: any) {
  if (!id) admin(access);
  const project = id ? requireProject(value, id, access, true) : null;
  const data = projectSchema.parse(input);
  const campaign = requireCampaign(
    value,
    project?.campaignId || input.campaignId,
  );
  if (campaign.status === "archived")
    throw new Error("Restore this campaign before changing its projects.");
  if (data.nonprofit !== campaign.ownerName)
    throw new Error("Project organization must match its campaign.");
  if (data.status === "active" && campaign.status !== "active")
    throw new Error(
      "Admin activation is required before publishing this project.",
    );
  if (
    (!project || project.pricingStatus === "pending") &&
    data.status === "active"
  )
    throw new Error(
      "Project pricing is not configured. Save this project as a draft.",
    );
  data.instagram = normalizeInstagram(data.instagram);
  if (
    project &&
    access.role !== "admin" &&
    data.nonprofit !== project.nonprofit
  )
    throw new Error("Only Admin can reassign a project's organization.");
  const organization = value.nonprofits.find(
    (item: any) => item.id === campaign.ownerOrganizationId,
  );
  if (!organization) throw new Error("Campaign organization is unavailable.");
  const result = project || { id: uuid(), createdAt: new Date().toISOString() };
  Object.assign(result, data, {
    campaignId: campaign.id,
    ...(!project ? { pricingStatus: "pending" } : {}),
    nonprofit: organization.name,
    nonprofitId: organization.id,
    ownerOrganizationId: organization.id,
    beneficiaryOrganizationId: organization.id,
    color: (
      {
        forest: "green",
        food: "orange",
        education: "purple",
        seedling: "green",
      } as Record<string, any>
    )[data.cover],
  });
  configurePolicy(result, data.policyConfig);
  if (!project) value.projects.unshift(result);
  refreshEligibility(value);
  addActivity(
    value,
    "project",
    `${project ? "Updated" : "Created"} “${result.name}”`,
    "Fictional browser workspace settings saved.",
    result.id,
  );
  return result;
}
function exportCreative(value: any, id: any, access: any) {
  const post = requirePost(value, id, access, "export"),
    project = getProject(value, post.projectId);
  if (!readiness(post, project).ready)
    throw new Error(readiness(post, project).reasons.join(". "));
  addActivity(
    value,
    "exported",
    `Exported “${post.title}”`,
    "Browser-only handoff; nothing has been published.",
    project.id,
  );
  return {
    disclosure:
      "Fictional browser-local handoff. No social post or server journal.",
    project: {
      id: project.id,
      name: project.name,
      instagram: project.instagram,
    },
    post,
    snapshot: post.snapshots.find((s: any) => s.id === post.snapshotId),
  };
}
export async function workspaceRequest(
  path: any,
  access: any = undefined,
  method: any = "GET",
  body: any = {},
) {
  await prepareWorkspace();
  const value = state();
  if (path === "/public/campaigns" && method === "GET") {
    return {
      handled: true,
      data: value.managedCampaigns
        .filter(
          (campaign: any) =>
            campaign.status === "active" &&
            value.projects.some(
              (project: any) =>
                project.campaignId === campaign.id &&
                project.status === "active",
            ),
        )
        .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))
        .map((campaign: any) => ({ id: campaign.id, name: campaign.name })),
    };
  }
  if (path === "/public/ads" && method === "GET") {
    const fixtures = {
      "sample-1": { impressions: 24800, clicks: 868, donatedCents: 186000 },
      "sample-2": { impressions: 18300, clicks: 439, donatedCents: 124500 },
      "sample-3": { impressions: 12600, clicks: 504, donatedCents: 97000 },
    };
    return {
      handled: true,
      data: value.posts
        .filter((p: any) => {
          const project = value.projects.find(
            (project: any) => project.id === p.projectId,
          );
          return project?.status === "active" && currentEligibility(p, project);
        })
        .map((p: any) => {
          const project = value.projects.find(
            (project: any) => project.id === p.projectId,
          );
          const sample =
            p.revision === 1 && p.media.startsWith("/images/")
              ? fixtures[p.id as keyof typeof fixtures]
              : null;
          const coffee = coffeeAds.find(
            (ad: any) => ad.id === p.id && p.media === ad.media,
          );
          const imported = adoptionAds.find(
            (ad: any) => ad.id === p.id && p.media === ad.media,
          );
          const performance = imported
            ? adoptionSampleMetrics
            : coffee || sample;
          return {
            id: p.id,
            projectId: p.projectId,
            campaignId: project.campaignId,
            campaign: requireCampaign(value, project.campaignId).name,
            title: p.title,
            creator: p.creator,
            creatorId: p.creatorId,
            caption: p.caption,
            media: p.media,
            mediaType: p.mediaType,
            poster: imported
              ? imported.poster
              : coffee
                ? coffee.poster
                : sample
                  ? p.media
                  : project.coverMedia || `/images/${project.cover}.jpg`,
            durationSeconds: imported
              ? imported.durationSeconds
              : coffee
                ? 16
                : undefined,
            performanceDays: performance
              ? samplePerformanceDays(p.id, performance)
              : undefined,
            project: project.name,
            nonprofit: project.nonprofit,
            category: project.category,
            ...(imported
              ? adoptionSampleMetrics
              : coffee
                ? {
                    impressions: coffee.impressions,
                    clicks: coffee.clicks,
                    donatedCents: coffee.donatedCents,
                  }
                : sample || {
                    impressions: null,
                    clicks: null,
                    donatedCents: null,
                  }),
          };
        }),
    };
  }
  if (path === "/demo-options" && method === "GET")
    return {
      handled: true,
      data: { nonprofits: value.nonprofits, creators: value.creators },
    };
  if (path === "/demo/showcase" && method === "GET")
    return {
      handled: true,
      data: { ready: true, campaignId, creatorId, ownerId },
    };
  if (path === `/giving/${campaignId}/campaign` && method === "GET")
    return { handled: true, data: getProject(value, campaignId) };
  // Financial routes are handled by the separate, explicitly simulated adapter.
  if (
    path.startsWith("/management/campaigns") ||
    path.startsWith("/project-requests")
  ) {
    const a = accessFor(value, access);
    const result = campaignManagementRequest(
      value,
      a,
      path,
      method,
      body,
      (input: any) => upsertProject(value, null, input, a),
    );
    save(value);
    return { handled: true, data: structuredClone(result?.data) };
  }
  const supported =
    path === "/workspace" ||
    path === "/offers" ||
    path === "/demo-creators" ||
    path === "/projects" ||
    path.startsWith("/projects/") ||
    path.startsWith("/posts/") ||
    path.startsWith("/appeals/") ||
    path === "/uploads" ||
    /\/(consent|sample-creative|demo-link|records\/participations|records\/distributions)$/.test(
      path,
    );
  if (!supported) return { handled: false };
  const a = accessFor(value, access);
  let data;
  if (method === "GET" && path === "/workspace") {
    data = scopedWorkspace(value, a);
    if (a.role === "admin") data.sampleFinancials = value.sampleFinancials;
    else if (a.role === "creator" && value.sampleFinancials) {
      const contributions = value.sampleFinancials.contributions.filter(
        (c: any) => c.creatorId === a.creatorId,
      );
      const ids = new Set(contributions.map((c: any) => c.id));
      data.sampleFinancials = {
        version: value.sampleFinancials.version,
        contributions,
        payments: value.sampleFinancials.payments.filter(
          (p: any) => p.recipient === "creator" && ids.has(p.contributionId),
        ),
      };
    }
    data.projectRequests = value.projectRequests
      .filter(
        (request: any) =>
          a.role === "admin" ||
          (a.role === "owner" &&
            request.ownerOrganizationId === a.organizationId),
      )
      .map((request: any) => {
        if (a.role === "admin") return request;
        const { campaignId: _campaignId, ...visible } = request;
        return visible;
      });
    if (a.role === "admin") data.managedCampaigns = value.managedCampaigns;
    else
      data.projects = data.projects.map(
        ({ campaignId: _campaignId, ...project }: any) => ({
          ...project,
          campaignPaused:
            requireCampaign(value, _campaignId).status === "archived",
        }),
      );
    if (a.role === "creator") {
      // Retain only this creator's history, including ended/unpublished campaigns.
      // Campaign discovery and other creators' private ads remain scoped normally.
      const today = new Date().toISOString().slice(0, 10);
      const ownPastAds = value.posts.filter((post: any) => {
        const project = value.projects.find(
          (p: any) => p.id === post.projectId,
        );
        return (
          post.creatorId === a.creatorId &&
          (post.withdrawnAt ||
            !project ||
            project.status !== "active" ||
            project.endDate < today)
        );
      });
      const visibleIds = new Set(data.posts.map((post: any) => post.id));
      data.posts.push(
        ...ownPastAds.filter((post: any) => !visibleIds.has(post.id)),
      );
      data.approvedPosts = data.approvedPosts.filter(
        (p: any) => p.creatorId === a.creatorId,
      );
      data.ownArchivedPosts = ownPastAds
        .filter((post: any) =>
          value.projects.some(
            (project: any) =>
              project.id === post.projectId && project.status === "archived",
          ),
        )
        .map((post: any) => post.id);
      data.ownPastAds = ownPastAds.map((post: any) => {
        const project = value.projects.find(
          (p: any) => p.id === post.projectId,
        );
        return {
          postId: post.id,
          campaign: project?.name || "Past campaign",
          reason: post.withdrawnAt
            ? "Withdrawn"
            : !project
              ? "Campaign unavailable"
              : project.status === "archived"
                ? "Campaign archived"
                : project.status !== "active"
                  ? "Campaign unpublished"
                  : "Campaign ended",
        };
      });
    }
  } else if (method === "GET" && path === "/offers") {
    if (a.role === "owner")
      throw new Error("Campaign management is available to Admin only.");
    const p = getProject(value, campaignId);
    data = {
      items:
        (a.role === "admin" || p.status === "active") &&
        (a.role !== "owner" || p.ownerOrganizationId === a.organizationId)
          ? [
              {
                ...p,
                cause: p.category,
                beneficiary: { name: p.nonprofit },
                terms,
              },
            ]
          : [],
    };
  } else if (method === "POST" && path === "/demo-creators") {
    creator(a);
    const name = String(body.name || "").trim();
    if (!name || name.length > 80)
      throw new Error("Enter a creator name with 1–80 characters.");
    data = ensureIdentity(value, "creators", name);
  } else if (method === "POST" && path === "/projects")
    throw new Error(
      "Projects are created by approving an owner request. Use Project requests.",
    );
  else if (method === "PUT" && /^\/projects\/[^/]+$/.test(path))
    data = upsertProject(value, path.split("/")[2], body, a);
  else if (method === "POST" && path === "/uploads") {
    if (!["admin", "creator"].includes(a.role))
      throw new Error("Choose Admin or Creator to upload a sample.");
    data = await uploadMedia(body);
    value.uploads.push({ ...data, creatorId: a.creatorId });
  } else if (method === "POST" && /^\/projects\/[^/]+\/posts$/.test(path)) {
    if (!["admin", "creator"].includes(a.role))
      throw new Error("Choose Admin or Creator to submit a creative.");
    const p = requireProject(value, path.split("/")[2], a);
    const input = postInput(value, p, body, a);
    data = addSubmission(value, p.id, input, await mediaEvidence(input.media));
  } else if (method === "PUT" && /^\/posts\/[^/]+$/.test(path)) {
    const post = requirePost(value, path.split("/")[2], a, "edit");
    ownMedia(value, body.media, a);
    data = revisePost(value, post.id, body, await mediaEvidence(body.media));
  } else if (/^\/posts\/[^/]+\/(holds|appeals|withdraw|export)$/.test(path)) {
    const [, , id, action] = path.split("/");
    const post = requirePost(
      value,
      id,
      a,
      action === "export" ? "export" : action === "holds" ? "review" : "edit",
    );
    if (method === "POST" && action === "holds") {
      admin(a);
      data = holdCreative(value, id, body);
    } else if (method === "POST" && action === "appeals")
      data = appealCreative(
        value,
        id,
        body,
        a.role === "admin" ? "Demo administrator" : post.creator,
      );
    else if (method === "POST" && action === "withdraw") {
      if (post.revision !== body.revision)
        throw new Error("Reopen the latest creative revision and try again.");
      post.withdrawnAt = new Date().toISOString();
      refreshEligibility(value);
      addActivity(
        value,
        "withdrawn",
        `Withdrew “${post.title}”`,
        "Withdrawn from new use; historical revisions remain.",
        post.projectId,
      );
      data = post;
    } else if (method === "GET" && action === "export")
      data = exportCreative(value, id, a);
    else throw new Error("This action is unavailable.");
  } else if (method === "POST" && /^\/appeals\/[^/]+\/resolve$/.test(path)) {
    admin(a);
    data = resolveAppeal(value, path.split("/")[2], body);
  } else if (path.startsWith(`/campaigns/${campaignId}/`)) {
    const p = requireProject(value, campaignId, a);
    if (method === "GET" && path.endsWith("/records/participations"))
      data = {
        items: value.participations
          .filter(
            (id: any) =>
              a.role !== "creator" || id.startsWith(a.creatorId + ":"),
          )
          .map((id: any) => ({ id, termsId: terms.id })),
      };
    else if (method === "GET" && path.endsWith("/records/distributions"))
      data = {
        items: value.distributions.filter(
          (d: any) => a.role !== "creator" || d.creatorId === a.creatorId,
        ),
      };
    else if (method === "POST" && path.endsWith("/consent")) {
      creator(a);
      if (body.termsId !== terms.id)
        throw new Error("Reload the current campaign terms.");
      const id = `${a.creatorId}:${terms.id}`;
      if (!value.participations.includes(id)) value.participations.push(id);
      refreshEligibility(value);
      data = { id, termsId: terms.id };
    } else if (method === "POST" && path.endsWith("/sample-creative")) {
      creator(a);
      const policy = p.eligibilityPolicy;
      data = addSubmission(
        value,
        p.id,
        {
          title: "Small acts. Living rivers.",
          creator: value.creators.find((c: any) => c.id === a.creatorId).name,
          creatorId: a.creatorId,
          caption:
            "A little care can go a long way. Join this fictional river campaign.",
          format: "photo",
          media: "/images/forest.jpg",
          mediaType: "image",
          rights: true,
          channel: "instagram",
          destination: policy.destinations[0],
          disclosures: {
            compensation: policy.compensationDisclosure,
            beneficiary: policy.beneficiaryDisclosure,
          },
          factualClaims: [] as any[],
          acceptedTermsVersion: terms.id,
        },
        await mediaEvidence("/images/forest.jpg"),
      );
    } else if (method === "POST" && path.endsWith("/demo-link")) {
      creator(a);
      const post = requirePost(value, body.postId, a, "edit");
      if (post.projectId !== p.id || !currentEligibility(post, p))
        throw new Error(
          "Choose a currently eligible creative for this campaign.",
        );
      const distribution = {
        id: uuid(),
        creatorId: post.creatorId,
        postId: post.id,
        snapshotId: post.snapshotId,
        campaignId,
        token: uuid(),
      };
      value.distributions.push(distribution);
      data = {
        distribution,
        link: {
          path: `#/campaigns/${campaignId}/give?ref=${distribution.token}`,
        },
      };
    } else throw new Error("This preview action is unavailable.");
  } else throw new Error("This preview action is unavailable.");
  save(value);
  return { handled: true, data: structuredClone(data) };
}
export function attributionFor(token: any) {
  const value = state();
  const d = value.distributions.find((d: any) => d.token === token);
  const post = d && value.posts.find((p: any) => p.id === d.postId);
  if (
    post &&
    post.snapshotId === d.snapshotId &&
    currentEligibility(post, getProject(value, campaignId))
  )
    return d;
  return undefined;
}
export async function previewMedia(path: any, access: any) {
  await prepareWorkspace();
  const value = state(),
    a = accessFor(value, access);
  const cleanPath = path.split("?")[0];
  const upload = value.uploads.find((m: any) => m.media === cleanPath);
  const scoped = scopedWorkspace(value, a);
  const visible = [...scoped.posts, ...scoped.approvedPosts].some(
    (p: any) => p.media.split("?")[0] === cleanPath,
  );
  if (
    !upload ||
    !(a.role === "admin" || upload.creatorId === a.creatorId || visible)
  )
    return new Response("Media unavailable", { status: 404 });
  const file = await mediaFile(cleanPath);
  return file
    ? new Response(file, { headers: { "Content-Type": file.type } })
    : new Response("Media unavailable", { status: 404 });
}

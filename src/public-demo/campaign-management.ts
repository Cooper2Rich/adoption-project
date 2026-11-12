import type { DemoState } from "../../server/demo-types.ts";
import { addActivity, projectSchema } from "../../server/domain.ts";
import { campaignAdPlatformAction } from "./ad-platforms.ts";

export function ensureCampaignHierarchy(state: DemoState) {
  state.managedCampaigns ||= [];
  state.projectRequests ||= [];
  state.activity ||= [];
  for (const project of state.projects) {
    project.ownerOrganizationId ||= project.nonprofitId;
    project.beneficiaryOrganizationId ||= project.nonprofitId;
    if (project.campaignId) continue;
    // Retain legacy IDs and records; introduce a parent without moving ads.
    project.campaignId = project.id;
    state.managedCampaigns.push({
      id: project.id,
      name: project.name,
      description: project.description,
      ownerOrganizationId: project.ownerOrganizationId || project.nonprofitId,
      ownerName: project.nonprofit,
      status: project.status,
      createdAt: project.createdAt,
      pricingStatus: "pending",
    });
  }
}

export function requireCampaign(state: DemoState, id: any) {
  const campaign = state.managedCampaigns.find((item: any) => item.id === id);
  if (!campaign) throw new Error("Campaign not available.");
  return campaign;
}

function text(value: any, label: any, max: any) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max)
    throw new Error(`${label} must contain 1–${max} characters.`);
  return result;
}

export function campaignManagementRequest(
  state: DemoState,
  access: any,
  path: any,
  method: any,
  body: any,
  createProject: any,
) {
  if (
    !path.startsWith("/management/campaigns") &&
    !path.startsWith("/project-requests")
  )
    return null;
  ensureCampaignHierarchy(state);
  if (path.startsWith("/management/campaigns")) {
    if (access.role !== "admin")
      throw new Error("Campaign management is available to Admin only.");
    if (path === "/management/campaigns" && method === "GET")
      return { data: state.managedCampaigns };
    const adPlatformMatch =
      /^\/management\/campaigns\/([^/]+)\/ad-platforms(?:\/(connect|disconnect|rules|preview))?$/.exec(
        path,
      );
    if (adPlatformMatch)
      return campaignAdPlatformAction(
        state,
        requireCampaign(state, adPlatformMatch[1]),
        adPlatformMatch[2],
        method,
        body,
      );
    if (path === "/management/campaigns" && method === "POST") {
      const owner = state.nonprofits.find(
        (item: any) => item.id === body.ownerOrganizationId,
      );
      if (!owner) throw new Error("Choose an existing organization.");
      const campaign = {
        id: crypto.randomUUID(),
        name: text(body.name, "Campaign name", 80),
        description: text(body.description, "Description", 600),
        ownerOrganizationId: owner.id,
        ownerName: owner.name,
        status: "active",
        pricingStatus: "pending",
        createdAt: new Date().toISOString(),
      };
      state.managedCampaigns.unshift(campaign);
      addActivity(
        state,
        "campaign",
        `Created campaign “${campaign.name}”`,
        "Project pricing remains pending. No charge was created.",
      );
      return { data: campaign };
    }
    const match = /^\/management\/campaigns\/([^/]+)\/(archive|restore)$/.exec(
      path,
    );
    if (match && method === "POST") {
      const campaign = requireCampaign(state, match[1]);
      const archive = match[2] === "archive";
      if (archive === (campaign.status === "archived"))
        return { data: campaign };
      if (archive) campaign.statusBeforeArchive = campaign.status;
      if (archive && state.adPlatformSetups?.[campaign.id])
        state.adPlatformSetups[campaign.id].rules.enabled = false;
      campaign.status = archive
        ? "archived"
        : campaign.statusBeforeArchive || "active";
      if (!archive) delete campaign.statusBeforeArchive;
      for (const project of state.projects.filter(
        (item: any) => item.campaignId === campaign.id,
      )) {
        if (archive) {
          project.statusBeforeCampaignArchive = project.status;
          project.status = "archived";
        } else if (project.statusBeforeCampaignArchive) {
          project.status = project.statusBeforeCampaignArchive;
          delete project.statusBeforeCampaignArchive;
        }
      }
      addActivity(
        state,
        "campaign",
        `${archive ? "Archived" : "Restored"} campaign “${campaign.name}”`,
        "Saved project and funding records were retained.",
      );
      return { data: campaign };
    }
    throw new Error("Campaign action unavailable.");
  }
  if (!["admin", "owner"].includes(access.role))
    throw new Error(
      "Project requests are available to campaign owners and Admin only.",
    );
  if (path === "/project-requests" && method === "GET")
    return {
      data: state.projectRequests
        .filter(
          (request: any) =>
            access.role === "admin" ||
            request.ownerOrganizationId === access.organizationId,
        )
        .map((request: any) => {
          if (access.role === "admin") return request;
          const { campaignId: _campaignId, ...visible } = request;
          return visible;
        }),
    };
  if (path === "/project-requests" && method === "POST") {
    if (access.role !== "owner")
      throw new Error("Choose a campaign owner profile to request a project.");
    const owner = state.nonprofits.find(
      (item: any) => item.id === access.organizationId,
    );
    if (!owner) throw new Error("Organization unavailable.");
    const input = projectSchema.parse({
      name: body.name,
      description: body.description,
      brief: body.brief,
      category: body.category,
      startDate: body.startDate,
      endDate: body.endDate,
      nonprofit: owner.name,
      cover: "forest",
      instagram: "",
      status: "draft",
    });
    const id = text(body.requestId, "Request ID", 100);
    const previous = state.projectRequests.find(
      (request: any) => request.id === id,
    );
    if (previous) {
      if (
        previous.ownerOrganizationId !== owner.id ||
        Object.keys(input)
          .filter((key: any) => key !== "status")
          .some(
            (key: any) => input[key as keyof typeof input] !== previous[key],
          )
      )
        throw new Error("This request ID has already been used.");
      return { data: previous };
    }
    const request = {
      ...input,
      id,
      ownerOrganizationId: owner.id,
      ownerName: owner.name,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    state.projectRequests.unshift(request);
    addActivity(
      state,
      "project_request",
      `Requested project “${request.name}”`,
      "Awaiting Admin review. No project was activated or charged.",
    );
    return { data: request };
  }
  const decision = /^\/project-requests\/([^/]+)\/decision$/.exec(path);
  if (decision && method === "POST") {
    if (access.role !== "admin")
      throw new Error("Only Admin can review project requests.");
    const request = state.projectRequests.find(
      (item: any) => item.id === decision[1],
    );
    if (!request) throw new Error("Request unavailable.");
    if (!["approve", "decline"].includes(body.decision))
      throw new Error("Choose approve or decline.");
    if (request.status !== "pending") {
      if (
        body.decision === "approve" &&
        request.status === "approved" &&
        request.campaignId === body.campaignId
      )
        return { data: request };
      throw new Error("This request has already been reviewed.");
    }
    const note = String(body.note || "").trim();
    if (note.length > 600)
      throw new Error("Review note must be 600 characters or fewer.");
    if (body.decision === "decline") {
      if (!note) throw new Error("Explain why this request was declined.");
      request.status = "declined";
    } else {
      const campaign = requireCampaign(state, body.campaignId);
      if (
        campaign.status === "archived" ||
        campaign.ownerOrganizationId !== request.ownerOrganizationId
      )
        throw new Error(
          "Choose a non-archived campaign belonging to this organization.",
        );
      const project = createProject({
        ...request,
        status: "draft",
        nonprofit: campaign.ownerName,
        campaignId: campaign.id,
      });
      request.projectId = project.id;
      request.campaignId = campaign.id;
      request.status = "approved";
    }
    request.reviewNote = note;
    request.reviewedAt = new Date().toISOString();
    addActivity(
      state,
      "project_request",
      `${request.status === "approved" ? "Approved" : "Declined"} project request “${request.name}”`,
      request.status === "approved"
        ? "Approved as a draft. Pricing remains pending; no charge was created."
        : note,
      request.projectId,
    );
    return { data: request };
  }
  throw new Error("Project request action unavailable.");
}

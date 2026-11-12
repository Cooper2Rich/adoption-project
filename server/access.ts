import { randomUUID } from "node:crypto";
import type { DemoRecords, DemoState } from "./demo-types.ts";
import { AppError, getPost, getProject, readiness } from "./domain.ts";
import { currentEligibility, eligibleCounts } from "./eligibility.ts";

const identityKey = (name: any) => name.trim().toLocaleLowerCase("en-US");
export function ensureIdentity(state: DemoState, collection: any, name: any) {
  state[collection] ||= [];
  let identity = state[collection].find(
    (item: any) => identityKey(item.name) === identityKey(name),
  );
  if (!identity) {
    identity = { id: randomUUID(), name: name.trim() };
    state[collection].push(identity);
  }
  return identity;
}
export function migrateIdentities(state: DemoState) {
  state.nonprofits ||= [];
  state.creators ||= [];
  for (const project of state.projects) {
    if (!project.nonprofitId)
      project.nonprofitId = ensureIdentity(
        state,
        "nonprofits",
        project.nonprofit,
      ).id;
  }
  for (const post of state.posts) {
    if (!post.creatorId)
      post.creatorId = ensureIdentity(state, "creators", post.creator).id;
  }
  return state;
}
export function readAccess(
  req: any,
  state: DemoState,
  requireSelection: any = true,
) {
  const role = req.get("x-demo-role");
  if (!["admin", "owner", "nonprofit", "creator"].includes(role))
    throw new AppError("Select a demo view first.", 403);
  const access = {
    role,
    nonprofitId: req.get("x-demo-nonprofit") || null,
    creatorId: req.get("x-demo-creator") || null,
    organizationId: req.get("x-demo-organization") || null,
  };
  if (requireSelection && role !== "admin") {
    const exists =
      role === "nonprofit"
        ? state.organizations.some(
            (n: any) => n.id === access.nonprofitId && n.type === "nonprofit",
          )
        : role === "owner"
          ? state.organizations.some((o: any) => o.id === access.organizationId)
          : state.creators.some((c: any) => c.id === access.creatorId);
    if (!exists)
      throw new AppError(
        `Select a ${role === "nonprofit" ? "nonprofit" : "creator profile"} to continue.`,
        403,
      );
  }
  if (role === "nonprofit") access.organizationId = access.nonprofitId;
  return access;
}
export function canViewProject(project: any, access: any) {
  if (access.role === "admin") return true;
  if (access.role === "nonprofit" || access.role === "owner")
    return project.ownerOrganizationId === access.organizationId;
  return project.status === "active";
}
export function requireProject(
  state: DemoState,
  id: any,
  access: any,
  manage: any = false,
) {
  const project = getProject(state, id);
  if (!canViewProject(project, access))
    throw new AppError("Project not available in this view.", 404);
  if (manage && access.role === "creator")
    throw new AppError(
      "Project settings are available to Admin and the project's nonprofit only.",
      403,
    );
  return project;
}
export function requirePost(
  state: DemoState,
  id: any,
  access: any,
  action: any,
) {
  const post = getPost(state, id);
  requireProject(
    state,
    post.projectId,
    access,
    action === "review" || action === "export",
  );
  if (
    action === "edit" &&
    access.role !== "admin" &&
    (access.role !== "creator" || post.creatorId !== access.creatorId)
  )
    throw new AppError("You can only edit your own submissions.", 403);
  return post;
}
function publicPost(post: any, records?: DemoRecords) {
  const media = post.media.startsWith("/api/media/")
    ? records?.get("media", post.media.slice(11))
    : records?.byMediaPath(post.media);
  return {
    id: post.id,
    projectId: post.projectId,
    title: post.title,
    creatorId: post.creatorId,
    creator: post.creator,
    format: post.format,
    caption: post.caption,
    media: media
      ? `/api/media/${media.id}?postId=${post.id}&snapshotId=${post.snapshotId}`
      : post.media,
    mediaType: post.mediaType,
    status: post.status,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    revision: post.revision,
    history: [] as any[],
    feedback: "",
  };
}
export function scopedWorkspace(
  state: DemoState,
  access: any,
  records?: DemoRecords,
): Record<string, any> {
  const projects = state.projects.filter((p: any) => canViewProject(p, access));
  const projectIds = new Set(projects.map((p: any) => p.id));
  const visible = state.posts.filter((p: any) => projectIds.has(p.projectId));
  const posts = visible
    .filter(
      (p: any) => access.role !== "creator" || p.creatorId === access.creatorId,
    )
    .map((post: any) =>
      access.role === "creator"
        ? {
            ...post,
            appeals: state.creativeAppeals.filter(
              (a: any) => a.postId === post.id,
            ),
            readiness: undefined,
          }
        : {
            ...post,
            appeals: state.creativeAppeals.filter(
              (a: any) => a.postId === post.id,
            ),
            readiness: readiness(post, getProject(state, post.projectId)),
          },
    );
  return {
    projects: projects.map((p: any) =>
      access.role === "creator"
        ? { ...p, instagram: undefined, nonprofitId: undefined }
        : p,
    ),
    posts,
    approvedPosts: visible
      .filter((p: any) => currentEligibility(p, getProject(state, p.projectId)))
      .map((p: any) =>
        access.role === "creator" && p.creatorId !== access.creatorId
          ? publicPost(p, records)
          : posts.find((post: any) => post.id === p.id),
      ),
    eligibleCounts: eligibleCounts(
      visible.filter((p: any) =>
        currentEligibility(p, getProject(state, p.projectId)),
      ),
    ),
    activity:
      access.role === "creator"
        ? []
        : state.activity.filter(
            (e: any) => access.role === "admin" || projectIds.has(e.projectId),
          ),
  };
}

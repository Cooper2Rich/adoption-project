import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DemoState } from "./demo-types.ts";
import {
  configurePolicy,
  currentEligibility,
  evaluatePost,
  policyInput,
  snapshotPost,
  submissionsOpen,
} from "./eligibility.ts";

export class AppError extends Error {
  status: number;
  constructor(message: any, status: any = 400) {
    super(message);
    this.status = status;
  }
}
const text = (max: any) => z.string().trim().min(1).max(max);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v: any) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Enter a valid calendar date.",
  );
export const projectSchema = z
  .object({
    name: text(80),
    nonprofit: text(80),
    category: text(40),
    description: text(600),
    brief: text(1200),
    cover: z.enum(["forest", "food", "education", "seedling"]),
    startDate: date,
    endDate: date,
    status: z.enum(["draft", "active", "archived"]),
    goalCents: z.number().int().positive().safe().nullable().optional(),
    instagram: z.string().trim().max(150).default(""),
    policyConfig: policyInput.optional(),
  })
  .refine((v: any) => v.endDate >= v.startDate, {
    message: "The end date must be on or after the start date.",
    path: ["endDate"],
  });
export const postSchema = z.object({
  title: text(100),
  creator: text(80),
  caption: text(2200),
  format: z.enum(["photo", "reel", "carousel", "story", "other"]),
  media: text(300),
  mediaType: z.enum(["image", "video"]),
  rights: z.boolean(),
  channel: z.string().trim().max(80).default("instagram"),
  destination: z.string().trim().max(600).default(""),
  disclosures: z
    .object({
      compensation: z.string().max(600),
      beneficiary: z.string().max(600),
    })
    .default({ compensation: "", beneficiary: "" }),
  factualClaims: z.array(z.string().max(600)).max(20).default([]),
  acceptedTermsVersion: z.string().max(80).default(""),
});
export function normalizeInstagram(input: any) {
  const value = input
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/$/, "");
  if (
    value &&
    (!/^[a-zA-Z0-9._]{1,30}$/.test(value) ||
      value.endsWith(".") ||
      value.includes(".."))
  )
    throw new AppError("Enter a valid Instagram username or profile URL.");
  return value.toLowerCase();
}
export function getProject(state: DemoState, id: any) {
  const project = state.projects.find((p: any) => p.id === id);
  if (!project) throw new AppError("Project not found.", 404);
  return project;
}
export function getPost(state: DemoState, id: any) {
  const post = state.posts.find((p: any) => p.id === id);
  if (!post) throw new AppError("Post not found.", 404);
  return post;
}
export function checkPolicy(post: any) {
  const reasons: any[] = [];
  if (!post.rights)
    reasons.push(
      "The creator must confirm media rights and permission to share.",
    );
  if (post.format === "photo" && post.mediaType !== "image")
    reasons.push("A photo post needs an image.");
  if (post.format === "reel" && post.mediaType !== "video")
    reasons.push("A reel needs a video.");
  return {
    passed: reasons.length === 0,
    reasons,
    version: "demo-submission-v1",
  };
}
export function readiness(post: any, project: any) {
  const reasons: any[] = [];
  if (!currentEligibility(post, project))
    reasons.push("Current automatic eligibility is required");
  if (!post.policy.passed) reasons.push("Submission checks need attention");
  if (!["photo", "reel"].includes(post.format))
    reasons.push("Format needs a separate handoff plan");
  if (!project.instagram) reasons.push("Add the nonprofit’s Instagram account");
  if (project.status === "archived") reasons.push("Project is archived");
  return { ready: reasons.length === 0, reasons };
}
export function addActivity(
  state: DemoState,
  action: any,
  title: any,
  detail: any,
  projectId: any = undefined,
) {
  state.activity.unshift({
    id: randomUUID(),
    action,
    title,
    detail,
    projectId,
    at: new Date().toISOString(),
  });
}
export function assertSubmissionsOpen(project: any) {
  if (!submissionsOpen(project))
    throw new AppError(
      "This project is not currently accepting submissions.",
      409,
    );
}
export function addSubmission(
  state: DemoState,
  projectId: any,
  input: any,
  mediaEvidence: any,
) {
  const project = getProject(state, projectId);
  if (!project.eligibilityPolicy)
    configurePolicy(project, project.policyConfig);
  assertSubmissionsOpen(project);
  const data = postSchema.parse(input);
  const at = new Date().toISOString();
  const post = {
    ...data,
    creatorId: input.creatorId,
    id: randomUUID(),
    projectId,
    status: "pending",
    policy: checkPolicy(data),
    revision: 1,
    createdAt: at,
    updatedAt: at,
    feedback: "",
    history: [
      {
        id: randomUUID(),
        action: "submitted",
        actor: data.creator,
        note: "Checking: immutable snapshot submitted for deterministic evaluation.",
        at,
      },
    ],
  };
  state.posts.unshift(post);
  snapshotPost(post, mediaEvidence);
  evaluatePost(state, post, project);
  addActivity(
    state,
    "submitted",
    `${data.creator} submitted “${data.title}”`,
    project.name,
    projectId,
  );
  return post;
}
export function reviewPost(..._args: unknown[]) {
  throw new AppError(
    "Manual creative decisions are retired. Correct the recorded facts and rerun automatic eligibility.",
    409,
  );
}
export function revisePost(
  state: DemoState,
  id: any,
  input: any,
  mediaEvidence: any,
) {
  const post = getPost(state, id);
  assertSubmissionsOpen(getProject(state, post.projectId));
  const revision = z.number().int().positive().parse(input.revision);
  if (post.revision !== revision)
    throw new AppError(
      "This submission changed. Reopen it and try again.",
      409,
    );
  const data = postSchema.parse({ ...input, creator: post.creator });
  Object.assign(post, data, {
    status: "pending",
    policy: checkPolicy(data),
    revision: post.revision + 1,
    updatedAt: new Date().toISOString(),
    feedback: "",
  });
  delete post.withdrawnAt;
  post.history.push({
    id: randomUUID(),
    action: "resubmitted",
    actor: data.creator,
    note: "Checking: new immutable revision submitted for deterministic evaluation.",
    at: post.updatedAt,
  });
  addActivity(
    state,
    "resubmitted",
    `${data.creator} resubmitted “${data.title}”`,
    "Automatic eligibility reruns on the new snapshot.",
    post.projectId,
  );
  snapshotPost(post, mediaEvidence);
  evaluatePost(state, post, getProject(state, post.projectId));
  return post;
}

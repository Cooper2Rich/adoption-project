import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DemoState } from "./demo-types.ts";
import { AppError, addActivity, getPost } from "./domain.ts";
import { refreshEligibility } from "./eligibility.ts";

const explanation = z.string().trim().min(1).max(2000);
export function holdCreative(state: DemoState, id: any, input: any) {
  const data = z
    .object({
      code: z.enum([
        "RIGHTS_COMPLAINT",
        "ABUSE_COMPLAINT",
        "EVIDENCE_CONFLICT",
      ]),
      reason: explanation,
      evidence: explanation,
    })
    .parse(input);
  const post = getPost(state, id);
  const snapshot = post.snapshots.find((s: any) => s.id === post.snapshotId);
  const hold = {
    ...data,
    id: randomUUID(),
    postId: id,
    projectId: post.projectId,
    contentKey: snapshot.contentKey,
    snapshotId: snapshot.id,
    actor: "Demo administrator",
    at: new Date().toISOString(),
  };
  state.creativeHolds.push(hold);
  addActivity(
    state,
    "held",
    `Held “${post.title}”`,
    data.reason,
    post.projectId,
  );
  refreshEligibility(state);
  return hold;
}
export function appealCreative(
  state: DemoState,
  id: any,
  input: any,
  actor: any,
) {
  const post = getPost(state, id);
  const data = z.object({ holdId: z.string(), note: explanation }).parse(input);
  const hold = state.creativeHolds.find(
    (h: any) =>
      h.id === data.holdId &&
      !h.resolvedAt &&
      (h.postId === id ||
        post.eligibility.facts.holds.some((f: any) => f.id === h.id)),
  );
  if (!hold)
    throw new AppError(
      "Choose an unresolved hold affecting this creative.",
      409,
    );
  const appeal = {
    ...data,
    id: randomUUID(),
    postId: id,
    projectId: post.projectId,
    actor,
    at: new Date().toISOString(),
  };
  state.creativeAppeals.push(appeal);
  addActivity(
    state,
    "appeal",
    `Appeal for “${post.title}”`,
    data.note,
    post.projectId,
  );
  return appeal;
}
export function resolveAppeal(state: DemoState, appealId: any, input: any) {
  const data = z
    .object({
      correctedFact: explanation,
      evidence: explanation,
      holdIncorrect: z.boolean(),
    })
    .parse(input);
  const appeal = state.creativeAppeals.find((a: any) => a.id === appealId);
  if (!appeal || appeal.resolution)
    throw new AppError("An unresolved appeal is required.", 409);
  appeal.resolution = {
    ...data,
    actor: "Demo administrator",
    at: new Date().toISOString(),
  };
  if (data.holdIncorrect) {
    const hold = state.creativeHolds.find((h: any) => h.id === appeal.holdId);
    hold.resolvedAt = appeal.resolution.at;
    hold.resolutionAppealId = appeal.id;
  }
  addActivity(
    state,
    "appeal",
    "Appeal fact correction recorded",
    data.correctedFact,
    appeal.projectId,
  );
  refreshEligibility(state);
  return appeal;
}

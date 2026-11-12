import { z } from "zod";
import { requireProject } from "./access.ts";
import { appendOnce, rows, subjectRows } from "./analytics-common.ts";
import type { DemoRecords, DemoState } from "./demo-types.ts";
import { AppError } from "./domain.ts";
import { currentEligibility, refreshEligibility } from "./eligibility.ts";
import { fingerprint, positiveMoney, text } from "./finance-operations.ts";
import {
  activeTerms,
  createDistribution,
  distributionState,
  offerOpen,
  participationBlock,
  transitionDistribution,
} from "./marketplace.ts";
import { cancelMedia, reserveMedia } from "./media-budgets.ts";

const cohortInput = z
  .object({
    channel: text,
    placement: text,
    paid: z.boolean(),
    mode: z.literal("simulated"),
  })
  .strict();
export function publishExposurePolicy(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
  input: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  requireProject(state, campaignId, access, true);
  const data = z
    .object({
      cohort: cohortInput,
      maxActiveTrialsPerCreator: z.number().int().min(1).max(100),
      trialAllocationCents: positiveMoney.nullable(),
      exposurePlan: text,
    })
    .strict()
    .parse(input);
  if (data.cohort.paid !== (data.trialAllocationCents !== null))
    throw new AppError("EXPLICIT_PAID_ALLOCATION_OR_ORGANIC_PREVIEW_REQUIRED");
  const subjectId = fingerprint(data.cohort);
  return appendOnce(
    records,
    "exposure_policies",
    campaignId,
    subjectId,
    {
      ...data,
      subjectId,
      disclosure:
        "Local initial opportunity policy; equal allowances do not promise equal views/spend. No scaling authorization.",
    },
    at,
  );
}
function eligible(
  state: DemoState,
  records: DemoRecords,
  post: any,
  project: any,
  terms: any,
  policy: any,
  at: any,
) {
  const c = policy.cohort;
  return (
    post.projectId === project.id &&
    post.channel === c.channel &&
    currentEligibility(post, project) &&
    offerOpen(project, terms, at) &&
    terms.permissions[c.channel]?.state === "allowed" &&
    terms.combinations.some(
      (p: any) =>
        p.channel === c.channel &&
        p.placement === c.placement &&
        p.paid === c.paid,
    ) &&
    !!records.get("participations", `${post.creatorId}:${terms.id}`) &&
    !participationBlock(records, project.id, post.creatorId, at)
  );
}
function activeAssignments(
  records: DemoRecords,
  campaignId: any,
  policyId: any,
) {
  const assignments = subjectRows(
    records,
    "exposure_assignments",
    campaignId,
    policyId,
  );
  const closed = new Set(
    subjectRows(records, "exposure_events", campaignId, policyId).map(
      (e: any) => e.assignmentId,
    ),
  );
  return {
    assignments,
    active: assignments.filter((a: any) => !closed.has(a.id)),
  };
}
export function finishTrial(
  state: DemoState,
  records: DemoRecords,
  assignmentId: any,
  input: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  const data = z
    .object({ reason: text, evidenceRef: text })
    .strict()
    .parse(input);
  const a = records.get("exposure_assignments", assignmentId);
  if (!a) throw new AppError("Trial unavailable.", 404);
  requireProject(state, a.campaignId, access, true);
  const previous = subjectRows(
    records,
    "exposure_events",
    a.campaignId,
    a.policyId,
  ).find((e: any) => e.assignmentId === a.id);
  if (previous) return previous;
  if (a.reservationId) cancelMedia(state, records, a.reservationId, access, at);
  return appendOnce(
    records,
    "exposure_events",
    a.campaignId,
    a.id,
    { ...data, subjectId: a.policyId, assignmentId: a.id, state: "completed" },
    at,
  );
}
export function scheduleExposure(
  state: DemoState,
  records: DemoRecords,
  policyId: any,
  input: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  const data = z
    .object({
      idempotencyKey: text,
      maxSlots: z.number().int().min(1).max(100),
    })
    .strict()
    .parse(input);
  const policy = records.get("exposure_policies", policyId);
  if (!policy) throw new AppError("Exposure policy unavailable.", 404);
  const project = requireProject(state, policy.campaignId, access, true);
  const key = `${policy.id}:${data.idempotencyKey}`;
  const prior = records.get(
    "exposure_runs",
    fingerprint([project.id, "exposure_runs", key]),
  );
  if (prior) {
    if (prior.requestDigest !== fingerprint(data))
      throw new AppError("IDEMPOTENCY_CONFLICT", 409);
    return prior;
  }
  refreshEligibility(state);
  const { terms } = activeTerms(state, records, project.id);
  const { assignments, active } = activeAssignments(
    records,
    project.id,
    policy.id,
  );
  const retained: any[] = [];
  for (const a of active) {
    const post = state.posts.find((p: any) => p.id === a.postId),
      d = records.get("distributions", a.distributionId);
    if (
      !post ||
      post.snapshotId !== a.snapshotId ||
      d.termsId !== terms.id ||
      distributionState(records, d, at) === "stopped" ||
      !eligible(state, records, post, project, terms, policy, at)
    ) {
      if (distributionState(records, d, at) !== "stopped")
        transitionDistribution(state, records, d.id, "stopped", access, at);
      appendOnce(
        records,
        "exposure_events",
        project.id,
        a.id,
        {
          subjectId: policy.id,
          assignmentId: a.id,
          state: "invalidated",
          reason: "CURRENT_ELIGIBILITY_OR_TERMS_INVALID",
          evidenceRef: post?.eligibility?.id || "snapshot removed",
        },
        at,
      );
    } else retained.push(a);
  }
  const sampled = new Set(assignments.map((a: any) => a.snapshotId));
  const waitingPosts = state.posts.filter(
    (p: any) =>
      !sampled.has(p.snapshotId) &&
      eligible(state, records, p, project, terms, policy, at),
  );
  const grouped = new Map();
  for (const post of waitingPosts) {
    const list = grouped.get(post.creatorId) || [];
    list.push(post);
    grouped.set(post.creatorId, list);
  }
  const snapshot = (p: any) =>
    p.snapshots.find((s: any) => s.id === p.snapshotId);
  for (const list of grouped.values())
    list.sort(
      (a: any, b: any) =>
        snapshot(a).at.localeCompare(snapshot(b).at) ||
        a.id.localeCompare(b.id),
    );
  const previous = records.lastExposureRun(project.id, policy.id),
    cursorBefore = previous?.cursorAfter || null;
  const creators = [...grouped.keys()].sort();
  const ordered = [
    ...creators.filter((id: any) => cursorBefore === null || id > cursorBefore),
    ...creators.filter(
      (id: any) => cursorBefore !== null && id <= cursorBefore,
    ),
  ];
  const selected: any[] = [],
    waiting: any[] = [],
    invalidated = active.length - retained.length;
  let cursorAfter = cursorBefore;
  const distributions = [...rows(records, "distributions", project.id)];
  // One waiting snapshot per creator per pass. Persisted creator cursor crosses passes.
  for (const creatorId of ordered) {
    if (selected.length >= data.maxSlots) break;
    if (
      retained.filter((a: any) => a.creatorId === creatorId).length >=
      policy.maxActiveTrialsPerCreator
    ) {
      waiting.push({ creatorId, reason: "MAX_ACTIVE_TRIALS" });
      continue;
    }
    const post = grouped.get(creatorId)[0],
      c = policy.cohort;
    let d = distributions.find(
      (d: any) =>
        d.snapshotId === post.snapshotId &&
        d.termsId === terms.id &&
        d.channel === c.channel &&
        d.placement === c.placement &&
        d.paid === c.paid &&
        distributionState(records, d, at) !== "stopped",
    );
    if (!d)
      d = createDistribution(
        state,
        records,
        project.id,
        {
          postId: post.id,
          snapshotId: post.snapshotId,
          revision: post.revision,
          termsId: terms.id,
          channel: c.channel,
          placement: c.placement,
          paid: c.paid,
          destination: post.destination,
          payer: c.paid ? terms.budgetPayer : "unassigned",
          mode: "simulated",
        },
        access,
        at,
      );
    let reservation: any = null;
    if (c.paid) {
      try {
        reservation = reserveMedia(
          state,
          records,
          d.id,
          {
            idempotencyKey: `trial:${policy.id}:${post.snapshotId}`,
            amountCents: policy.trialAllocationCents,
          },
          access,
          at,
        );
      } catch (e: any) {
        if (
          !(e instanceof AppError) ||
          !/MEDIA_|NAMED_MEDIA_PAYER/.test(e.message)
        )
          throw e;
        waiting.push({
          creatorId,
          snapshotId: post.snapshotId,
          distributionId: d.id,
          reason: "WAITING_FOR_FUNDED_CAPACITY",
          detail: e.message,
        });
        continue;
      }
    }
    const assignment = appendOnce(
      records,
      "exposure_assignments",
      project.id,
      `${policy.id}:${post.snapshotId}`,
      {
        subjectId: policy.id,
        policyId: policy.id,
        creatorId,
        postId: post.id,
        snapshotId: post.snapshotId,
        distributionId: d.id,
        reservationId: reservation?.id || null,
        allocationCents: reservation?.amountCents || null,
        kind: c.paid ? "local_bounded_test_plan" : "first_party_preview",
        exposurePlan: policy.exposurePlan,
        cohort: c,
        deliveryEvidence: null,
      },
      at,
    );
    selected.push(assignment);
    cursorAfter = creatorId;
  }
  return appendOnce(
    records,
    "exposure_runs",
    project.id,
    key,
    {
      ...data,
      requestDigest: fingerprint(data),
      subjectId: policy.id,
      policyId: policy.id,
      cursorBefore,
      cursorAfter,
      assignments: selected,
      waiting,
      invalidated,
      status: selected.length
        ? "allocated"
        : waiting.length
          ? "pending"
          : "empty",
      liveCapability: "unavailable",
      disclosure:
        "Simulated local plan/preview only; no ad purchase, impressions or views. Grades do not authorize scaling.",
    },
    at,
  );
}

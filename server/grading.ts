import { z } from "zod";
import { requireProject } from "./access.ts";
import {
  appendOnce,
  basisInput,
  countsInput,
  sameBasis,
  subjectRows,
} from "./analytics-common.ts";
import { giftEvidence } from "./analytics-gifts.ts";
import type { DemoRecords, DemoState } from "./demo-types.ts";
import { AppError } from "./domain.ts";
import {
  admin,
  fingerprint,
  instant,
  money,
  positiveMoney,
  text,
} from "./finance-operations.ts";

export const ARITHMETIC =
  "grading-v2-js-binary64-sqrt-v1; no intermediate/display rounding; stored IEEE754 score; competition ties by exact stored Number";
export const WEIGHTS = Object.freeze({
  ctr: 15,
  views: 10,
  votes: 35,
  amount: 40,
});
const positive = z.number().finite().positive();
const configInput = z
  .object({
    idempotencyKey: text,
    policy: z.literal("grading-v2"),
    period: z.enum(["monthly", "final"]),
    basis: basisInput,
    audienceExposurePlan: text,
    comparableAllowanceCents: money.nullable(),
    ctrTarget: positive.max(1),
    viewTarget: positiveMoney,
    voteTarget: positiveMoney,
    amountTargetCents: positiveMoney,
    priorCTR: z.number().min(0).max(1),
    priorStrength: positive,
    minimumImpressions: positiveMoney,
    minimumViews: positiveMoney,
    reconciliationCutoff: instant,
  })
  .strict();
export function publishGradingConfig(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
  input: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  requireProject(state, campaignId, access, true);
  const data = configInput.parse(input);
  const key = fingerprint([data.period, data.basis]);
  const prior = records.get(
    "grading_configs",
    fingerprint([campaignId, "grading_configs", data.idempotencyKey]),
  );
  if (prior)
    return appendOnce(
      records,
      "grading_configs",
      campaignId,
      data.idempotencyKey,
      {
        ...data,
        windowKey: key,
        subjectId: key,
        weights: WEIGHTS,
        arithmetic: ARITHMETIC,
      },
      at,
    );
  if (
    at >= data.basis.startsAt ||
    data.reconciliationCutoff < data.basis.endsAt
  )
    throw new AppError(
      "GRADING_CONFIG_MUST_PRECEDE_WINDOW_AND_CUTOFF_FOLLOW_END",
      409,
    );
  if (subjectRows(records, "grading_configs", campaignId, key).length)
    throw new AppError("GRADING_WINDOW_ALREADY_CONFIGURED", 409);
  if (data.basis.paid && data.comparableAllowanceCents === null)
    throw new AppError("DECLARED_FUNDED_OPPORTUNITY_REQUIRED", 409);
  if (data.period === "monthly") {
    const start = new Date(data.basis.startsAt),
      end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    if (
      start.getUTCDate() !== 1 ||
      start.toISOString().slice(11) !== "00:00:00.000Z" ||
      end.toISOString() !== data.basis.endsAt
    )
      throw new AppError("EXPLICIT_CALENDAR_MONTH_REQUIRED", 409);
  }
  return appendOnce(
    records,
    "grading_configs",
    campaignId,
    data.idempotencyKey,
    {
      ...data,
      windowKey: key,
      subjectId: key,
      weights: WEIGHTS,
      arithmetic: ARITHMETIC,
    },
    at,
  );
}

export function recordMetricEvidence(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
  input: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  admin(access);
  requireProject(state, campaignId, access, true);
  const data = z
    .object({
      idempotencyKey: text,
      configId: text,
      creatorId: text,
      basis: basisInput,
      counts: countsInput,
      coverage: z.enum(["complete", "partial", "unknown"]),
      financialCoverage: z.enum(["complete", "partial", "unknown"]),
      evidenceRefs: z.array(text).min(1),
      distributionIds: z.array(text).min(1),
      exposure: z
        .object({
          plan: text,
          comparable: z.boolean().nullable(),
          allowanceCents: money.nullable(),
          evidenceRef: text,
        })
        .strict(),
      supersedesId: text.nullable(),
      correctionReason: text.nullable(),
    })
    .strict()
    .parse(input);
  const config = records.get("grading_configs", data.configId);
  if (
    !config ||
    config.campaignId !== campaignId ||
    !sameBasis(config.basis, data.basis)
  )
    throw new AppError("INCOMPATIBLE_METRIC_BASIS", 409);
  if (!state.creators.some((c: any) => c.id === data.creatorId))
    throw new AppError("Creator unavailable.", 404);
  if (new Set(data.distributionIds).size !== data.distributionIds.length)
    throw new AppError("Duplicate distribution evidence.");
  for (const id of data.distributionIds) {
    const d = records.get("distributions", id);
    if (
      !d ||
      d.campaignId !== campaignId ||
      d.creatorId !== data.creatorId ||
      d.channel !== data.basis.channel ||
      d.placement !== data.basis.placement ||
      d.paid !== data.basis.paid ||
      d.mode !== data.basis.mode
    )
      throw new AppError("INCOMPATIBLE_DISTRIBUTION_EVIDENCE", 409);
  }
  if (data.basis.endsAt > at)
    throw new AppError("MEASUREMENT_WINDOW_NOT_CLOSED", 409);
  if (
    data.counts.validOutboundClicks !== null &&
    data.counts.validImpressions !== null &&
    data.counts.validOutboundClicks > data.counts.validImpressions
  )
    throw new AppError("OUTBOUND_CLICKS_EXCEED_IMPRESSIONS");
  const subjectId = `${data.configId}:${data.creatorId}`;
  const prior = subjectRows(records, "metric_evidence", campaignId, subjectId);
  const same = prior.find((r: any) => r.idempotencyKey === data.idempotencyKey);
  if (!same && prior.length && !data.supersedesId)
    throw new AppError("APPEND_LINKED_METRIC_CORRECTION_REQUIRED", 409);
  if (data.supersedesId) {
    const previous = records.get("metric_evidence", data.supersedesId);
    if (!previous || previous.subjectId !== subjectId || !data.correctionReason)
      throw new AppError("INVALID_METRIC_CORRECTION", 409);
    if (!same && prior.some((r: any) => r.supersedesId === data.supersedesId))
      throw new AppError("STALE_METRIC_CORRECTION", 409);
  }
  return appendOnce(
    records,
    "metric_evidence",
    campaignId,
    data.idempotencyKey,
    {
      ...data,
      subjectId,
      disclosure:
        "Fictional simulated metric evidence; no external delivery verified.",
    },
    at,
  );
}

// Counts are aggregated before ratios. This pure seam has no money/award mutations.
export function gradeComponents(config: any, inputs: any) {
  const adjustedCTR =
    (inputs.validOutboundClicks + config.priorStrength * config.priorCTR) /
    (inputs.validImpressions + config.priorStrength);
  const components = {
    ctr: Math.min(1, adjustedCTR / config.ctrTarget),
    views: Math.min(1, Math.sqrt(inputs.validViews / config.viewTarget)),
    votes: Math.min(
      1,
      Math.sqrt(inputs.eligibleSettledGiftCount / config.voteTarget),
    ),
    amount: Math.min(
      1,
      Math.sqrt(inputs.netSettledEligibleGrossCents / config.amountTargetCents),
    ),
  };
  const score =
    WEIGHTS.ctr * components.ctr +
    WEIGHTS.views * components.views +
    WEIGHTS.votes * components.votes +
    WEIGHTS.amount * components.amount;
  return { adjustedCTR, components, score, arithmetic: ARITHMETIC };
}
export function evaluateGrade(
  config: any,
  evidence: any,
  financial: any,
  at: any,
) {
  const reasons: any[] = [];
  if (!config)
    return {
      status: "provisional",
      reasons: ["GRADING_CONFIGURATION_MISSING"],
      inputs: null,
      components: null,
      score: null,
    };
  if (at < config.reconciliationCutoff)
    reasons.push("RECONCILIATION_CUTOFF_PENDING");
  if (!evidence) reasons.push("METRIC_EVIDENCE_MISSING");
  else {
    if (!sameBasis(config.basis, evidence.basis))
      reasons.push("INCOMPATIBLE_METRIC_BASIS");
    if (evidence.coverage !== "complete")
      reasons.push("METRIC_COVERAGE_INCOMPLETE");
    if (evidence.financialCoverage !== "complete")
      reasons.push("DONATION_COVERAGE_INCOMPLETE");
    const n = evidence.counts;
    if (
      [n.validImpressions, n.validOutboundClicks, n.validViews].some(
        (v: any) => v === null,
      )
    )
      reasons.push("REQUIRED_METRIC_MISSING");
    if (
      n.validImpressions !== null &&
      (n.validImpressions <= 0 ||
        n.validImpressions < config.minimumImpressions)
    )
      reasons.push("INSUFFICIENT_IMPRESSIONS");
    if (n.validViews !== null && n.validViews < config.minimumViews)
      reasons.push("INSUFFICIENT_VIEWS");
    if (
      evidence.exposure.comparable !== true ||
      evidence.exposure.plan !== config.audienceExposurePlan ||
      evidence.exposure.allowanceCents !== config.comparableAllowanceCents
    )
      reasons.push("UNEQUAL_OR_UNKNOWN_EXPOSURE");
  }
  if (!financial) reasons.push("DONATION_EVIDENCE_MISSING");
  else reasons.push(...financial.reasons);
  const inputs =
    evidence && financial
      ? {
          ...evidence.counts,
          eligibleSettledGiftCount: financial.eligibleSettledGiftCount,
          netSettledEligibleGrossCents: financial.netSettledEligibleGrossCents,
        }
      : null;
  // Missing facts never enter arithmetic as zeros; provisional evidence keeps raw inputs.
  if (reasons.length)
    return {
      status: "provisional",
      reasons: [...new Set(reasons)],
      inputs,
      components: null,
      score: null,
    };
  return {
    status: "final",
    reasons: [] as any[],
    inputs,
    ...gradeComponents(config, inputs),
  };
}
export function publishGrade(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
  input: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  admin(access);
  requireProject(state, campaignId, access, true);
  const data = z
    .object({
      idempotencyKey: text,
      configId: text,
      creatorId: text,
      evidenceId: text.nullable(),
      supersedesId: text.nullable(),
      correctionReason: text.nullable(),
      correctionCutoff: instant.nullable(),
    })
    .strict()
    .parse(input);
  const config = records.get("grading_configs", data.configId);
  if (!config || config.campaignId !== campaignId)
    throw new AppError("GRADING_CONFIGURATION_MISSING", 409);
  const evidence = data.evidenceId
    ? records.get("metric_evidence", data.evidenceId)
    : null;
  const subjectId = `${config.id}:${data.creatorId}`;
  if (
    evidence &&
    (evidence.campaignId !== campaignId || evidence.subjectId !== subjectId)
  )
    throw new AppError("METRIC_EVIDENCE_SCOPE_MISMATCH", 409);
  if (data.evidenceId && !evidence)
    throw new AppError("Metric evidence unavailable.", 404);
  if (
    data.correctionCutoff &&
    (!data.supersedesId ||
      data.correctionCutoff < config.reconciliationCutoff ||
      data.correctionCutoff > at)
  )
    throw new AppError("INVALID_CORRECTION_CUTOFF", 409);
  const previous = subjectRows(
    records,
    "grade_snapshots",
    campaignId,
    subjectId,
  );
  const retry = previous.find(
    (r: any) => r.idempotencyKey === data.idempotencyKey,
  );
  if (retry) {
    if (fingerprint(data) !== retry.requestDigest)
      throw new AppError("IDEMPOTENCY_CONFLICT", 409);
    return retry;
  }
  if (previous.length && !data.supersedesId)
    throw new AppError("LINKED_GRADE_CORRECTION_REQUIRED", 409);
  if (
    data.supersedesId &&
    (!previous.some((r: any) => r.id === data.supersedesId) ||
      !data.correctionReason)
  )
    throw new AppError("INVALID_GRADE_CORRECTION", 409);
  if (
    data.supersedesId &&
    previous.some((r: any) => r.supersedesId === data.supersedesId)
  )
    throw new AppError("STALE_GRADE_CORRECTION", 409);
  const cutoff = data.correctionCutoff || config.reconciliationCutoff;
  const financial = giftEvidence(
    records,
    campaignId,
    config.basis,
    data.creatorId,
    cutoff,
    evidence?.distributionIds,
  );
  if (records.pendingCount(campaignId))
    financial.reasons.push("SOURCE_RECONCILIATION_PENDING");
  const result = evaluateGrade(config, evidence, financial, at);
  return appendOnce(
    records,
    "grade_snapshots",
    campaignId,
    data.idempotencyKey,
    {
      ...data,
      subjectId,
      requestDigest: fingerprint(data),
      config,
      evidence,
      financial,
      cutoff,
      ...result,
      arithmetic: ARITHMETIC,
      weights: WEIGHTS,
      financialEffect:
        "none; fixed 1000bps commission and seed promises remain independent",
    },
    at,
  );
}
export function gradeBoard(
  state: DemoState,
  records: DemoRecords,
  configId: any,
  access: any,
) {
  const config = records.get("grading_configs", configId);
  if (!config)
    return {
      status: "provisional",
      reasons: ["GRADING_CONFIGURATION_MISSING"],
      items: [] as any[],
      winnerIds: [] as any[],
    };
  requireProject(state, config.campaignId, access);
  const all = state.creators.flatMap((c: any) =>
    subjectRows(
      records,
      "grade_snapshots",
      config.campaignId,
      `${config.id}:${c.id}`,
    ),
  );
  const superseded = new Set(all.map((r: any) => r.supersedesId));
  const items = all
    .filter((r: any) => !superseded.has(r.id))
    .sort(
      (a: any, b: any) =>
        (b.score ?? -1) - (a.score ?? -1) ||
        a.creatorId.localeCompare(b.creatorId),
    );
  let lastScore,
    rank = 0,
    finalIndex = 0;
  for (const row of items) {
    row.rank = null;
    if (row.status === "final") {
      finalIndex++;
      if (row.score !== lastScore) rank = finalIndex;
      row.rank = rank;
      lastScore = row.score;
    }
  }
  return {
    config,
    items: items.filter(
      (r: any) => access.role !== "creator" || r.creatorId === access.creatorId,
    ),
    winnerIds: items
      .filter((r: any) => r.rank === 1)
      .map((r: any) => r.creatorId),
    disclosure: "Status only; no bonus or spending authorization.",
  };
}
export function rejectGradeObligation() {
  throw new AppError(
    "SEPARATELY_CONFIGURED_FUNDED_BONUS_OR_SCALING_POLICY_REQUIRED",
    409,
  );
}

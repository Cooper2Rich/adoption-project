import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  attributionEligibility,
  evaluateIntentCompletion,
} from "./attribution.ts";
import type { DemoRecords, DemoState } from "./demo-types.ts";
import { AppError, getProject } from "./domain.ts";
import { createContribution } from "./finance-contributions.ts";
import { appendJournal } from "./finance-journal.ts";
import { initialPosition, positionProjection } from "./finance-money.ts";
import { postOperation } from "./finance-operations.ts";
export {
  contributionInput,
  createContribution,
} from "./finance-contributions.ts";

const text = z.string().trim().min(1).max(200);
const money = z.number().int().nonnegative().safe();
const instant = z.iso
  .datetime({ offset: true })
  .transform((v: any) => new Date(v).toISOString());
const hash = (v: any) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const eventInput = z
  .object({
    contributionId: text,
    mode: z.literal("simulated").default("simulated"),
    source: text,
    sourceAccountId: text,
    sourceEventId: text,
    originalTransactionId: text,
    type: z.enum([
      "pending",
      "failed",
      "capture",
      "settlement",
      "refund",
      "dispute",
      "dispute_release",
      "dispute_loss",
      "attribution_resolution",
    ]),
    amountCents: money,
    effectiveAt: instant,
    evidenceRef: text,
    distributionId: text.optional(),
  })
  .strict()
  .refine(
    (d: any) => (d.type === "attribution_resolution") === !!d.distributionId,
    "Only attribution resolutions require a distribution.",
  );

// Cumulative subject amounts are monotone; duplicate evidence names add no money.
function nextPosition(
  state: DemoState,
  records: DemoRecords,
  c: any,
  event: any,
  p: any,
  historicalEligibility: any = undefined,
) {
  const next = { ...p };
  const n = event.amountCents;
  if (n > c.amountCents)
    throw new AppError(
      event.type === "refund" || event.type === "dispute_loss"
        ? "REFUND_EXCEEDS_CAPTURE"
        : "AMOUNT_EXCEEDS_INTENT",
      409,
    );
  if (event.type === "capture") {
    if (n <= p.capturedCents) return next;
    next.capturedCents = n;
    next.failed = false;
    if (c.purpose === "public") {
      const intent = records.get("gift_intents", c.intentId);
      const result =
        historicalEligibility ||
        (p.eligibility?.binding?.kind === "admin_adjudication"
          ? attributionEligibility(
              state,
              records,
              p.eligibility.binding.distributionId,
              event.effectiveAt,
            )
          : evaluateIntentCompletion(
              state,
              records,
              intent,
              event.effectiveAt,
            ));
      if (p.capturedCents && p.eligibility?.eligible && !result.eligible)
        throw new AppError("INSTALLMENT_ATTRIBUTION_INELIGIBLE", 409);
      next.eligibility = p.eligibility ||
        historicalEligibility || {
          eligible: result.eligible,
          reason: result.reason || null,
          binding: intent.binding,
          effectiveAt: event.effectiveAt,
        };
      next.creatorId = next.eligibility.eligible
        ? next.eligibility.binding.creatorId
        : null;
    }
  } else if (event.type === "attribution_resolution") {
    if (!p.capturedCents) return null;
    if (c.purpose !== "public" || p.eligibility?.eligible)
      throw new AppError("ATTRIBUTION_ALREADY_ALLOCATED", 409);
    if (event.effectiveAt !== p.eligibility?.effectiveAt)
      throw new AppError("ORIGINAL_COMPLETION_TIME_REQUIRED", 409);
    if (event.amountCents !== p.capturedCents)
      throw new AppError("CAPTURED_AMOUNT_REQUIRED", 409);
    const result =
      historicalEligibility ||
      attributionEligibility(
        state,
        records,
        event.distributionId,
        event.effectiveAt,
      );
    if (
      !historicalEligibility &&
      (!result.eligible || result.distribution.campaignId !== c.campaignId)
    )
      throw new AppError(
        "Eligible same-campaign historical evidence required.",
        409,
      );
    next.eligibility = historicalEligibility || {
      eligible: true,
      reason: null,
      effectiveAt: p.eligibility.effectiveAt,
      adjudicationSourceRecordId: event.id,
      binding: {
        kind: "admin_adjudication",
        distributionId: result.distribution.id,
        creatorId: result.distribution.creatorId,
        termsId: result.terms.id,
        snapshotId: result.distribution.snapshotId,
        evaluationId: result.distribution.evaluationId,
        evidenceRef: event.evidenceRef,
      },
    };
    next.creatorId = next.eligibility.binding.creatorId;
  } else if (event.type === "settlement") {
    if (!p.capturedCents || n > p.capturedCents) return null;
    next.settledCents = Math.max(n, p.settledCents);
  } else if (event.type === "refund" || event.type === "dispute_loss") {
    if (!p.capturedCents) return null;
    if (n > p.capturedCents) throw new AppError("REFUND_EXCEEDS_CAPTURE", 409);
    next.refundedCents = Math.max(n, p.refundedCents);
    if (event.type === "dispute_loss") next.disputed = false;
  } else if (event.type === "dispute" || event.type === "dispute_release") {
    if (!p.capturedCents) return null;
    if (!p.disputeEffectiveAt || event.effectiveAt >= p.disputeEffectiveAt) {
      next.disputed = event.type === "dispute";
      next.disputeEffectiveAt = event.effectiveAt;
    }
  } else if (event.type === "failed" && !p.capturedCents) next.failed = true;
  return next;
}
export function adjudicateContribution(
  state: DemoState,
  records: DemoRecords,
  contributionId: any,
  input: any,
  at: any = new Date().toISOString(),
) {
  const data = z
    .object({ distributionId: text, evidence: text })
    .strict()
    .parse(input);
  const c = records.get("contributions", contributionId),
    p = records.position(contributionId);
  if (!c || !p?.capturedCents || !p.eligibility)
    throw new AppError("Captured public suspense is required.", 409);
  const existing = records.sourceByKey(
    c.mode,
    c.source,
    c.sourceAccountId,
    `adjudication:${c.id}`,
  );
  return ingestEvent(
    state,
    records,
    {
      contributionId: c.id,
      source: c.source,
      sourceAccountId: c.sourceAccountId,
      originalTransactionId: c.originalTransactionId,
      sourceEventId: `adjudication:${c.id}`,
      type: "attribution_resolution",
      amountCents: existing?.amountCents ?? p.capturedCents,
      effectiveAt: p.eligibility.effectiveAt,
      evidenceRef: data.evidence,
      distributionId: data.distributionId,
    },
    at,
  );
}
function applyEvent(
  state: DemoState,
  records: DemoRecords,
  c: any,
  event: any,
  at: any,
) {
  const before = records.position(c.id);
  const next = nextPosition(state, records, c, event, before);
  if (!next) {
    records.setPending(event, true);
    return { state: "pending", position: before };
  }
  next.lastTransactionId = appendJournal(records, c, event, before, next, at);
  const position = records.putPosition(positionProjection(c, next));
  records.setPending(event, false);
  records.append("source_event_results", {
    id: randomUUID(),
    campaignId: c.campaignId,
    mode: c.mode,
    effectiveAt: at,
    sourceRecordId: event.id,
    contributionId: c.id,
    state: "applied",
    lastTransactionId: position.lastTransactionId,
  });
  if (position.creatorId) {
    const totals = records.operationTotals(c.campaignId, {
      creatorId: position.creatorId,
    });
    const recoveryCents = Math.max(
      0,
      totals.paidBaseCents -
        records.financeTotals(c.campaignId, c.mode, position.creatorId)
          .creatorCents,
    );
    const originalPeriod = records.periodAt(
      c.campaignId,
      position.eligibility.effectiveAt,
    );
    const delta = recoveryCents - totals.recoveryRecordedCents;
    if (delta)
      postOperation(
        records,
        c.campaignId,
        delta > 0 ? "recovery_hold" : "recovery_adjustment",
        { idempotencyKey: event.id },
        {
          creatorId: position.creatorId,
          purpose: "public",
          recoveryCents,
          recoveryRecordedCents: delta,
          correctingSourceRecordId: event.id,
          priorTransactionId: before.lastTransactionId,
          originalPeriodId: originalPeriod?.id || null,
        },
        [
          ["recovery:creator", delta],
          ["recovery:carry_forward", -delta],
        ],
        at,
      );
  }
  return { state: "applied", position };
}
export function ingestEvent(
  state: DemoState,
  records: DemoRecords,
  input: any,
  receivedAt: any = new Date().toISOString(),
) {
  const data = eventInput.parse(input);
  if (data.effectiveAt > receivedAt)
    throw new AppError("Future financial evidence is invalid.");
  const c = records.get("contributions", data.contributionId);
  if (!c) throw new AppError("Contribution unavailable.", 404);
  if (
    data.mode !== c.mode ||
    data.source !== c.source ||
    data.sourceAccountId !== c.sourceAccountId ||
    data.originalTransactionId !== c.originalTransactionId
  )
    throw new AppError("ORIGINAL_TRANSACTION_CONFLICT", 409);
  const payloadDigest = hash(data);
  const existing = records.sourceByKey(
    data.mode,
    data.source,
    data.sourceAccountId,
    data.sourceEventId,
  );
  if (existing) {
    if (existing.payloadDigest === payloadDigest)
      return {
        state: "duplicate",
        event: existing,
        position: records.position(c.id),
      };
    const conflictId = hash([existing.id, payloadDigest]);
    if (!records.get("source_conflicts", conflictId))
      records.append("source_conflicts", {
        id: conflictId,
        campaignId: c.campaignId,
        mode: c.mode,
        effectiveAt: receivedAt,
        sourceRecordId: existing.id,
        contributionId: c.id,
        originalContributionId: existing.contributionId,
        receivedDigest: payloadDigest,
        evidenceRef: data.evidenceRef,
        state: "held",
      });
    const original = records.get("contributions", existing.contributionId);
    records.putPosition(
      positionProjection(original, {
        ...records.position(original.id),
        conflicted: true,
      }),
    );
    if (original.id !== c.id)
      records.putPosition(
        positionProjection(c, { ...records.position(c.id), conflicted: true }),
      );
    return {
      state: "held",
      reason: "SOURCE_EVIDENCE_CONFLICT",
      event: existing,
      position: records.position(c.id),
    };
  }
  const event = records.append("source_events", {
    ...data,
    id: hash([
      data.mode,
      data.source,
      data.sourceAccountId,
      data.sourceEventId,
    ]),
    campaignId: c.campaignId,
    payloadDigest,
    receivedAt,
  });
  const result = applyEvent(state, records, c, event, receivedAt);
  // A bounded pass wakes prerequisites; no background polling is needed.
  const reconciliation =
    result.state === "applied" && ["capture", "settlement"].includes(data.type)
      ? reconcile(
          state,
          records,
          { campaignId: c.campaignId, mode: c.mode, contributionId: c.id },
          receivedAt,
        )
      : null;
  return { ...result, event, position: records.position(c.id), reconciliation };
}
export function reconcile(
  state: DemoState,
  records: DemoRecords,
  { campaignId, mode = "simulated", contributionId, cursor, limit = 100 }: any,
  at: any = new Date().toISOString(),
) {
  getProject(state, campaignId);
  const started = performance.now();
  const page = records.pendingPage({
    campaignId,
    mode,
    contributionId,
    cursor,
    limit,
  });
  let applied = 0;
  for (const event of page.items) {
    const c = records.get("contributions", event.contributionId);
    if (applyEvent(state, records, c, event, at).state === "applied") applied++;
  }
  return records.append("reconciliation_runs", {
    id: randomUUID(),
    campaignId,
    mode,
    effectiveAt: at,
    processed: page.items.length,
    applied,
    pending: page.items.length - applied,
    nextCursor: page.nextCursor,
    durationMs: performance.now() - started,
  });
}
// Read immutable processing order in <=100-row chunks; install only a complete
// rebuilt projection. Caller can persist/continue the returned checkpoint.
export function rebuildPosition(
  state: DemoState,
  records: DemoRecords,
  contributionId: any,
  checkpoint: any,
) {
  const c = records.get("contributions", contributionId);
  if (!c) throw new AppError("Contribution unavailable.", 404);
  let p = checkpoint?.position || initialPosition(c);
  if (p.id !== c.id) throw new AppError("Invalid rebuild scope.");
  const rows = records.appliedEventPage(c.id, checkpoint?.after || 0);
  let after = checkpoint?.after || 0;
  for (const row of rows.slice(0, 100)) {
    const event = records.get("source_events", row.result.sourceRecordId);
    const tx = row.result.lastTransactionId
      ? records.get("journal_transactions", row.result.lastTransactionId)
      : null;
    p = nextPosition(state, records, c, event, p, tx?.attribution);
    if (!p) throw new Error("Applied evidence lacks its recorded prerequisite");
    p.lastTransactionId = row.result.lastTransactionId;
    after = row.sequence;
  }
  if (rows.length > 100)
    return { processed: 100, checkpoint: { after, position: p } };
  p.conflicted = records.hasConflict(c.id);
  const position = records.putPosition(positionProjection(c, p));
  return { processed: rows.length, checkpoint: null, position };
}
export function publicFinance(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
) {
  const p = getProject(state, campaignId);
  if (p.status !== "active") throw new AppError("Campaign unavailable.", 404);
  const totals = records.financeTotals(campaignId);
  return {
    campaignId,
    mode: "simulated",
    currency: "USD",
    beneficiary: state.organizations.find(
      (o: any) => o.id === p.beneficiaryOrganizationId,
    )?.name,
    goalCents: p.goalCents ?? null,
    eligibleGrossCents: totals.publicGrossCents,
    refundCents: totals.publicRefundCents,
    netProgressCents: totals.publicNetCents,
    pendingCents: totals.pendingPublicCents,
    unallocatedCents: totals.unallocatedCents,
    heldCents: totals.publicHeldCents,
    simulationDisclosure:
      "Simulated gifts only. Creators receive 10%; beneficiary receives 90% before fees. No money is collected.",
  };
}
// Called only after the HTTP layer verifies the visitor owns this fixed intent.
export function confirmSimulatedGift(
  state: DemoState,
  records: DemoRecords,
  intent: any,
  at: any = new Date().toISOString(),
) {
  if (!intent?.amountCents)
    throw new AppError("FIXED_INTENT_AMOUNT_REQUIRED", 409);
  const c = createContribution(
    state,
    records,
    intent.campaignId,
    {
      source: "local-giving",
      sourceAccountId: "local-simulation",
      originalTransactionId: intent.id,
      originalEvidenceId: `intent:${intent.id}`,
      currency: "USD",
      amountCents: intent.amountCents,
      contributorType: "public_supporter",
      purpose: "public",
      consent: intent.simulationDisclosure,
      intentId: intent.id,
      effectiveAt: intent.effectiveAt,
    },
    at,
  );
  const existing = records.sourceByKey(
    c.mode,
    c.source,
    c.sourceAccountId,
    `${intent.id}:capture`,
  );
  const effectiveAt = existing?.effectiveAt || at;
  for (const type of ["capture", "settlement"])
    ingestEvent(
      state,
      records,
      {
        contributionId: c.id,
        source: c.source,
        sourceAccountId: c.sourceAccountId,
        originalTransactionId: c.originalTransactionId,
        sourceEventId: `${intent.id}:${type}`,
        type,
        amountCents: c.amountCents,
        effectiveAt,
        evidenceRef: `trusted-local-intent:${intent.id}`,
      },
      at,
    );
  const p = records.position(c.id);
  return {
    id: intent.id,
    mode: c.mode,
    currency: c.currency,
    amountCents: c.amountCents,
    state: p.state,
    creatorCents: p.creatorCents,
    beneficiaryCents: p.beneficiaryCents,
    unallocatedCents: p.unallocatedCents,
    votes: p.votes,
    simulationDisclosure: intent.simulationDisclosure,
  };
}

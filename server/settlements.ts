import { z } from "zod";
import { requireProject } from "./access.ts";
import type { DemoRecords, DemoState } from "./demo-types.ts";
import { AppError } from "./domain.ts";
import { checked } from "./finance-money.ts";
import {
  admin,
  fingerprint,
  operationId,
  postOperation,
  text,
} from "./finance-operations.ts";
import { week } from "./seed-commitments.ts";
import {
  creatorStatement,
  historicalEarnings,
} from "./settlement-statements.ts";

export { creatorStatement } from "./settlement-statements.ts";
export function definePeriod(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
  input: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  admin(access);
  requireProject(state, campaignId, access, true);
  const data = week.parse(input),
    id = fingerprint([campaignId, "week", data.startsAt]);
  const existing = records.get("settlement_periods", id);
  if (existing) {
    if (existing.endsAt !== data.endsAt || existing.cutoff !== data.cutoff)
      throw new AppError("PERIOD_CONFLICT", 409);
    return existing;
  }
  if (
    records.periodAt(campaignId, data.startsAt) ||
    records.periodAt(
      campaignId,
      new Date(Date.parse(data.endsAt) - 1).toISOString(),
    )
  )
    throw new AppError("OVERLAPPING_WEEK", 409);
  return records.append("settlement_periods", {
    ...data,
    id,
    campaignId,
    mode: "simulated",
    effectiveAt: at,
    configuredBy: "admin",
  });
}
export function getPeriod(records: DemoRecords, campaignId: any, id: any) {
  const p = records.get("settlement_periods", id);
  if (!p || p.campaignId !== campaignId)
    throw new AppError("Settlement period unavailable.", 404);
  return p;
}
export function previewSettlement(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
  periodId: any,
  creatorId: any,
  access: any,
): Record<string, any> {
  requireProject(state, campaignId, access);
  if (access.role === "creator" && access.creatorId !== creatorId)
    throw new AppError("Statement unavailable.", 404);
  if (!state.creators.some((c: any) => c.id === creatorId))
    throw new AppError("Creator unavailable.", 404);
  return creatorStatement(
    records,
    campaignId,
    creatorId,
    getPeriod(records, campaignId, periodId),
  );
}
const csvCell = (v: any) => `"${String(v).replaceAll('"', '""')}"`;
function csvManifest(manifest: any) {
  const keys = [
    "batchId",
    "transferIntentId",
    "campaignId",
    "creatorId",
    "mode",
    "currency",
    "periodId",
    "cutoff",
    "baseCents",
    "topUpCents",
    "amountCents",
    "journalSourceIds",
  ];
  return (
    [
      keys.join(","),
      ...manifest.lines.map((l: any) =>
        keys
          .map((k: any) => csvCell(Array.isArray(l[k]) ? l[k].join("|") : l[k]))
          .join(","),
      ),
    ].join("\n") + "\n"
  );
}
export function approveBatch(
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
      periodId: text,
      creatorIds: z.array(text).min(1).max(100),
      mode: z.literal("simulated").default("simulated"),
    })
    .strict()
    .parse(input);
  data.creatorIds = [...new Set(data.creatorIds)].sort();
  const id = fingerprint([campaignId, "batch", data.idempotencyKey]),
    existing = records.get("settlement_manifests", id);
  if (existing) {
    if (existing.inputDigest !== fingerprint(data))
      throw new AppError("IDEMPOTENCY_CONFLICT", 409);
    return existing;
  }
  const period = getPeriod(records, campaignId, data.periodId);
  if (at < period.cutoff) throw new AppError("WEEK_CUTOFF_NOT_REACHED", 409);
  const lines: any[] = [];
  for (const creatorId of data.creatorIds) {
    const statement = previewSettlement(
      state,
      records,
      campaignId,
      period.id,
      creatorId,
      access,
    );
    if (
      statement.heldReasons.length ||
      statement.guaranteePending ||
      statement.recoveryHold
    )
      throw new AppError(
        `SETTLEMENT_HOLD: ${statement.heldReasons.join(",") || "RECOVERY"}`,
        409,
      );
    if (!statement.payableCents) continue;
    const current = historicalEarnings(records, campaignId, creatorId, {
      ...period,
      endsAt: new Date(Date.parse(at) + 1).toISOString(),
      cutoff: at,
    });
    const currentTotals = records.operationTotals(campaignId, { creatorId });
    if (
      current.heldReasons.length ||
      current.settledEligibleCommissionCents <
        currentTotals.reservedBaseCents +
          currentTotals.paidBaseCents +
          statement.basePayableCents
    )
      throw new AppError("STALE_BATCH_RECOVERY_OR_FUNDING_HOLD", 409);
    const additionalSources: any[] = [];
    for (const adjustment of statement.guaranteeAdjustments.filter(
      (a: any) => a.newTopUpCents,
    )) {
      const r = records.get("reservations", adjustment.reservationId),
        n = adjustment.newTopUpCents;
      const balance = records.operationTotals(campaignId, {
        reservationId: r.id,
      });
      if (balance.reservedGuaranteeCents < n)
        throw new AppError("SEED_SHORTFALL_HOLD", 409);
      const topUp = postOperation(
        records,
        campaignId,
        "guarantee_top_up",
        { idempotencyKey: `${r.id}:${adjustment.topUpCents}` },
        {
          reservationId: r.id,
          creatorId,
          termsId: r.termsId,
          purpose: "seed",
          originalPeriodId: adjustment.originalPeriodId,
          reservedGuaranteeCents: -n,
          usedGuaranteeCents: n,
        },
        [
          ["reserve:guarantee", n],
          ["creator:seed_top_up", -n],
        ],
        at,
      );
      additionalSources.push(topUp.sourceRecordId);
      if (adjustment.originalPeriodId !== period.id)
        statement.adjustments.push({
          sourceRecordId: topUp.sourceRecordId,
          originalPeriodId: adjustment.originalPeriodId,
          adjustmentPeriodId: period.id,
          kind: "seed_top_up",
          reservationId: r.id,
        });
    }
    const n = statement.basePayableCents,
      top = statement.topUpPayableCents;
    const approval = postOperation(
      records,
      campaignId,
      "batch_reserve",
      { idempotencyKey: `${id}:${creatorId}` },
      {
        batchId: id,
        creatorId,
        originalPeriodId: period.id,
        purpose: "public",
        reservedBaseCents: n,
        reservedTopUpCents: top,
      },
      [
        ["creator", n, "public"],
        ["reserve:payment", -n, "public"],
        ["creator:seed_top_up", top, "seed"],
        ["reserve:payment", -top, "seed"],
      ],
      at,
    );
    lines.push({
      batchId: id,
      transferIntentId: `${id}:${creatorId}:transfer`,
      campaignId,
      creatorId,
      mode: "simulated",
      currency: "USD",
      periodId: period.id,
      cutoff: period.cutoff,
      baseCents: n,
      topUpCents: top,
      amountCents: checked(BigInt(n) + BigInt(top)),
      journalSourceIds: [
        ...statement.journalSourceIds,
        ...additionalSources,
        approval.sourceRecordId,
      ].sort(),
      adjustments: statement.adjustments,
    });
  }
  if (!lines.length) throw new AppError("NO_RECONCILED_PAYABLE_LIABILITY", 409);
  const manifest = {
    batchId: id,
    campaignId,
    mode: "simulated",
    currency: "USD",
    periodId: period.id,
    cutoff: period.cutoff,
    approvedBy: "admin",
    approvedAt: at,
    status: "approved",
    disclosure:
      "Local simulation. Export is not payment. Live transfers require verified adapter capability.",
    lines,
  };
  return records.append("settlement_manifests", {
    id,
    campaignId,
    mode: "simulated",
    effectiveAt: at,
    idempotencyKey: data.idempotencyKey,
    inputDigest: fingerprint(data),
    manifest,
    json: JSON.stringify(manifest, null, 2) + "\n",
    csv: csvManifest(manifest),
  });
}
export function exportBatch(
  state: DemoState,
  records: DemoRecords,
  id: any,
  access: any,
  format: any = "json",
) {
  admin(access);
  const batch = records.get("settlement_manifests", id);
  if (!batch) throw new AppError("Settlement batch unavailable.", 404);
  requireProject(state, batch.campaignId, access);
  if (!["json", "csv"].includes(format))
    throw new AppError("Invalid settlement export format.");
  return {
    batchId: id,
    format,
    content: batch[format],
    status: "approved",
    disclosure: "Export is not payment.",
  };
}
export function executeBatch(
  state: DemoState,
  records: DemoRecords,
  id: any,
  input: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  admin(access);
  const data = z
    .object({
      idempotencyKey: text,
      outcome: z.enum(["simulated_paid", "failed", "unknown"]),
      mode: z.literal("simulated").default("simulated"),
      evidenceRef: text,
    })
    .strict()
    .parse(input);
  const batch = records.get("settlement_manifests", id);
  if (!batch) throw new AppError("Settlement batch unavailable.", 404);
  requireProject(state, batch.campaignId, access, true);
  const resultId = fingerprint([id, data.idempotencyKey]),
    prior = records.get("settlement_results", resultId);
  if (prior) {
    if (prior.inputDigest !== fingerprint(data))
      throw new AppError("IDEMPOTENCY_CONFLICT", 409);
    return prior;
  }
  const intents: any[] = [];
  for (const line of batch.manifest.lines) {
    const paymentId = operationId(
        batch.campaignId,
        "simulated_payment",
        line.transferIntentId,
      ),
      payment = records.get("finance_operations", paymentId);
    if (payment) {
      intents.push({
        transferIntentId: line.transferIntentId,
        status: "simulated_paid",
      });
      continue;
    }
    if (data.outcome === "simulated_paid") {
      // Revalidate against NOW, including refunds and holds after immutable approval.
      const current = historicalEarnings(
        records,
        batch.campaignId,
        line.creatorId,
        {
          ...batch.manifest,
          id: batch.manifest.periodId,
          startsAt: "0000-01-01T00:00:00.000Z",
          endsAt: new Date(Date.parse(at) + 1).toISOString(),
          cutoff: at,
        },
      );
      const totals = records.operationTotals(batch.campaignId, {
        creatorId: line.creatorId,
      });
      const seed = records.financeTotals(batch.campaignId),
        commitments = records.operationTotals(batch.campaignId);
      if (
        current.heldReasons.length ||
        records.pendingCount(batch.campaignId) ||
        current.settledEligibleCommissionCents <
          totals.reservedBaseCents + totals.paidBaseCents ||
        seed.availableSeedGuaranteeCents <
          commitments.reservedGuaranteeCents + commitments.usedGuaranteeCents
      )
        throw new AppError("STALE_BATCH_RECOVERY_OR_FUNDING_HOLD", 409);
      postOperation(
        records,
        batch.campaignId,
        "simulated_payment",
        { idempotencyKey: line.transferIntentId },
        {
          batchId: id,
          creatorId: line.creatorId,
          originalPeriodId: line.periodId,
          purpose: "public",
          transferIntentId: line.transferIntentId,
          reservedBaseCents: -line.baseCents,
          reservedTopUpCents: -line.topUpCents,
          paidBaseCents: line.baseCents,
          paidTopUpCents: line.topUpCents,
        },
        [
          ["reserve:payment", line.baseCents, "public"],
          ["available", -line.baseCents, "public"],
          ["reserve:payment", line.topUpCents, "seed"],
          ["available", -line.topUpCents, "seed"],
        ],
        at,
      );
    }
    intents.push({
      transferIntentId: line.transferIntentId,
      status: data.outcome,
    });
  }
  return records.append("settlement_results", {
    id: resultId,
    campaignId: batch.campaignId,
    mode: "simulated",
    effectiveAt: at,
    batchId: id,
    inputDigest: fingerprint(data),
    evidenceRef: data.evidenceRef,
    status: intents.every((i: any) => i.status === "simulated_paid")
      ? "simulated_paid"
      : data.outcome,
    intents,
  });
}

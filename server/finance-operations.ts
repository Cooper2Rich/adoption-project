import { createHash } from "node:crypto";
import { z } from "zod";
import type { DemoRecords } from "./demo-types.ts";
import { AppError } from "./domain.ts";

export const money = z.number().int().nonnegative().safe();
export const positiveMoney = money.refine((n: any) => n > 0);
export const text = z.string().trim().min(1).max(200);
export const instant = z.iso
  .datetime({ offset: true })
  .transform((s: any) => new Date(s).toISOString());
export const fingerprint = (data: any) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex");
export const operationId = (campaignId: any, kind: any, key: any) =>
  fingerprint([campaignId, kind, key]);
export function admin(access: any) {
  if (access.role !== "admin")
    throw new AppError("Admin finance approval required.", 403);
}
export function replay(
  records: DemoRecords,
  campaignId: any,
  kind: any,
  data: any,
) {
  const prior = records.get(
    "finance_operations",
    operationId(campaignId, kind, data.idempotencyKey),
  );
  if (prior && prior.inputDigest !== fingerprint(data))
    throw new AppError("IDEMPOTENCY_CONFLICT", 409);
  return prior;
}

// Internal source facts use the same accepted-source/journal closure protocol as gifts.
// The operation is inserted before its source; the result closes it AFTER the lines.
export function postOperation(
  records: DemoRecords,
  campaignId: any,
  kind: any,
  data: any,
  details: any,
  lines: any,
  at: any,
) {
  const prior = replay(records, campaignId, kind, data);
  if (prior) return prior;
  const id = operationId(campaignId, kind, data.idempotencyKey);
  const op = records.append("finance_operations", {
    ...details,
    id,
    campaignId,
    mode: "simulated",
    currency: "USD",
    kind,
    effectiveAt: data.effectiveAt || at,
    recordedAt: at,
    inputDigest: fingerprint(data),
    idempotencyKey: data.idempotencyKey,
    sourceRecordId: `${id}:source`,
    transactionId: `${id}:journal`,
  });
  const source = records.append("source_events", {
    id: op.sourceRecordId,
    campaignId,
    mode: "simulated",
    effectiveAt: op.effectiveAt,
    receivedAt: at,
    sourceKind: "finance_operation",
    contributionId: id,
    source: "local-finance",
    sourceAccountId: campaignId,
    sourceEventId: id,
    type: kind,
    payloadDigest: op.inputDigest,
    evidenceRef: data.evidenceRef || kind,
  });
  records.append("journal_transactions", {
    id: op.transactionId,
    campaignId,
    mode: "simulated",
    currency: "USD",
    effectiveAt: op.effectiveAt,
    recordedAt: at,
    sourceRecordId: source.id,
    sourceEventId: source.sourceEventId,
    contributionId: id,
    type: kind,
    creatorId: details.creatorId || null,
    termsId: details.termsId || null,
    priorTransactionId: details.priorTransactionId || null,
    originalPeriodId: details.originalPeriodId || null,
    creatorCommissionBps: 1000,
  });
  for (const [i, line] of lines.filter((l: any) => l[1]).entries())
    records.append("journal_entries", {
      id: `${op.transactionId}:${i}`,
      campaignId,
      mode: "simulated",
      currency: "USD",
      effectiveAt: op.effectiveAt,
      transactionId: op.transactionId,
      sourceRecordId: source.id,
      contributionId: id,
      account: line[0],
      purpose: line[2] || details.purpose || "seed",
      debitCents: Math.max(0, line[1]),
      creditCents: Math.max(0, -line[1]),
    });
  // Zero-value obligations still have a balanced, nonempty memo journal.
  if (!lines.some((l: any) => l[1]))
    throw new AppError("Zero financial operation is unnecessary.");
  records.append("source_event_results", {
    id: `${id}:result`,
    campaignId,
    mode: "simulated",
    effectiveAt: at,
    sourceRecordId: source.id,
    contributionId: id,
    state: "applied",
    lastTransactionId: op.transactionId,
  });
  return op;
}

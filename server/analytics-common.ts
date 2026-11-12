import { z } from "zod";
import type { DemoRecords } from "./demo-types.ts";
import { AppError } from "./domain.ts";
import {
  fingerprint,
  instant,
  money,
  operationId,
  text,
} from "./finance-operations.ts";

export const basisInput = z
  .object({
    channel: text,
    placement: text,
    paid: z.boolean(),
    cohortId: text,
    source: text,
    mode: z.literal("simulated"),
    definitionVersion: text,
    viewDefinition: text,
    startsAt: instant,
    endsAt: instant,
  })
  .strict()
  .refine(
    (b: any) => b.startsAt < b.endsAt,
    "Nonempty measurement window required",
  );
export const countsInput = z
  .object({
    validImpressions: money.nullable(),
    validOutboundClicks: money.nullable(),
    validViews: money.nullable(),
    allClicks: money.nullable(),
    eligibleLandingVisits: money.nullable(),
  })
  .strict();
export function* rows(
  records: DemoRecords,
  table: any,
  campaignId: any,
  through: any = undefined,
) {
  let cursor;
  do {
    const page: any = records.page(table, {
      campaignId,
      limit: 100,
      cursor,
      through,
    });
    yield* page.items;
    cursor = page.nextCursor;
  } while (cursor);
}
export function subjectRows(
  records: DemoRecords,
  table: any,
  campaignId: any,
  subjectId: any,
) {
  const result: any[] = [];
  let after = "";
  for (;;) {
    const page = records.analyticsSubject(table, campaignId, subjectId, after);
    result.push(...page);
    if (page.length < 100) return result;
    after = page.at(-1).id;
  }
}
export function sameBasis(a: any, b: any) {
  return fingerprint(a) === fingerprint(b);
}
export function appendOnce(
  records: DemoRecords,
  table: any,
  campaignId: any,
  key: any,
  data: any,
  at: any,
) {
  const id = operationId(campaignId, table, key),
    prior = records.get(table, id);
  if (prior) {
    if (prior.inputDigest !== fingerprint(data))
      throw new AppError("IDEMPOTENCY_CONFLICT", 409);
    return prior;
  }
  return records.append(table, {
    ...data,
    id,
    campaignId,
    mode: "simulated",
    effectiveAt: at,
    inputDigest: fingerprint(data),
  });
}
export function scopedCreator(access: any, creatorId: any) {
  if (access.role === "creator" && access.creatorId !== creatorId)
    throw new AppError("Creator report unavailable.", 404);
}

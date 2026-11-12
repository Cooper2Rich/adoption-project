import { z } from "zod";
import type { DemoRecords, DemoState } from "./demo-types.ts";
import { AppError } from "./domain.ts";
import { checked } from "./finance-money.ts";
import {
  admin,
  instant,
  operationId,
  positiveMoney,
  postOperation,
  replay,
  text,
} from "./finance-operations.ts";

export const week = z
  .object({ startsAt: instant, endsAt: instant, cutoff: instant })
  .strict()
  .refine(
    (p: any) =>
      p.startsAt.endsWith("T00:00:00.000Z") &&
      Date.parse(p.endsAt) - Date.parse(p.startsAt) === 7 * 86400000 &&
      p.cutoff >= p.endsAt,
    "Exact UTC seven-day period and cutoff required.",
  );
export const guaranteePolicy = z
  .object({
    floorCents: positiveMoney,
    creatorIds: z.array(text).min(1).max(100),
    periodStart: instant,
    periodEnd: instant,
    cutoff: instant,
    maxTotalLiabilityCents: positiveMoney,
  })
  .strict()
  .refine(
    (g: any) =>
      week.safeParse({
        startsAt: g.periodStart,
        endsAt: g.periodEnd,
        cutoff: g.cutoff,
      }).success &&
      new Set(g.creatorIds).size === g.creatorIds.length &&
      BigInt(g.floorCents) * BigInt(g.creatorIds.length) ===
        BigInt(g.maxTotalLiabilityCents),
    "Finite exact weekly maximum required.",
  );
export const appUsePolicy = z
  .object({
    obligationId: text,
    amountCents: positiveMoney,
    recipientId: text,
    trigger: text,
  })
  .strict();
export const mediaPolicy = z
  .object({
    campaignLifetimeCapCents: positiveMoney,
    distributionCapCents: positiveMoney,
    dailyCapCents: positiveMoney.nullable().default(null),
    payerId: text,
  })
  .strict()
  .refine(
    (v: any) => v.distributionCapCents <= v.campaignLifetimeCapCents,
    "Distribution cap exceeds lifetime cap.",
  );

export function seedCapacity(records: DemoRecords, campaignId: any) {
  const funding = records.financeTotals(campaignId),
    used = records.operationTotals(campaignId);
  return {
    guaranteeCents:
      funding.availableSeedGuaranteeCents -
      used.reservedGuaranteeCents -
      used.usedGuaranteeCents,
    appUseCents:
      funding.availableSeedAppUseCents -
      used.reservedAppUseCents -
      used.usedAppUseCents,
  };
}
function reserveCommitment(
  records: DemoRecords,
  campaignId: any,
  key: any,
  amountCents: any,
  kind: any,
  details: any,
  at: any,
) {
  const id = operationId(campaignId, "seed_commitment", key),
    existing = records.get("reservations", id);
  if (existing) {
    for (const field of [
      "amountCents",
      "creatorId",
      "periodStart",
      "periodEnd",
      "cutoff",
      "recipientId",
      "trigger",
      "obligationId",
    ])
      if (
        (existing[field] ?? null) !==
        ({ amountCents, ...details }[field] ?? null)
      )
        throw new AppError(
          "COMMITMENT_CONFLICT: existing promise is immutable.",
          409,
        );
    return existing;
  }
  const capacity = seedCapacity(records, campaignId);
  if (
    capacity[kind === "guarantee" ? "guaranteeCents" : "appUseCents"] <
    amountCents
  )
    throw new AppError(
      `SEED_SHORTFALL: ${kind} commitment exceeds settled eligible funding.`,
      409,
    );
  const row = records.append("reservations", {
    id,
    idempotencyKey: id,
    campaignId,
    mode: "simulated",
    effectiveAt: at,
    kind,
    amountCents,
    ...details,
  });
  const field =
    kind === "guarantee" ? "reservedGuaranteeCents" : "reservedAppUseCents";
  postOperation(
    records,
    campaignId,
    "seed_commitment",
    { idempotencyKey: key },
    { reservationId: id, purpose: "seed", ...details, [field]: amountCents },
    [
      [`seed:${kind === "guarantee" ? "guarantee" : "app_use"}`, amountCents],
      [`reserve:${kind}`, -amountCents],
    ],
    at,
  );
  return row;
}
export function reserveSeedCommitments(
  state: DemoState,
  records: DemoRecords,
  terms: any,
  at: any,
) {
  if (terms.appUseAllocationCents && !terms.appUse)
    throw new AppError(
      "Named app-use recipient, obligation and trigger required.",
    );
  if (terms.appUse && terms.appUseAllocationCents !== terms.appUse.amountCents)
    throw new AppError(
      "App-use allocation must equal its explicit obligation.",
    );
  if (terms.guarantee) {
    const g = terms.guarantee;
    if (g.periodStart < terms.startsAt || g.periodEnd > terms.endsAt)
      throw new AppError(
        "Guarantee must name a finite week within campaign terms.",
      );
    for (const creatorId of g.creatorIds) {
      if (!state.creators.some((c: any) => c.id === creatorId))
        throw new AppError("Named guarantee creator unavailable.");
      reserveCommitment(
        records,
        terms.campaignId,
        `guarantee:${creatorId}:${g.periodStart}`,
        g.floorCents,
        "guarantee",
        {
          termsId: terms.id,
          creatorId,
          periodStart: g.periodStart,
          periodEnd: g.periodEnd,
          cutoff: g.cutoff,
        },
        at,
      );
    }
  }
  if (terms.appUse) {
    const a = terms.appUse;
    if (
      ![...state.organizations, ...state.creators].some(
        (r: any) => r.id === a.recipientId,
      )
    )
      throw new AppError("Named app-use recipient unavailable.");
    reserveCommitment(
      records,
      terms.campaignId,
      `app_use:${a.obligationId}`,
      a.amountCents,
      "app_use",
      { ...a, termsId: terms.id },
      at,
    );
  }
  const remaining = seedCapacity(records, terms.campaignId);
  if (remaining.guaranteeCents < 0 || remaining.appUseCents < 0)
    throw new AppError(
      "SEED_SHORTFALL: existing promises remain held until funded.",
      409,
    );
}
export function chargeAppUse(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
  input: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  admin(access);
  const data = z
    .object({
      obligationId: text,
      trigger: text,
      evidenceRef: text,
      mode: z.literal("simulated").default("simulated"),
    })
    .strict()
    .parse(input);
  const id = operationId(
      campaignId,
      "seed_commitment",
      `app_use:${data.obligationId}`,
    ),
    reservation = records.get("reservations", id);
  if (
    !reservation ||
    reservation.kind !== "app_use" ||
    reservation.campaignId !== campaignId
  )
    throw new AppError("App-use commitment unavailable.", 404);
  if (data.trigger !== reservation.trigger)
    throw new AppError("APP_USE_TRIGGER_MISMATCH", 409);
  const key = `app_use:${data.obligationId}`,
    payload = { ...data, idempotencyKey: key };
  const prior = replay(records, campaignId, "app_use_charge", payload);
  if (prior) return prior;
  const funding = records.financeTotals(campaignId),
    totals = records.operationTotals(campaignId);
  if (
    funding.availableSeedAppUseCents <
    totals.reservedAppUseCents + totals.usedAppUseCents
  )
    throw new AppError("SEED_SHORTFALL_HOLD", 409);
  const n = checked(BigInt(reservation.amountCents));
  return postOperation(
    records,
    campaignId,
    "app_use_charge",
    payload,
    {
      reservationId: id,
      recipientId: reservation.recipientId,
      obligationId: reservation.obligationId,
      termsId: reservation.termsId,
      purpose: "seed",
      reservedAppUseCents: -n,
      usedAppUseCents: n,
    },
    [
      ["reserve:app_use", n],
      ["seed:app_use_payable", -n],
      ["seed:app_use_expense", n],
      ["seed:app_use_expense_offset", -n],
    ],
    at,
  );
}

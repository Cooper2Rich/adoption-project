import { z } from "zod";
import { requireProject } from "./access.ts";
import type { DemoRecords, DemoState } from "./demo-types.ts";
import { AppError, getPost, getProject } from "./domain.ts";
import { currentEligibility, refreshEligibility } from "./eligibility.ts";
import {
  admin,
  instant,
  operationId,
  positiveMoney,
  postOperation,
  replay,
  text,
} from "./finance-operations.ts";

export function mediaBalance(
  records: DemoRecords,
  campaignId: any,
  filter: any = {},
) {
  const funding = records.financeTotals(campaignId),
    totals = records.operationTotals(campaignId, filter);
  return {
    ...totals,
    settledFundingCents: funding.availableMediaCents,
    availableCents:
      funding.availableMediaCents -
      totals.reservedMediaCents -
      totals.spentMediaCents,
    deficitCents: Math.max(
      0,
      totals.reservedMediaCents +
        totals.spentMediaCents -
        funding.availableMediaCents,
    ),
    held:
      totals.overrunCents > 0 ||
      funding.availableMediaCents <
        totals.reservedMediaCents + totals.spentMediaCents,
  };
}
function distributionAccess(
  state: DemoState,
  records: DemoRecords,
  id: any,
  access: any,
) {
  const d = records.get("distributions", id);
  if (!d) throw new AppError("Distribution unavailable.", 404);
  const project = requireProject(state, d.campaignId, access);
  if (access.role === "creator" && d.creatorId !== access.creatorId)
    throw new AppError("Distribution unavailable.", 404);
  return { d, project, terms: records.get("offer_versions", d.termsId) };
}
export function reserveMedia(
  state: DemoState,
  records: DemoRecords,
  distributionId: any,
  input: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  const data = z
    .object({
      idempotencyKey: text,
      amountCents: positiveMoney,
      mode: z.literal("simulated").default("simulated"),
    })
    .strict()
    .parse(input);
  const { d, project, terms } = distributionAccess(
    state,
    records,
    distributionId,
    access,
  );
  const payload = { ...data, distributionId };
  const prior = replay(records, d.campaignId, "media_reserve", payload);
  if (prior) return records.get("reservations", prior.reservationId);
  if (!d.paid || !terms.mediaBudget)
    throw new AppError("MEDIA_BOUNDED_CAPS_REQUIRED", 409);
  const budget = terms.mediaBudget;
  if (
    (d.payer === "owner" && budget.payerId !== project.ownerOrganizationId) ||
    (d.payer === "sponsor" &&
      !project.sponsorOrganizationIds.includes(budget.payerId)) ||
    (d.payer === "creator" && budget.payerId !== d.creatorId) ||
    terms.budgetPayer !== d.payer ||
    d.payer === "unassigned"
  )
    throw new AppError("NAMED_MEDIA_PAYER_REQUIRED", 409);
  // A creator can commit only their own external funds; owner/sponsor funds need the owner/Admin.
  if (d.payer !== "creator") requireProject(state, d.campaignId, access, true);
  const event = records.distributionStateAt(d.campaignId, d.id, at);
  refreshEligibility(state);
  const post = getPost(state, d.postId);
  if (
    project.offerState !== "open" ||
    project.status !== "active" ||
    project.offerVersionId !== terms.id ||
    at < terms.startsAt ||
    at >= terms.endsAt ||
    event?.state === "stopped" ||
    post.snapshotId !== d.snapshotId ||
    !currentEligibility(post, project)
  )
    throw new AppError("MEDIA_NEW_COMMITMENTS_PAUSED_OR_INELIGIBLE", 409);
  const balance = mediaBalance(records, d.campaignId),
    lifetime = records.operationTotals(d.campaignId),
    distribution = records.operationTotals(d.campaignId, { distributionId });
  if (balance.held)
    throw new AppError("MEDIA_RECONCILIATION_DEFICIT_HOLD", 409);
  const committed = (n: any) =>
    BigInt(n.reservedMediaCents) +
    BigInt(n.spentMediaCents) +
    BigInt(n.creatorMediaCostCents) +
    BigInt(n.creatorReservedCents || 0);
  // External creator reservations use the same cap counter, separate from Slander cash.
  const creatorReserved = records.creatorMediaReserved(d.campaignId),
    distributionCreatorReserved = records.creatorMediaReserved(
      d.campaignId,
      distributionId,
    );
  if (
    committed(lifetime) + BigInt(creatorReserved) + BigInt(data.amountCents) >
      BigInt(budget.campaignLifetimeCapCents) ||
    committed(distribution) +
      BigInt(distributionCreatorReserved) +
      BigInt(data.amountCents) >
      BigInt(budget.distributionCapCents)
  )
    throw new AppError("MEDIA_CAP_EXCEEDED", 409);
  const day = at.slice(0, 10),
    daily = records.operationTotals(d.campaignId, { day });
  if (
    budget.dailyCapCents &&
    committed(daily) +
      BigInt(records.creatorMediaReserved(d.campaignId, null, day)) +
      BigInt(data.amountCents) >
      BigInt(budget.dailyCapCents)
  )
    throw new AppError("MEDIA_UTC_DAILY_CAP_EXCEEDED", 409);
  if (d.payer !== "creator" && balance.availableCents < data.amountCents)
    throw new AppError("MEDIA_FUNDING_SHORTFALL", 409);
  const id = operationId(d.campaignId, "media_reserve", data.idempotencyKey),
    external = d.payer === "creator";
  const reservation = records.append("reservations", {
    id,
    idempotencyKey: id,
    campaignId: d.campaignId,
    mode: "simulated",
    effectiveAt: at,
    kind: "media",
    distributionId,
    creatorId: d.creatorId,
    termsId: terms.id,
    payer: d.payer,
    payerId: budget.payerId,
    amountCents: data.amountCents,
    day,
    dailyReset: "00:00 UTC",
  });
  postOperation(
    records,
    d.campaignId,
    "media_reserve",
    payload,
    {
      reservationId: id,
      distributionId,
      termsId: terms.id,
      creatorId: d.creatorId,
      payer: d.payer,
      payerId: budget.payerId,
      purpose: "media",
      day,
      reservedMediaCents: external ? 0 : data.amountCents,
      creatorReservedCents: external ? data.amountCents : 0,
    },
    [
      [
        external ? "media:creator_external_capacity" : "media:ad_budget",
        data.amountCents,
      ],
      [external ? "reserve:creator_media" : "reserve:media", -data.amountCents],
    ],
    at,
  );
  return reservation;
}
export function spendMedia(
  state: DemoState,
  records: DemoRecords,
  reservationId: any,
  input: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  admin(access);
  const data = z
    .object({
      idempotencyKey: text,
      amountCents: positiveMoney,
      effectiveAt: instant,
      evidenceRef: text,
      mode: z.literal("simulated").default("simulated"),
    })
    .strict()
    .parse(input);
  const r = records.get("reservations", reservationId);
  if (!r || r.kind !== "media")
    throw new AppError("Media reservation unavailable.", 404);
  getProject(state, r.campaignId);
  if (data.effectiveAt > at || data.effectiveAt < r.effectiveAt)
    throw new AppError("Invalid spend evidence time.");
  // Evidence identifies one logical invoice even if a retry changes its request key.
  const payload = {
      ...data,
      idempotencyKey: `bill:${data.evidenceRef}`,
      reservationId,
    },
    prior = replay(records, r.campaignId, "media_spend", payload);
  if (prior) return prior;
  const totals = records.operationTotals(r.campaignId, { reservationId }),
    external = r.payer === "creator";
  const remaining = external
    ? records.creatorMediaReserved(r.campaignId, null, null, reservationId)
    : totals.reservedMediaCents;
  const consumed = Math.min(remaining, data.amountCents),
    overrunCents = data.amountCents - consumed;
  const lines = external
    ? [
        ["reserve:creator_media", consumed],
        ["media:creator_external_capacity", -consumed],
        ["media:creator_expense", data.amountCents],
        ["media:creator_external_funding", -data.amountCents],
      ]
    : [
        ["reserve:media", consumed],
        ["media:ad_budget", overrunCents],
        ["available", -data.amountCents],
        ["media:spend_expense", data.amountCents],
        ["media:spend_expense_offset", -data.amountCents],
      ];
  return postOperation(
    records,
    r.campaignId,
    "media_spend",
    payload,
    {
      reservationId,
      distributionId: r.distributionId,
      creatorId: r.creatorId,
      termsId: r.termsId,
      payer: r.payer,
      payerId: r.payerId,
      purpose: "media",
      day: r.day,
      reservedMediaCents: external ? 0 : -consumed,
      creatorReservedCents: external ? -consumed : 0,
      spentMediaCents: external ? 0 : data.amountCents,
      creatorMediaCostCents: external ? data.amountCents : 0,
      overrunCents,
    },
    lines,
    at,
  );
}
export function cancelMedia(
  state: DemoState,
  records: DemoRecords,
  reservationId: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  const r = records.get("reservations", reservationId);
  if (!r || r.kind !== "media")
    throw new AppError("Media reservation unavailable.", 404);
  distributionAccess(state, records, r.distributionId, access);
  if (r.payer !== "creator") requireProject(state, r.campaignId, access, true);
  const external = r.payer === "creator",
    totals = records.operationTotals(r.campaignId, { reservationId });
  const remaining = external
    ? records.creatorMediaReserved(r.campaignId, null, null, reservationId)
    : totals.reservedMediaCents;
  const data = { idempotencyKey: reservationId };
  const prior = replay(records, r.campaignId, "media_cancel", data);
  if (prior) return prior;
  if (!remaining) return { reservationId, releasedCents: 0 };
  return postOperation(
    records,
    r.campaignId,
    "media_cancel",
    data,
    {
      reservationId,
      distributionId: r.distributionId,
      creatorId: r.creatorId,
      purpose: "media",
      day: r.day,
      releasedCents: remaining,
      reservedMediaCents: external ? 0 : -remaining,
      creatorReservedCents: external ? -remaining : 0,
    },
    [
      [external ? "reserve:creator_media" : "reserve:media", remaining],
      [
        external ? "media:creator_external_capacity" : "media:ad_budget",
        -remaining,
      ],
    ],
    at,
  );
}
export function paidPlanReady(records: DemoRecords, d: any) {
  return (
    !mediaBalance(records, d.campaignId).held &&
    (records.operationTotals(d.campaignId, { distributionId: d.id })
      .reservedMediaCents > 0 ||
      records.creatorMediaReserved(d.campaignId, d.id) > 0)
  );
}

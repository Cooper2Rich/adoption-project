import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireProject } from "./access.ts";
import type { DemoRecords, DemoState } from "./demo-types.ts";
import { AppError, getPost, getProject } from "./domain.ts";
import { currentEligibility, refreshEligibility } from "./eligibility.ts";
import { cancelMedia, paidPlanReady } from "./media-budgets.ts";
import {
  appUsePolicy,
  guaranteePolicy,
  mediaPolicy,
  reserveSeedCommitments,
} from "./seed-commitments.ts";

export const channels = ["instagram", "facebook", "tiktok", "youtube"];
export function enforceFixedRate(input: any) {
  if (!input || typeof input !== "object") return;
  for (const [key, value] of Object.entries(input)) {
    if (
      (key === "creatorCommissionBps" && value !== 1000) ||
      [
        "tierRate",
        "commissionRate",
        "creatorRate",
        "creatorRateBps",
        "creatorCommissionRate",
      ].includes(key)
    )
      throw new AppError("Creator commission is fixed at 1000 basis points.");
    if (value && typeof value === "object") enforceFixedRate(value);
  }
}
const text = z.string().trim().min(1).max(600);
const instant = z.iso
  .datetime({ offset: true })
  .transform((v: any) => new Date(v).toISOString());
const permission = z
  .object({
    state: z.enum(["unreviewed", "allowed", "blocked"]),
    approver: z.string().max(100).default(""),
    evidence: z.string().max(600).default(""),
  })
  .strict()
  .refine(
    (v: any) => v.state === "unreviewed" || (v.approver && v.evidence),
    "Channel decisions require approver and evidence.",
  );
export const termsInput = z
  .object({
    currency: z.literal("USD"),
    creatorCommissionBps: z.literal(1000),
    effectiveAt: instant,
    startsAt: instant,
    endsAt: instant,
    attributionPolicy: z.literal("first-party-last-click-v1"),
    attributionWindowDays: z.literal(7),
    permissions: z
      .object(
        Object.fromEntries(
          channels.map((c: any) => [
            c,
            permission.default({
              state: "unreviewed",
              approver: "",
              evidence: "",
            }),
          ]),
        ),
      )
      .strict()
      .default({}),
    combinations: z
      .array(
        z
          .object({
            channel: z.enum(channels),
            placement: text,
            paid: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    destinations: z.array(text).min(1).max(30),
    budgetPayer: z.enum(["unassigned", "owner", "sponsor", "creator"]),
    guarantee: guaranteePolicy.nullable(),
    appUseAllocationCents: z.number().int().nonnegative().safe().nullable(),
    appUse: appUsePolicy.nullable().default(null),
    mediaBudget: mediaPolicy.nullable().default(null),
    refundHoldPolicy: text,
    gradingConfigId: z.string().max(100).nullable(),
  })
  .strict()
  .refine(
    (v: any) => v.startsAt < v.endsAt && v.effectiveAt < v.endsAt,
    "Invalid terms window.",
  )
  .refine(
    (v: any) => !v.guarantee || v.guarantee.periodStart < v.guarantee.periodEnd,
    "Invalid guarantee period.",
  );

export function migrateOrganizations(state: DemoState) {
  state.organizations ||= [];
  for (const n of state.nonprofits)
    if (!state.organizations.some((o: any) => o.id === n.id))
      state.organizations.push({ ...n, type: "nonprofit" });
  for (const p of state.projects) {
    p.ownerOrganizationId ||= p.nonprofitId;
    p.beneficiaryOrganizationId ||= p.nonprofitId;
    p.sponsorOrganizationIds ||= [];
  }
  return state;
}
export function organization(state: DemoState, id: any, type: any = undefined) {
  const o = state.organizations.find(
    (o: any) => o.id === id && (!type || o.type === type),
  );
  if (!o) throw new AppError(`A valid ${type || "organization"} is required.`);
  return o;
}
export function assignOrganizations(
  state: DemoState,
  project: any,
  input: any,
) {
  const owner = organization(
    state,
    input.ownerOrganizationId ||
      project.ownerOrganizationId ||
      project.nonprofitId,
  );
  const beneficiary = organization(
    state,
    input.beneficiaryOrganizationId ||
      project.beneficiaryOrganizationId ||
      project.nonprofitId,
    "nonprofit",
  );
  const sponsors =
    input.sponsorOrganizationIds || project.sponsorOrganizationIds || [];
  sponsors.forEach((id: any) => organization(state, id, "business"));
  if (
    project.offerVersionId &&
    (owner.id !== project.ownerOrganizationId ||
      beneficiary.id !== project.beneficiaryOrganizationId)
  )
    throw new AppError(
      "Opened campaign ownership and beneficiary are frozen; create a new campaign.",
      409,
    );
  Object.assign(project, {
    ownerOrganizationId: owner.id,
    beneficiaryOrganizationId: beneficiary.id,
    sponsorOrganizationIds: [...new Set(sponsors)],
    nonprofitId: beneficiary.id,
    nonprofit: beneficiary.name,
  });
}
export function capability(name: any, mode: any = "simulated") {
  if (mode !== "simulated" || !["simulate", "manual_handoff"].includes(name))
    throw new AppError(`LIVE_CAPABILITY_UNAVAILABLE: ${name}`, 409);
  return { mode, capability: name, simulated: true };
}
export function activeTerms(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
) {
  const project = getProject(state, campaignId);
  const terms = records.get("offer_versions", project.offerVersionId || "");
  if (!terms) throw new AppError("Published campaign terms are required.", 409);
  return { project, terms };
}
export function offerOpen(project: any, terms: any, at: any) {
  return (
    project.status === "active" &&
    project.offerState === "open" &&
    at >= terms.effectiveAt &&
    at >= terms.startsAt &&
    at < terms.endsAt
  );
}
export function publishTerms(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
  input: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  const project = requireProject(state, campaignId, access, true);
  const terms = termsInput.parse(input);
  organization(state, project.ownerOrganizationId);
  organization(state, project.beneficiaryOrganizationId, "nonprofit");
  if (project.status !== "active")
    throw new AppError("Publish the campaign before opening its offer.", 409);
  if (
    terms.startsAt !== `${project.startDate}T00:00:00.000Z` ||
    terms.endsAt !==
      new Date(
        Date.parse(`${project.endDate}T00:00:00Z`) + 86400000,
      ).toISOString()
  )
    throw new AppError(
      "Terms must derive the exact inclusive UTC campaign dates.",
    );
  const previous = project.offerVersionId
    ? records.get("offer_versions", project.offerVersionId)
    : null;
  if (previous && terms.effectiveAt < at)
    throw new AppError("New terms must take effect prospectively.");
  const row = {
    ...terms,
    id: randomUUID(),
    campaignId,
    mode: "simulated",
    version: (previous?.version || 0) + 1,
    ownerOrganizationId: project.ownerOrganizationId,
    beneficiaryOrganizationId: project.beneficiaryOrganizationId,
    createdAt: at,
  };
  reserveSeedCommitments(state, records, row, at);
  records.append("offer_versions", row);
  project.offerVersionId = row.id;
  project.offerState = "open";
  delete project.offerClosedAt;
  audit(records, campaignId, access, "offer_opened", row.id, at);
  refreshEligibility(state);
  return row;
}
export function changeOfferState(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
  next: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  const { project, terms } = activeTerms(state, records, campaignId);
  requireProject(state, campaignId, access, true);
  z.enum(["open", "paused", "closed"]).parse(next);
  if (
    next === "open" &&
    (project.status !== "active" || at < terms.startsAt || at >= terms.endsAt)
  )
    throw new AppError("Offer cannot reopen outside its active window.", 409);
  project.offerState = next;
  if (next === "closed") project.offerClosedAt = at;
  audit(records, campaignId, access, `offer_${next}`, terms.id, at);
  return { state: next, termsId: terms.id };
}
export function audit(
  records: DemoRecords,
  campaignId: any,
  access: any,
  operation: any,
  evidence: any,
  at: any,
) {
  return records.append("audit_events", {
    id: randomUUID(),
    campaignId,
    mode: "simulated",
    effectiveAt: at,
    actorId: access.creatorId || access.organizationId || "admin",
    operation,
    evidence,
  });
}
export function participationBlock(
  records: DemoRecords,
  campaignId: any,
  creatorId: any,
  at: any,
) {
  return records.restrictionFor(campaignId, creatorId, at);
}
export function consent(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
  termsId: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  if (access.role !== "creator")
    throw new AppError("Select a creator profile to accept terms.", 403);
  const { project, terms } = activeTerms(state, records, campaignId);
  const creator = state.creators.find((c: any) => c.id === access.creatorId);
  if (!creator?.name?.trim())
    throw new AppError("CREATOR_PROFILE_REQUIRED", 409);
  if (!offerOpen(project, terms, at))
    throw new AppError("OFFER_WINDOW_CLOSED", 409);
  if (termsId !== terms.id)
    throw new AppError("CURRENT_TERMS_CONSENT_REQUIRED", 409);
  const restriction = participationBlock(records, campaignId, creator.id, at);
  if (
    restriction ||
    ["declined", "suspended"].includes(creator.participationState)
  )
    throw new AppError(
      "PARTICIPATION_HELD: existing declined/suspended evidence",
      409,
    );
  const id = `${creator.id}:${terms.id}`;
  return (
    records.get("participations", id) ||
    records.append("participations", {
      id,
      campaignId,
      mode: "simulated",
      effectiveAt: at,
      creatorId: creator.id,
      termsId: terms.id,
      termsVersion: terms.version,
      state: "accepted",
      automatic: true,
      simulationDisclosure:
        "Fictional demo identity; not production verification.",
    })
  );
}
export function distributionInput(input: any) {
  if (input?.mode === "live") capability("ad_delivery", "live");
  return z
    .object({
      postId: text,
      snapshotId: text,
      revision: z.number().int().positive(),
      termsId: text,
      channel: z.enum(channels),
      placement: text,
      paid: z.boolean(),
      destination: text,
      payer: z.enum(["unassigned", "owner", "sponsor", "creator"]),
      mode: z.literal("simulated").default("simulated"),
    })
    .strict()
    .parse(input);
}
export function createDistribution(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
  input: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  const data = distributionInput(input);
  const { project, terms } = activeTerms(state, records, campaignId);
  requireProject(state, campaignId, access);
  const post = getPost(state, data.postId);
  if (
    post.projectId !== campaignId ||
    (access.role === "creator" && post.creatorId !== access.creatorId)
  )
    throw new AppError("Creative unavailable in this scope.", 404);
  if (!offerOpen(project, terms, at))
    throw new AppError("OFFER_WINDOW_CLOSED", 409);
  if (data.termsId !== terms.id)
    throw new AppError("CURRENT_TERMS_CONSENT_REQUIRED", 409);
  const participation = records.get(
    "participations",
    `${post.creatorId}:${terms.id}`,
  );
  if (
    !participation ||
    participationBlock(records, campaignId, post.creatorId, at)
  )
    throw new AppError("ACCEPTED_PARTICIPATION_REQUIRED", 409);
  if (data.snapshotId !== post.snapshotId || data.revision !== post.revision)
    throw new AppError("Stale creative snapshot.", 409);
  refreshEligibility(state);
  if (!currentEligibility(post, project))
    throw new AppError("ELIGIBLE_EVALUATED_SNAPSHOT_REQUIRED", 409);
  if (terms.permissions[data.channel].state !== "allowed")
    throw new AppError("CAMPAIGN_CHANNEL_PERMISSION_REQUIRED", 409);
  if (
    !terms.combinations.some(
      (c: any) =>
        c.channel === data.channel &&
        c.placement === data.placement &&
        c.paid === data.paid,
    )
  )
    throw new AppError("CHANNEL_PLACEMENT_NOT_ALLOWED", 409);
  if (!terms.destinations.includes(data.destination))
    throw new AppError("DESTINATION_NOT_ALLOWED", 409);
  if (!["photo", "reel"].includes(post.format))
    throw new AppError("SUPPORTED_LOCAL_FORMAT_REQUIRED", 409);
  if (data.channel === "instagram" && !project.instagram)
    throw new AppError("INSTAGRAM_PAIRING_REQUIRED", 409);
  if (data.paid) {
    if (data.payer === "unassigned" || terms.budgetPayer !== data.payer)
      throw new AppError("MEDIA_BUDGET_PAYER_REQUIRED", 409);
  }
  return records.append("distributions", {
    ...data,
    id: randomUUID(),
    campaignId,
    creatorId: post.creatorId,
    participationId: participation.id,
    evaluationId: post.eligibility.id,
    policyVersion: post.eligibility.policyVersion,
    mode: "simulated",
    effectiveAt: at,
    state: data.paid ? "draft" : "ready_for_handoff",
    platformReview: "unverified",
    fundingState: data.paid ? "reservation_required" : "not_required",
  });
}
export function distributionState(
  records: DemoRecords,
  distribution: any,
  at: any = new Date().toISOString(),
) {
  return (
    records.distributionStateAt(distribution.campaignId, distribution.id, at)
      ?.state || distribution.state
  );
}
export function transitionDistribution(
  state: DemoState,
  records: DemoRecords,
  id: any,
  next: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  const d = records.get("distributions", id);
  if (!d) throw new AppError("Distribution unavailable.", 404);
  requireProject(state, d.campaignId, access, true);
  if (next === "externally_verified") capability("ad_delivery", "live");
  z.enum(["exported", "stopped"]).parse(next);
  if (distributionState(records, d, at) === "stopped")
    throw new AppError("Distribution is stopped.", 409);
  if (next === "exported") {
    const { project, terms } = activeTerms(state, records, d.campaignId);
    const post = getPost(state, d.postId);
    refreshEligibility(state);
    if (
      !offerOpen(project, terms, at) ||
      terms.id !== d.termsId ||
      post.snapshotId !== d.snapshotId ||
      !currentEligibility(post, project) ||
      terms.permissions[d.channel].state !== "allowed"
    )
      throw new AppError("Current distribution eligibility required.", 409);
    if (d.paid && !paidPlanReady(records, d))
      throw new AppError(
        "MEDIA_RESERVATION_REQUIRED: paid funded execution requires a bounded reservation.",
        409,
      );
    capability("manual_handoff");
  }
  if (next === "stopped") {
    let cursor = "";
    for (;;) {
      const page = records.subjectPage(
        "reservations",
        d.campaignId,
        "distributionId",
        d.id,
        cursor,
      );
      for (const r of page) cancelMedia(state, records, r.id, access, at);
      if (page.length < 100) break;
      cursor = page.at(-1).id;
    }
  }
  return records.append("distribution_events", {
    id: randomUUID(),
    campaignId: d.campaignId,
    mode: d.mode,
    effectiveAt: at,
    distributionId: d.id,
    state: next,
    simulationDisclosure:
      "Simulated manual handoff; no external publication or inventory purchase.",
  });
}

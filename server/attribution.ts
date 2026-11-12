import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { requireProject } from "./access.ts";
import type { DemoRecords, DemoState } from "./demo-types.ts";
import { AppError, getProject } from "./domain.ts";
import {
  activeTerms,
  distributionState,
  offerOpen,
  participationBlock,
} from "./marketplace.ts";

export const opaqueToken = () => randomBytes(32).toString("base64url");
const timestamp = z.iso
  .datetime({ offset: true })
  .transform((v: any) => new Date(v).toISOString());
function revokedLink(records: DemoRecords, linkId: any, at: any) {
  const link = records.get("tracking_links", linkId);
  if (!link) return true;
  const event = records.get("tracking_link_events", linkId);
  return !!event && event.effectiveAt <= at;
}
export function revokeLink(
  state: DemoState,
  records: DemoRecords,
  token: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  const link = records.get("tracking_links", token);
  if (!link) throw new AppError("Tracking link unavailable.", 404);
  requireProject(state, link.campaignId, access, true);
  return (
    records.get("tracking_link_events", token) ||
    records.append("tracking_link_events", {
      id: token,
      campaignId: link.campaignId,
      mode: link.mode,
      effectiveAt: at,
      state: "revoked",
      actorId: access.organizationId || "admin",
    })
  );
}

// Reuses exact historical snapshots/evaluations. Arrival time is deliberately absent.
export function attributionEligibility(
  state: DemoState,
  records: DemoRecords,
  distributionId: any,
  at: any,
) {
  const d = records.get("distributions", distributionId);
  if (!d) return { eligible: false, reason: "DISTRIBUTION_UNAVAILABLE" };
  const terms = records.get("offer_versions", d.termsId);
  const project = getProject(state, d.campaignId);
  if (
    at < d.effectiveAt ||
    at < terms.startsAt ||
    at < terms.effectiveAt ||
    at >= terms.endsAt
  )
    return { eligible: false, reason: "ATTRIBUTION_WINDOW_CLOSED" };
  const offerState =
    records.offerControlAt(d.campaignId, at)?.operation === "offer_closed"
      ? "closed"
      : "open";
  if (
    offerState === "closed" ||
    distributionState(records, d, at) === "stopped"
  )
    return { eligible: false, reason: "DISTRIBUTION_OR_OFFER_CLOSED" };
  const post = state.posts.find((p: any) => p.id === d.postId);
  const snapshot = post?.snapshots.find((s: any) => s.id === d.snapshotId);
  const evaluation = post?.evaluations.find(
    (e: any) => e.id === d.evaluationId,
  );
  if (!snapshot || evaluation?.outcome !== "eligible")
    return { eligible: false, reason: "EVALUATED_SNAPSHOT_UNAVAILABLE" };
  if (post.withdrawnAt && post.withdrawnAt <= at)
    return { eligible: false, reason: "CREATIVE_WITHDRAWN" };
  if (
    state.creativeHolds.some(
      (h: any) =>
        (h.postId === post.id || h.contentKey === snapshot.contentKey) &&
        h.at <= at &&
        (!h.resolvedAt || h.resolvedAt > at),
    )
  )
    return { eligible: false, reason: "CREATIVE_HELD" };
  if (participationBlock(records, d.campaignId, d.creatorId, at))
    return { eligible: false, reason: "PARTICIPATION_HELD" };
  return { eligible: true, distribution: d, terms, project };
}
export function issueLink(
  state: DemoState,
  records: DemoRecords,
  id: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  const d = records.get("distributions", id);
  if (!d) throw new AppError("Distribution unavailable.", 404);
  requireProject(state, d.campaignId, access);
  if (access.role === "creator" && access.creatorId !== d.creatorId)
    throw new AppError("Distribution unavailable.", 404);
  const { project, terms } = activeTerms(state, records, d.campaignId);
  if (!offerOpen(project, terms, at) || d.termsId !== terms.id)
    throw new AppError("OFFER_WINDOW_CLOSED", 409);
  const eligibility = attributionEligibility(state, records, id, at);
  if (!eligibility.eligible) throw new AppError(eligibility.reason, 409);
  if (terms.permissions[d.channel].state !== "allowed")
    throw new AppError("CAMPAIGN_CHANNEL_PERMISSION_REQUIRED", 409);
  const token = opaqueToken();
  records.append("tracking_links", {
    id: token,
    campaignId: d.campaignId,
    mode: d.mode,
    effectiveAt: at,
    distributionId: d.id,
    snapshotId: d.snapshotId,
    evaluationId: d.evaluationId,
    creatorId: d.creatorId,
    termsId: d.termsId,
    expiresAt: terms.endsAt,
  });
  return {
    path: `/r/${token}`,
    mode: d.mode,
    simulationDisclosure: "Local simulated giving only.",
  };
}
export function clickLink(
  state: DemoState,
  records: DemoRecords,
  token: any,
  visitorId: any,
  at: any = new Date().toISOString(),
) {
  const link = records.get("tracking_links", token);
  if (!link) throw new AppError("Tracking link unavailable.", 404);
  const result = attributionEligibility(
    state,
    records,
    link.distributionId,
    at,
  );
  if (revokedLink(records, token, at)) {
    result.eligible = false;
    result.reason = "LINK_REVOKED";
  }
  // Existing unrevoked links remain usable during a pause under their frozen terms.
  const click = records.append("tracking_clicks", {
    id: randomUUID(),
    campaignId: link.campaignId,
    mode: link.mode,
    effectiveAt: at,
    visitorId,
    linkId: link.id,
    distributionId: link.distributionId,
    eligible: result.eligible,
    reason: result.reason || null,
  });
  return {
    location: `/campaigns/${encodeURIComponent(link.campaignId)}/give`,
    click,
  };
}
export function freezeIntent(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
  visitorId: any,
  input: any = {},
  at: any = new Date().toISOString(),
) {
  getProject(state, campaignId);
  const data = z
    .object({
      distributionId: z.string().max(100).optional(),
      amountCents: z.number().int().positive().safe().optional(),
    })
    .strict()
    .parse(input);
  let binding: any = null,
    reason = "MISSING_ATTRIBUTION";
  if (data.distributionId) {
    const result = attributionEligibility(
      state,
      records,
      data.distributionId,
      at,
    );
    if (
      result.eligible &&
      result.distribution.campaignId === campaignId &&
      result.project.offerState === "open"
    )
      binding = {
        kind: "direct_selection",
        distributionId: data.distributionId,
        termsId: result.terms.id,
        creatorId: result.distribution.creatorId,
        snapshotId: result.distribution.snapshotId,
        evaluationId: result.distribution.evaluationId,
        selectedAt: at,
      };
    else reason = result.reason || "CAMPAIGN_MISMATCH";
  } else {
    let before;
    while (true) {
      const clicks: any = records.visitorClicks(
        campaignId,
        visitorId,
        at,
        before,
      );
      for (const click of clicks) {
        if (!click.eligible || revokedLink(records, click.linkId, at)) continue;
        const result = attributionEligibility(
          state,
          records,
          click.distributionId,
          at,
        );
        if (result.eligible) {
          binding = {
            kind: "first_party_click",
            clickId: click.id,
            clickedAt: click.effectiveAt,
            distributionId: click.distributionId,
            termsId: result.terms.id,
            creatorId: result.distribution.creatorId,
            snapshotId: result.distribution.snapshotId,
            evaluationId: result.distribution.evaluationId,
          };
          break;
        }
      }
      if (binding || clicks.length < 100) break;
      const last = clicks.at(-1);
      before = { at: last.effectiveAt, id: last.id };
    }
  }
  return records.append("gift_intents", {
    id: opaqueToken(),
    campaignId,
    mode: "simulated",
    effectiveAt: at,
    visitorId,
    amountCents: data.amountCents ?? null,
    binding,
    state: binding ? "attributed" : "suspense",
    reason: binding ? null : reason,
    simulationDisclosure:
      "Simulated gift. Creators receive 10%; nonprofit beneficiary receives 90% before fees. No money is collected.",
  });
}
export function evaluateIntentCompletion(
  state: DemoState,
  records: DemoRecords,
  intent: any,
  at: any,
) {
  if (!intent.binding)
    return { eligible: false, reason: intent.reason || "MISSING_ATTRIBUTION" };
  if (at < intent.effectiveAt)
    return { eligible: false, reason: "COMPLETION_PRECEDES_INTENT" };
  const binding = intent.binding;
  if (binding.kind === "first_party_click") {
    const click = records.get("tracking_clicks", binding.clickId);
    if (!click || revokedLink(records, click.linkId, at))
      return { eligible: false, reason: "LINK_REVOKED" };
  }
  if (
    binding.kind === "first_party_click" &&
    Date.parse(at) - Date.parse(binding.clickedAt) > 7 * 86400000
  )
    return { eligible: false, reason: "CLICK_EXPIRED" };
  return attributionEligibility(state, records, binding.distributionId, at);
}
export function recordAttributionFixture(
  state: DemoState,
  records: DemoRecords,
  input: any,
  arrivalAt: any = new Date().toISOString(),
) {
  const data = z
    .object({
      intentId: z.string(),
      effectiveAt: timestamp,
      mode: z.literal("simulated").default("simulated"),
      sourceEventId: z.string().min(1).max(100),
    })
    .strict()
    .parse(input);
  const intent = records.get("gift_intents", data.intentId);
  if (!intent) throw new AppError("Intent unavailable.", 404);
  if (data.effectiveAt > arrivalAt)
    throw new AppError("Future financial evidence is invalid.");
  const id = `attribution:${data.sourceEventId}`;
  const previous = records.get("attribution_events", id);
  if (previous) {
    if (
      previous.intentId !== intent.id ||
      previous.effectiveAt !== data.effectiveAt
    )
      throw new AppError("SOURCE_EVIDENCE_CONFLICT", 409);
    return previous;
  }
  const result = evaluateIntentCompletion(
    state,
    records,
    intent,
    data.effectiveAt,
  );
  return records.append("attribution_events", {
    ...data,
    id,
    campaignId: intent.campaignId,
    arrivalAt,
    eligible: result.eligible,
    state: result.eligible ? "eligible" : "suspense",
    reason: result.reason || null,
    binding: intent.binding,
    simulationDisclosure:
      "Attribution evidence fixture only; no financial allocation.",
  });
}
export function adjudicate(
  state: DemoState,
  records: DemoRecords,
  eventId: any,
  input: any,
  at: any = new Date().toISOString(),
) {
  const data = z
    .object({
      distributionId: z.string(),
      evidence: z.string().trim().min(1).max(2000),
    })
    .strict()
    .parse(input);
  const event = records.get("attribution_events", eventId);
  if (!event || event.state !== "suspense")
    throw new AppError("A suspense event is required.", 409);
  if (records.get("attribution_adjudications", eventId))
    throw new AppError(
      "An adjudication already exists; paid gifts cannot be silently reassigned.",
      409,
    );
  const result = attributionEligibility(
    state,
    records,
    data.distributionId,
    event.effectiveAt,
  );
  if (!result.eligible || result.distribution.campaignId !== event.campaignId)
    throw new AppError("Eligible same-campaign evidence is required.", 409);
  return records.append("attribution_adjudications", {
    ...data,
    id: eventId,
    campaignId: event.campaignId,
    mode: event.mode,
    effectiveAt: at,
    eventId,
    creatorId: result.distribution.creatorId,
    termsId: result.terms.id,
    snapshotId: result.distribution.snapshotId,
    actorId: "admin",
    state: "resolved",
  });
}

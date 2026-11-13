import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { authorizedCampaign } from "./access.ts";
import {
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
  type Doc,
} from "./functions.ts";
import { observationValidator } from "./incidentSchema.ts";
import type { Infer } from "convex/values";

export const bothOperatorKinds = new Set<string>([
  "capacity-waiting",
  "stopping-failed",
  "stopping-uncertain",
  "delivery-unavailable",
  "evaluation-interrupted",
  "pause-reserved-slot",
  "financial-safety-pause",
  "initial-trial-coverage",
  "launch-blocker",
]);
export const emailJob = makeFunctionReference<"action", { emailId: string }>(
  "incidentEmailJobs:run",
);
export const emailWatchdog = makeFunctionReference<
  "mutation",
  { emailId: string; generation: number }
>("incidentEmail:watchdog");
export const RETRY_DELAYS = [60_000, 300_000, 900_000, 3_600_000];
export const IDEMPOTENCY_WINDOW = 24 * 60 * 60 * 1000;
export const EMAIL_TRANSPORT_TIMEOUT_MS = 10_000;
// Includes the transport budget plus a conservative operational margin.
// This fences last-window starts; it is not a provider latency guarantee.
export const EMAIL_REPLAY_MARGIN_MS = 60_000;
export function safeText(value: string, max: number) {
  if (!value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value))
    throw new Error("INVALID_INCIDENT_INPUT");
}
export async function routing(
  ctx: QueryCtx,
  incident: Pick<
    Doc<"operatorIncidents">,
    "campaignSlug" | "nonprofitId" | "kind"
  >,
) {
  const managers = await ctx.db
    .query("memberships")
    .filter((q) =>
      q.and(
        q.eq(q.field("nonprofitId"), incident.nonprofitId),
        q.eq(q.field("role"), "manager"),
        q.eq(q.field("active"), true),
      ),
    )
    .collect();
  const operators = bothOperatorKinds.has(incident.kind)
    ? await ctx.db
        .query("operators")
        .filter((q) => q.eq(q.field("active"), true))
        .collect()
    : [];
  const configuration = await ctx.db
    .query("operatorRouting")
    .withIndex("by_campaign", (q) =>
      q.eq("campaignSlug", incident.campaignSlug),
    )
    .unique();
  let hold: string | undefined;
  if (!managers.length) hold = "No active campaign manager";
  if (
    bothOperatorKinds.has(incident.kind) &&
    (!configuration ||
      !operators.some((o) => o.subject === configuration.designatedOperator))
  )
    hold = "Designated operator configuration required";
  const people = [
    ...new Set([...managers, ...operators].map((p) => p.subject)),
  ].sort();
  const recipients: {
    subject: string;
    email: string;
    recipientRole: string;
  }[] = [];
  for (const subject of people) {
    const contact = await ctx.db
      .query("operatorContacts")
      .withIndex("by_person", (q) =>
        q.eq("nonprofitId", incident.nonprofitId).eq("subject", subject),
      )
      .unique();
    if (!contact) hold = "Verified operator contact required";
    else if (!recipients.some((p) => p.email === contact.email))
      recipients.push({
        subject,
        email: contact.email,
        recipientRole: managers.some((m) => m.subject === subject)
          ? operators.some((o) => o.subject === subject)
            ? "Campaign manager and platform administrator"
            : "Campaign manager"
          : "Platform administrator",
      });
  }
  return {
    recipients,
    hold,
    fingerprint: JSON.stringify({
      people,
      recipients,
      designated: bothOperatorKinds.has(incident.kind)
        ? (configuration?.designatedOperator ?? null)
        : null,
    }),
  };
}
export async function createNotice(
  ctx: MutationCtx,
  incident: Doc<"operatorIncidents">,
  kind: "detection" | "recovery",
  at: number,
) {
  const route = await routing(ctx, incident);
  const title = `${kind === "recovery" ? "Resolved" : "Action required"}: ${incident.kind}`;
  const text = `${incident.campaignSlug}: ${incident.reason}\nStatus: ${kind === "recovery" ? "resolved" : "open"}. Resolution role: ${incident.resolutionRole}.\nReview the campaign operator dashboard.`;
  const noticeId = await ctx.db.insert("incidentNotices", {
    incidentId: incident._id,
    kind,
    createdAt: at,
    title,
    text,
    routing: route.fingerprint,
    ...(route.hold ? { hold: route.hold } : {}),
  });
  for (const person of route.recipients) {
    const emailId = await ctx.db.insert("incidentEmails", {
      noticeId,
      incidentId: incident._id,
      ...person,
      from: process.env.OPERATOR_EMAIL_FROM ?? "unconfigured",
      title,
      text,
      routing: route.fingerprint,
      state: "pending",
      createdAt: at,
      nextAt: at,
      failures: 0,
      wakeVersion: 1,
    });
    await ctx.scheduler.runAfter(0, emailWatchdog, { emailId, generation: 1 });
  }
  return noticeId;
}
// Import this seam from trusted backend monitors after validating their source.
// No public browser mutation can submit observations. Producer identity is bound
// to each ordered stream; timestamps and sequence must both advance safely.
export async function recordTrustedIncident(
  ctx: MutationCtx,
  args: Infer<typeof observationValidator>,
  provenance: { producer: string; actor: string; synthetic: boolean },
) {
  const input = args;
  for (const [value, max] of [
    [input.key, 128],
    [input.reason, 500],
    [input.evidence, 200],
    [provenance.producer, 80],
    [provenance.actor, 128],
  ] as const)
    safeText(value, max);
  if (
    !Number.isSafeInteger(input.sequence) ||
    input.sequence < 1 ||
    !Number.isSafeInteger(input.observedAt) ||
    input.observedAt < 0 ||
    input.observedAt > Date.now() + 60_000
  )
    throw new Error("INVALID_INCIDENT_EVIDENCE");
  const campaign = await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", input.campaignId))
    .unique();
  if (
    !campaign ||
    (provenance.synthetic &&
      (!campaign.fixtureRunId ||
        campaign.fixtureRunId !==
          process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID)) ||
    (!provenance.synthetic && campaign.fixtureRunId)
  )
    throw new Error("INCIDENT_SOURCE_SCOPE_DENIED");
  const head = await ctx.db
    .query("incidentHeads")
    .withIndex("by_stream", (q) =>
      q.eq("campaignSlug", input.campaignId).eq("key", input.key),
    )
    .unique();
  if (
    head &&
    (head.producer !== provenance.producer || head.kind !== input.kind)
  )
    throw new Error("INCIDENT_SOURCE_CONFLICT");
  if (
    head &&
    (input.sequence <= head.sequence || input.observedAt < head.observedAt)
  )
    return { accepted: false, incidentId: head.incidentId ?? null };
  const at = Date.now();
  let incident = head?.incidentId ? await ctx.db.get(head.incidentId) : null;
  if (input.active && incident?.status !== "open") {
    const id = await ctx.db.insert("operatorIncidents", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      key: input.key,
      kind: input.kind,
      reason: input.reason,
      resolutionRole: input.resolutionRole,
      status: "open",
      detectedAt: at,
      firstObservedAt: input.observedAt,
      updatedAt: at,
      originalEvidence: input.evidence,
      producer: provenance.producer,
      synthetic: provenance.synthetic,
      version: 1,
    });
    incident = (await ctx.db.get(id))!;
    await createNotice(ctx, incident, "detection", at);
  } else if (incident?.status === "open") {
    await ctx.db.patch(incident._id, {
      reason: input.reason,
      resolutionRole: input.resolutionRole,
      updatedAt: at,
      ...(!input.active ? { status: "resolved" as const, resolvedAt: at } : {}),
    });
    if (!input.active)
      await createNotice(
        ctx,
        { ...incident, reason: input.reason },
        "recovery",
        at,
      );
  }
  if (incident)
    await ctx.db.insert("incidentEvidence", {
      incidentId: incident._id,
      sequence: input.sequence,
      observedAt: input.observedAt,
      at,
      actor: provenance.actor,
      source: provenance.producer,
      evidence: input.evidence,
      reason: input.reason,
      active: input.active,
      version: 1,
    });
  const update = {
    campaignSlug: campaign.slug,
    key: input.key,
    kind: input.kind,
    producer: provenance.producer,
    sequence: input.sequence,
    observedAt: input.observedAt,
    ...(incident ? { incidentId: incident._id } : {}),
  };
  if (head) await ctx.db.patch(head._id, update);
  else await ctx.db.insert("incidentHeads", update);
  return { accepted: true, incidentId: incident?._id ?? null };
}
export const registerContact = mutation({
  args: { campaignId: v.string() },
  handler: async (ctx, args) => {
    const { campaign, subject } = await authorizedCampaign(
      ctx,
      args.campaignId,
    );
    const identity = (await ctx.auth.getUserIdentity())!;
    if (
      (identity.emailVerified ?? identity["email_verified"]) !== true ||
      typeof identity.email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email) ||
      identity.email.length > 254
    )
      throw new Error("VERIFIED_CLERK_EMAIL_REQUIRED");
    const email = identity.email.toLowerCase();
    const existing = await ctx.db
      .query("operatorContacts")
      .withIndex("by_person", (q) =>
        q.eq("nonprofitId", campaign.nonprofitId).eq("subject", subject),
      )
      .unique();
    const record = {
      nonprofitId: campaign.nonprofitId,
      subject,
      email,
      verifiedAt: Date.now(),
      source: "verified-clerk-identity",
    };
    if (existing) await ctx.db.patch(existing._id, record);
    else await ctx.db.insert("operatorContacts", record);
    await ctx.db.insert("operatorContactAudit", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      subject,
      actor: subject,
      action: existing ? "contact-reverified" : "contact-verified",
      source: "verified-clerk-identity",
      at: Date.now(),
      version: 1,
    });
    return { registered: true };
  },
});
export const configure = mutation({
  args: { campaignId: v.string(), designatedOperator: v.string() },
  handler: async (ctx, args) => {
    const { campaign, subject } = await authorizedCampaign(
      ctx,
      args.campaignId,
    );
    const operator = await ctx.db
      .query("operators")
      .withIndex("by_subject", (q) => q.eq("subject", args.designatedOperator))
      .unique();
    if (!operator?.active)
      throw new Error("DESIGNATED_ACTIVE_OPERATOR_REQUIRED");
    const previous = await ctx.db
      .query("operatorRouting")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .unique();
    const record = {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      designatedOperator: args.designatedOperator,
      actor: subject,
      at: Date.now(),
      version: 1 as const,
    };
    if (previous) await ctx.db.patch(previous._id, record);
    else await ctx.db.insert("operatorRouting", record);
    await ctx.db.insert("operatorContactAudit", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      subject: args.designatedOperator,
      actor: subject,
      action: "designated-operator-configured",
      source: "authenticated-campaign-operation",
      at: Date.now(),
      version: 1,
    });
    return { configured: true };
  },
});
export const list = query({
  args: { campaignId: v.string() },
  handler: async (ctx, args) => {
    const { campaign } = await authorizedCampaign(ctx, args.campaignId);
    const records = await ctx.db
      .query("operatorIncidents")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .order("desc")
      .collect();
    return await Promise.all(
      records.map(async (incident) => {
        const notices = await ctx.db
          .query("incidentNotices")
          .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
          .collect();
        return {
          ...incident,
          evidence: await ctx.db
            .query("incidentEvidence")
            .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
            .collect(),
          notices: await Promise.all(
            notices.map(async (notice) => {
              const emails = await ctx.db
                .query("incidentEmails")
                .withIndex("by_notice", (q) => q.eq("noticeId", notice._id))
                .collect();
              return {
                id: notice._id,
                kind: notice.kind,
                createdAt: notice.createdAt,
                hold: notice.hold ?? null,
                emails: await Promise.all(
                  emails.map(async (email) => ({
                    id: email._id,
                    recipientRole: email.recipientRole,
                    state: email.state,
                    hold: email.hold ?? null,
                    failures: email.failures,
                    nextAt: email.nextAt,
                    createdAt: email.createdAt,
                    attempts: (
                      await ctx.db
                        .query("incidentEmailAttempts")
                        .withIndex("by_email", (q) =>
                          q.eq("emailId", email._id),
                        )
                        .collect()
                    ).map((a) => ({
                      id: a._id,
                      ordinal: a.ordinal,
                      state: a.state,
                      journaledAt: a.journaledAt,
                      sendStartedAt: a.sendStartedAt,
                      lastTransportAt: a.lastTransportAt,
                      transportCalls: a.transportCalls,
                      finishedAt: a.finishedAt ?? null,
                      source: a.source,
                      providerEvent: a.providerEvent ?? null,
                      version: a.version,
                    })),
                  })),
                ),
              };
            }),
          ),
        };
      }),
    );
  },
});
// Explicit repair of configuration holds. Already journaled recipients retain
// immutable payloads and are never silently replaced after unknown/accepted sends.
export const resume = mutation({
  args: { campaignId: v.string() },
  handler: async (ctx, args) => {
    const { campaign, subject } = await authorizedCampaign(
      ctx,
      args.campaignId,
    );
    const incidents = await ctx.db
      .query("operatorIncidents")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .collect();
    for (const incident of incidents) {
      const route = await routing(ctx, incident);
      const notices = await ctx.db
        .query("incidentNotices")
        .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
        .collect();
      for (const notice of notices) {
        if (notice.kind === "detection" && incident.status === "resolved") {
          await ctx.db.patch(notice._id, {
            hold: "Resolved; unsent detection notices superseded by recovery",
          });
          continue;
        }
        await ctx.db.patch(notice._id, { hold: route.hold });
        const held = await ctx.db
          .query("incidentEmails")
          .withIndex("by_notice_state", (q) =>
            q.eq("noticeId", notice._id).eq("state", "held"),
          )
          .first();
        // Stable routes with no held recipient have nothing to repair. Do
        // not depend on accepted/sending rows that watchdogs keep updating.
        // Changed routes still inspect every prior recipient below, so new
        // contacts cannot bypass immutable attempts or duplicate fences.
        if (!held && notice.routing === route.fingerprint) continue;
        const emails = await ctx.db
          .query("incidentEmails")
          .withIndex("by_notice", (q) => q.eq("noticeId", notice._id))
          .collect();
        for (const person of route.recipients) {
          const previous = emails.filter(
            (e) => e.subject === person.subject || e.email === person.email,
          );
          if (previous.some((e) => e.activeAttempt || e.state !== "held"))
            continue;
          const exact = previous.find(
            (e) =>
              e.email === person.email &&
              e.from === process.env.OPERATOR_EMAIL_FROM,
          );
          if (exact) {
            await ctx.db.patch(exact._id, {
              state: "pending",
              hold: undefined,
              nextAt: Date.now(),
              wakeVersion: exact.wakeVersion + 1,
            });
            await ctx.scheduler.runAfter(0, emailWatchdog, {
              emailId: exact._id,
              generation: exact.wakeVersion + 1,
            });
          } else {
            const at = Date.now();
            const emailId = await ctx.db.insert("incidentEmails", {
              noticeId: notice._id,
              incidentId: incident._id,
              ...person,
              from: process.env.OPERATOR_EMAIL_FROM ?? "unconfigured",
              title: notice.title,
              text: notice.text,
              routing: route.fingerprint,
              state: "pending",
              createdAt: at,
              nextAt: at,
              failures: 0,
              wakeVersion: 1,
            });
            await ctx.scheduler.runAfter(0, emailWatchdog, {
              emailId,
              generation: 1,
            });
          }
        }
      }
    }
    await ctx.db.insert("operatorContactAudit", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      subject,
      actor: subject,
      action: "unsent-notices-resumed",
      source: "authenticated-campaign-operation",
      at: Date.now(),
      version: 1,
    });
    return { resumed: true };
  },
});
export const configuration = query({
  args: { campaignId: v.string() },
  handler: async (ctx, args) => {
    const { campaign, subject } = await authorizedCampaign(
      ctx,
      args.campaignId,
    );
    const route = await ctx.db
      .query("operatorRouting")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .unique();
    const contact = await ctx.db
      .query("operatorContacts")
      .withIndex("by_person", (q) =>
        q.eq("nonprofitId", campaign.nonprofitId).eq("subject", subject),
      )
      .unique();
    return {
      designatedOperator: route?.designatedOperator ?? null,
      ownContactVerified: !!contact,
      audit: await ctx.db
        .query("operatorContactAudit")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
        .collect(),
    };
  },
});

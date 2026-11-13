import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { makeFunctionReference } from "convex/server";
import { v, type Infer } from "convex/values";
import {
  authorizedCampaign,
  operationIdentity,
  stableRequest,
} from "./access.ts";
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
  type Doc,
} from "./functions.ts";
import { correctionState, resolveMetric } from "./paidMetricAuthority.ts";
import {
  paidManager,
  metricScope,
  reconcileCorrections,
} from "./paidCorrections.ts";
import { enrollmentInput, reportRow } from "./paidMetricSchema.ts";
import { recordTrustedIncident, safeText } from "./operatorIncidents.ts";
import { trackedPath } from "./publicViewer.ts";
import { chicagoDay } from "./allocation/chicago.ts";

const hash = (value: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(stableRequest(value as never))));
const metrics = ["impressions", "linkClicks"] as const;
const watchdogRef = makeFunctionReference<
  "mutation",
  { sourceId: string; generation: number }
>("paidMetrics:watchdog");
const operationWatchdogRef = makeFunctionReference<
  "mutation",
  { operationId: string; generation: number }
>("paidMetrics:operationWatchdog");
const coverageExpiryRef = makeFunctionReference<
  "mutation",
  { coverageId: string; operationId: string }
>("paidMetrics:expireCoverage");
const scope = { campaignId: v.string() };
const manager = paidManager;
async function clock(ctx: QueryCtx, campaignSlug: string) {
  const c = await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", campaignSlug))
    .unique();
  return c?.fixtureRunId &&
    c.fixtureRunId === process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID
    ? (c.fixturePaidNow ?? Date.now())
    : Date.now();
}
async function audit(
  ctx: MutationCtx,
  campaign: { slug: string; nonprofitId: string },
  actor: string,
  action: string,
  reference: string,
  evidence: string,
) {
  await ctx.db.insert("paidAudit", {
    campaignSlug: campaign.slug,
    nonprofitId: campaign.nonprofitId,
    actor,
    source: "paid-metrics-v1",
    at: Date.now(),
    version: 1,
    action,
    reference,
    evidence,
  });
}
export const creativeBinding = (
  version: Pick<Doc<"photoVersions">, "photos" | "video">,
) => hash({ photos: version.photos, video: version.video ?? null });
export function canonicalPeriod(
  start: number,
  end: number,
  rules: { campaignStart: string; campaignEnd: string },
) {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start >= end ||
    start < Date.parse(rules.campaignStart) ||
    end > Date.parse(rules.campaignEnd)
  )
    throw new Error("PAID_PERIOD: Exact bounded competition period required");
  const day = chicagoDay(start);
  if (
    start !== Math.max(day.start, Date.parse(rules.campaignStart)) ||
    end !== Math.min(day.end, Date.parse(rules.campaignEnd))
  )
    throw new Error(
      "PAID_PERIOD: Use one canonical Chicago competition day; derive week totals from days",
    );
}
export function canonicalDays(
  start: number,
  end: number,
  rules: { campaignStart: string; campaignEnd: string },
) {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start >= end ||
    start < Date.parse(rules.campaignStart) ||
    end > Date.parse(rules.campaignEnd)
  )
    throw new Error(
      "PAID_WINDOW: Bounded canonical competition window required",
    );
  const days: { start: number; end: number; label: string }[] = [];
  for (let at = start; at < end;) {
    const day = chicagoDay(at),
      dayEnd = Math.min(day.end, Date.parse(rules.campaignEnd));
    canonicalPeriod(at, dayEnd, rules);
    if (dayEnd > end)
      throw new Error(
        "PAID_WINDOW: Window must end at canonical competition day boundary",
      );
    days.push({ start: at, end: dayEnd, label: day.label });
    at = dayEnd;
    if (days.length > 366) throw new Error("PAID_WINDOW: Window too large");
  }
  return days;
}
const anchor = (source: Doc<"paidSources">) =>
  Math.max(source.activatedAt, source.lastSuccess ?? 0);
async function requiredPeriods(ctx: QueryCtx, mapping: Doc<"paidMappings">) {
  const proof = (await ctx.db.get(mapping.enrollmentId))!;
  const appended = await ctx.db
    .query("paidRequiredPeriods")
    .withIndex("by_mapping", (q) => q.eq("mappingId", mapping._id))
    .collect();
  return [...proof.requiredPeriods, ...appended];
}
async function materializeRequiredDays(
  ctx: MutationCtx,
  mapping: Doc<"paidMappings">,
  requirements: { start: number; end: number }[],
  actor: string,
) {
  const registered = await ctx.db
    .query("paidPeriods")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", mapping.campaignSlug))
    .collect();
  for (const required of requirements) {
    const prior = registered.find(
      (p) => p.start === required.start && p.end === required.end,
    );
    if (prior) {
      if (!prior.mappingIds.includes(mapping._id))
        await ctx.db.patch(prior._id, {
          mappingIds: [...prior.mappingIds, mapping._id],
        });
    } else {
      const id = await ctx.db.insert("paidPeriods", {
        campaignSlug: mapping.campaignSlug,
        nonprofitId: mapping.nonprofitId,
        label: chicagoDay(required.start).label,
        ...required,
        mappingIds: [mapping._id],
        actor,
        source: "trusted-placement-required-period",
        at: Date.now(),
        version: 1,
      });
      registered.push((await ctx.db.get(id))!);
    }
  }
}
export async function appendTrustedPaidPeriods(
  ctx: MutationCtx,
  input: {
    mappingId: Doc<"paidMappings">["_id"];
    periods: { start: number; end: number }[];
    evidence: string;
  },
  provenance: { synthetic: boolean; actor: string; source: string },
) {
  const mapping = await ctx.db.get(input.mappingId),
    campaign = mapping
      ? await ctx.db
          .query("campaigns")
          .withIndex("by_slug", (q) => q.eq("slug", mapping.campaignSlug))
          .unique()
      : null;
  if (
    !mapping ||
    !provenance.synthetic ||
    !campaign?.fixtureRunId ||
    campaign.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID
  )
    throw new Error(
      "PAID_HELD: Trusted ongoing placement evidence required (#12)",
    );
  const settings = (await ctx.db
    .query("campaignSettings")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
    .unique())!;
  safeText(input.evidence, 200);
  if (!input.periods.length || input.periods.length > 366)
    throw new Error("PAID_PERIOD: Bounded exact period requirements needed");
  const existing = await requiredPeriods(ctx, mapping);
  let changed = false;
  for (const p of input.periods) {
    canonicalPeriod(p.start, p.end, settings.rules);
    if (existing.some((e) => e.start === p.start && e.end === p.end)) continue;
    await ctx.db.insert("paidRequiredPeriods", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      mappingId: mapping._id,
      ...p,
      evidence: input.evidence,
      actor: provenance.actor,
      source: provenance.source,
      at: Date.now(),
      version: 1,
    });
    existing.push(p);
    changed = true;
  }
  if (changed) {
    await materializeRequiredDays(ctx, mapping, existing, provenance.actor);
    const source = (await ctx.db.get(mapping.sourceId))!;
    await ctx.db.patch(source._id, { revision: source.revision + 1 });
    await audit(
      ctx,
      campaign,
      provenance.actor,
      "reporting-period-requirements-appended",
      mapping._id,
      input.evidence,
    );
  }
  return { changed };
}

// Narrow future ad-producer seam. Discovery alone supplies no enrollment proof.
// Production enrollment remains deliberately held pending #12's actual contracts.
export async function recordTrustedPaidEnrollment(
  ctx: MutationCtx,
  input: Infer<ReturnType<typeof v.object<typeof enrollmentInput>>>,
  provenance: { synthetic: boolean; actor: string; source: string },
) {
  const campaign = await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", input.campaignId))
    .unique();
  if (
    !provenance.synthetic ||
    !campaign?.fixtureRunId ||
    campaign.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID
  )
    throw new Error(
      "PAID_HELD: Actual provider enrollment validation required (#12)",
    );
  const entry = await ctx.db.get(input.entryId);
  const version = await ctx.db
    .query("photoVersions")
    .withIndex("by_entry_version", (q) =>
      q.eq("entryId", input.entryId).eq("version", input.creativeVersion),
    )
    .unique();
  if (
    !entry ||
    entry.status !== "approved" ||
    entry.campaignSlug !== campaign.slug ||
    entry.nonprofitId !== campaign.nonprofitId ||
    entry.version !== input.creativeVersion ||
    !version ||
    creativeBinding(version) !== input.creativeDigest ||
    input.destination !== trackedPath(entry._id) ||
    (input.provider === "meta"
      ? !["facebook", "instagram"].includes(input.platform)
      : input.platform !== "tiktok")
  )
    throw new Error(
      "PAID_ENROLLMENT_SCOPE: Approved unchanged creative and destination required",
    );
  for (const value of [
    input.account,
    input.adId,
    input.providerCampaign,
    input.grantRevision,
    input.evidence,
  ])
    safeText(value, 200);
  const settings = await ctx.db
    .query("campaignSettings")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
    .unique();
  if (
    !settings ||
    !input.requiredPeriods.length ||
    input.requiredPeriods.length > 366
  )
    throw new Error(
      "PAID_PERIOD: Explicit trusted reporting requirements needed",
    );
  const ordered = [...input.requiredPeriods].sort((a, b) => a.start - b.start);
  for (let i = 0; i < ordered.length; i++) {
    canonicalPeriod(ordered[i].start, ordered[i].end, settings.rules);
    if (i && ordered[i].start < ordered[i - 1].end)
      throw new Error("PAID_OVERLAP: Duplicate required period");
  }
  const { campaignId: _, ...facts } = input;
  return ctx.db.insert("paidEnrollments", {
    ...facts,
    campaignSlug: campaign.slug,
    nonprofitId: campaign.nonprofitId,
    ...provenance,
    at: Date.now(),
    version: 1,
  });
}

async function schedule(
  ctx: MutationCtx,
  source: Doc<"paidSources">,
  now: number,
  active: boolean,
  reason: string,
) {
  const generation = source.watchGeneration + 1;
  const dueAt = active ? anchor(source) + 300_001 : undefined;
  await ctx.db.patch(source._id, {
    active,
    statusReason: reason,
    watchGeneration: generation,
    dueAt,
  });
  await audit(
    ctx,
    { slug: source.campaignSlug, nonprofitId: source.nonprofitId },
    "paid-metric-monitor",
    "source-monitoring-state",
    source._id,
    stableRequest({
      active,
      activatedAt: source.activatedAt,
      lastSuccess: source.lastSuccess ?? null,
      reason,
    }),
  );
  if (dueAt !== undefined)
    await ctx.scheduler.runAfter(Math.max(0, dueAt - now), watchdogRef, {
      sourceId: source._id,
      generation,
    });
}
async function currentRequired(
  ctx: QueryCtx,
  sourceId: Doc<"paidSources">["_id"],
) {
  return (
    await ctx.db
      .query("paidMappings")
      .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
      .collect()
  ).some((m) => m.active);
}
async function notice(
  ctx: MutationCtx,
  source: Doc<"paidSources">,
  now: number,
  active: boolean,
  reason: string,
) {
  const sequence = source.incidentSequence + 1;
  await recordTrustedIncident(
    ctx,
    {
      campaignId: source.campaignSlug,
      key: `paid-${hash(source._id)}`,
      kind: "import-outage",
      sequence,
      observedAt: now,
      active,
      reason,
      evidence: `paid-source:${source._id}:generation:${source.generation}`,
      resolutionRole: "manager",
    },
    {
      producer: "paid-metric-source-monitor-v1",
      actor: "paid-metric-monitor",
      synthetic: source.synthetic,
    },
  );
  await ctx.db.patch(source._id, {
    incidentSequence: sequence,
    outage: active,
  });
}
export const watchdog = internalMutation({
  args: { sourceId: v.id("paidSources"), generation: v.number() },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source || !source.active || source.watchGeneration !== args.generation)
      return { stale: true };
    const now = await clock(ctx, source.campaignSlug);
    if (!(await currentRequired(ctx, source._id))) {
      await schedule(
        ctx,
        source,
        now,
        false,
        "No currently required placement; historical requirements retained",
      );
      return { inactive: true };
    }
    if (now - anchor(source) <= 300_000) return { outage: false };
    if (!source.outage)
      await notice(
        ctx,
        source,
        now,
        true,
        `${source.provider} / ${source.account}: import unavailable for more than five minutes. ${source.lastSuccess === undefined ? "No successful import yet" : `Last successful import ${new Date(source.lastSuccess).toISOString()}`}`,
      );
    return { outage: true };
  },
});

export const addPeriod = mutation({
  args: { ...scope, label: v.string(), start: v.number(), end: v.number() },
  handler: async (ctx, args) => {
    const { campaign, subject } = await manager(ctx, args.campaignId);
    safeText(args.label, 80);
    const settings = await ctx.db
      .query("campaignSettings")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .unique();
    if (!settings) throw new Error("PAID_PERIOD: Campaign rules required");
    canonicalPeriod(args.start, args.end, settings.rules);
    const periods = await ctx.db
      .query("paidPeriods")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .collect();
    const same = periods.find(
      (p) => p.start === args.start && p.end === args.end,
    );
    if (same) return same._id;
    if (periods.some((p) => args.start < p.end && args.end > p.start))
      throw new Error(
        "PAID_OVERLAP: Canonical periods cannot overlap; derive broader totals from these periods",
      );
    const mappings = await ctx.db
      .query("paidMappings")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .collect();
    const required = [];
    for (const m of mappings) {
      if (
        (await requiredPeriods(ctx, m)).some(
          (p) => p.start === args.start && p.end === args.end,
        )
      )
        required.push(m._id);
    }
    const id = await ctx.db.insert("paidPeriods", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      label: args.label,
      start: args.start,
      end: args.end,
      mappingIds: required,
      actor: subject,
      source: "authenticated-manager",
      at: Date.now(),
      version: 1,
    });
    await audit(
      ctx,
      campaign,
      subject,
      "canonical-period-required",
      id,
      hash([args.start, args.end]),
    );
    return id;
  },
});
export const mapPlacement = mutation({
  args: { ...scope, enrollmentId: v.id("paidEnrollments") },
  handler: async (ctx, args) => {
    const { campaign, subject } = await manager(ctx, args.campaignId),
      proof = await ctx.db.get(args.enrollmentId);
    if (
      !proof ||
      proof.campaignSlug !== campaign.slug ||
      proof.nonprofitId !== campaign.nonprofitId
    )
      throw new Error("FORBIDDEN: Enrollment scope denied");
    const entry = await ctx.db.get(proof.entryId),
      version = await ctx.db
        .query("photoVersions")
        .withIndex("by_entry_version", (q) =>
          q.eq("entryId", proof.entryId).eq("version", proof.creativeVersion),
        )
        .unique();
    if (
      !entry ||
      entry.status !== "approved" ||
      entry.version !== proof.creativeVersion ||
      !version ||
      creativeBinding(version) !== proof.creativeDigest
    )
      throw new Error(
        "PAID_ENROLLMENT_SCOPE: Current approved unchanged creative required",
      );
    const sources = await ctx.db
      .query("paidSources")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .collect();
    let source = sources.find(
      (s) => s.provider === proof.provider && s.account === proof.account,
    );
    const now = await clock(ctx, campaign.slug);
    if (!source) {
      const id = await ctx.db.insert("paidSources", {
        campaignSlug: campaign.slug,
        nonprofitId: campaign.nonprofitId,
        provider: proof.provider,
        account: proof.account,
        active: false,
        activatedAt: now,
        revision: 0,
        generation: 0,
        watchGeneration: 0,
        nextAt: 0,
        incidentSequence: 0,
        outage: false,
        statusReason: "First required use",
        synthetic: proof.synthetic,
        freshnessMs: 900_000,
      });
      source = (await ctx.db.get(id))!;
    }
    const same = await ctx.db
      .query("paidMappings")
      .withIndex("by_placement", (q) =>
        q
          .eq("provider", proof.provider)
          .eq("account", proof.account)
          .eq("adId", proof.adId)
          .eq("platform", proof.platform),
      )
      .unique();
    if (same) {
      if (
        same.enrollmentId !== proof._id ||
        same.campaignSlug !== campaign.slug ||
        same.entryId !== proof.entryId
      )
        throw new Error(
          "PAID_MAPPING_CONFLICT: Historical placement cannot be reassigned",
        );
      if (same.active) return same._id;
      await ctx.db.patch(same._id, {
        active: true,
        revokedAt: undefined,
        revokedBy: undefined,
      });
    }
    const id =
      same?._id ??
      (await ctx.db.insert("paidMappings", {
        campaignSlug: campaign.slug,
        nonprofitId: campaign.nonprofitId,
        enrollmentId: proof._id,
        sourceId: source._id,
        entryId: proof.entryId,
        provider: proof.provider,
        account: proof.account,
        platform: proof.platform,
        adId: proof.adId,
        active: true,
        actor: subject,
        source: "authenticated-manager-enrollment",
        at: Date.now(),
        version: 1,
      }));
    const requirements = same
      ? await requiredPeriods(ctx, same)
      : proof.requiredPeriods;
    await materializeRequiredDays(
      ctx,
      (await ctx.db.get(id))!,
      requirements,
      subject,
    );
    const revision = source.revision + 1;
    await ctx.db.patch(source._id, {
      revision,
      ...(!source.active ? { activatedAt: now } : {}),
    });
    source = (await ctx.db.get(source._id))!;
    await schedule(
      ctx,
      source,
      now,
      true,
      "Required placement monitoring active",
    );
    await audit(
      ctx,
      campaign,
      subject,
      same ? "placement-reactivated" : "placement-mapped",
      id,
      proof.evidence,
    );
    return id;
  },
});
export const revokePlacement = mutation({
  args: { ...scope, mappingId: v.id("paidMappings") },
  handler: async (ctx, args) => {
    const { campaign, subject } = await manager(ctx, args.campaignId),
      mapping = await ctx.db.get(args.mappingId);
    if (
      !mapping ||
      mapping.campaignSlug !== campaign.slug ||
      mapping.nonprofitId !== campaign.nonprofitId
    )
      throw new Error("FORBIDDEN: Mapping scope denied");
    if (!mapping.active) return;
    await ctx.db.patch(mapping._id, {
      active: false,
      revokedAt: Date.now(),
      revokedBy: subject,
    });
    const source = (await ctx.db.get(mapping.sourceId))!;
    await ctx.db.patch(source._id, { revision: source.revision + 1 });
    await schedule(
      ctx,
      source,
      await clock(ctx, campaign.slug),
      await currentRequired(ctx, source._id),
      "Placement requirement changed; historical coverage retained",
    );
    await audit(
      ctx,
      campaign,
      subject,
      "placement-revoked",
      mapping._id,
      "Future monitoring stopped where no active placement remains; no import success asserted",
    );
  },
});

export const requestImport = mutation({
  args: {
    ...scope,
    sourceId: v.id("paidSources"),
    periodId: v.id("paidPeriods"),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { campaign, subject } = await manager(ctx, args.campaignId),
      source = await ctx.db.get(args.sourceId),
      period = await ctx.db.get(args.periodId);
    if (
      !source ||
      !period ||
      source.campaignSlug !== campaign.slug ||
      period.campaignSlug !== campaign.slug ||
      source.nonprofitId !== campaign.nonprofitId
    )
      throw new Error("FORBIDDEN: Import scope denied");
    operationIdentity(args.operationId);
    const previous = await ctx.db
      .query("paidOperations")
      .withIndex("by_operation", (q) =>
        q.eq("campaignSlug", campaign.slug).eq("operationId", args.operationId),
      )
      .unique();
    if (previous) {
      if (
        previous.sourceId !== source._id ||
        previous.periodId !== period._id ||
        previous.actor !== subject
      )
        throw new Error("PAID_CONFLICT: Import operation changed");
      return previous._id;
    }
    const now = await clock(ctx, campaign.slug);
    if (source.retryHold)
      throw new Error(
        "PAID_BACKOFF_HELD: Provider retry policy needs trusted review",
      );
    if (now < source.nextAt)
      throw new Error("PAID_BACKOFF: Provider retry time has not arrived");
    const mappingIds = [];
    for (const id of period.mappingIds) {
      const m = await ctx.db.get(id);
      if (m?.sourceId === source._id) mappingIds.push(id);
    }
    if (!mappingIds.length)
      throw new Error("PAID_SCOPE: No required placements in this period");
    const generation = source.generation + 1;
    await ctx.db.patch(source._id, { generation, nextAt: now + 30_000 });
    const id = await ctx.db.insert("paidOperations", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      actor: subject,
      source: "authenticated-manager",
      at: Date.now(),
      version: 1,
      operationId: args.operationId,
      sourceId: source._id,
      periodId: period._id,
      generation,
      inputRevision: source.revision,
      mappingIds,
      state: "queued",
      reason: "Awaiting validated provider reader",
      leaseUntil: now + 60_000,
    });
    await ctx.scheduler.runAfter(60_001, operationWatchdogRef, {
      operationId: id,
      generation,
    });
    return id;
  },
});

const receiptScope = {
  operationId: v.id("paidOperations"),
  fixtureRunId: v.string(),
  at: v.number(),
};
function signature(value: any, supplied: string) {
  const secret = process.env.PAID_METRIC_RECEIPT_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("FORBIDDEN: Paid reader unavailable");
  const expected = bytesToHex(
    hmac(
      sha256,
      new TextEncoder().encode(secret),
      new TextEncoder().encode(stableRequest(value)),
    ),
  );
  let difference = expected.length ^ supplied.length;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ (supplied.charCodeAt(i) || 0);
  if (
    difference ||
    !Number.isSafeInteger(value.at) ||
    Math.abs(Date.now() - value.at) > 30_000
  )
    throw new Error("FORBIDDEN: Invalid paid reader receipt");
}
async function receipt(
  ctx: MutationCtx,
  input: { operationId: Doc<"paidOperations">["_id"]; fixtureRunId: string },
) {
  const op = await ctx.db.get(input.operationId),
    campaign = op
      ? await ctx.db
          .query("campaigns")
          .withIndex("by_slug", (q) => q.eq("slug", op.campaignSlug))
          .unique()
      : null;
  if (
    !op ||
    !campaign?.fixtureRunId ||
    campaign.fixtureRunId !== input.fixtureRunId ||
    input.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID
  )
    throw new Error(
      "PAID_HELD: Actual provider reporting validation required (#12)",
    );
  return op;
}
export const claim = mutation({
  args: { value: v.object(receiptScope), signature: v.string() },
  handler: async (ctx, args) => {
    signature(args.value, args.signature);
    const op = await receipt(ctx, args.value),
      source = (await ctx.db.get(op.sourceId))!;
    if (op.state !== "queued") return null;
    // Recheck the current manager and source input even after HTTP authentication.
    const member = await ctx.db
      .query("memberships")
      .withIndex("by_subject_nonprofit", (q) =>
        q.eq("subject", op.actor).eq("nonprofitId", op.nonprofitId),
      )
      .unique();
    if (
      !member?.active ||
      member.role !== "manager" ||
      source.generation !== op.generation ||
      source.revision !== op.inputRevision
    ) {
      await ctx.db.patch(op._id, {
        state: "superseded",
        reason: "Authority or required mapping changed",
      });
      return null;
    }
    const now = await clock(ctx, op.campaignSlug);
    if (op.leaseUntil !== undefined && now > op.leaseUntil) return null;
    await ctx.db.patch(op._id, { state: "reading", startedAt: Date.now() });
    const mappings = await Promise.all(
      op.mappingIds.map(async (id) => {
        const m = (await ctx.db.get(id))!,
          proof = (await ctx.db.get(m.enrollmentId))!;
        return { ...m, proof };
      }),
    );
    return { op, source, period: (await ctx.db.get(op.periodId))!, mappings };
  },
});
const completion = v.object({
  ...receiptScope,
  outcome: v.union(v.literal("success"), v.literal("failed")),
  reason: v.string(),
  retryMs: v.number(),
  retryHold: v.optional(v.string()),
  rows: v.array(reportRow),
  reportEvidence: v.string(),
});
export const operationWatchdog = internalMutation({
  args: { operationId: v.id("paidOperations"), generation: v.number() },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.operationId);
    if (
      !op ||
      op.generation !== args.generation ||
      !["queued", "reading"].includes(op.state)
    )
      return { stale: true };
    const now = await clock(ctx, op.campaignSlug);
    if (op.leaseUntil === undefined || now <= op.leaseUntil)
      return { due: false };
    const source = (await ctx.db.get(op.sourceId))!;
    const current =
      source.generation === op.generation &&
      source.revision === op.inputRevision;
    await ctx.db.patch(op._id, {
      state: current ? "failed" : "superseded",
      reason: "Import reader lease expired; no successful operation asserted",
      finishedAt: Date.now(),
    });
    if (current) {
      await ctx.db.patch(source._id, {
        nextAt: Math.max(source.nextAt, now + 60_000),
        statusReason:
          "Latest import reader lease expired; prior successful operation unchanged",
      });
      for (const mappingId of op.mappingIds)
        for (const metric of metrics) {
          const mapping = (await ctx.db.get(mappingId))!;
          const previous = await ctx.db
            .query("paidCoverage")
            .withIndex("by_scope", (q) =>
              q
                .eq("mappingId", mappingId)
                .eq("periodId", op.periodId)
                .eq("metric", metric),
            )
            .unique();
          const data = {
            campaignSlug: op.campaignSlug,
            nonprofitId: op.nonprofitId,
            entryId: mapping.entryId,
            mappingId,
            sourceId: source._id,
            periodId: op.periodId,
            metric,
            inputRevision: op.inputRevision,
            generation: op.generation,
            operationId: op._id,
            complete: false,
            reason: "Import reader lease expired; prior observations retained",
            observedAt: now,
            provenance: "owned-controlled-unvalidated" as const,
          };
          if (previous)
            await ctx.db.patch(previous._id, {
              ...data,
              currentDataAsOf: undefined,
            });
          else await ctx.db.insert("paidCoverage", data);
        }
    }
    await audit(
      ctx,
      { slug: op.campaignSlug, nonprofitId: op.nonprofitId },
      "paid-metric-watchdog",
      "import-reader-expired",
      op._id,
      "Reader did not complete before durable lease",
    );
    return { expired: true };
  },
});
export const complete = mutation({
  args: { value: completion, signature: v.string() },
  handler: async (ctx, args) => {
    signature(args.value, args.signature);
    const value = args.value,
      op = await receipt(ctx, value),
      source = (await ctx.db.get(op.sourceId))!,
      period = (await ctx.db.get(op.periodId))!;
    const fingerprint = hash({
      ...value,
      at: 0,
      rows: [...value.rows].sort((a, b) =>
        `${a.mappingId}:${a.metric}`.localeCompare(
          `${b.mappingId}:${b.metric}`,
        ),
      ),
    });
    if (op.fingerprint) {
      if (op.fingerprint !== fingerprint)
        throw new Error("PAID_REPLAY_CONFLICT: Completed report changed");
      return { state: op.state };
    }
    if (op.state !== "reading")
      throw new Error("PAID_OPERATION: Reader was not claimed");
    const member = await ctx.db
      .query("memberships")
      .withIndex("by_subject_nonprofit", (q) =>
        q.eq("subject", op.actor).eq("nonprofitId", op.nonprofitId),
      )
      .unique();
    if (
      source.generation !== op.generation ||
      source.revision !== op.inputRevision ||
      !member?.active ||
      member.role !== "manager"
    ) {
      await ctx.db.patch(op._id, {
        state: "superseded",
        reason: "Newer import, mapping or authority superseded this read",
        fingerprint,
        finishedAt: Date.now(),
      });
      return { state: "superseded" };
    }
    safeText(value.reason, 300);
    safeText(value.reportEvidence, 200);
    const now = await clock(ctx, op.campaignSlug),
      seen = new Set<string>();
    if (
      !Number.isSafeInteger(value.retryMs) ||
      value.retryMs < 30_000 ||
      !Number.isSafeInteger(now + value.retryMs) ||
      now + value.retryMs > 8_640_000_000_000_000
    )
      throw new Error("PAID_RETRY: Invalid retry policy");
    if (value.retryHold) safeText(value.retryHold, 200);
    if (op.leaseUntil !== undefined && now > op.leaseUntil)
      throw new Error("PAID_OPERATION: Reader lease expired");
    for (const row of value.rows) {
      const key = `${row.mappingId}:${row.metric}`;
      if (
        seen.has(key) ||
        !op.mappingIds.includes(row.mappingId) ||
        row.start !== period.start ||
        row.end !== period.end ||
        !Number.isSafeInteger(row.value) ||
        row.value < 0 ||
        !Number.isSafeInteger(row.revision) ||
        row.revision < 1 ||
        (row.dataAsOf !== undefined &&
          (!Number.isSafeInteger(row.dataAsOf) ||
            row.dataAsOf < period.end ||
            row.dataAsOf > now))
      )
        throw new Error(
          "PAID_REPORT: Malformed, duplicate or out-of-scope metric",
        );
      safeText(row.evidence, 200);
      seen.add(key);
    }
    // Validate all corrections before committing any observation. A stale/backfilled
    // read cannot replace a newer accepted source fact or certify its coverage.
    const rows = new Map(
      value.rows.map((r) => [`${r.mappingId}:${r.metric}`, r]),
    );
    // Check whole-entry arithmetic before accepting the transaction, including
    // observations from other providers and the current report's corrections.
    const totals = new Map<string, number>();
    for (const mappingId of period.mappingIds) {
      const m = (await ctx.db.get(mappingId))!;
      for (const metric of metrics) {
        const history = await ctx.db
            .query("paidObservations")
            .withIndex("by_scope", (q) =>
              q
                .eq("mappingId", mappingId)
                .eq("periodId", period._id)
                .eq("metric", metric),
            )
            .collect(),
          prior = history.sort((a, b) => b.revision - a.revision)[0],
          row = rows.get(`${mappingId}:${metric}`);
        const candidate =
          value.outcome === "success" &&
          row &&
          row.dataAsOf !== undefined &&
          (!prior ||
            (row.revision > prior.revision && row.dataAsOf >= prior.dataAsOf))
            ? row.value
            : prior?.value;
        if (candidate !== undefined) {
          const key = `${m.entryId}:${metric}`,
            sum = (totals.get(key) ?? 0) + candidate;
          if (!Number.isSafeInteger(sum))
            throw new Error(
              "PAID_OVERFLOW: Entry aggregate exceeds safe integer range",
            );
          totals.set(key, sum);
        }
      }
    }
    for (const mappingId of op.mappingIds)
      for (const metric of metrics) {
        const mapping = (await ctx.db.get(mappingId))!,
          row = rows.get(`${mappingId}:${metric}`);
        const history = await ctx.db
          .query("paidObservations")
          .withIndex("by_scope", (q) =>
            q
              .eq("mappingId", mappingId)
              .eq("periodId", period._id)
              .eq("metric", metric),
          )
          .collect();
        const prior = history.sort((a, b) => b.revision - a.revision)[0];
        let reason =
          value.outcome === "failed"
            ? "Import operation failed; prior observations retained"
            : !row
              ? "Required placement or metric missing"
              : row.dataAsOf === undefined
                ? "Source data-as-of unknown"
                : !row.complete
                  ? "Exact period completeness unproven"
                  : now - row.dataAsOf > source.freshnessMs
                    ? "Source evidence stale"
                    : prior &&
                        (row.revision < prior.revision ||
                          row.dataAsOf < prior.dataAsOf)
                      ? "Older source evidence; prior observation retained"
                      : "Complete owned controlled scope; production validation held (#12)";
        if (
          prior &&
          row?.dataAsOf !== undefined &&
          row.revision === prior.revision &&
          (row.value !== prior.value || row.dataAsOf !== prior.dataAsOf)
        )
          throw new Error("PAID_REPLAY_CONFLICT: Source revision changed");
        const complete =
          value.outcome === "success" &&
          !!row &&
          row.dataAsOf !== undefined &&
          row.complete &&
          now - row.dataAsOf <= source.freshnessMs &&
          (!prior ||
            (row.revision >= prior.revision && row.dataAsOf >= prior.dataAsOf));
        if (
          value.outcome === "success" &&
          row &&
          row.dataAsOf !== undefined &&
          (!prior ||
            (row.revision > prior.revision && row.dataAsOf >= prior.dataAsOf))
        )
          await ctx.db.insert("paidObservations", {
            campaignSlug: op.campaignSlug,
            nonprofitId: op.nonprofitId,
            actor: "owned-paid-reader",
            source: "owned-provider-report-v1",
            at: Date.now(),
            version: 1,
            mappingId,
            entryId: mapping.entryId,
            sourceId: source._id,
            periodId: period._id,
            metric,
            value: row.value,
            revision: row.revision,
            dataAsOf: row.dataAsOf,
            evidence: row.evidence,
            fingerprint: hash(row),
            operationId: op._id,
          });
        const coverage = await ctx.db
          .query("paidCoverage")
          .withIndex("by_scope", (q) =>
            q
              .eq("mappingId", mappingId)
              .eq("periodId", period._id)
              .eq("metric", metric),
          )
          .unique();
        const data = {
          campaignSlug: op.campaignSlug,
          nonprofitId: op.nonprofitId,
          entryId: mapping.entryId,
          mappingId,
          sourceId: source._id,
          periodId: period._id,
          metric,
          inputRevision: op.inputRevision,
          generation: op.generation,
          operationId: op._id,
          complete,
          reason,
          observedAt: now,
          ...(value.outcome === "success" && row?.dataAsOf !== undefined
            ? { currentDataAsOf: row.dataAsOf }
            : {}),
          provenance: "owned-controlled-unvalidated" as const,
        };
        let coverageId: Doc<"paidCoverage">["_id"];
        if (coverage) {
          coverageId = coverage._id;
          await ctx.db.patch(coverage._id, {
            ...data,
            currentDataAsOf:
              value.outcome === "success" ? row?.dataAsOf : undefined,
          });
        } else coverageId = await ctx.db.insert("paidCoverage", data);
        if (complete && row?.dataAsOf !== undefined)
          await ctx.scheduler.runAfter(
            Math.max(0, row.dataAsOf + source.freshnessMs + 1 - now),
            coverageExpiryRef,
            { coverageId, operationId: op._id },
          );
      }
    if (value.outcome === "success")
      await reconcileCorrections(ctx, op, period, value.rows);
    const retryAt = now + value.retryMs;
    await ctx.db.patch(op._id, {
      state: value.outcome,
      reason: value.reason,
      fingerprint,
      finishedAt: Date.now(),
      retryAt,
      reportedRows: value.rows,
    });
    await ctx.db.patch(source._id, {
      nextAt: retryAt,
      retryHold: value.retryHold,
      ...(value.outcome === "failed"
        ? {
            statusReason: `Latest import failed: ${value.reason}. Last successful operation unchanged.`,
          }
        : {}),
      ...(value.outcome === "success" ? { lastSuccess: now } : {}),
    });
    if (value.outcome === "success") {
      if (source.outage)
        await notice(
          ctx,
          source,
          now,
          false,
          `${source.provider} / ${source.account}: import operation recovered. Period coverage remains separately evaluated.`,
        );
      await schedule(
        ctx,
        { ...source, lastSuccess: now },
        now,
        await currentRequired(ctx, source._id),
        "Successful import operation; coverage assessed separately",
      );
    }
    await audit(
      ctx,
      { slug: op.campaignSlug, nonprofitId: op.nonprofitId },
      op.actor,
      `import-${value.outcome}`,
      op._id,
      value.reportEvidence,
    );
    return { state: value.outcome };
  },
});
export const expireCoverage = internalMutation({
  args: {
    coverageId: v.id("paidCoverage"),
    operationId: v.id("paidOperations"),
  },
  handler: async (ctx, args) => {
    const coverage = await ctx.db.get(args.coverageId);
    if (
      !coverage ||
      coverage.operationId !== args.operationId ||
      !coverage.complete
    )
      return { superseded: true };
    const source = (await ctx.db.get(coverage.sourceId))!,
      now = await clock(ctx, coverage.campaignSlug);
    if (
      coverage.currentDataAsOf !== undefined &&
      now - coverage.currentDataAsOf <= source.freshnessMs
    )
      return { expired: false };
    await ctx.db.patch(coverage._id, {
      complete: false,
      reason: "Source evidence stale; controlled freshness budget expired",
    });
    await audit(
      ctx,
      { slug: coverage.campaignSlug, nonprofitId: coverage.nonprofitId },
      "paid-metric-coverage-monitor",
      "coverage-expired",
      coverage._id,
      `operation:${args.operationId}`,
    );
    return { expired: true };
  },
});

export interface PaidMetricInputCoverage {
  mappingId: Doc<"paidMappings">["_id"];
  sourceId: Doc<"paidSources">["_id"];
  platform: Doc<"paidMappings">["platform"];
  metric: "impressions" | "linkClicks";
  value: number | null;
  dataAsOf: number | null;
  latestDataAsOf: number | null;
  reportingDelayMs: number | null;
  complete: boolean;
  reason: string;
  provenance: string | null;
  coverageId: Doc<"paidCoverage">["_id"] | null;
  operationId: Doc<"paidOperations">["_id"] | null;
  latestOperationState: string;
  inputRevision: number | null;
  generation: number | null;
  observedAt: number | null;
  observationHistory: Doc<"paidObservations">[];
}

// Typed projection for T13/T14/T16: exact canonical inputs, never scores or awards.
// Coverage carries provenance; even complete controlled proof cannot finalize.
export async function importedInputProjection(
  ctx: QueryCtx,
  campaignSlug: string,
) {
  const periods = await ctx.db
    .query("paidPeriods")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignSlug))
    .collect();
  const result = [];
  const now = await clock(ctx, campaignSlug);
  for (const period of periods) {
    const entries = new Map<
      string,
      {
        entryId: string;
        impressions: number;
        linkClicks: number;
        platforms: Record<string, { impressions: number; linkClicks: number }>;
        coverage: PaidMetricInputCoverage[];
      }
    >();
    for (const mappingId of period.mappingIds) {
      const mapping = (await ctx.db.get(mappingId))!;
      let entry = entries.get(mapping.entryId);
      if (!entry) {
        entry = {
          entryId: mapping.entryId,
          impressions: 0,
          linkClicks: 0,
          platforms: {},
          coverage: [],
        };
        entries.set(mapping.entryId, entry);
      }
      entry.platforms[mapping.platform] ??= { impressions: 0, linkClicks: 0 };
      for (const metric of metrics) {
        const observations = await ctx.db
            .query("paidObservations")
            .withIndex("by_scope", (q) =>
              q
                .eq("mappingId", mappingId)
                .eq("periodId", period._id)
                .eq("metric", metric),
            )
            .collect(),
          observation = observations.sort((a, b) => b.revision - a.revision)[0];
        const coverage = await ctx.db
          .query("paidCoverage")
          .withIndex("by_scope", (q) =>
            q
              .eq("mappingId", mappingId)
              .eq("periodId", period._id)
              .eq("metric", metric),
          )
          .unique();
        const source = (await ctx.db.get(mapping.sourceId))!;
        const fresh =
          observation && now - observation.dataAsOf <= source.freshnessMs;
        const complete = !!coverage?.complete && !!fresh;
        const latestOperation = coverage
          ? await ctx.db.get(coverage.operationId)
          : null;
        if (observation) {
          for (const target of [entry, entry.platforms[mapping.platform]]) {
            const sum = target[metric] + observation.value;
            if (!Number.isSafeInteger(sum))
              throw new Error(
                "PAID_OVERFLOW: Aggregate exceeds safe integer range",
              );
            target[metric] = sum;
          }
        }
        entry.coverage.push({
          mappingId,
          sourceId: mapping.sourceId,
          platform: mapping.platform,
          metric,
          value: observation?.value ?? null,
          dataAsOf: observation?.dataAsOf ?? null,
          latestDataAsOf: coverage?.currentDataAsOf ?? null,
          reportingDelayMs:
            coverage?.currentDataAsOf === undefined
              ? null
              : now - coverage.currentDataAsOf,
          complete,
          reason: !coverage
            ? "Required scope has not been imported"
            : coverage.complete && !fresh
              ? "Source evidence stale"
              : coverage.reason,
          provenance: coverage?.provenance ?? null,
          coverageId: coverage?._id ?? null,
          operationId: coverage?.operationId ?? null,
          latestOperationState: latestOperation?.state ?? "not-read",
          inputRevision: coverage?.inputRevision ?? null,
          generation: coverage?.generation ?? null,
          observedAt: coverage?.observedAt ?? null,
          observationHistory: observations,
        });
      }
    }
    result.push({
      period,
      entries: [...entries.values()].map((e) => ({
        ...e,
        impressions: e.coverage.some(
          (c) => c.metric === "impressions" && c.value !== null,
        )
          ? e.impressions
          : null,
        linkClicks: e.coverage.some(
          (c) => c.metric === "linkClicks" && c.value !== null,
        )
          ? e.linkClicks
          : null,
        platforms: Object.fromEntries(
          Object.entries(e.platforms).map(([p, v]) => [
            p,
            {
              impressions: e.coverage.some(
                (c) =>
                  c.platform === p &&
                  c.metric === "impressions" &&
                  c.value !== null,
              )
                ? v.impressions
                : null,
              linkClicks: e.coverage.some(
                (c) =>
                  c.platform === p &&
                  c.metric === "linkClicks" &&
                  c.value !== null,
              )
                ? v.linkClicks
                : null,
            },
          ]),
        ),
        complete: e.coverage.length > 0 && e.coverage.every((c) => c.complete),
        productionEligible: false as const,
        finalizationHold:
          "Actual provider measurement, Chicago attribution and completeness validation required (#12)",
      })),
    });
  }
  return result;
}
export async function paidInputProjection(ctx: QueryCtx, campaignSlug: string) {
  const raw = await importedInputProjection(ctx, campaignSlug),
    state = await correctionState(ctx, campaignSlug);
  return raw.map((p) => {
    const entries = [...p.entries];
    for (const c of state.corrections.filter(
      (c) => c.active && c.start < p.period.end && c.end > p.period.start,
    ))
      if (!entries.some((e) => e.entryId === c.entryId))
        entries.push({
          entryId: c.entryId,
          impressions: null,
          linkClicks: null,
          platforms: {},
          coverage: [],
          complete: false,
          productionEligible: false,
          finalizationHold:
            "Actual provider measurement validation required (#12)",
        });
    return {
      ...p,
      entries: entries.map((e) => {
        const metricAuthority = Object.fromEntries(
          metrics.map((metric) => [
            metric,
            resolveMetric(
              [
                {
                  start: p.period.start,
                  end: p.period.end,
                  value: e[metric],
                  complete:
                    e.coverage.some((c) => c.metric === metric) &&
                    e.coverage
                      .filter((c) => c.metric === metric)
                      .every((c) => c.complete),
                },
              ],
              state.corrections,
              e.entryId,
              metric,
              p.period.start,
              p.period.end,
            ),
          ]),
        );
        return {
          ...e,
          impressions: metricAuthority.impressions.value,
          linkClicks: metricAuthority.linkClicks.value,
          complete: metrics.every((m) => metricAuthority[m].complete),
          metricAuthority,
          platformBreakdown:
            "Imported provenance only; entry corrections are not allocated to platforms",
        };
      }),
    };
  });
}
// A consumer supplies an exact contiguous competition window, never completeness.
// Days are enumerated in Chicago (including DST); absence of a required day is a
// hold, not an empty zero. Each daily placement snapshot contributes exactly once.
export async function paidWindowProjection(
  ctx: QueryCtx,
  campaignSlug: string,
  start: number,
  end: number,
) {
  const settings = await ctx.db
    .query("campaignSettings")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignSlug))
    .unique();
  if (
    !settings ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start >= end ||
    start < Date.parse(settings.rules.campaignStart) ||
    end > Date.parse(settings.rules.campaignEnd)
  )
    throw new Error(
      "PAID_WINDOW: Bounded canonical competition window required",
    );
  const all = await paidInputProjection(ctx, campaignSlug),
    days = canonicalDays(start, end, settings.rules);
  const correctionHeads = await correctionState(ctx, campaignSlug);
  const entryIds = [
    ...new Set([
      ...all
        .filter((p) => p.period.start >= start && p.period.end <= end)
        .flatMap((p) => p.entries.map((e) => e.entryId)),
      ...correctionHeads.corrections
        .filter((c) => c.active && c.start < end && c.end > start)
        .map((c) => c.entryId),
    ]),
  ];
  const entries = await Promise.all(
    entryIds.map(async (entryId) => {
      const coverage = days.map((day) => {
        const input = all
          .find((p) => p.period.start === day.start && p.period.end === day.end)
          ?.entries.find((e) => e.entryId === entryId);
        return {
          day,
          input: input ?? null,
          complete: input?.complete ?? false,
          reason: input
            ? input.complete
              ? "Exact controlled daily coverage"
              : "Required daily metric coverage incomplete"
            : "No trusted required-placement evidence for this competition day",
        };
      });
      function sum(metric: "impressions" | "linkClicks", platform?: string) {
        let total: number | null = null;
        for (const c of coverage) {
          const value = platform
            ? c.input?.platforms[platform]?.[metric]
            : c.input?.[metric];
          if (value !== null && value !== undefined) {
            const next: number = (total ?? 0) + value;
            if (!Number.isSafeInteger(next))
              throw new Error(
                "PAID_OVERFLOW: Window aggregate exceeds safe integer range",
              );
            total = next;
          }
        }
        return total;
      }
      const platforms = Object.fromEntries(
        ["facebook", "instagram", "tiktok"].map((p) => [
          p,
          {
            impressions: sum("impressions", p),
            linkClicks: sum("linkClicks", p),
          },
        ]),
      );
      return {
        entryId,
        platformBreakdown:
          "Imported provenance only; entry corrections are not allocated to platforms",
        impressions: (
          await metricScope(
            ctx,
            campaignSlug,
            entryId,
            "impressions",
            start,
            end,
          )
        ).value,
        linkClicks: (
          await metricScope(
            ctx,
            campaignSlug,
            entryId,
            "linkClicks",
            start,
            end,
          )
        ).value,
        platforms,
        coverage,
        complete:
          (
            await metricScope(
              ctx,
              campaignSlug,
              entryId,
              "impressions",
              start,
              end,
            )
          ).complete &&
          (
            await metricScope(
              ctx,
              campaignSlug,
              entryId,
              "linkClicks",
              start,
              end,
            )
          ).complete,
        productionEligible: false as const,
        finalizationHold:
          "Actual provider validation (#12); every required canonical day must be complete",
      };
    }),
  );
  return {
    start,
    end,
    days,
    entries,
    complete: entries.length > 0 && entries.every((e) => e.complete),
    productionEligible: false as const,
  };
}
export const window = query({
  args: { ...scope, start: v.number(), end: v.number() },
  handler: async (ctx, args) => {
    const { campaign } = await manager(ctx, args.campaignId);
    return paidWindowProjection(ctx, campaign.slug, args.start, args.end);
  },
});
export const read = query({
  args: scope,
  handler: async (ctx, args) => {
    const { campaign } = await manager(ctx, args.campaignId);
    return {
      productionEligible: false as const,
      gate: "#12: actual provider/account/reporting validation held",
      enrollments: await ctx.db
        .query("paidEnrollments")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
        .collect(),
      mappings: await ctx.db
        .query("paidMappings")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
        .collect(),
      sources: await ctx.db
        .query("paidSources")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
        .collect(),
      inputs: await paidInputProjection(ctx, campaign.slug),
      correctionState: await correctionState(ctx, campaign.slug),
      correctionEntries: await Promise.all(
        (
          await ctx.db
            .query("photoEntries")
            .withIndex("by_campaign", (q) =>
              q.eq("campaignSlug", campaign.slug),
            )
            .collect()
        ).map(async (entry) => ({
          _id: entry._id,
          title:
            (
              await ctx.db
                .query("photoVersions")
                .withIndex("by_entry_version", (q) =>
                  q.eq("entryId", entry._id).eq("version", entry.version),
                )
                .unique()
            )?.title ?? "Untitled entry",
        })),
      ),
      correctionBounds:
        (
          await ctx.db
            .query("campaignSettings")
            .withIndex("by_campaign", (q) =>
              q.eq("campaignSlug", campaign.slug),
            )
            .unique()
        )?.rules ?? null,
      operations: (await ctx.db.query("paidOperations").collect()).filter(
        (o) => o.campaignSlug === campaign.slug,
      ),
      audit: await ctx.db
        .query("paidAudit")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
        .collect(),
    };
  },
});

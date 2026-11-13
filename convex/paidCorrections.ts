import { v, type Infer } from "convex/values";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { reportRow } from "./paidMetricSchema.ts";
import {
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
  type Doc,
} from "./functions.ts";
import {
  authorizedCampaign,
  operationIdentity,
  stableRequest,
} from "./access.ts";
import { paidMetric } from "./paidMetricSchema.ts";
import { correctionState, resolveMetric } from "./paidMetricAuthority.ts";
import { chicagoDay } from "./allocation/chicago.ts";
import { importedInputProjection } from "./paidMetrics.ts";
import { recordTrustedIncident, safeText } from "./operatorIncidents.ts";

export async function paidManager(ctx: QueryCtx, campaignId: string) {
  const result = await authorizedCampaign(ctx, campaignId);
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_subject_nonprofit", (q) =>
      q
        .eq("subject", result.subject)
        .eq("nonprofitId", result.campaign.nonprofitId),
    )
    .unique();
  if (!membership?.active || membership.role !== "manager")
    throw new Error("FORBIDDEN: Current campaign manager required");
  return result;
}
const scope = {
  campaignId: v.string(),
  entryId: v.id("photoEntries"),
  metric: paidMetric,
  start: v.number(),
  end: v.number(),
};
async function validate(
  ctx: QueryCtx,
  args: {
    campaignId: string;
    entryId: Doc<"photoEntries">["_id"];
    start: number;
    end: number;
  },
) {
  const auth = await paidManager(ctx, args.campaignId),
    entry = await ctx.db.get(args.entryId);
  if (
    !entry ||
    entry.campaignSlug !== auth.campaign.slug ||
    entry.nonprofitId !== auth.campaign.nonprofitId
  )
    throw new Error("FORBIDDEN: Entry access denied");
  const settings = (await ctx.db
    .query("campaignSettings")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", auth.campaign.slug))
    .unique())!;
  if (
    !Number.isSafeInteger(args.start) ||
    !Number.isSafeInteger(args.end) ||
    args.start >= args.end ||
    args.start < Date.parse(settings.rules.campaignStart) ||
    args.end > Date.parse(settings.rules.campaignEnd)
  )
    throw new Error(
      "PAID_CORRECTION_SCOPE: Exact bounded campaign range required",
    );
  return auth;
}
export async function metricScope(
  ctx: QueryCtx,
  campaignSlug: string,
  entryId: string,
  metric: "impressions" | "linkClicks",
  start: number,
  end: number,
  apply = true,
) {
  const raw = await importedInputProjection(ctx, campaignSlug),
    state = await correctionState(ctx, campaignSlug);
  const days = raw.map((p) => {
    const e = p.entries.find((e) => e.entryId === entryId),
      coverage = e?.coverage.filter((c) => c.metric === metric) ?? [];
    return {
      start: p.period.start,
      end: p.period.end,
      value: e?.[metric] ?? null,
      complete: coverage.length > 0 && coverage.every((c) => c.complete),
    };
  });
  const result = resolveMetric(
    days,
    apply ? state.corrections : [],
    entryId,
    metric,
    start,
    end,
  );
  const inputs = raw
    .filter((p) => p.period.start < end && p.period.end > start)
    .flatMap((p) =>
      p.entries
        .filter((e) => e.entryId === entryId)
        .flatMap((e) => e.coverage.filter((c) => c.metric === metric)),
    );
  const inputFingerprint = bytesToHex(
    sha256(
      new TextEncoder().encode(
        stableRequest({
          days,
          inputs: inputs.map((c) => ({
            mappingId: c.mappingId,
            value: c.value,
            operationId: c.operationId,
            inputRevision: c.inputRevision,
            generation: c.generation,
            complete: c.complete,
            dataAsOf: c.dataAsOf,
          })),
          revision: state.revision,
        }),
      ),
    ),
  );
  return { ...result, inputFingerprint };
}
export const inspect = query({
  args: scope,
  handler: async (ctx, args) => {
    const { campaign } = await validate(ctx, args);
    return metricScope(
      ctx,
      campaign.slug,
      args.entryId,
      args.metric,
      args.start,
      args.end,
    );
  },
});
export const save = mutation({
  args: {
    ...scope,
    value: v.number(),
    reason: v.string(),
    source: v.string(),
    certified: v.boolean(),
    evidence: v.optional(v.string()),
    expectedInputFingerprint: v.string(),
    expectedRevision: v.number(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { campaign, subject } = await validate(ctx, args);
    operationIdentity(args.operationId);
    const fingerprint = stableRequest({
        ...args,
        evidence: args.evidence ?? null,
      }),
      state = await correctionState(ctx, campaign.slug);
    const retry = state.corrections.find(
      (c) => c.actor === subject && c.operationId === args.operationId,
    );
    if (retry) {
      if (retry.fingerprint !== fingerprint)
        throw new Error("PAID_REPLAY_CONFLICT: Correction retry changed");
      return retry._id;
    }
    if (
      state.events.some(
        (e) => e.actor === subject && e.operationId === args.operationId,
      )
    )
      throw new Error("PAID_REPLAY_CONFLICT: Operation identity already used");
    if (args.expectedRevision !== state.revision)
      throw new Error(
        "PAID_CORRECTION_REVISION: History changed; inspect current prior value and retry",
      );
    if (!Number.isSafeInteger(args.value) || args.value < 0)
      throw new Error(
        "PAID_CORRECTION_VALUE: Nonnegative safe integer required",
      );
    for (const [value, max] of [
      [args.reason, 500],
      [args.source, 120],
    ] as const)
      safeText(value, max);
    if (args.certified && !args.evidence?.trim())
      throw new Error(
        "PAID_CORRECTION_EVIDENCE: Evidence reference required for certification",
      );
    if (args.evidence !== undefined) safeText(args.evidence, 500);
    if (
      state.corrections.some(
        (c) =>
          c.active &&
          c.entryId === args.entryId &&
          c.metric === args.metric &&
          c.start < args.end &&
          c.end > args.start,
      )
    )
      throw new Error(
        "PAID_CORRECTION_OVERLAP: Release the overlapping authority explicitly first",
      );
    const prior = await metricScope(
        ctx,
        campaign.slug,
        args.entryId,
        args.metric,
        args.start,
        args.end,
      ),
      at = Date.now(),
      revision = state.revision + 1;
    if (args.expectedInputFingerprint !== prior.inputFingerprint)
      throw new Error(
        "PAID_CORRECTION_INPUT_CHANGED: Imported prior changed; inspect the current prior value before saving",
      );
    const id = await ctx.db.insert("paidCorrections", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      actor: subject,
      source: args.source,
      at,
      version: 1,
      entryId: args.entryId,
      metric: args.metric,
      start: args.start,
      end: args.end,
      priorValue: prior.value,
      value: args.value,
      reason: args.reason,
      ...(args.evidence ? { evidence: args.evidence } : {}),
      certified: args.certified,
      active: true,
      revision,
      operationId: args.operationId,
      fingerprint,
    });
    await ctx.db.insert("paidCorrectionEvents", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      correctionId: id,
      actor: subject,
      source: args.source,
      at,
      version: 1,
      action: args.certified ? "certified" : "fallback",
      reason: args.reason,
      operationId: args.operationId,
      fingerprint,
      priorValue: prior.value,
      value: args.value,
      revision,
    });
    const settings = (await ctx.db
      .query("campaignSettings")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .unique())!;
    for (let at = args.start; at < args.end;) {
      const day = chicagoDay(at),
        start = Math.max(day.start, Date.parse(settings.rules.campaignStart)),
        end = Math.min(day.end, Date.parse(settings.rules.campaignEnd));
      const periods = await ctx.db
        .query("paidPeriods")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
        .collect();
      if (!periods.some((p) => p.start === start && p.end === end))
        await ctx.db.insert("paidPeriods", {
          campaignSlug: campaign.slug,
          nonprofitId: campaign.nonprofitId,
          actor: subject,
          source: "manager-correction-display",
          at: Date.now(),
          version: 1,
          label: day.label,
          start,
          end,
          mappingIds: [],
        });
      at = end;
    }
    return id;
  },
});
async function conflictNotice(
  ctx: MutationCtx,
  c: Doc<"paidCorrections">,
  sequence: number,
  active: boolean,
  reason: string,
) {
  const campaign = (await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", c.campaignSlug))
    .unique())!;
  await recordTrustedIncident(
    ctx,
    {
      campaignId: c.campaignSlug,
      key: `metric-correction:${c._id}`,
      kind: "certified-metric-conflict",
      sequence,
      observedAt: Date.now(),
      active,
      reason,
      evidence: `correction:${c._id}; revision:${sequence}`,
      resolutionRole: "manager",
    },
    {
      producer: "paid-correction-reconciler",
      actor: "paid-import-reconciler",
      synthetic: !!campaign.fixtureRunId,
    },
  );
}
export const release = mutation({
  args: {
    campaignId: v.string(),
    correctionId: v.id("paidCorrections"),
    reason: v.string(),
    expectedRevision: v.number(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { campaign, subject } = await paidManager(ctx, args.campaignId),
      state = await correctionState(ctx, campaign.slug);
    operationIdentity(args.operationId);
    safeText(args.reason, 500);
    const c = state.corrections.find((c) => c._id === args.correctionId);
    if (!c) throw new Error("FORBIDDEN: Correction access denied");
    const fingerprint = stableRequest(args),
      retry = state.events.find(
        (e) => e.actor === subject && e.operationId === args.operationId,
      );
    if (retry) {
      if (retry.fingerprint !== fingerprint)
        throw new Error("PAID_REPLAY_CONFLICT: Release retry changed");
      return { released: true };
    }
    if (state.revision !== args.expectedRevision || !c.active)
      throw new Error(
        "PAID_CORRECTION_REVISION: Authority changed; inspect history before release",
      );
    const next = await metricScope(
        ctx,
        campaign.slug,
        c.entryId,
        c.metric,
        c.start,
        c.end,
        false,
      ),
      revision = state.revision + 1;
    await ctx.db.patch(c._id, { active: false });
    await ctx.db.insert("paidCorrectionEvents", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      correctionId: c._id,
      actor: subject,
      source: "manager-explicit-release",
      at: Date.now(),
      version: 1,
      action: "released",
      reason: args.reason,
      operationId: args.operationId,
      fingerprint,
      priorValue: c.value,
      value: next.value,
      revision,
    });
    await conflictNotice(
      ctx,
      c,
      revision,
      false,
      "Manager explicitly released metric authority; retained imported evidence is visible with its own completeness",
    );
    return { released: true };
  },
});
// Called in the same OCC transaction as validated report completion. Reading the
// correction head and source observations fences concurrent manager writes.
export async function reconcileCorrections(
  ctx: MutationCtx,
  op: Doc<"paidOperations">,
  period: Doc<"paidPeriods">,
  reportRows: Infer<typeof reportRow>[],
) {
  const state = await correctionState(ctx, op.campaignSlug);
  for (const c of state.corrections.filter(
    (c) => c.active && c.start < period.end && c.end > period.start,
  )) {
    const mappings = await Promise.all(
      op.mappingIds.map((id) => ctx.db.get(id)),
    );
    if (!mappings.some((m) => m?.entryId === c.entryId)) continue;
    const exact = await metricScope(
      ctx,
      c.campaignSlug,
      c.entryId,
      c.metric,
      c.start,
      c.end,
      false,
    );
    // Broader completed daily evidence can supersede an uncertified fallback;
    // it cannot determine whether a subday certified correction matches.
    const covering = await metricScope(
      ctx,
      c.campaignSlug,
      c.entryId,
      c.metric,
      Math.min(c.start, period.start),
      Math.max(c.end, period.end),
      false,
    );
    const relevant = reportRows.filter(
      (row) =>
        row.metric === c.metric &&
        mappings.some(
          (m) => m?._id === row.mappingId && m.entryId === c.entryId,
        ),
    );
    if (!relevant.length) continue;
    const observations = await ctx.db
      .query("paidObservations")
      .filter((q) =>
        q.and(
          q.eq(q.field("entryId"), c.entryId),
          q.eq(q.field("metric"), c.metric),
        ),
      )
      .collect();
    const currentProof = relevant.every(
      (row) =>
        row.dataAsOf !== undefined &&
        row.complete &&
        observations.some(
          (o) =>
            o.mappingId === row.mappingId &&
            o.periodId === period._id &&
            o.revision === row.revision &&
            o.value === row.value &&
            o.dataAsOf === row.dataAsOf,
        ),
    );
    if (!c.certified && (!covering.complete || !currentProof)) continue;
    const action = !c.certified
      ? "fallback-reconciled"
      : currentProof && exact.complete && exact.value === c.value
        ? "import-matched"
        : "import-held";
    const revision = ++state.revision,
      reason =
        action === "import-held"
          ? "Conflicting or coarser import held; manager certification remains authoritative"
          : action === "import-matched"
            ? "Matching imported evidence retained once; certification remains active"
            : "Later covering import replaces fallback once; prior values and provenance retained";
    await ctx.db.insert("paidCorrectionEvents", {
      campaignSlug: c.campaignSlug,
      nonprofitId: c.nonprofitId,
      correctionId: c._id,
      actor: "paid-import-reconciler",
      source: "validated-paid-report",
      at: Date.now(),
      version: 1,
      action,
      reason,
      operationId: op._id,
      fingerprint: op._id,
      priorValue: c.value,
      value: exact.value,
      revision,
    });
    if (!c.certified) await ctx.db.patch(c._id, { active: false });
    else
      await conflictNotice(ctx, c, revision, action === "import-held", reason);
  }
}

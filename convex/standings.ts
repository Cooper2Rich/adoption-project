import { v } from "convex/values";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { mutation, query, type QueryCtx, type Doc } from "./functions.ts";
import { operationIdentity, stableRequest } from "./access.ts";
import { paidManager } from "./paidCorrections.ts";
import { correctionState } from "./paidMetricAuthority.ts";
import { paidWindowProjection } from "./paidMetrics.ts";
import { currentCommission } from "./fundraisingCorrections.ts";
import { sumCents } from "./fundraisingPolicy.ts";
import { publicCampaign, projection, approvedEntry } from "./publicViewer.ts";
import {
  competitionPeriods,
  rankCompetition,
  type PeriodKind,
} from "./competitionPolicy.ts";
import { periodKind } from "./standingsSchema.ts";

const hash = (value: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(stableRequest(value as never))));
const selectedArgs = { kind: periodKind, period: v.string() };
async function settingsFor(ctx: QueryCtx, campaignSlug: string) {
  return ctx.db
    .query("campaignSettings")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignSlug))
    .unique();
}
async function inputs(
  ctx: QueryCtx,
  campaign: Doc<"campaigns">,
  kind: PeriodKind,
  label: string,
) {
  const settings = await settingsFor(ctx, campaign.slug);
  if (!settings || settings.nonprofitId !== campaign.nonprofitId)
    throw new Error("STANDINGS_HELD: Campaign rules unavailable");
  const period = competitionPeriods(settings.rules, kind).find(
    (p) => p.label === label,
  );
  if (!period)
    throw new Error("STANDINGS_PERIOD: Select an available Chicago period");
  const paid = await paidWindowProjection(
      ctx,
      campaign.slug,
      period.inputStart,
      period.inputEnd,
    ),
    corrections = await correctionState(ctx, campaign.slug),
    entries = (
      await ctx.db
        .query("photoEntries")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
        .collect()
    ).filter(
      (e) =>
        e.nonprofitId === campaign.nonprofitId &&
        e.firstApprovedAt !== undefined &&
        e.firstApprovedAt < period.inputEnd,
    ),
    donations = (
      await ctx.db
        .query("fundraisingDonations")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
        .collect()
    ).filter(
      (d) =>
        d.nonprofitId === campaign.nonprofitId &&
        d.eligible &&
        d.completedAt >= period.inputStart &&
        d.completedAt < period.inputEnd,
    ),
    rows = [],
    evidence = [];
  let complete = true;
  for (const entry of entries) {
    // Historical snapshots never confer present public visibility.
    const visible = await approvedEntry(ctx, entry._id);
    if (!visible) {
      complete = false;
      evidence.push({ entryId: entry._id, hidden: true });
      continue;
    }
    const metric = paid.entries.find((e) => e.entryId === entry._id),
      selected = donations.filter((d) => d.originEntryId === entry._id),
      current = await Promise.all(
        selected.map((d) => currentCommission(ctx, d)),
      ),
      fundraisingCents = sumCents(current.map((d) => d.eligibleGrossCents)),
      periods = await ctx.db
        .query("fundraisingPeriodResults")
        .withIndex("by_entry", (q) => q.eq("entryId", entry._id))
        .collect(),
      fundraising = periods
        .filter(
          (p) =>
            p.nonprofitId === campaign.nonprofitId &&
            p.campaignSlug === campaign.slug &&
            p.periodKind === kind &&
            p.period === label,
        )
        .at(-1);
    // A trusted period record is affirmative evidence, including an explicit zero.
    // Neither a manager refresh nor absence of donations establishes that zero.
    let fundraisingComplete =
      !!fundraising &&
      fundraising.eligibleGrossCents === fundraisingCents &&
      stableRequest([...fundraising.donationIds].sort()) ===
        stableRequest(selected.map((d) => d._id).sort());
    const refundReads = [];
    for (const donation of selected) {
      const reads = await ctx.db
        .query("fundraisingRefundReads")
        .withIndex("by_checkout", (q) =>
          q.eq("checkoutId", donation.checkoutId),
        )
        .collect();
      const latest = reads.sort((a, b) => b.generation - a.generation)[0];
      if (latest && latest.applied !== true) fundraisingComplete = false;
      refundReads.push({
        donationId: donation._id,
        latest: latest ?? null,
        current: current[selected.indexOf(donation)],
      });
    }
    complete &&=
      !!metric?.complete &&
      metric.impressions !== null &&
      metric.linkClicks !== null &&
      fundraisingComplete;
    evidence.push({
      entryId: entry._id,
      creativeVersion: entry.version,
      createdAt: entry.createdAt,
      metric: metric
        ? {
            impressions: metric.impressions,
            linkClicks: metric.linkClicks,
            complete: metric.complete,
            coverage: metric.coverage.map((c) => ({
              day: c.day,
              inputs:
                c.input?.coverage.map((v) => ({
                  coverageId: v.coverageId,
                  operationId: v.operationId,
                  inputRevision: v.inputRevision,
                  generation: v.generation,
                  value: v.value,
                  complete: v.complete,
                  dataAsOf: v.dataAsOf,
                })) ?? null,
            })),
          }
        : null,
      fundraising: fundraising ?? null,
      refundReads,
    });
    if (
      metric?.complete &&
      metric.impressions !== null &&
      metric.linkClicks !== null &&
      fundraisingComplete
    )
      rows.push({
        entryId: entry._id,
        creativeVersion: entry.version,
        createdAt: entry.createdAt,
        impressions: metric.impressions,
        linkClicks: metric.linkClicks,
        fundraisingCents,
      });
  }
  complete &&= evidence.length > 0 && rows.length === evidence.length;
  const inputFingerprint = hash({
    settings,
    period,
    evidence,
    paidCorrectionRevision: corrections.revision,
  });
  const coverages = paid.entries.flatMap((e) =>
      e.coverage.flatMap((c) => c.input?.coverage ?? []),
    ),
    sourceIds = [...new Set(coverages.map((c) => c.sourceId))],
    sources = await Promise.all(sourceIds.map((id) => ctx.db.get(id))),
    lastSuccesses = sources.map((s) => s?.lastSuccess ?? null),
    dataTimes = coverages.map((c) => c.latestDataAsOf),
    now =
      campaign.fixtureRunId === process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID
        ? (campaign.fixturePaidNow ?? Date.now())
        : Date.now();
  return {
    settings,
    period,
    rows,
    complete,
    inputFingerprint,
    freshness: {
      lastSuccessfulImport:
        lastSuccesses.length && lastSuccesses.every((v) => v !== null)
          ? Math.min(...(lastSuccesses as number[]))
          : null,
      dataAsOf:
        dataTimes.length && dataTimes.every((v) => v !== null)
          ? Math.min(...(dataTimes as number[]))
          : null,
      reportingDelayMs:
        dataTimes.length && dataTimes.every((v) => v !== null)
          ? Math.max(0, now - Math.min(...(dataTimes as number[])))
          : null,
    },
  };
}
async function snapshots(
  ctx: QueryCtx,
  campaignSlug: string,
  kind: PeriodKind,
  period: string,
) {
  return ctx.db
    .query("standingsSnapshots")
    .withIndex("by_period", (q) =>
      q.eq("campaignSlug", campaignSlug).eq("kind", kind).eq("period", period),
    )
    .collect();
}
export const refresh = mutation({
  args: { campaignId: v.string(), ...selectedArgs, operationId: v.string() },
  handler: async (ctx, args) => {
    const { campaign, subject } = await paidManager(ctx, args.campaignId);
    if (campaign.slug !== "adoption")
      throw new Error("FORBIDDEN: Public campaign unavailable");
    operationIdentity(args.operationId);
    const requestFingerprint = hash(args),
      retry = await ctx.db
        .query("standingsRefreshes")
        .withIndex("by_operation", (q) =>
          q
            .eq("campaignSlug", campaign.slug)
            .eq("actor", subject)
            .eq("operationId", args.operationId),
        )
        .unique();
    if (retry) {
      if (retry.requestFingerprint !== requestFingerprint)
        throw new Error("STANDINGS_RETRY_CONFLICT");
      return retry;
    }
    const input = await inputs(ctx, campaign, args.kind, args.period),
      previous = (
        await snapshots(ctx, campaign.slug, args.kind, args.period)
      ).at(-1);
    let snapshotId = previous?._id ?? null;
    const outcome = !input.complete
      ? "held"
      : previous?.inputFingerprint === input.inputFingerprint
        ? "unchanged"
        : "stored";
    if (outcome === "stored") {
      const rules = input.settings.rules,
        targets =
          args.kind === "daily" ? rules.dailyTargets : rules.weeklyTargets,
        fixedPrizeCents = input.period.prizeEligible
          ? args.kind === "daily"
            ? rules.dailyPrizeCents
            : rules.weeklyPrizeCents
          : 0;
      snapshotId = await ctx.db.insert("standingsSnapshots", {
        campaignSlug: campaign.slug,
        nonprofitId: campaign.nonprofitId,
        kind: args.kind,
        period: args.period,
        inputFingerprint: input.inputFingerprint,
        settingsId: input.settings._id,
        actor: subject,
        source: "standings-v1",
        at: Date.now(),
        version: 1,
        prizeEligible: input.period.prizeEligible,
        fixedPrizeCents,
        rows: rankCompetition(input.rows, targets, fixedPrizeCents).map(
          (r) => ({
            ...r,
            entryId: r.entryId as Doc<"photoEntries">["_id"],
            creativeVersion: input.rows.find((v) => v.entryId === r.entryId)!
              .creativeVersion,
          }),
        ),
      });
    }
    const id = await ctx.db.insert("standingsRefreshes", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      kind: args.kind,
      period: args.period,
      operationId: args.operationId,
      requestFingerprint,
      inputFingerprint: input.inputFingerprint,
      snapshotId,
      outcome,
      actor: subject,
      source: "standings-v1",
      at: Date.now(),
      version: 1,
    });
    return ctx.db.get(id);
  },
});
export const periods = query({
  args: { kind: periodKind },
  handler: async (ctx, { kind }) => {
    const campaign = await publicCampaign(ctx),
      settings = campaign && (await settingsFor(ctx, campaign.slug));
    return settings ? competitionPeriods(settings.rules, kind) : [];
  },
});
export const read = query({
  args: selectedArgs,
  handler: readStandings,
});
export async function readStandings(
  ctx: QueryCtx,
  { kind, period }: { kind: PeriodKind; period: string },
) {
  const campaign = await publicCampaign(ctx);
  if (!campaign) return null;
  const input = await inputs(ctx, campaign, kind, period),
    snapshot = (await snapshots(ctx, campaign.slug, kind, period)).at(-1);
  let delayed =
    !input.complete ||
    !snapshot ||
    snapshot.inputFingerprint !== input.inputFingerprint;
  const rows = [];
  for (const row of snapshot?.rows ?? []) {
    const entry = await projection(ctx, row.entryId);
    if (!entry || entry.version !== row.creativeVersion) {
      delayed = true;
      continue;
    }
    rows.push({
      entryId: row.entryId,
      title: entry.title,
      creator: entry.creator,
      score: row.score,
      rank: row.rank,
      impressions: row.impressions,
      linkClicks: row.linkClicks,
      fundraisingCents: row.fundraisingCents,
      proposedPrizeCents: row.proposedPrizeCents,
    });
  }
  return {
    kind,
    period: input.period,
    status: "provisional" as const,
    delayed,
    updatedAt: snapshot?.at ?? null,
    rows,
    targets:
      kind === "daily"
        ? input.settings.rules.dailyTargets
        : input.settings.rules.weeklyTargets,
    fixedPrizeCents: snapshot?.fixedPrizeCents ?? null,
    freshness: input.freshness,
    evidence:
      "Controlled or manager-certified inputs; actual provider validation remains required. Prize proposals await funding and finalization.",
  };
}
export type StandingsResult = Awaited<ReturnType<typeof readStandings>>;
export const history = query({
  args: { campaignId: v.string() },
  handler: async (ctx, args) => {
    const { campaign } = await paidManager(ctx, args.campaignId);
    return ctx.db
      .query("standingsRefreshes")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .collect();
  },
});

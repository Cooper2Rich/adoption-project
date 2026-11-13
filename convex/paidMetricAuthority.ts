import type { Doc, QueryCtx } from "./functions.ts";

export async function correctionState(ctx: QueryCtx, campaignSlug: string) {
  const corrections = await ctx.db
    .query("paidCorrections")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignSlug))
    .collect();
  const events = await ctx.db
    .query("paidCorrectionEvents")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignSlug))
    .collect();
  return { corrections, events, revision: events.length };
}
export interface MetricDay {
  start: number;
  end: number;
  value: number | null;
  complete: boolean;
}
// Never split a count by elapsed time. A subday replacement is exact evidence
// for its interval, but a coarser source cannot establish the outside residual.
export function resolveMetric(
  days: MetricDay[],
  authorities: Doc<"paidCorrections">[],
  entryId: string,
  metric: "impressions" | "linkClicks",
  start: number,
  end: number,
) {
  const selected = authorities.filter(
    (c) =>
      c.active &&
      c.entryId === entryId &&
      c.metric === metric &&
      c.start < end &&
      c.end > start,
  );
  const pieces: { value: number | null; complete: boolean }[] = [];
  const relevant = days.filter((d) => d.start < end && d.end > start);
  for (const c of selected) {
    if (c.start < start || c.end > end)
      return {
        value: null,
        complete: false,
        reason:
          "Requested scope intersects a larger manager correction; residual counts unresolved",
        authorityIds: selected.map((c) => c._id),
      };
    pieces.push({ value: c.value, complete: c.certified });
  }
  for (const day of relevant) {
    const overlaps = selected.filter(
      (c) => c.start < day.end && c.end > day.start,
    );
    if (overlaps.length) {
      let cursor = Math.max(start, day.start);
      for (const c of [...overlaps].sort((a, b) => a.start - b.start)) {
        if (c.start > cursor)
          return {
            value: null,
            complete: false,
            reason:
              "Manager correction overlaps coarser imported day; outside residual counts unresolved",
            authorityIds: selected.map((c) => c._id),
          };
        cursor = Math.max(cursor, c.end);
      }
      if (cursor < Math.min(end, day.end))
        return {
          value: null,
          complete: false,
          reason:
            "Manager correction overlaps coarser imported day; outside residual counts unresolved",
          authorityIds: selected.map((c) => c._id),
        };
    } else {
      if (day.start < start || day.end > end)
        return {
          value: null,
          complete: false,
          reason: "Exact scope cannot be separated from coarser imported day",
          authorityIds: [],
        };
      pieces.push(day);
    }
  }
  // An exact manager scope can establish evidence before any placement exists.
  // Uncovered intervals still require an explicit daily input.
  const intervals = [
    ...relevant.map((d) => ({
      start: Math.max(start, d.start),
      end: Math.min(end, d.end),
    })),
    ...selected,
  ].sort((a, b) => a.start - b.start);
  let cursor = start;
  for (const interval of intervals) {
    if (interval.start > cursor) break;
    cursor = Math.max(cursor, interval.end);
  }
  const complete =
    cursor >= end && pieces.length > 0 && pieces.every((p) => p.complete);
  let value: number | null = null;
  for (const p of pieces)
    if (p.value !== null) {
      const next: number = (value ?? 0) + p.value;
      if (!Number.isSafeInteger(next))
        throw new Error(
          "PAID_OVERFLOW: Corrected metric exceeds safe integer range",
        );
      value = next;
    }
  return {
    value,
    complete,
    reason: complete
      ? "Exact manager-certified and/or imported scope"
      : selected.length
        ? "Reasoned fallback; completeness remains unproven"
        : "Imported daily evidence; missing coverage remains held",
    authorityIds: selected.map((c) => c._id),
  };
}

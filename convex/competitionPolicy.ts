import { chicagoDay } from "./allocation/chicago.ts";
import type { CampaignRules } from "./campaignRules.ts";

export type PeriodKind = "daily" | "weekly";
export function competitionPeriod(kind: PeriodKind, at: number) {
  const day = chicagoDay(at);
  if (kind === "daily") return day;
  const weekday = new Date(day.label + "T12:00:00Z").getUTCDay();
  const monday = new Date(
    Date.parse(day.label + "T12:00:00Z") - ((weekday + 6) % 7) * 86400000,
  );
  return {
    label: monday.toISOString().slice(0, 10),
    start: chicagoDay(monday.getTime()).start,
    end: chicagoDay(monday.getTime() + 7 * 86400000).start,
  };
}
export function competitionPeriods(rules: CampaignRules, kind: PeriodKind) {
  const start = Date.parse(rules.campaignStart),
    end = Date.parse(rules.campaignEnd),
    periods = [];
  for (let cursor = start; cursor < end;) {
    const period = competitionPeriod(kind, cursor);
    periods.push({
      ...period,
      inputStart: Math.max(start, period.start),
      inputEnd: Math.min(end, period.end),
      prizeEligible: period.start >= start && period.end <= end,
    });
    cursor = period.end;
    if (periods.length > 3660)
      throw new Error("STANDINGS_PERIOD: Campaign too long");
  }
  return periods;
}
export type CompetitionInput = {
  entryId: string;
  createdAt: number;
  impressions: number;
  linkClicks: number;
  fundraisingCents: number;
};
export function competitionScore(
  input: Pick<
    CompetitionInput,
    "impressions" | "linkClicks" | "fundraisingCents"
  >,
  targets: CampaignRules["dailyTargets"],
) {
  const component = (value: number, target: number, weight: number) => {
    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      !Number.isSafeInteger(target) ||
      target <= 0
    )
      throw new Error(
        "STANDINGS_INPUT: Nonnegative safe metrics and positive targets required",
      );
    return weight * Math.sqrt(Math.min(value / target, 1));
  };
  return (
    component(input.impressions, targets.impressions, 40) +
    component(input.linkClicks, targets.totalClicks, 30) +
    component(input.fundraisingCents, targets.fundraisingCents, 30)
  );
}
export function rankCompetition(
  inputs: CompetitionInput[],
  targets: CampaignRules["dailyTargets"],
  prizeCents: number,
) {
  if (!Number.isSafeInteger(prizeCents) || prizeCents < 0)
    throw new Error("STANDINGS_PRIZE: Safe whole USD cents required");
  const compare = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    b.score - a.score ||
    b.linkClicks - a.linkClicks ||
    b.fundraisingCents - a.fundraisingCents ||
    b.impressions - a.impressions;
  const rows = inputs.map((input) => ({
    ...input,
    score: competitionScore(input, targets),
    rank: 0,
    proposedPrizeCents: 0,
  }));
  rows.sort(
    (a, b) =>
      compare(a, b) ||
      a.createdAt - b.createdAt ||
      (a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0),
  );
  for (let i = 0; i < rows.length; i++)
    rows[i].rank =
      i && compare(rows[i - 1], rows[i]) === 0 ? rows[i - 1].rank : i + 1;
  const winners = rows.filter((r) => r.rank === 1);
  if (winners.length) {
    const each = Number(BigInt(prizeCents) / BigInt(winners.length)),
      remainder = Number(BigInt(prizeCents) % BigInt(winners.length));
    winners.forEach((row, i) => {
      row.proposedPrizeCents = each + (i < remainder ? 1 : 0);
    });
  }
  return rows;
}

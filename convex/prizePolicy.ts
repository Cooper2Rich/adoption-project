import type { CampaignRules } from "./campaignRules.ts";
import { competitionPeriods } from "./competitionPolicy.ts";
import { chicagoDay } from "./allocation/chicago.ts";
import { sumCents } from "./fundraisingPolicy.ts";

const wallClock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export function promisedPrizes(rules: CampaignRules) {
  const periods = (["daily", "weekly"] as const).flatMap((kind) =>
    competitionPeriods(rules, kind)
      .filter((p) => p.prizeEligible)
      .map((p) => ({
        kind,
        period: p.label,
        start: p.start,
        end: p.end,
        cents:
          kind === "daily" ? rules.dailyPrizeCents : rules.weeklyPrizeCents,
      })),
  );
  return { periods, requiredCents: sumCents(periods.map((p) => p.cents)) };
}
// Same convention as campaign-dates.ts: never select a fold or shift a gap.
export function replenishmentSchedule(rules: CampaignRules) {
  const start = Date.parse(rules.campaignStart),
    end = Date.parse(rules.campaignEnd);
  return competitionPeriods(rules, "daily").flatMap<{
    local: string;
    executionAt: number | null;
    advanceAt: number | null;
    hold: string | null;
  }>((day) => {
    const weekday = new Date(day.label + "T12:00:00Z").getUTCDay();
    if (weekday !== rules.weeklyReplenishmentSchedule.weekday) return [];
    const local = day.label + "T" + rules.weeklyReplenishmentSchedule.time;
    const wall = Date.parse(local + ":00.000Z");
    const matches = [5, 6]
      .map((offset) => wall + offset * 3600000)
      .filter((at) => wallClock.format(at).replace(" ", "T") === local);
    if (matches.length !== 1) {
      // An ambiguous clock is relevant only when an actual candidate falls
      // inside the campaign. A gap has no instant: compare its civil label
      // against the opening/closing labels, without selecting a shifted time.
      const within = matches.length
        ? matches.some((at) => at >= start && at < end)
        : local >= wallClock.format(start).replace(" ", "T") &&
          local < wallClock.format(end).replace(" ", "T");
      if (!within) return [];
      return [
        {
          local,
          executionAt: null,
          advanceAt: null,
          hold: `Ambiguous or nonexistent Chicago time ${local}; locked schedule requires review`,
        },
      ];
    }
    const executionAt = matches[0];
    if (executionAt < start || executionAt >= end) return [];
    return [
      { local, executionAt, advanceAt: executionAt - 86400000, hold: null },
    ];
  });
}

export const elapsedHour = 3600000;
export const chicagoDate = (at: number) => chicagoDay(at).label;

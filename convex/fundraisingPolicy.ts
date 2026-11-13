import type { CampaignRules } from "./campaignRules.ts";
import { chicagoDay } from "./allocation/chicago.ts";

export function cents(value: number, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0))
    throw new Error("FUNDRAISING_AMOUNT: Use safe whole USD cents");
  return value;
}
export function commission(gross: number, basisPoints: number) {
  cents(gross);
  if (
    !Number.isSafeInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > 10000
  )
    throw new Error("FUNDRAISING_RATE: Invalid locked commission");
  return Number((BigInt(gross) * BigInt(basisPoints) + 5000n) / 10000n);
}
function addDays(date: string, days: number) {
  return new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function attribution(
  rules: CampaignRules,
  at: number,
  approvedAt?: number,
  cutoff?: number,
) {
  const eligible =
    approvedAt !== undefined &&
    at >= approvedAt &&
    at >= Date.parse(rules.earningStart) &&
    at < Date.parse(rules.earningEnd) &&
    (cutoff === undefined || at < cutoff);
  const day = chicagoDay(at),
    date = day.label,
    dayStart = day.start,
    dayEnd = day.end;
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  const monday = addDays(date, -((weekday + 6) % 7)),
    weekStart = chicagoDay(Date.parse(monday + "T12:00:00Z")).start,
    weekEnd = chicagoDay(Date.parse(addDays(monday, 7) + "T12:00:00Z")).start;
  const full = (start: number, end: number) =>
    eligible &&
    start >= Date.parse(rules.campaignStart) &&
    end <= Date.parse(rules.campaignEnd);
  return {
    eligible,
    earningWeek: monday,
    dailyPeriod: full(dayStart, dayEnd) ? date : null,
    weeklyPeriod: full(weekStart, weekEnd) ? monday : null,
    dayStart,
    dayEnd,
    weekStart,
    weekEnd,
  };
}

// Check signed adjustments and aggregates as well as individual principal facts.
export function signedCents(value: number) {
  if (!Number.isSafeInteger(value))
    throw new Error("FUNDRAISING_AMOUNT: Unsafe signed USD cents");
  return value;
}
export function sumCents(values: number[]) {
  const total = values.reduce(
    (sum, value) => sum + BigInt(signedCents(value)),
    0n,
  );
  if (
    total > BigInt(Number.MAX_SAFE_INTEGER) ||
    total < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new Error("FUNDRAISING_AMOUNT: Aggregate exceeds safe USD cents");
  return Number(total);
}

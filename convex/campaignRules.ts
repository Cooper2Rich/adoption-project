import { v, type Infer } from "convex/values";

const weeklySchedule = v.object({ weekday: v.number(), time: v.string() });
const targets = v.object({
  impressions: v.number(),
  totalClicks: v.number(),
  fundraisingCents: v.number(),
});
export const rulesValidator = v.object({
  currency: v.literal("USD"),
  timezone: v.literal("America/Chicago"),
  campaignStart: v.string(),
  campaignEnd: v.string(),
  earningStart: v.string(),
  earningEnd: v.string(),
  commissionBasisPoints: v.number(),
  dailyTargets: targets,
  weeklyTargets: targets,
  dailyPrizeCents: v.number(),
  weeklyPrizeCents: v.number(),
  dailyPrizeTime: v.string(),
  weeklyPrizeSchedule: weeklySchedule,
  weeklyReplenishmentCents: v.number(),
  weeklyReplenishmentSchedule: weeklySchedule,
  creatorPaymentSchedule: weeklySchedule,
});
export type CampaignRules = Infer<typeof rulesValidator>;
export const batchPreparation = {
  weekday: 3,
  time: "12:00",
  timezone: "America/Chicago",
} as const;

export function validateRules(rules: CampaignRules) {
  const invalid = () => {
    throw new Error(
      "INVALID_RULES: Complete valid USD campaign rules are required",
    );
  };
  for (const date of [
    rules.campaignStart,
    rules.campaignEnd,
    rules.earningStart,
    rules.earningEnd,
  ]) {
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString() !== date
    )
      invalid();
  }
  if (
    rules.campaignStart >= rules.campaignEnd ||
    rules.earningStart >= rules.earningEnd
  )
    invalid();
  for (const target of [
    ...Object.values(rules.dailyTargets),
    ...Object.values(rules.weeklyTargets),
  ])
    if (!Number.isSafeInteger(target) || target <= 0) invalid();
  for (const cents of [
    rules.dailyPrizeCents,
    rules.weeklyPrizeCents,
    rules.weeklyReplenishmentCents,
  ])
    if (!Number.isSafeInteger(cents) || cents < 0) invalid();
  if (
    !Number.isSafeInteger(rules.commissionBasisPoints) ||
    rules.commissionBasisPoints < 0 ||
    rules.commissionBasisPoints > 10000
  )
    invalid();
  const clock = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  if (!clock(rules.dailyPrizeTime)) invalid();
  for (const schedule of [
    rules.weeklyPrizeSchedule,
    rules.weeklyReplenishmentSchedule,
    rules.creatorPaymentSchedule,
  ]) {
    if (
      !Number.isSafeInteger(schedule.weekday) ||
      schedule.weekday < 0 ||
      schedule.weekday > 6 ||
      !clock(schedule.time)
    )
      invalid();
  }
}

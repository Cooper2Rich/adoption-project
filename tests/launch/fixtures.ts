export { allocationInput } from "../../src/launch/fixture-input.ts";

export const campaignRules = {
  currency: "USD",
  timezone: "America/Chicago",
  campaignStart: "2026-12-01T06:00:00.000Z",
  campaignEnd: "2027-03-01T06:00:00.000Z",
  earningStart: "2026-11-01T05:00:00.000Z",
  earningEnd: "2027-04-01T05:00:00.000Z",
  commissionBasisPoints: 1000,
  dailyTargets: { impressions: 100, totalClicks: 50, fundraisingCents: 10000 },
  weeklyTargets: {
    impressions: 1000,
    totalClicks: 500,
    fundraisingCents: 100000,
  },
  dailyPrizeCents: 10000,
  weeklyPrizeCents: 50000,
  dailyPrizeTime: "23:59",
  weeklyPrizeSchedule: { weekday: 0, time: "23:59" },
  weeklyReplenishmentCents: 100000,
  weeklyReplenishmentSchedule: { weekday: 1, time: "09:00" },
  creatorPaymentSchedule: { weekday: 5, time: "14:00" },
};

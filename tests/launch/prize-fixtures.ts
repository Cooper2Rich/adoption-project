import { campaignRules } from "./fixtures.ts";
export const prizeRules = {
  ...campaignRules,
  campaignStart: "2026-03-01T06:00:00.000Z",
  campaignEnd: "2026-03-23T05:00:00.000Z",
  earningStart: "2026-02-01T06:00:00.000Z",
  earningEnd: "2026-04-01T05:00:00.000Z",
  weeklyReplenishmentCents: 10000,
  weeklyReplenishmentSchedule: { weekday: 0, time: "00:00" },
};

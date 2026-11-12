import type { AllocationInput } from "../../convex/allocation/planner.ts";

// Synthetic financial evidence only. These values never configure a live campaign.
export function allocationInput(): AllocationInput {
  const at = Date.parse("2026-11-11T18:00:00Z");
  return {
    at,
    authority: {
      revision: "authority-1",
      dailyLimitCents: 10000,
      totalLimitCents: 10000,
      dailyCommittedCents: 0,
      campaignCommittedCents: 0,
      capacity: 4,
    },
    settings: {
      baselineCents: 1500,
      boostPercent: 50,
      topCount: 1,
      metaPercent: 60,
      tiktokPercent: 40,
      targets: { impressions: 100, clicks: 100, raisedCents: 100 },
    },
    finance: {
      status: "verified",
      source: "synthetic-s1-example",
      asOf: at,
      availableCents: 10000,
      remainingBaselineReserveCents: 6000,
      obligations: [],
      safety: {
        revision: "synthetic-safety-1",
        reserveCents: 0,
        maximumAgeMs: 300000,
      },
    },
    scoreCoverage: "complete",
    providers: { meta: "available", tiktok: "available" },
    entries: ["a", "b", "c", "d"].map((id, i) => ({
      id,
      createdAt: i + 1,
      admittedAt: Date.parse("2026-11-11T06:00:00Z"),
      state: "funded",
      metrics: {
        impressions: i < 2 ? 100 : 25,
        clicks: i < 2 ? 100 : 25,
        raisedCents: i < 2 ? 100 : 25,
      },
    })),
  };
}

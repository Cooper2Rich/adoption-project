import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adBudgetBreakdown,
  splitAdBudget,
} from "../src/public-demo/ad-budget.ts";

const project = {
  id: "p",
  status: "active",
  startDate: "2020-01-01",
  endDate: "2099-12-31",
  eligibilityPolicy: { version: 1 },
};
const ad = (id, mediaType = "video") => ({
  id,
  projectId: "p",
  title: "Same title",
  mediaType,
  status: "approved",
  snapshotId: "s",
  snapshots: [{ id: "s", digest: "d" }],
  eligibility: { outcome: "eligible", snapshotDigest: "d", policyVersion: 1 },
});
const spend = (adId, platform, amountCents) => ({
  id: `${adId}-${platform}`,
  adId,
  platform,
  amountCents,
  projectId: "p",
  creative: "Old title",
  completedAt: "2026-10-21T15:00:00Z",
});

test("per-ad allocations reconcile to each platform and keep spending attached to stable IDs", () => {
  const posts = [
    { ...ad("a"), title: "Renamed ad" },
    ad("b"),
    ad("c", "image"),
  ];
  const report = adBudgetBreakdown(
    { campaignLimitCents: 101, metaPercent: 33 },
    [project],
    posts,
    [spend("a", "meta", 5), spend("a", "tiktok", 7)],
  );
  assert.equal(report.rows.length, 3);
  const first = report.rows.find((row) => row.adId === "a");
  assert.equal(first.title, "Renamed ad");
  assert.equal(first.totals.spentCents, 12);
  assert.equal(
    report.rows.find((row) => row.adId === "b").totals.spentCents,
    0,
  );
  assert.equal(
    report.rows.find((row) => row.adId === "c").platforms.tiktok.allocatedCents,
    0,
  );
  for (const platform of ["meta", "tiktok"]) {
    const campaign = report.campaign.rows.find(
      (row) => row.platform === platform,
    );
    assert.equal(
      report.rows.reduce(
        (sum, row) => sum + row.platforms[platform].allocatedCents,
        0,
      ) + report.unassigned[platform],
      campaign.allocatedCents,
    );
    assert.equal(
      report.rows.reduce(
        (sum, row) => sum + row.platforms[platform].spentCents,
        0,
      ),
      campaign.spentCents,
    );
    assert.equal(
      report.rows.reduce(
        (sum, row) => sum + row.platforms[platform].remainingCents,
        0,
      ) + report.unassigned[platform],
      campaign.remainingCents,
    );
  }
});

test("ineligible and historical ads retain spend while unavailable platform shares stay unassigned", () => {
  const posts = [
    { ...ad("held"), status: "held" },
    { ...ad("withdrawn"), withdrawnAt: "2026-10-01" },
  ];
  const history = [
    spend("retired", "meta", 150),
    { ...spend("outside", "meta", 9000), projectId: "other-project" },
  ];
  const report = adBudgetBreakdown(
    { campaignLimitCents: 100, metaPercent: 50 },
    [project],
    posts,
    history,
  );
  assert.deepEqual(report.unassigned, { meta: 50, tiktok: 50 });
  assert.equal(
    report.rows.find((row) => row.adId === "retired").historyOnly,
    true,
  );
  assert.equal(
    report.rows.find((row) => row.adId === "retired").totals.remainingCents,
    -150,
  );
  assert.ok(!report.rows.some((row) => row.adId === "outside"));
  assert.equal(report.campaign.remainingCents, -50);
  const videoOnly = adBudgetBreakdown(
    { campaignLimitCents: 100, metaPercent: 50 },
    [project],
    [ad("photo", "image")],
    [],
    { meta: { targetId: "demo-meta-p-video" } },
  );
  assert.deepEqual(videoOnly.unassigned, { meta: 50, tiktok: 50 });
});

test("bounded equal allocation redistributes exhausted shares fairly within one platform", () => {
  const capacities = [
    { id: "a", limitCents: 2 },
    { id: "b", limitCents: 100 },
    { id: "c", limitCents: 5 },
  ];
  assert.deepEqual(splitAdBudget(20, capacities), [
    { id: "a", amountCents: 2 },
    { id: "b", amountCents: 13 },
    { id: "c", amountCents: 5 },
  ]);
  assert.equal(
    splitAdBudget(1000, capacities).reduce(
      (sum, row) => sum + row.amountCents,
      0,
    ),
    107,
  );
  assert.deepEqual(splitAdBudget(1, capacities), [
    { id: "a", amountCents: 1 },
    { id: "b", amountCents: 0 },
    { id: "c", amountCents: 0 },
  ]);
  assert.equal(capacities[0].limitCents, 2);
  assert.throws(() => splitAdBudget(10, [{ id: "a", limitCents: -1 }]));
});

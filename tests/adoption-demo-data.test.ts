import assert from "node:assert/strict";
import { test } from "node:test";
import { adoptionAds } from "../src/public-demo/adoption-ads.ts";
import {
  adoptionSampleMetrics,
  ensureAdoptionDemoData,
} from "../src/public-demo/adoption-demo-data.ts";
import {
  addAdoptionShowcase,
  adoptionCreatorId,
} from "../src/public-demo/adoption-showcase.ts";
import { creatorEarningsReport } from "../src/public-demo/creator-earnings.ts";
import { campaignFundingReport } from "../src/public-demo/funding-report.ts";
import {
  leaderboardWindow,
  periodAd,
  samplePerformanceDays,
} from "../src/public-demo/leaderboard-periods.ts";
import { rankPublicAds } from "../src/public-demo/ranking.ts";

function fresh() {
  const state = {
    nonprofits: [],
    creators: [],
    managedCampaigns: [],
    projects: [],
    posts: [],
    activity: [],
    sampleFinancials: { version: 1, contributions: [], payments: [] },
  };
  addAdoptionShowcase(state);
  return state;
}

test("Yakira's credit and sample funds append once, retaining edits, immutable snapshots and earlier money records", () => {
  const state = fresh();
  state.posts[0].caption = "Preserved user caption";
  const oldSnapshots = structuredClone(state.posts[0].snapshots);
  state.sampleFinancials.contributions.push({
    id: "legacy",
    adId: "older",
    amountCents: 5000,
  });
  const previous = structuredClone(state.sampleFinancials.contributions[0]);
  ensureAdoptionDemoData(state);
  assert.equal(state.posts[0].creator, "Yakira");
  assert.equal(state.posts[0].creatorId, adoptionCreatorId);
  assert.equal(
    state.creators.find((c) => c.id === adoptionCreatorId).name,
    "Yakira",
  );
  assert.equal(state.posts[0].caption, "Preserved user caption");
  assert.deepEqual(
    state.posts[0].snapshots.slice(0, oldSnapshots.length),
    oldSnapshots,
  );
  assert.equal(state.posts[0].snapshots.at(-1).content.creator, "Yakira");
  assert.deepEqual(state.sampleFinancials.contributions[0], previous);
  assert.equal(state.sampleFinancials.contributions.at(-1).amountCents, 200000);
  assert.equal(state.sampleFinancials.contributions.length, 2);
  assert.equal(
    state.posts.some((p) => p.id === "adoption-duality"),
    false,
  );
  const after = structuredClone(state);
  ensureAdoptionDemoData(state);
  assert.deepEqual(state, after);
});

test("sample performance ranks in each current window and funding reconciles with Yakira's 10% earnings", () => {
  const state = fresh();
  ensureAdoptionDemoData(state);
  const now = new Date("2026-10-24T18:00:00Z");
  const ad = {
    ...adoptionAds[0],
    projectId: state.projects[0].id,
    campaignId: "adoption-is",
    ...adoptionSampleMetrics,
  };
  ad.performanceDays = samplePerformanceDays(ad.id, adoptionSampleMetrics, now);
  for (const period of ["daily", "weekly"]) {
    const measured = periodAd(ad, leaderboardWindow(period, now));
    const ranked = rankPublicAds([measured], "adoption-is");
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].rank, 1);
    assert.ok(
      ranked[0].impressions > 0 &&
        ranked[0].clicks > 0 &&
        ranked[0].donatedCents > 0,
    );
  }
  const earned = creatorEarningsReport(
    adoptionCreatorId,
    state.posts,
    state.sampleFinancials.contributions,
  );
  assert.equal(earned.earnedCents, 20000);
  assert.equal(earned.pendingCents, 20000);
  assert.equal(earned.paidCents, 0);
  const [funding] = campaignFundingReport(
    state.managedCampaigns,
    state.projects,
    [ad],
    state.sampleFinancials.contributions,
    now,
  );
  assert.equal(funding.grossCents, 200000);
  assert.equal(funding.creatorCents, 20000);
  assert.equal(funding.appUseFeeCents, 10000);
  assert.equal(funding.beneficiaryCents, 170000);
});

test("creator credit reuses an existing Yakira profile without renaming unrelated creators or reopening withdrawn work", () => {
  const state = fresh();
  state.creators.push(
    { id: "yakira-existing", name: "Yakira" },
    { id: "other", name: "Other creator" },
  );
  state.posts[0].withdrawnAt = "2026-10-23T12:00:00Z";
  ensureAdoptionDemoData(state);
  assert.equal(state.posts[0].creatorId, "yakira-existing");
  assert.equal(state.posts[0].withdrawnAt, "2026-10-23T12:00:00Z");
  assert.equal(
    state.creators.find((c) => c.id === "other").name,
    "Other creator",
  );
  assert.equal(state.creators.filter((c) => c.name === "Yakira").length, 1);
});

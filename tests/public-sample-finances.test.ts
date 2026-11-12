import assert from "node:assert/strict";
import { test } from "node:test";
import { migrateIdentities } from "../server/access.ts";
import { seedData } from "../server/seed.ts";
import { ensureCampaignHierarchy } from "../src/public-demo/campaign-management.ts";
import { creatorEarningsReport } from "../src/public-demo/creator-earnings.ts";
import { campaignFundingReport } from "../src/public-demo/funding-report.ts";
import {
  ensureSampleFinancials,
  samplePaymentsFor,
} from "../src/public-demo/sample-finances.ts";

function fresh() {
  const state = seedData();
  migrateIdentities(state);
  state.creators.push(
    { id: "nocturne-studio-v1", name: "Nocturne Studio · fictional" },
    {
      id: "fictional-river-showcase-v1-creator",
      name: "Alex River · fictional",
    },
  );
  state.projects.push(
    { id: "nocturne-coffee-showcase-v1", name: "Nocturne", status: "active" },
    { id: "fictional-river-showcase-v1", name: "Riverkind", status: "active" },
  );
  for (const [id, title] of [
    ["nocturne-midnight", "Your midnight ritual"],
    ["nocturne-espresso", "A little obsession"],
    ["nocturne-afterhours", "A seat after dark"],
  ])
    state.posts.push({
      id,
      title,
      creatorId: "nocturne-studio-v1",
      projectId: "nocturne-coffee-showcase-v1",
    });
  ensureCampaignHierarchy(state);
  return state;
}

test("sample financial initialization appends a separate frozen illustration once and preserves all existing records", () => {
  const state = fresh(),
    before = structuredClone(state);
  ensureSampleFinancials(state);
  assert.equal(state.sampleFinancials.contributions.length, 8);
  assert.equal(
    state.sampleFinancials.contributions.reduce((n, c) => n + c.amountCents, 0),
    2610000,
  );
  const snapshot = structuredClone(state.sampleFinancials);
  state.posts[0].title = "Edited title";
  ensureSampleFinancials(state);
  assert.deepEqual(state.sampleFinancials, snapshot);
  assert.deepEqual(state.projects, before.projects);
  assert.deepEqual(state.creators, before.creators);
  assert.equal(
    state.sampleFinancials.contributions.some((c) => c.adId === "sample-5"),
    false,
  );
  for (const contribution of snapshot.contributions) {
    const allocation = contribution.allocation;
    assert.equal(
      allocation.creatorCents +
        allocation.appUseFeeCents +
        allocation.beneficiaryCents,
      contribution.amountCents,
    );
  }
});

test("sample creator and campaign reports reconcile earned, paid and outstanding amounts without paying saved contributions", () => {
  const state = fresh();
  ensureSampleFinancials(state);
  const { contributions, payments } = state.sampleFinancials;
  const creator = creatorEarningsReport(
    "nocturne-studio-v1",
    state.posts,
    contributions,
    [],
    payments,
  );
  assert.equal(creator.earnedCents, 104000);
  assert.equal(creator.paidCents, 60000);
  assert.equal(creator.pendingCents, 44000);
  assert.equal(creator.ads.length, 3);
  assert.equal(creator.payments.length, 2);
  assert.equal(
    creatorEarningsReport(
      "new-creator",
      state.posts,
      contributions,
      [],
      payments,
    ).earnedCents,
    0,
  );
  const rows = campaignFundingReport(
    state.managedCampaigns,
    state.projects,
    [],
    contributions,
    new Date(),
    payments,
  );
  const coffee = rows.find(
    (r) => r.campaign.id === "nocturne-coffee-showcase-v1",
  );
  assert.equal(coffee.appUseFeeCents, 52000);
  assert.equal(coffee.appPaidCents, 34000);
  assert.equal(coffee.appOutstandingCents, 18000);
  assert.equal(
    rows.reduce((sum, r) => sum + r.appPaidCents, 0),
    89000,
  );
  const saved = {
    ...contributions[0],
    id: "saved-user-contribution",
    amountCents: 10000,
    allocation: {
      policy: "ad-fund-10-5-85-v1",
      creatorCents: 1000,
      appUseFeeCents: 500,
      beneficiaryCents: 8500,
    },
  };
  const combined = creatorEarningsReport(
    "nocturne-studio-v1",
    state.posts,
    [...contributions, saved],
    [],
    payments,
  );
  assert.equal(combined.earnedCents, 105000);
  assert.equal(combined.paidCents, 60000);
  assert.equal(combined.pendingCents, 45000);
  assert.equal(
    creatorEarningsReport("nocturne-studio-v1", state.posts, [saved]).paidCents,
    0,
  );
});

test("sample payments reject duplicate, cross-contribution, negative and excess allocations", () => {
  const state = fresh();
  ensureSampleFinancials(state);
  const { contributions, payments } = state.sampleFinancials;
  const original = payments.find((p) => p.recipient === "application");
  const attempts = [
    original,
    original,
    { ...original, id: "excess" },
    { ...original, id: "unknown", contributionId: "not-found" },
    { ...original, id: "negative", amountCents: -1 },
  ];
  assert.deepEqual(samplePaymentsFor(contributions, attempts, "application"), [
    original,
  ]);
  assert.deepEqual(samplePaymentsFor([], payments, "creator"), []);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { allocateAdFund } from "../src/public-demo/ad-fund-policy.ts";
import {
  campaignManagementRequest,
  ensureCampaignHierarchy,
} from "../src/public-demo/campaign-management.ts";
import { creatorEarningsReport } from "../src/public-demo/creator-earnings.ts";
import { campaignFundingReport } from "../src/public-demo/funding-report.ts";
import { rankPublicAds } from "../src/public-demo/ranking.ts";
const admin = { role: "admin" },
  owner = { role: "owner", organizationId: "a" };
const fresh = () => ({
  nonprofits: [
    { id: "a", name: "Owner A" },
    { id: "b", name: "Owner B" },
  ],
  projects: [
    {
      id: "p1",
      name: "Campaign A",
      description: "Original",
      ownerOrganizationId: "a",
      nonprofit: "Owner A",
      status: "active",
      createdAt: "2026-01-01",
    },
    {
      id: "p2",
      name: "Campaign B",
      description: "Original",
      ownerOrganizationId: "b",
      nonprofit: "Owner B",
      status: "draft",
      createdAt: "2026-01-01",
    },
  ],
  posts: [{ id: "ad", projectId: "p1" }],
  funding: [{ cents: 12345 }],
});
const input = {
  requestId: "request-1",
  name: "Requested project",
  description: "A project requested by its owner.",
  brief: "Tell a factual story with authorized media.",
  category: "Environment",
  startDate: "2026-10-24",
  endDate: "2026-12-31",
};
function call(
  state,
  access,
  path,
  method = "GET",
  body = {},
  create = () => {
    throw Error("Unexpected project creation");
  },
) {
  return campaignManagementRequest(state, access, path, method, body, create)
    .data;
}

test("hierarchy migration is repeatable and preserves project IDs, ads and funding", () => {
  const state = fresh(),
    before = structuredClone(state);
  ensureCampaignHierarchy(state);
  ensureCampaignHierarchy(state);
  assert.equal(state.managedCampaigns.length, 2);
  assert.equal(state.projects[0].campaignId, "p1");
  assert.deepEqual(state.posts, before.posts);
  assert.deepEqual(state.funding, before.funding);
  assert.equal(state.projects[1].status, "draft");
});

test("only Admin can manage campaigns; owners submit isolated requests without activating projects", () => {
  const state = fresh();
  ensureCampaignHierarchy(state);
  assert.throws(
    () => call(state, owner, "/management/campaigns"),
    /Admin only/,
  );
  assert.throws(
    () => call(state, { role: "creator" }, "/project-requests"),
    /owners and Admin/,
  );
  call(state, owner, "/project-requests", "POST", {
    ...input,
    nonprofit: "Owner B",
    ownerOrganizationId: "b",
    campaignId: "p2",
    policyConfig: { commissionBps: 9999 },
  });
  const requests = call(state, owner, "/project-requests");
  assert.equal(requests[0].ownerOrganizationId, "a");
  assert.equal(requests[0].status, "pending");
  assert.equal(requests[0].campaignId, undefined);
  assert.equal(requests[0].policyConfig, undefined);
  assert.equal(state.projects.length, 2);
  assert.deepEqual(
    call(state, { role: "owner", organizationId: "b" }, "/project-requests"),
    [],
  );
  call(state, owner, "/project-requests", "POST", input);
  assert.equal(state.projectRequests.length, 1);
  assert.throws(
    () =>
      call(state, owner, "/project-requests/request-1/decision", "POST", {
        decision: "approve",
        campaignId: "p1",
      }),
    /Only Admin/,
  );
  assert.throws(
    () =>
      call(state, admin, "/project-requests/request-1/decision", "POST", {
        decision: "approve",
        campaignId: "p2",
      }),
    /this organization/,
  );
  assert.throws(
    () =>
      call(state, admin, "/project-requests/request-1/decision", "POST", {
        decision: "decline",
      }),
    /Explain why/,
  );
  let creates = 0;
  const create = (data) => {
    creates++;
    assert.equal(data.status, "draft");
    state.projects.push({
      ...data,
      id: "new-project",
      pricingStatus: "pending",
    });
    return state.projects.at(-1);
  };
  call(
    state,
    admin,
    "/project-requests/request-1/decision",
    "POST",
    { decision: "approve", campaignId: "p1" },
    create,
  );
  call(
    state,
    admin,
    "/project-requests/request-1/decision",
    "POST",
    { decision: "approve", campaignId: "p1" },
    create,
  );
  assert.equal(creates, 1);
  assert.equal(state.projects.at(-1).pricingStatus, "pending");
  assert.equal(
    call(state, owner, "/project-requests")[0].campaignId,
    undefined,
  );
});

test("archiving and restoring campaigns preserves previous project states and financial records", () => {
  const state = fresh();
  ensureCampaignHierarchy(state);
  state.projects.push({
    id: "already-archived",
    campaignId: "p1",
    status: "archived",
  });
  const funding = structuredClone(state.funding);
  call(state, admin, "/management/campaigns/p1/archive", "POST");
  assert.equal(state.projects[0].status, "archived");
  call(state, admin, "/management/campaigns/p1/archive", "POST");
  call(state, admin, "/management/campaigns/p1/restore", "POST");
  assert.equal(state.projects[0].status, "active");
  assert.equal(state.projects.at(-1).status, "archived");
  call(state, admin, "/management/campaigns/p2/archive", "POST");
  call(state, admin, "/management/campaigns/p2/restore", "POST");
  assert.equal(state.managedCampaigns[1].status, "draft");
  assert.deepEqual(state.funding, funding);
});

test("new ad funds conserve cents with 10% creator, 5% app and the nonprofit remainder", () => {
  assert.deepEqual(allocateAdFund(10000), {
    policy: "ad-fund-10-5-85-v1",
    creatorCents: 1000,
    appUseFeeCents: 500,
    beneficiaryCents: 8500,
  });
  for (const gross of [
    1,
    5,
    99,
    100,
    101,
    105,
    999,
    100000,
    Number.MAX_SAFE_INTEGER,
  ]) {
    const result = allocateAdFund(gross);
    assert.equal(
      result.creatorCents + result.appUseFeeCents + result.beneficiaryCents,
      gross,
    );
    assert.ok(result.beneficiaryCents >= 0);
  }
  for (const bad of [0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => allocateAdFund(bad));
});

test("funding reports aggregate projects by campaign, preserve legacy funds and distinguish allocations from payouts", () => {
  const now = new Date("2026-10-24T18:00:00Z");
  const campaigns = [
    { id: "parent", name: "Parent", status: "active" },
    { id: "unknown", name: "Unknown", status: "active" },
  ];
  const projects = [
    { id: "child1", campaignId: "parent" },
    { id: "child2", campaignId: "parent" },
  ];
  const ads = projects.map((p, i) => ({
    id: `ad${i}`,
    projectId: p.id,
    campaignId: "parent",
    impressions: 1000,
    clicks: 100,
    donatedCents: 10000,
    performanceDays: [
      { date: "2026-10-23", impressions: 500, clicks: 50, donatedCents: 5000 },
      { date: "2026-10-24", impressions: 800, clicks: 80, donatedCents: 10000 },
    ],
  }));
  const support = [
    {
      id: "new",
      campaignId: "parent",
      amountCents: 10000,
      allocation: allocateAdFund(10000),
    },
    { id: "legacy", projectId: "child2", amountCents: 2500 },
  ];
  const before = structuredClone(support);
  const rows = campaignFundingReport(campaigns, projects, ads, support, now);
  assert.equal(rows[0].grossCents, 12500);
  assert.equal(rows[0].beneficiaryCents, 8500);
  assert.equal(rows[0].appUseFeeCents, 500);
  assert.equal(rows[0].appPaidCents, 0);
  assert.equal(rows[0].appOutstandingCents, 500);
  assert.equal(rows[0].legacyCents, 2500);
  assert.equal(rows[0].paidCents, 0);
  assert.equal(rows[0].growthCents, 10000);
  assert.equal(rows[0].growthPercent, 100);
  assert.equal(rows[1].growthCents, null);
  assert.equal(rankPublicAds(ads, "parent").length, 2);
  assert.deepEqual(support, before);
});

test("creator earnings use saved attribution and commissions, retain past ads, and exclude other creators and unsupported history", () => {
  const posts = [
    { id: "ad", creatorId: "creator-a", title: "Past ad" },
    { id: "other", creatorId: "creator-b", title: "Other ad" },
  ];
  const contribution = (id, creatorId, adId, amountCents) => ({
    id,
    creatorId,
    adId,
    title: "Saved title",
    amountCents,
    allocation: allocateAdFund(amountCents),
  });
  const support = [
    contribution("one", "creator-a", "ad", 10000),
    contribution("two", "creator-b", "other", 20000),
    contribution("retained", "creator-a", "unavailable-ad", 7500),
    { id: "legacy", adId: "ad", amountCents: 5000, title: "Legacy" },
    {
      ...contribution("bad", "creator-a", "ad", 1000),
      allocation: {
        policy: "ad-fund-10-5-85-v1",
        creatorCents: 9000,
        appUseFeeCents: 50,
        beneficiaryCents: 850,
      },
    },
    contribution("unattributed", undefined, "ad", 2000),
  ];
  const gifts = [
    {
      id: "gift",
      creatorId: "creator-a",
      attributed: true,
      result: { creatorCents: 333 },
    },
    { id: "pending", creatorId: "creator-a", attributed: true },
    {
      id: "other",
      creatorId: "creator-b",
      attributed: true,
      result: { creatorCents: 700 },
    },
    {
      id: "no-attribution",
      creatorId: "creator-a",
      attributed: false,
      result: { creatorCents: 700 },
    },
  ];
  const before = structuredClone({ posts, support, gifts });
  const report = creatorEarningsReport("creator-a", posts, support, gifts);
  assert.equal(report.adFundCents, 1750);
  assert.equal(report.causeGiftCents, 333);
  assert.equal(report.earnedCents, 2083);
  assert.equal(report.pendingCents, 2083);
  assert.equal(report.paidCents, 0);
  assert.equal(report.legacyCents, 8000);
  assert.equal(report.ads.length, 2);
  assert.equal(report.ads.find((a) => a.adId === "ad").earnedCents, 1000);
  assert.deepEqual(
    creatorEarningsReport("creator-c", posts, support, gifts).ads,
    [],
  );
  assert.deepEqual({ posts, support, gifts }, before);
});

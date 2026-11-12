import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignManagementRequest } from "../src/public-demo/campaign-management.ts";

const campaign = (id) => ({
  id,
  name: id,
  description: "Demo",
  ownerOrganizationId: id,
  ownerName: `Owner ${id}`,
  status: "active",
  createdAt: "2026-01-01",
  pricingStatus: "pending",
});
const project = (id, campaignId, status = "active") => ({
  id,
  campaignId,
  status,
  startDate: "2020-01-01",
  endDate: "2099-12-31",
  eligibilityPolicy: { version: 1 },
});
const ad = (id, projectId, mediaType = "video") => ({
  id,
  projectId,
  title: id,
  mediaType,
  status: "approved",
  snapshotId: "snapshot",
  snapshots: [{ id: "snapshot", digest: "digest" }],
  eligibility: {
    outcome: "eligible",
    policyVersion: 1,
    snapshotDigest: "digest",
  },
});
function fresh() {
  return {
    managedCampaigns: [campaign("a"), campaign("b")],
    projectRequests: [],
    activity: [],
    projects: [
      project("p1", "a"),
      project("p2", "b"),
      project("draft", "a", "draft"),
    ],
    posts: [
      ad("video-a", "p1"),
      ad("video-b", "p1"),
      ad("photo", "p1", "image"),
      ad("other", "p2"),
      ad("draft-ad", "draft"),
      { ...ad("held", "p1"), status: "held" },
      { ...ad("withdrawn", "p1"), withdrawnAt: "2026-01-01" },
    ],
    funding: [{ amountCents: 12345 }],
    sampleFinancials: { contributions: [{ amountCents: 8000 }], payments: [] },
  };
}
function call(
  state,
  action = "",
  body = {},
  id = "a",
  role = "admin",
  method = action ? "POST" : "GET",
) {
  return campaignManagementRequest(
    state,
    { role },
    `/management/campaigns/${id}/ad-platforms${action ? `/${action}` : ""}`,
    method,
    body,
  ).data;
}
const connect = (state, provider, id = "a", target = "traffic") =>
  call(
    state,
    "connect",
    { platform: provider, account: "organization", target },
    id,
  );
const rules = (overrides = {}) => ({
  enabled: true,
  dailyLimitCents: 10001,
  campaignLimitCents: 100000,
  metaPercent: 33,
  ...overrides,
});
function ready(state) {
  connect(state, "meta");
  connect(state, "tiktok");
  call(state, "rules", rules());
}

test("included completed samples cap previews by both overall and platform budget left", () => {
  const state = fresh();
  state.projects[0].id = "nocturne-coffee-showcase-v1";
  state.posts.forEach((post) => {
    if (post.projectId === "p1") post.projectId = state.projects[0].id;
  });
  ready(state);
  call(
    state,
    "rules",
    rules({
      dailyLimitCents: 40000,
      campaignLimitCents: 100000,
      metaPercent: 50,
    }),
  );
  const included = call(state, "preview", { includeSamples: true }).preview;
  assert.equal(included.budgetCents, 30000);
  assert.equal(included.plannedCents, 23000);
  assert.equal(included.unallocatedCents, 7000);
  assert.equal(
    included.rows
      .filter((row) => row.platform === "meta")
      .reduce((sum, row) => sum + row.amountCents, 0),
    8000,
  );
  assert.equal(included.includesSampleSpend, true);
  const excluded = call(state, "preview", { includeSamples: false }).preview;
  assert.equal(excluded.plannedCents, 40000);
  assert.equal(excluded.includesSampleSpend, false);
  call(
    state,
    "rules",
    rules({
      dailyLimitCents: 10000,
      campaignLimitCents: 60000,
      metaPercent: 50,
    }),
  );
  const exhausted = call(state, "preview", { includeSamples: true }).preview;
  assert.equal(exhausted.plannedCents, 0);
  assert.equal(exhausted.budgetCents, 0);
  assert.match(exhausted.notes[0], /no remaining funds/);
});

test("campaign ad setup is Admin only and settings do not cross campaigns", () => {
  const state = fresh();
  for (const role of ["owner", "creator", "nonprofit"]) {
    assert.throws(() => call(state, "", {}, "a", role), /Admin only/);
    assert.throws(
      () => call(state, "connect", { platform: "meta" }, "a", role),
      /Admin only/,
    );
  }
  assert.equal(call(state).rules.enabled, false);
  connect(state, "meta");
  assert.match(call(state).connections.meta.accountId, /^demo-meta-/);
  assert.deepEqual(call(state, "", {}, "b").connections, {});
  assert.throws(
    () =>
      call(state, "connect", {
        platform: "meta",
        account: "real-account",
        target: "traffic",
      }),
    /Choose a demo/,
  );
  assert.throws(() => connect(state, "instagram"), /Choose Meta or TikTok/);
});

test("rules validate whole cents, caps, percentages and selected destinations atomically", () => {
  const state = fresh();
  connect(state, "meta");
  const before = structuredClone(state.adPlatformSetups);
  assert.throws(() => call(state, "rules", rules()), /Connect a demo TikTok/);
  for (const invalid of [
    rules({ dailyLimitCents: 0 }),
    rules({ dailyLimitCents: 1.5 }),
    rules({ dailyLimitCents: NaN }),
    rules({ campaignLimitCents: Infinity }),
    rules({ campaignLimitCents: 100 }),
    rules({ metaPercent: -1 }),
    rules({ metaPercent: 101 }),
    rules({ metaPercent: 50.5 }),
    rules({ enabled: "true" }),
  ])
    assert.throws(() => call(state, "rules", invalid));
  assert.deepEqual(state.adPlatformSetups, before);
  const saved = call(state, "rules", rules({ metaPercent: 100 }));
  assert.equal(saved.rules.enabled, true);
  assert.equal(saved.connections.tiktok, undefined);
});

test("previews conserve every cent and exclude held, withdrawn, draft and other-campaign creatives", () => {
  const state = fresh();
  ready(state);
  const finances = structuredClone({
    funding: state.funding,
    samples: state.sampleFinancials,
  });
  const preview = call(state, "preview").preview;
  assert.equal(preview.budgetCents, 10001);
  assert.equal(preview.plannedCents, 10001);
  assert.equal(preview.unallocatedCents, 0);
  assert.equal(preview.rows.length, 5);
  assert.equal(
    preview.rows
      .filter((row) => row.platform === "meta")
      .reduce((n, row) => n + row.amountCents, 0),
    3300,
  );
  assert.equal(
    preview.rows
      .filter((row) => row.platform === "tiktok")
      .reduce((n, row) => n + row.amountCents, 0),
    6701,
  );
  assert.ok(
    preview.rows.every((row) =>
      ["video-a", "video-b", "photo"].includes(row.adId),
    ),
  );
  assert.ok(
    preview.rows
      .filter((row) => row.platform === "tiktok")
      .every((row) => row.adId !== "photo"),
  );
  const repeated = call(state, "preview").preview;
  assert.deepEqual(repeated.rows, preview.rows);
  assert.deepEqual(
    { funding: state.funding, samples: state.sampleFinancials },
    finances,
  );
});

test("shares with no eligible media remain unallocated, including Meta video-view destinations", () => {
  const state = fresh();
  ready(state);
  state.posts = [ad("photo", "p1", "image")];
  let preview = call(state, "preview").preview;
  assert.equal(preview.plannedCents, 3300);
  assert.equal(preview.unallocatedCents, 6701);
  assert.match(preview.notes[0], /TikTok has no eligible video/);
  connect(state, "meta", "a", "video");
  call(state, "rules", rules());
  preview = call(state, "preview").preview;
  assert.equal(preview.plannedCents, 0);
  assert.equal(preview.unallocatedCents, 10001);
  assert.equal(preview.notes.length, 2);
});

test("changing a connection, disconnecting and archiving pause automation without losing settings", () => {
  const state = fresh();
  ready(state);
  call(state, "preview");
  connect(state, "meta", "a", "video");
  assert.equal(call(state).rules.enabled, false);
  assert.equal(call(state).preview, undefined);
  call(state, "rules", rules());
  call(state, "disconnect", { platform: "tiktok" });
  assert.equal(call(state).rules.enabled, false);
  assert.equal(call(state).connections.tiktok, undefined);
  connect(state, "tiktok");
  call(state, "rules", rules());
  campaignManagementRequest(
    state,
    { role: "admin" },
    "/management/campaigns/a/archive",
    "POST",
    {},
  );
  assert.equal(call(state).rules.enabled, false);
  assert.ok(call(state).connections.meta);
  assert.throws(
    () =>
      call(state, "connect", {
        platform: "meta",
        account: "organization",
        target: "traffic",
      }),
    /Restore this campaign/,
  );
  assert.throws(() => call(state, "preview"), /Restore this campaign/);
  campaignManagementRequest(
    state,
    { role: "admin" },
    "/management/campaigns/a/restore",
    "POST",
    {},
  );
  assert.equal(call(state).rules.enabled, false);
  assert.throws(() => call(state, "preview"), /Enable and save/);
});

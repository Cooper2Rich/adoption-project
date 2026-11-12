import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createApp } from "../server/app.ts";
import {
  clickLink,
  evaluateIntentCompletion,
  freezeIntent,
  issueLink,
  recordAttributionFixture,
  revokeLink,
} from "../server/attribution.ts";
import {
  COMPENSATION,
  eligibilityFacts,
  eligibleCounts,
  evaluateSnapshot,
  submissionsOpen,
} from "../server/eligibility.ts";
import {
  finishTrial,
  publishExposurePolicy,
  scheduleExposure,
} from "../server/exposure-queue.ts";
import {
  capability,
  changeOfferState,
  consent,
  publishTerms,
  transitionDistribution,
} from "../server/marketplace.ts";
import { mediaBalance, spendMedia } from "../server/media-budgets.ts";
import {
  mayRetrieveMedia,
  verifyMediaReference,
} from "../server/private-media.ts";
import { seedData } from "../server/seed.ts";
import { createStore } from "../server/store.ts";
import { financeFixture } from "./finance-helpers.ts";
import { fixture } from "./helpers.ts";

const queueEvidence = {
  disclosure: "Fictional isolated local queue receipts; no external delivery",
};
test("initial organic queue rotates stable creators, limits active trials, preserves cursor and retries atomically", async (t) => {
  const f = await marketplaceFixture(t),
    firstId = f.access.creatorId;
  for (let i = 0; i < 4; i++)
    assert.equal(
      (
        await submit(f.request, {
          acceptedTermsVersion: f.terms.id,
          caption: `Fictional variant ${i}`,
        })
      ).status,
      201,
    );
  const secondId = f.store.read().creators.find((c) => c.id !== firstId).id;
  f.store.update((s, r) =>
    consent(s, r, f.project.id, f.terms.id, {
      role: "creator",
      creatorId: secondId,
    }),
  );
  const second = await f.request(`/projects/${f.project.id}/posts`, {
    method: "POST",
    role: "creator",
    headers: { "x-demo-creator": secondId },
    body: {
      ...valid,
      caption: "Fictional second creator",
      acceptedTermsVersion: f.terms.id,
    },
  });
  assert.equal(second.status, 201);
  const policy = f.store.update((s, r) =>
    publishExposurePolicy(
      s,
      r,
      f.project.id,
      {
        cohort: {
          channel: "instagram",
          placement: "feed",
          paid: false,
          mode: "simulated",
        },
        maxActiveTrialsPerCreator: 1,
        trialAllocationCents: null,
        exposurePlan: "Fictional discovery preview order",
      },
      adminAccess,
    ),
  );
  const schedule = (key) =>
    f.store.update((s, r) =>
      scheduleExposure(
        s,
        r,
        policy.id,
        { idempotencyKey: key, maxSlots: 1 },
        adminAccess,
      ),
    );
  const first = schedule("first"),
    retry = schedule("first"),
    next = schedule("next"),
    blocked = schedule("blocked");
  assert.deepEqual(retry, first);
  assert.equal(first.assignments.length, 1);
  assert.equal(next.assignments.length, 1);
  assert.notEqual(
    first.assignments[0].creatorId,
    next.assignments[0].creatorId,
  );
  assert.equal(next.cursorBefore, first.cursorAfter);
  assert.equal(blocked.assignments.length, 0);
  assert.ok(blocked.waiting.some((w) => w.reason === "MAX_ACTIVE_TRIALS"));
  assert.equal(first.assignments[0].reservationId, null);
  assert.equal(first.assignments[0].deliveryEvidence, null);
  const creatorAssignment = [...first.assignments, ...next.assignments].find(
    (a) => a.creatorId === firstId,
  );
  assert.equal(creatorAssignment.snapshotId, f.post.snapshotId);
  f.store.update((s, r) =>
    finishTrial(
      s,
      r,
      creatorAssignment.id,
      { reason: "Preview finished", evidenceRef: "Fictional preview receipt" },
      adminAccess,
    ),
  );
  assert.equal(schedule("after-completion").assignments[0].creatorId, firstId);
  const reopened = createStore(join(f.dir, "test.sqlite"));
  assert.deepEqual(
    reopened.records.lastExposureRun(f.project.id, policy.id).cursorAfter,
    firstId,
  );
  reopened.close();
  queueEvidence.organic = { policy, first, retry, next, blocked };
});
test("paid trial waits for settled funds, reserves real capacity once, and invalidation releases only unused money", async (t) => {
  const f = await financeFixture(t, { paid: true });
  const policy = f.store.update((s, r) =>
    publishExposurePolicy(
      s,
      r,
      f.project.id,
      {
        cohort: {
          channel: "instagram",
          placement: "feed",
          paid: true,
          mode: "simulated",
        },
        maxActiveTrialsPerCreator: 1,
        trialAllocationCents: 6000,
        exposurePlan: "Fictional bounded paid initial trial",
      },
      adminAccess,
    ),
  );
  const schedule = (key) =>
    f.store.update((s, r) =>
      scheduleExposure(
        s,
        r,
        policy.id,
        { idempotencyKey: key, maxSlots: 1 },
        adminAccess,
      ),
    );
  const pending = schedule("unfunded");
  assert.equal(pending.status, "pending");
  assert.equal(pending.waiting[0].reason, "WAITING_FOR_FUNDED_CAPACITY");
  assert.equal(f.rows("reservations").length, 0);
  const cash = f.support(10000, [
    { purpose: "media", use: "ad_budget", amountCents: 10000 },
  ]);
  f.send(cash, "capture");
  assert.equal(schedule("captured-only").status, "pending");
  f.send(cash, "settlement");
  const funded = schedule("funded"),
    a = funded.assignments[0];
  assert.ok(a.reservationId);
  assert.equal(a.allocationCents, 6000);
  assert.deepEqual(schedule("funded"), funded);
  f.store.update((s, r) =>
    spendMedia(
      s,
      r,
      a.reservationId,
      {
        idempotencyKey: "fixture-invoice",
        amountCents: 4000,
        effectiveAt: new Date().toISOString(),
        evidenceRef: "Fictional trial actual bill",
      },
      adminAccess,
    ),
  );
  f.store.update((s) =>
    s.creativeHolds.push({
      id: "fictional-hold",
      postId: f.post.id,
      code: "CONTENT_HOLD",
      reason: "Fictional invalidation",
      evidence: "Fictional review evidence",
      at: new Date().toISOString(),
    }),
  );
  const stopped = schedule("invalidation"),
    balance = mediaBalance(f.store.records, f.project.id);
  assert.equal(stopped.invalidated, 1);
  assert.equal(stopped.assignments.length, 0);
  assert.equal(balance.reservedMediaCents, 0);
  assert.equal(balance.spentMediaCents, 4000);
  assert.equal(balance.availableCents, 6000);
  assert.ok(f.store.records.get("distributions", a.distributionId));
  assert.equal(
    f.store.records.distributionStateAt(
      f.project.id,
      a.distributionId,
      new Date().toISOString(),
    ).state,
    "stopped",
  );
  queueEvidence.paid = { policy, pending, funded, stopped, balance };
  queueEvidence.queryPlans = f.store.records.analyticsQueryPlans();
  if (process.env.SLANDER_QUEUE_EVIDENCE)
    writeFileSync(
      process.env.SLANDER_QUEUE_EVIDENCE,
      JSON.stringify(queueEvidence, null, 2),
    );
});

const valid = {
  title: "Automatic creative",
  creator: "Cannot impersonate",
  caption: "Plant a tree with our fictional community.",
  format: "photo",
  media: "/images/forest.jpg",
  mediaType: "image",
  rights: true,
  channel: "instagram",
  destination: "/campaigns/greener-tomorrow/give",
  acceptedTermsVersion: "local-v1",
  disclosures: {
    compensation: COMPENSATION,
    beneficiary: "Beneficiary: One Tree Collective.",
  },
  factualClaims: [],
};
const submit = async (request, changes = {}) =>
  request("/projects/greener-tomorrow/posts", {
    method: "POST",
    role: "creator",
    body: { ...valid, ...changes },
  });
const pair = async (request) => {
  const project = (await request("/workspace")).data.projects.find(
    (p) => p.id === "greener-tomorrow",
  );
  return request(`/projects/${project.id}`, {
    method: "PUT",
    body: { ...project, instagram: "one.tree" },
  });
};

test("automatic evaluation is reproducible, audited and idempotent on snapshot/rule/fact versions", async (t) => {
  const { request, store } = await fixture(t);
  const { data: post, status } = await submit(request);
  assert.equal(status, 201);
  assert.equal(post.revision, 1);
  assert.equal(post.history[0].action, "submitted");
  assert.match(post.history[0].note, /Checking/);
  assert.equal(post.eligibility.outcome, "eligible");
  assert.equal(post.snapshots[0].submittedBy, store.read().creators[0].id);
  const project = store.read().projects[0];
  const facts = eligibilityFacts(store.read(), post, project);
  const result = evaluateSnapshot(
    post.snapshots[0],
    project.eligibilityPolicy,
    facts,
  );
  assert.deepEqual(
    result,
    evaluateSnapshot(post.snapshots[0], project.eligibilityPolicy, facts),
  );
  assert.deepEqual(result.reasons, []);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await request(`/posts/${post.id}/evaluate`, {
          method: "POST",
          body: { snapshotId: post.snapshotId },
        })
      ).data.id,
      post.eligibility.id,
    );
  assert.equal(store.read().posts[0].evaluations.length, 1);
});

const adminAccess = { role: "admin" };
function offerInput(
  project,
  at = new Date(Date.now() - 3600000).toISOString(),
  changes = {},
) {
  return {
    currency: "USD",
    creatorCommissionBps: 1000,
    effectiveAt: at,
    startsAt: `${project.startDate}T00:00:00.000Z`,
    endsAt: new Date(
      Date.parse(`${project.endDate}T00:00:00Z`) + 86400000,
    ).toISOString(),
    attributionPolicy: "first-party-last-click-v1",
    attributionWindowDays: 7,
    permissions: {
      instagram: {
        state: "allowed",
        approver: "Fictional owner",
        evidence: "Local simulated use only",
      },
    },
    combinations: [
      { channel: "instagram", placement: "feed", paid: false },
      { channel: "instagram", placement: "feed", paid: true },
    ],
    destinations: [`/campaigns/${project.id}/give`],
    budgetPayer: "unassigned",
    guarantee: null,
    appUseAllocationCents: null,
    refundHoldPolicy: "Hold disputed evidence; append cumulative refunds.",
    gradingConfigId: null,
    ...changes,
  };
}
async function marketplaceFixture(t) {
  const f = await fixture(t);
  await pair(f.request);
  const project = f.store.read().projects[0];
  const at = new Date(Date.now() - 3600000).toISOString();
  const terms = f.store.update((s, r) =>
    publishTerms(s, r, project.id, offerInput(project, at), adminAccess, at),
  );
  const creatorId = f.store.read().creators[0].id;
  const access = { role: "creator", creatorId };
  f.store.update((s, r) => consent(s, r, project.id, terms.id, access, at));
  const post = (await submit(f.request, { acceptedTermsVersion: terms.id }))
    .data;
  const distributionBody = {
    postId: post.id,
    snapshotId: post.snapshotId,
    revision: post.revision,
    termsId: terms.id,
    channel: "instagram",
    placement: "feed",
    paid: false,
    destination: `/campaigns/${project.id}/give`,
    payer: "unassigned",
    mode: "simulated",
  };
  const response = await f.request(`/campaigns/${project.id}/distributions`, {
    method: "POST",
    role: "creator",
    body: distributionBody,
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return {
    ...f,
    project,
    terms,
    post,
    distribution: response.data,
    distributionBody,
    access,
    at,
  };
}

test("organizations preserve nonprofit IDs, business ownership isolates beneficiary and sponsor management, discovery spans owners", async (t) => {
  const { request, store } = await fixture(t);
  const initial = store.read();
  for (const n of initial.nonprofits)
    assert(
      initial.organizations.some(
        (o) => o.id === n.id && o.type === "nonprofit",
      ),
    );
  const business = (
    await request("/organizations", {
      method: "POST",
      body: { name: "Fictional business owner", type: "business" },
    })
  ).data;
  const sponsor = (
    await request("/organizations", {
      method: "POST",
      body: { name: "Fictional business sponsor", type: "business" },
    })
  ).data;
  const p = initial.projects[0];
  const owned = await request(`/projects/${p.id}/organizations`, {
    method: "PUT",
    body: {
      ownerOrganizationId: business.id,
      beneficiaryOrganizationId: p.nonprofitId,
      sponsorOrganizationIds: [sponsor.id],
    },
  });
  assert.equal(owned.status, 200);
  assert.equal(owned.data.beneficiaryOrganizationId, p.nonprofitId);
  const ownerHeaders = { "x-demo-organization": business.id };
  assert.equal(
    (
      await request(`/projects/${p.id}`, {
        method: "PUT",
        role: "owner",
        headers: ownerHeaders,
        body: owned.data,
      })
    ).status,
    200,
  );
  for (const organizationId of [sponsor.id, p.nonprofitId])
    assert.equal(
      (
        await request(`/projects/${p.id}`, {
          method: "PUT",
          role: "owner",
          headers: { "x-demo-organization": organizationId },
          body: owned.data,
        })
      ).status,
      404,
    );
  assert.equal(
    (
      await request("/workspace", {
        role: "nonprofit",
        headers: { "x-demo-nonprofit": business.id },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/workspace", {
        role: "owner",
        headers: { "x-demo-organization": "forged" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/workspace", { role: "owner", headers: ownerHeaders })).data
      .projects.length,
    1,
  );
  const p2 = initial.projects[1];
  for (const project of [p, p2])
    store.update((s, r) =>
      publishTerms(s, r, project.id, offerInput(project), adminAccess),
    );
  const discovery = await request("/offers", { role: "creator" });
  assert.equal(discovery.data.items.length, 2);
  assert.equal(
    discovery.data.items.find((i) => i.id === p.id).owner.type,
    "business",
  );
  assert.equal(
    (
      await request(
        `/offers?organizationId=${business.id}&cause=Environment&channel=instagram`,
        { role: "creator" },
      )
    ).data.items.length,
    1,
  );
  assert.equal(
    (await request(`/campaigns/${p.id}/records/audit`, { role: "creator" }))
      .status,
    403,
  );
  const before = store.read();
  assert.equal(
    (
      await request(`/projects/${p.id}/organizations`, {
        method: "PUT",
        body: {
          ownerOrganizationId: sponsor.id,
          beneficiaryOrganizationId: p.nonprofitId,
          sponsorOrganizationIds: [],
        },
      })
    ).status,
    409,
  );
  assert.deepEqual(store.read(), before);
});

test("terms opening validates all required fields, independent channel defaults and fixed rate without partial mutation", async (t) => {
  const { request, store } = await fixture(t);
  const p = store.read().projects[0],
    input = offerInput(p);
  for (const override of [{ creatorCommissionBps: 1500 }, { tierRate: 1500 }]) {
    const before = store.read();
    assert.equal(
      (
        await request(`/projects/${p.id}`, {
          method: "PUT",
          body: { ...p, ...override },
        })
      ).status,
      400,
    );
    assert.deepEqual(store.read(), before);
  }
  for (const changes of [
    { currency: undefined },
    { startsAt: undefined },
    { endsAt: undefined },
    { refundHoldPolicy: undefined },
    { creatorCommissionBps: 1500 },
    { creatorCommissionBps: 900 },
    { tierRate: 1500 },
    { currency: "EUR" },
    { startsAt: "2026-02-30T00:00:00Z" },
    { combinations: [] },
  ]) {
    const before = store.read();
    const result = await request(`/campaigns/${p.id}/terms`, {
      method: "POST",
      body: { ...input, ...changes },
    });
    assert.equal(result.status, 400, JSON.stringify(changes));
    assert.deepEqual(store.read(), before);
    assert.equal(
      store.records.page("offer_versions", { campaignId: p.id }).items.length,
      0,
    );
  }
  const opened = await request(`/campaigns/${p.id}/terms`, {
    method: "POST",
    body: input,
  });
  assert.equal(opened.status, 201);
  assert.equal(opened.data.permissions.facebook.state, "unreviewed");
  assert.equal(opened.data.creatorCommissionBps, 1000);
  assert.equal(opened.data.gradingConfigId, null); // Incomplete grading never blocks ordinary crowdfunding.
  const before = store.read();
  store.update((s) => {
    delete s.projects[0].beneficiaryOrganizationId;
  });
  assert.equal(
    (await request(`/campaigns/${p.id}/terms`, { method: "POST", body: input }))
      .status,
    400,
  );
  store.update((s) => Object.assign(s, before));
});

test("current terms consent is automatic, server-resolved and cannot bypass profile or restriction evidence", async (t) => {
  const f = await marketplaceFixture(t),
    { request, store, project, terms, access } = f;
  assert.equal(
    store.records.get("participations", `${access.creatorId}:${terms.id}`)
      .automatic,
    true,
  );
  const second = store.read().creators[1];
  const missing = await request(`/projects/${project.id}/posts`, {
    method: "POST",
    role: "creator",
    headers: { "x-demo-creator": second.id },
    body: { ...valid, acceptedTermsVersion: terms.id },
  });
  assert(
    missing.data.eligibility.reasons.some(
      (r) => r.code === "ACCEPTED_PARTICIPATION_REQUIRED",
    ),
  );
  assert.equal(
    (
      await request(`/campaigns/${project.id}/consent`, {
        method: "POST",
        role: "creator",
        body: { termsId: "forged" },
      })
    ).status,
    409,
  );
  const restriction = await request(
    `/campaigns/${project.id}/participation-restrictions`,
    {
      method: "POST",
      body: {
        creatorId: access.creatorId,
        state: "suspended",
        evidence: "Existing identity investigation",
      },
    },
  );
  assert.equal(restriction.status, 201);
  assert.equal(
    (
      await request(`/campaigns/${project.id}/consent`, {
        method: "POST",
        role: "creator",
        body: { termsId: terms.id },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/campaigns/${project.id}/distributions`, {
        method: "POST",
        role: "creator",
        body: f.distributionBody,
      })
    ).status,
    409,
  );
  const ws = (await request("/workspace")).data;
  assert(
    ws.posts
      .find((p) => p.id === f.post.id)
      .eligibility.reasons.some((r) => r.code === "PARTICIPATION_HELD"),
  );
  assert.equal(
    (
      await request(`/campaigns/${project.id}/participation-restrictions`, {
        method: "POST",
        role: "nonprofit",
        body: {
          creatorId: second.id,
          state: "declined",
          evidence: "No invitation",
        },
      })
    ).status,
    403,
  );
  store.update((s) => {
    s.creators.find((c) => c.id === second.id).name = "";
  });
  assert.equal(
    (
      await request(`/campaigns/${project.id}/consent`, {
        method: "POST",
        role: "creator",
        headers: { "x-demo-creator": second.id },
        body: { termsId: terms.id },
      })
    ).status,
    409,
  );
});

test("distribution channel, destination, dates, budget and live capabilities are independent; old evaluated snapshot survives edits", async (t) => {
  const f = await marketplaceFixture(t),
    { request, store, project, terms, post, distributionBody, distribution } =
      f;
  for (const [change, reason] of [
    [{ channel: "facebook" }, "CAMPAIGN_CHANNEL_PERMISSION_REQUIRED"],
    [{ destination: "https://evil.example" }, "DESTINATION_NOT_ALLOWED"],
    [{ paid: true }, "MEDIA_BUDGET_PAYER_REQUIRED"],
    [{ revision: 99 }, "Stale creative snapshot"],
    [{ termsId: "old" }, "CURRENT_TERMS_CONSENT_REQUIRED"],
  ]) {
    const before = store.read();
    const response = await request(`/campaigns/${project.id}/distributions`, {
      method: "POST",
      role: "creator",
      body: { ...distributionBody, ...change },
    });
    assert.equal(response.status, 409);
    assert.match(response.data.error, new RegExp(reason));
    assert.deepEqual(store.read(), before);
  }
  const exported = await request(`/distributions/${distribution.id}/state`, {
    method: "POST",
    body: { state: "exported" },
  });
  assert.equal(exported.status, 200);
  const original = store
    .read()
    .posts.find((p) => p.id === post.id)
    .snapshots.find((s) => s.id === distribution.snapshotId);
  const revised = await request(`/posts/${post.id}`, {
    method: "PUT",
    role: "creator",
    body: {
      ...valid,
      acceptedTermsVersion: terms.id,
      revision: 1,
      caption: "Revised immutable content",
    },
  });
  assert.equal(revised.status, 200);
  assert.deepEqual(
    store.records.get("distributions", distribution.id),
    distribution,
  );
  assert.deepEqual(
    store.read().posts.find((p) => p.id === post.id).snapshots[0],
    original,
  );
  assert.equal(
    (
      await request(`/distributions/${distribution.id}/state`, {
        method: "POST",
        body: { state: "exported" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/distributions/${distribution.id}/state`, {
        method: "POST",
        body: { state: "externally_verified" },
      })
    ).status,
    409,
  );
  for (const name of [
    "ad_delivery",
    "donation_collection",
    "creator_transfer",
    "verified_metrics",
  ]) {
    const result = await request(`/capabilities/${name}`, {
      method: "POST",
      body: { mode: "live", enabled: true },
    });
    assert.equal(result.status, 409);
    assert.match(
      result.data.error,
      new RegExp(`LIVE_CAPABILITY_UNAVAILABLE: ${name}`),
    );
  }
  assert.deepEqual(capability("simulate"), {
    mode: "simulated",
    capability: "simulate",
    simulated: true,
  });
  const liveDistribution = await request(
    `/campaigns/${project.id}/distributions`,
    {
      method: "POST",
      role: "creator",
      body: { ...distributionBody, mode: "live" },
    },
  );
  assert.equal(liveDistribution.status, 409);
  assert.match(
    liveDistribution.data.error,
    /LIVE_CAPABILITY_UNAVAILABLE: ad_delivery/,
  );
  assert.equal(
    (
      await request("/capabilities/manual_handoff", {
        method: "POST",
        body: { mode: "simulated" },
      })
    ).status,
    200,
  );
  await request(`/campaigns/${project.id}/offer-state`, {
    method: "POST",
    body: { state: "paused" },
  });
  assert.equal(
    (
      await request(`/campaigns/${project.id}/distributions`, {
        method: "POST",
        role: "creator",
        body: {
          ...distributionBody,
          snapshotId: revised.data.snapshotId,
          revision: 2,
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/distributions/${distribution.id}/links`, {
        method: "POST",
        role: "creator",
        body: {},
      })
    ).status,
    409,
  );
});

test("opaque first-party links ignore forged attribution fields, freeze last same-campaign click and record direct selection without a click", async (t) => {
  const f = await marketplaceFixture(t),
    { request, store, project, terms, post, distribution, access, baseURL } = f;
  const another = (
    await request(`/campaigns/${project.id}/distributions`, {
      method: "POST",
      role: "creator",
      body: f.distributionBody,
    })
  ).data;
  const first = store.update((s, r) =>
    issueLink(s, r, distribution.id, access),
  );
  const last = store.update((s, r) => issueLink(s, r, another.id, access));
  assert.match(first.path, /^\/r\/[A-Za-z0-9_-]{43}$/);
  assert(!first.path.includes(post.creatorId));
  const hit = await fetch(
    baseURL + first.path + "?utm_creator=forged&rate=9999",
    { redirect: "manual" },
  );
  assert.equal(hit.status, 303);
  assert.equal(hit.headers.get("location"), `/campaigns/${project.id}/give`);
  const cookie = hit.headers.get("set-cookie").split(";")[0];
  await fetch(baseURL + last.path, { redirect: "manual", headers: { cookie } });
  const intentResponse = await fetch(
    `${baseURL}/api/giving/${project.id}/intents`,
    {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: "{}",
    },
  );
  const intent = await intentResponse.json();
  assert.equal(intent.attributionKind, "first_party_click");
  const frozen = store.records.get("gift_intents", intent.id);
  assert.equal(frozen.binding.distributionId, another.id);
  assert.equal(frozen.binding.creatorId, post.creatorId);
  assert.equal(frozen.binding.termsId, terms.id);
  assert(!("visitorId" in intent));
  assert(!("binding" in intent));
  await fetch(baseURL + first.path, {
    redirect: "manual",
    headers: { cookie },
  });
  assert.equal(
    store.records.get("gift_intents", intent.id).binding.distributionId,
    another.id,
  );
  const direct = store.update((s, r) =>
    freezeIntent(s, r, project.id, "direct-visitor", {
      distributionId: distribution.id,
    }),
  );
  assert.equal(direct.binding.kind, "direct_selection");
  assert(!("clickId" in direct.binding));
  assert.equal(
    store.records.page("tracking_clicks", { campaignId: project.id }).items
      .length,
    3,
  );
  assert.equal(
    (
      await fetch(`${baseURL}/api/giving/${project.id}/intents/${intent.id}`, {
        headers: { cookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (await fetch(`${baseURL}/api/giving/${project.id}/intents/${intent.id}`))
      .status,
    404,
  );
  const foreign = store.update((s, r) =>
    freezeIntent(s, r, "seat-at-the-table", frozen.visitorId),
  );
  assert.equal(foreign.state, "suspense");
  assert.equal(
    (
      await request(`/giving/${project.id}/intents`, {
        method: "POST",
        body: { creatorId: "forged" },
      })
    ).status,
    400,
  );
});

test("attribution suspense is visible and adjudication appends evidence; non-Admin cannot inject fixtures", async (t) => {
  const f = await marketplaceFixture(t),
    { request, store, project, distribution } = f;
  const intent = store.update((s, r) =>
    freezeIntent(s, r, project.id, "visitor-without-click"),
  );
  const body = {
    intentId: intent.id,
    effectiveAt: new Date().toISOString(),
    mode: "simulated",
    sourceEventId: "fictional-event-1",
  };
  for (const role of ["creator", "nonprofit", "owner"])
    assert.equal(
      (
        await request("/admin/attribution-events", {
          method: "POST",
          role,
          body,
        })
      ).status,
      403,
    );
  const result = await request("/admin/attribution-events", {
    method: "POST",
    body,
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.state, "suspense");
  assert.equal(
    (await request(`/campaigns/${project.id}/records/attribution`)).data
      .items[0].id,
    result.data.id,
  );
  assert.equal(
    (
      await request(`/attribution-events/${result.data.id}/adjudications`, {
        method: "POST",
        role: "nonprofit",
        body: { distributionId: distribution.id, evidence: "Proof" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/attribution-events/${result.data.id}/adjudications`, {
        method: "POST",
        body: { distributionId: distribution.id, evidence: "" },
      })
    ).status,
    400,
  );
  const resolution = await request(
    `/attribution-events/${result.data.id}/adjudications`,
    {
      method: "POST",
      body: {
        distributionId: distribution.id,
        evidence: "Fictional supporter receipt identifying exact creative",
      },
    },
  );
  assert.equal(resolution.status, 201);
  assert.deepEqual(
    store.records.get("attribution_events", result.data.id),
    result.data,
  );
  assert.equal(
    (
      await request(`/attribution-events/${result.data.id}/adjudications`, {
        method: "POST",
        body: { distributionId: distribution.id, evidence: "Reassignment" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/admin/attribution-events", {
        method: "POST",
        body: { ...body, mode: "live" },
      })
    ).status,
    400,
  );
});

test("prospective terms and late effective-time completion preserve prior evidence; pause retains links, expiry/stop/close block new outcomes", async (t) => {
  const f = await marketplaceFixture(t),
    { store, request, project, terms, distribution, access } = f;
  const base = Date.now() + 1;
  const time = (offset) => new Date(base + offset).toISOString();
  const link = store.update((s, r) =>
    issueLink(s, r, distribution.id, access, time(0)),
  );
  store.update((s, r) =>
    clickLink(s, r, link.path.slice(3), "visitor", time(10)),
  );
  const intent = store.update((s, r) =>
    freezeIntent(s, r, project.id, "visitor", {}, time(20)),
  );
  const original = structuredClone(
    store.records.get("offer_versions", terms.id),
  );
  const next = store.update((s, r) =>
    publishTerms(
      s,
      r,
      project.id,
      offerInput(project, time(40)),
      adminAccess,
      time(40),
    ),
  );
  assert.equal(next.version, 2);
  assert.deepEqual(store.records.get("offer_versions", terms.id), original);
  assert.equal(
    (
      await request(`/campaigns/${project.id}/distributions`, {
        method: "POST",
        role: "creator",
        body: f.distributionBody,
      })
    ).status,
    409,
  );
  store.update((s, r) =>
    changeOfferState(s, r, project.id, "paused", adminAccess, time(50)),
  );
  assert.equal(
    store.update((s, r) =>
      clickLink(s, r, link.path.slice(3), "visitor", time(60)),
    ).click.eligible,
    true,
  );
  store.update((s, r) =>
    changeOfferState(s, r, project.id, "closed", adminAccess, time(80)),
  );
  const late = store.update((s, r) =>
    recordAttributionFixture(
      s,
      r,
      {
        intentId: intent.id,
        effectiveAt: time(70),
        sourceEventId: "late-valid",
      },
      time(500),
    ),
  );
  assert.equal(late.eligible, true);
  assert.equal(late.binding.termsId, terms.id);
  const after = store.update((s, r) =>
    recordAttributionFixture(
      s,
      r,
      {
        intentId: intent.id,
        effectiveAt: time(90),
        sourceEventId: "after-close",
      },
      time(500),
    ),
  );
  assert.equal(after.state, "suspense");
  assert.equal(
    evaluateIntentCompletion(
      store.read(),
      store.records,
      intent,
      time(7 * 86400000 + 30),
    ).eligible,
    false,
  );
  assert.equal(
    evaluateIntentCompletion(store.read(), store.records, intent, terms.endsAt)
      .eligible,
    false,
  );
  store.update((s, r) =>
    transitionDistribution(
      s,
      r,
      distribution.id,
      "stopped",
      adminAccess,
      time(100),
    ),
  );
  assert.equal(
    store.update((s, r) =>
      clickLink(s, r, link.path.slice(3), "visitor", time(110)),
    ).click.eligible,
    false,
  );
  assert.equal(
    store.records.get("gift_intents", intent.id).binding.distributionId,
    distribution.id,
  );
});

test("private uploads reject guessed IDs/raw paths and reuse, allow exact public evaluated media and explicit sharing", async (t) => {
  const { request, store, baseURL } = await fixture(t);
  const [a, b] = store.read().creators;
  const form = new FormData();
  form.append(
    "media",
    new Blob([readFileSync("public/images/forest.jpg")], {
      type: "image/jpeg",
    }),
    "private.jpg",
  );
  const response = await fetch(baseURL + "/api/uploads", {
    method: "POST",
    headers: { "x-demo-role": "creator", "x-demo-creator": a.id },
    body: form,
  });
  assert.equal(response.status, 201);
  const uploaded = await response.json(),
    media = store.records.get("media", uploaded.media.slice(11));
  assert.equal(media.bytes, readFileSync("public/images/forest.jpg").length);
  assert.equal(media.signatureVerified, true);
  const bHeaders = { "x-demo-role": "creator", "x-demo-creator": b.id };
  for (const path of [uploaded.media, media.storagePath]) {
    assert.equal(
      (await fetch(baseURL + path, { headers: bHeaders })).status,
      404,
    );
    assert.equal((await fetch(baseURL + path)).status, 403);
  }
  assert.equal(
    (await submit(request, { ...uploaded, rights: false })).status,
    201,
  );
  assert.equal(
    (
      await request("/projects/greener-tomorrow/posts", {
        method: "POST",
        role: "creator",
        headers: bHeaders,
        body: { ...valid, ...uploaded },
      })
    ).status,
    403,
  );
  const own = (
    await request("/workspace", { role: "creator" })
  ).data.posts.find((p) => p.media === uploaded.media);
  const eligible = await request(`/posts/${own.id}`, {
    method: "PUT",
    role: "creator",
    body: { ...valid, ...uploaded, revision: 1 },
  });
  assert.equal(eligible.data.status, "approved");
  const publicProjection = (
    await request("/workspace", { role: "creator", headers: bHeaders })
  ).data.approvedPosts.find((p) => p.id === own.id);
  assert.match(publicProjection.media, /postId=.+&snapshotId=/);
  assert.equal((await fetch(baseURL + publicProjection.media)).status, 200);
  const oldPublic = publicProjection.media;
  await request(`/posts/${own.id}`, {
    method: "PUT",
    role: "creator",
    body: { ...valid, revision: 2 },
  });
  assert.equal((await fetch(baseURL + oldPublic)).status, 404);
  assert.equal(
    (
      await request(`/media/${media.id}/share`, {
        method: "POST",
        body: { campaignId: "greener-tomorrow" },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request("/projects/greener-tomorrow/posts", {
        method: "POST",
        role: "creator",
        headers: bHeaders,
        body: { ...valid, ...uploaded },
      })
    ).status,
    201,
  );
  assert.equal(
    (await fetch(baseURL + uploaded.media, { headers: bHeaders })).status,
    200,
  );
  assert.equal((await fetch(baseURL + "/images/forest.jpg")).status, 404); // Static samples served by index/Vite, not the isolated API app.
});

test("shared SQLite owner rolls back workspace and appended rows; stable indexed pages cap at 100 and histories stay out of workspace", async (t) => {
  const { store, request, dir } = await fixture(t);
  const campaignId = store.read().projects[0].id,
    at = new Date().toISOString(),
    before = store.read();
  assert.throws(() =>
    store.update((s, r) => {
      s.projects[0].name = "Must roll back";
      r.append("journal_transactions", {
        id: "rolled-back",
        campaignId,
        mode: "simulated",
        effectiveAt: at,
        sourceEventId: "rollback-fixture",
      });
      throw new Error("injected between cross-record writes");
    }),
  );
  assert.deepEqual(store.read(), before);
  assert.equal(store.records.get("journal_transactions", "rolled-back"), null);
  assert.throws(() =>
    store.records.append("audit_events", {
      id: "outside",
      campaignId,
      mode: "simulated",
      effectiveAt: at,
    }),
  );
  store.update((s, r) => {
    for (let i = 0; i < 220; i++)
      r.append("audit_events", {
        id: `event-${String(i).padStart(3, "0")}`,
        campaignId,
        mode: "simulated",
        effectiveAt: at,
        actorId: "admin",
        operation: "fictional fixture",
      });
  });
  const first = (await request(`/campaigns/${campaignId}/records/audit`)).data;
  assert.equal(first.items.length, 50);
  const max = (
    await request(`/campaigns/${campaignId}/records/audit?limit=999`)
  ).data;
  assert.equal(max.items.length, 100);
  const second = (
    await request(
      `/campaigns/${campaignId}/records/audit?limit=100&cursor=${max.nextCursor}`,
    )
  ).data;
  assert.equal(second.items.length, 100);
  assert.equal(
    new Set([...max.items, ...second.items].map((r) => r.id)).size,
    200,
  );
  assert.equal(
    (
      await request(
        `/campaigns/seat-at-the-table/records/audit?cursor=${max.nextCursor}`,
      )
    ).status,
    400,
  );
  for (const table of [
    "offer_versions",
    "distributions",
    "tracking_clicks",
    "source_events",
    "journal_transactions",
    "reservations",
  ])
    assert(
      store.records
        .queryPlan(table)
        .some((r) => r.detail.includes(`${table}_page`)),
    );
  assert(
    store.records
      .discoveryQueryPlan()
      .some((r) => r.detail.includes("campaign_discovery")),
  );
  store.update((s) => {
    for (let i = 0; i < 110; i++)
      s.organizations.push({
        id: `fictional-org-${String(i).padStart(3, "0")}`,
        name: `Fictional organization ${i}`,
        type: "business",
      });
  });
  const orgs = (await request("/organizations?limit=999")).data;
  assert.equal(orgs.items.length, 100);
  assert(orgs.nextCursor);
  assert.equal((await request("/organizations")).data.items.length, 50);
  const workspace = (await request("/workspace")).data;
  for (const key of [
    "audit_events",
    "tracking_clicks",
    "source_events",
    "journal_transactions",
    "gift_intents",
  ])
    assert(!(key in workspace));
  const reopened = createStore(join(dir, "test.sqlite"));
  assert.equal(
    reopened.records.page("audit_events", { campaignId, limit: 100 }).items
      .length,
    100,
  );
  reopened.close();
});

test("v1 migration backs up a consistent legacy database and uploads, preserves IDs and orphan files across repeat startup", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "slander-migration-")),
    directory = join(root, "old-data");
  mkdirSync(join(directory, "uploads"), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = "/uploads/11111111-1111-1111-1111-111111111111.jpg",
    orphan = "22222222-2222-2222-2222-222222222222.jpg",
    seed = seedData();
  seed.posts[0].media = path;
  const image = readFileSync("public/images/forest.jpg");
  writeFileSync(join(directory, path.slice(1)), image);
  writeFileSync(join(directory, "uploads", orphan), image);
  const db = new DatabaseSync(join(directory, "legacy.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL;CREATE TABLE workspace(id INTEGER PRIMARY KEY, document TEXT NOT NULL)",
  );
  db.prepare("INSERT INTO workspace VALUES(1,?)").run(JSON.stringify(seed));
  for (const stage of ["afterSchema", "afterWorkspace"]) {
    assert.throws(
      () =>
        createStore(join(directory, "legacy.sqlite"), true, {
          migrationHook(current) {
            if (current === stage)
              throw new Error("Injected migration rollback");
          },
        }),
      /Injected migration/,
    );
    assert.equal(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name='offer_versions'")
        .get(),
      undefined,
    );
    assert.equal(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name='schema_migrations'",
        )
        .get(),
      undefined,
    );
    assert.deepEqual(
      JSON.parse(db.prepare("SELECT document FROM workspace").get().document),
      seed,
    );
  }
  const migrated = createStore(join(directory, "legacy.sqlite"));
  const backup = migrated.migrationBackup;
  assert(backup);
  const saved = new DatabaseSync(join(backup, "legacy.sqlite"));
  assert.equal(
    JSON.parse(saved.prepare("SELECT document FROM workspace").get().document)
      .posts[0].id,
    seed.posts[0].id,
  );
  saved.close();
  db.close();
  assert.deepEqual(readFileSync(join(backup, "uploads", orphan)), image);
  createApp(migrated, directory);
  const media = migrated.records.byMediaPath(path);
  assert(media.ownerCreatorIds.includes(migrated.read().posts[0].creatorId));
  assert.equal(media.legacy, true);
  assert.equal(
    migrated.records.byMediaPath(`/uploads/${orphan}`).reviewRequired,
    true,
  );
  const after = migrated.read();
  migrated.close();
  const again = createStore(join(directory, "legacy.sqlite"));
  assert.equal(again.migrationBackup, null);
  assert.deepEqual(again.read(), after);
  assert.equal(again.records.byMediaPath(path).id, media.id);
  again.close();
});

test("ambiguous legacy media remains Admin-only until evidence-backed ownership review", async (t) => {
  const f = await fixture(t),
    { store, request, dir, baseURL } = f;
  const filename = "33333333-3333-3333-3333-333333333333.jpg",
    path = `/uploads/${filename}`;
  writeFileSync(
    join(dir, "uploads", filename),
    readFileSync("public/images/forest.jpg"),
  );
  store.update((s) => {
    s.posts[0].media = path;
    s.posts[0].snapshots[0].content.media = path;
    s.posts[1].media = path;
    s.posts[1].snapshots[0].content.media = path;
  });
  createApp(store, dir);
  const media = store.records.byMediaPath(path),
    [a, b] = store.read().creators;
  assert.equal(media.reviewRequired, true);
  for (const creatorId of [a.id, b.id]) {
    assert.equal(
      mayRetrieveMedia(store.read(), store.records, media, {
        role: "creator",
        creatorId,
      }),
      false,
    );
    assert.throws(
      () =>
        verifyMediaReference(
          store.read(),
          store.records,
          join(dir, "uploads"),
          { media: path, mediaType: "image" },
          { role: "creator", creatorId },
          "greener-tomorrow",
        ),
      /owned media/,
    );
    assert.equal(
      (
        await fetch(baseURL + path, {
          headers: { "x-demo-role": "creator", "x-demo-creator": creatorId },
        })
      ).status,
      404,
    );
  }
  assert.equal(
    (
      await request(`/media/${media.id}/ownership-review`, {
        method: "POST",
        role: "creator",
        body: { ownerCreatorId: a.id, evidence: "Claim" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/media/${media.id}/ownership-review`, {
        method: "POST",
        body: {
          ownerCreatorId: a.id,
          evidence: "Fictional license and authorship proof",
        },
      })
    ).status,
    201,
  );
  assert.equal(
    mayRetrieveMedia(store.read(), store.records, media, {
      role: "creator",
      creatorId: a.id,
    }),
    true,
  );
  assert.equal(
    mayRetrieveMedia(store.read(), store.records, media, {
      role: "creator",
      creatorId: b.id,
    }),
    false,
  );
});

test("link revocation is append-only and event-time scoped; last eligible earlier click wins", async (t) => {
  const f = await marketplaceFixture(t),
    { store, project, distribution, access } = f;
  const base = Date.now() + 1,
    time = (x) => new Date(base + x).toISOString();
  const first = store.update((s, r) =>
    issueLink(s, r, distribution.id, access, time(0)),
  );
  const second = store.update((s, r) =>
    issueLink(s, r, distribution.id, access, time(0)),
  );
  store.update((s, r) =>
    clickLink(s, r, first.path.slice(3), "visitor", time(10)),
  );
  store.update((s, r) =>
    clickLink(s, r, second.path.slice(3), "visitor", time(20)),
  );
  const frozen = store.update((s, r) =>
    freezeIntent(s, r, project.id, "visitor", {}, time(30)),
  );
  store.update((s, r) =>
    revokeLink(s, r, second.path.slice(3), adminAccess, time(40)),
  );
  assert.equal(
    evaluateIntentCompletion(store.read(), store.records, frozen, time(35))
      .eligible,
    true,
  );
  assert.equal(
    evaluateIntentCompletion(store.read(), store.records, frozen, time(45))
      .reason,
    "LINK_REVOKED",
  );
  const later = store.update((s, r) =>
    freezeIntent(s, r, project.id, "visitor", {}, time(50)),
  );
  assert.notEqual(later.binding.clickId, frozen.binding.clickId);
  assert.equal(
    store.update((s, r) =>
      clickLink(s, r, second.path.slice(3), "visitor", time(60)),
    ).click.reason,
    "LINK_REVOKED",
  );
});

test("a declared paid plan remains draft with a separate reservation blocker, independent of live delivery", async (t) => {
  const f = await marketplaceFixture(t),
    { store, request, project, post, access } = f;
  const at = new Date().toISOString();
  const terms = store.update((s, r) =>
    publishTerms(
      s,
      r,
      project.id,
      offerInput(project, at, { budgetPayer: "owner" }),
      adminAccess,
      at,
    ),
  );
  store.update((s, r) => consent(s, r, project.id, terms.id, access));
  const revised = await request(`/posts/${post.id}`, {
    method: "PUT",
    role: "creator",
    body: { ...valid, acceptedTermsVersion: terms.id, revision: 1 },
  });
  const plan = await request(`/campaigns/${project.id}/distributions`, {
    method: "POST",
    role: "creator",
    body: {
      ...f.distributionBody,
      termsId: terms.id,
      snapshotId: revised.data.snapshotId,
      revision: 2,
      paid: true,
      payer: "owner",
    },
  });
  assert.equal(plan.status, 201);
  assert.equal(plan.data.state, "draft");
  assert.equal(plan.data.fundingState, "reservation_required");
  const exported = await request(`/distributions/${plan.data.id}/state`, {
    method: "POST",
    body: { state: "exported" },
  });
  assert.equal(exported.status, 409);
  assert.match(exported.data.error, /MEDIA_RESERVATION_REQUIRED/);
  assert.equal(
    (
      await request(`/distributions/${plan.data.id}/state`, {
        method: "POST",
        body: { state: "externally_verified" },
      })
    ).status,
    409,
  );
});

test("mandatory rights, exact disclosure, destination, channel and current terms cannot be waived", async (t) => {
  const { request, store } = await fixture(t);
  for (const [changes, code] of [
    [{ rights: false }, "RIGHTS_REQUIRED"],
    [
      { disclosures: { ...valid.disclosures, compensation: "Optional" } },
      "COMPENSATION_DISCLOSURE_REQUIRED",
    ],
    [
      {
        disclosures: {
          ...valid.disclosures,
          beneficiary: "Different beneficiary",
        },
      },
      "BENEFICIARY_DISCLOSURE_REQUIRED",
    ],
    [{ destination: "https://evil.example" }, "DESTINATION_NOT_ALLOWED"],
    [{ channel: "unapproved" }, "CHANNEL_NOT_ALLOWED"],
    [{ acceptedTermsVersion: "old" }, "CURRENT_TERMS_REQUIRED"],
  ]) {
    const { data: post } = await submit(request, changes);
    assert.equal(post.eligibility.outcome, "needs_fix");
    assert.deepEqual(
      post.eligibility.reasons.map((r) => r.code),
      [code],
    );
    const result = await request(`/posts/${post.id}/review`, {
      method: "POST",
      role: "nonprofit",
      body: { decision: "approved", revision: 1 },
    });
    assert.equal(result.status, 409);
    assert.equal((await request(`/posts/${post.id}/export`)).status, 409);
  }
  const project = store.read().projects[0];
  const attempt = await request(`/projects/${project.id}`, {
    method: "PUT",
    body: {
      ...project,
      policyConfig: { ...project.eligibilityPolicy, rightsRequired: false },
    },
  });
  assert.equal(attempt.status, 400);
});

test("eligible revisions retain snapshots and exported evidence, reject stale edits/results and retain identity", async (t) => {
  const { request, store } = await fixture(t);
  await pair(request);
  const { data: post } = await submit(request);
  const original = structuredClone(post.snapshots[0]);
  const exported = (await request(`/posts/${post.id}/export`)).data;
  const revised = await request(`/posts/${post.id}`, {
    method: "PUT",
    role: "creator",
    body: {
      ...valid,
      creator: "Spoof",
      creatorId: "spoof",
      caption: "A fresh tree story.",
      revision: 1,
    },
  });
  assert.equal(revised.status, 200);
  assert.equal(revised.data.eligibility.outcome, "eligible");
  assert.equal(revised.data.creatorId, post.creatorId);
  assert.equal(revised.data.creator, post.creator);
  assert.deepEqual(revised.data.snapshots[0], original);
  assert.equal(
    (
      await request(`/posts/${post.id}`, {
        method: "PUT",
        role: "creator",
        body: { ...valid, revision: 1 },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/posts/${post.id}/evaluate`, {
        method: "POST",
        body: { snapshotId: original.id },
      })
    ).status,
    409,
  );
  assert.deepEqual(store.read().exports.at(-1), exported);
  assert.equal(exported.snapshot.content.caption, valid.caption);
  assert.equal(store.read().posts[0].revision, 2);
});

test("evidence-linked rights holds follow revisions and copied IDs, with scoped appeals and mandatory rules", async (t) => {
  const { request, store, baseURL } = await fixture(t);
  await pair(request);
  const { data: post } = await submit(request);
  const hold = await request(`/posts/${post.id}/holds`, {
    method: "POST",
    body: {
      code: "RIGHTS_COMPLAINT",
      reason: "Owner disputes license",
      evidence: "Complaint case DEMO-7",
    },
  });
  assert.equal(hold.status, 201);
  const failedHold = await request("/posts/sample-2/holds", {
    method: "POST",
    role: "nonprofit",
    body: hold.data,
  });
  assert.equal(failedHold.status, 403);
  const copied = (await submit(request, { title: "Copied creative" })).data;
  assert.equal(copied.status, "held");
  const uploadForm = new FormData();
  uploadForm.append(
    "media",
    new Blob([readFileSync("public/images/forest.jpg")], {
      type: "image/jpeg",
    }),
    "same-content.jpg",
  );
  const uploaded = await (
    await fetch(baseURL + "/api/uploads", {
      method: "POST",
      headers: {
        "x-demo-role": "creator",
        "x-demo-creator": store.read().creators[0].id,
      },
      body: uploadForm,
    })
  ).json();
  const copiedUpload = (
    await submit(request, {
      title: "Same bytes under new filename",
      ...uploaded,
    })
  ).data;
  assert.equal(copiedUpload.status, "held");
  const revised = await request(`/posts/${post.id}`, {
    method: "PUT",
    role: "creator",
    body: {
      ...valid,
      caption: "Changed but same held logical item",
      rights: false,
      revision: 1,
    },
  });
  assert.equal(revised.data.status, "held");
  assert.equal((await request(`/posts/${post.id}/export`)).status, 409);
  assert.equal(
    store.read().posts.find((p) => p.id === "sample-2").eligibility.outcome,
    "eligible",
  );
  const appeal = await request(`/posts/${post.id}/appeals`, {
    method: "POST",
    role: "creator",
    body: { holdId: hold.data.id, note: "License evidence supplied" },
  });
  assert.equal(appeal.status, 201);
  const resolution = await request(`/appeals/${appeal.data.id}/resolve`, {
    method: "POST",
    body: {
      holdIncorrect: true,
      correctedFact: "Complaint identified wrong asset",
      evidence: "Verified license DEMO-8",
    },
  });
  assert.equal(resolution.status, 200);
  const current = store.read().posts.find((p) => p.id === post.id);
  assert.equal(current.status, "changes");
  assert.deepEqual(
    current.eligibility.reasons.map((r) => r.code),
    ["RIGHTS_REQUIRED"],
  );
  assert.equal(
    store.read().posts.find((p) => p.id === copied.id).status,
    "approved",
  );
  assert.equal(store.read().creativeHolds[0].evidence, "Complaint case DEMO-7");
});

test("policy edits append versions and immediately invalidate current library and handoff", async (t) => {
  const { request, store } = await fixture(t);
  await pair(request);
  const { data: post } = await submit(request);
  const project = store.read().projects[0];
  const config = Object.fromEntries(
    [
      "allowedChannels",
      "allowedFormats",
      "destinations",
      "compensationDisclosure",
      "beneficiaryDisclosure",
      "factualClaims",
      "termsVersion",
      "maxFileBytes",
    ].map((key) => [key, project.eligibilityPolicy[key]]),
  );
  const updated = await request(`/projects/${project.id}`, {
    method: "PUT",
    role: "nonprofit",
    body: {
      ...project,
      policyConfig: {
        ...config,
        factualClaims: [
          "Fictional campaign: one tree planted per local event.",
        ],
        termsVersion: "local-v2",
      },
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.eligibilityPolicy.version, 2);
  assert.deepEqual(updated.data.policyHistory[0], project.policyHistory[0]);
  const workspace = (await request("/workspace")).data;
  assert.equal(workspace.approvedPosts.length, 1); // The independent food campaign remains eligible.
  assert.equal((await request(`/posts/${post.id}/export`)).status, 409);
  const current = store.read().posts[0];
  assert.deepEqual(
    current.eligibility.reasons.map((r) => r.code),
    ["CURRENT_TERMS_REQUIRED", "FACT_BLOCK_REQUIRED"],
  );
  assert.equal(current.evaluations[0].outcome, "eligible");
});

test("inclusive UTC dates share creation/revision/readiness rules and never partially mutate", async (t) => {
  const { request, store } = await fixture(t);
  const today = new Date().toISOString().slice(0, 10);
  const project = store.read().projects[0];
  assert(
    submissionsOpen({ ...project, startDate: today, endDate: today }, today),
  );
  assert(
    !submissionsOpen(
      { ...project, startDate: "2099-01-01", endDate: "2099-01-02" },
      today,
    ),
  );
  await request(`/projects/${project.id}`, {
    method: "PUT",
    body: {
      ...project,
      startDate: today,
      endDate: today,
      instagram: "one.tree",
    },
  });
  const { data: post } = await submit(request);
  assert.equal(post.status, "approved");
  assert.equal((await request(`/posts/${post.id}/export`)).status, 200);
  for (const change of [
    { status: "draft" },
    { status: "archived" },
    { startDate: "2099-01-01", endDate: "2099-01-02" },
    { startDate: "2000-01-01", endDate: "2000-01-02" },
  ]) {
    await request(`/projects/${project.id}`, {
      method: "PUT",
      body: { ...project, ...change },
    });
    const before = store.read();
    assert.equal(
      (
        await request(`/projects/${project.id}/posts`, {
          method: "POST",
          body: valid,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(`/posts/${post.id}`, {
          method: "PUT",
          body: { ...valid, revision: 1 },
        })
      ).status,
      409,
    );
    assert.equal((await request(`/posts/${post.id}/export`)).status, 409);
    assert.deepEqual(store.read(), before);
  }
});

test("private evidence never enters another creator's public projection, and unpublishing removes discovery", async (t) => {
  const { request, store } = await fixture(t);
  const { data: post } = await submit(request);
  const alex = store.read().creators.find((c) => c.name === "Alex Rivera");
  const result = (
    await request("/workspace", {
      role: "creator",
      headers: { "x-demo-creator": alex.id },
    })
  ).data;
  const publicPost = result.approvedPosts.find((p) => p.id === post.id);
  for (const privateKey of [
    "eligibility",
    "evaluations",
    "snapshots",
    "appeals",
    "rights",
    "disclosures",
    "policy",
  ])
    assert(!(privateKey in publicPost));
  assert.deepEqual(publicPost.history, []);
  assert.deepEqual(result.activity, []);
  const project = store.read().projects[0];
  await request(`/projects/${project.id}`, {
    method: "PUT",
    body: { ...project, status: "draft" },
  });
  const hidden = (
    await request("/workspace", {
      role: "creator",
      headers: { "x-demo-creator": alex.id },
    })
  ).data;
  assert(!hidden.approvedPosts.some((p) => p.id === post.id));
  assert(store.read().posts.some((p) => p.id === post.id));
});

test("eligible count uses one logical creative and stable creator ID with competition ties", async (t) => {
  const { request, store } = await fixture(t);
  const { data: post } = await submit(request);
  for (let revision = 1; revision <= 5; revision++)
    assert.equal(
      (
        await request(`/posts/${post.id}`, {
          method: "PUT",
          role: "creator",
          body: { ...valid, revision },
        })
      ).status,
      200,
    );
  const rows = (await request("/workspace")).data.eligibleCounts;
  assert.equal(rows.find((r) => r.creatorId === post.creatorId).count, 2);
  const counted = eligibleCounts([
    { id: "a", creatorId: "1", creator: "A" },
    { id: "a", creatorId: "1", creator: "A" },
    { id: "b", creatorId: "2", creator: "B" },
    { id: "c", creatorId: "3", creator: "C" },
    { id: "d", creatorId: "3", creator: "C" },
  ]);
  assert.deepEqual(
    counted.map((r) => [r.name, r.count, r.rank]),
    [
      ["C", 2, 1],
      ["A", 1, 2],
      ["B", 1, 2],
    ],
  );
  assert.equal(store.read().posts[0].snapshots.length, 6);
});

test("legacy migration preserves IDs, historical decisions and content; repeat startup never grants approval bypass", async (t) => {
  const { store, dir } = await fixture(t);
  store.update((state) => {
    const post = state.posts[0];
    for (const key of [
      "snapshots",
      "snapshotId",
      "evaluations",
      "evaluationId",
      "eligibility",
      "disclosures",
      "acceptedTermsVersion",
    ])
      delete post[key];
    post.status = "approved";
    post.history.push({
      id: "legacy-decision",
      action: "approved",
      actor: "Past owner",
      note: "Historical approval preserved",
      at: "2025-01-01T00:00:00Z",
    });
  });
  const original = store.read();
  const migrated = createStore(join(dir, "test.sqlite"));
  const after = migrated.read();
  assert.deepEqual(after.creators, original.creators);
  assert.equal(after.posts[0].id, original.posts[0].id);
  assert.equal(after.posts[0].caption, original.posts[0].caption);
  assert(after.posts[0].history.some((e) => e.id === "legacy-decision"));
  assert.equal(after.posts[0].eligibility.outcome, "needs_fix");
  migrated.close();
  const reopened = createStore(join(dir, "test.sqlite"));
  assert.deepEqual(reopened.read(), after);
  reopened.close();
});

test("withdrawal blocks new handoff but retains immutable prior export and evaluated snapshot", async (t) => {
  const { request, store } = await fixture(t);
  await pair(request);
  const { data: post } = await submit(request);
  const exported = (await request(`/posts/${post.id}/export`)).data;
  assert.equal(
    (
      await request(`/posts/${post.id}/withdraw`, {
        method: "POST",
        role: "creator",
        body: { revision: 1 },
      })
    ).status,
    200,
  );
  assert.equal((await request(`/posts/${post.id}/export`)).status, 409);
  assert.deepEqual(store.read().exports.at(-1), exported);
  assert.deepEqual(store.read().posts[0].snapshots[0], post.snapshots[0]);
});

test("upload boundaries, signature rejection cleanup and persisted media survive isolated restart", async (t) => {
  const { request, baseURL, store, dir } = await fixture(t);
  async function upload(bytes, type = "image/jpeg", name = "creative.jpg") {
    const form = new FormData();
    form.append("media", new Blob([bytes], { type }), name);
    const response = await fetch(`${baseURL}/api/uploads`, {
      method: "POST",
      headers: {
        "x-demo-role": "creator",
        "x-demo-creator": store.read().creators[0].id,
      },
      body: form,
    });
    return { status: response.status, data: await response.json() };
  }
  assert.equal((await upload(Buffer.from("forged"))).status, 400);
  assert.equal(
    (await upload(Buffer.from("pdf"), "application/pdf", "bad.pdf")).status,
    400,
  );
  assert.deepEqual(readdirSync(join(dir, "uploads")), []);
  const limit = new Uint8Array(30 * 1024 * 1024);
  limit.set([255, 216, 255]);
  const maximum = await upload(limit);
  assert.equal(maximum.status, 201);
  const oversized = new Uint8Array(limit.length + 1);
  oversized.set([255, 216, 255]);
  assert.equal((await upload(oversized)).status, 400);
  assert.equal(readdirSync(join(dir, "uploads")).length, 1);
  const actualImage = readFileSync("public/images/forest.jpg");
  const uploaded = await upload(actualImage);
  assert.equal(uploaded.status, 201);
  assert.notEqual(uploaded.data.media, maximum.data.media);
  assert.equal(
    (await submit(request, { media: uploaded.data.media, mediaType: "video" }))
      .status,
    400,
  );
  const created = await submit(request, uploaded.data);
  assert.equal(created.status, 201);
  assert.equal(created.data.eligibility.outcome, "eligible");
  const reopened = createStore(join(dir, "test.sqlite"));
  assert.equal(reopened.read().posts[0].media, uploaded.data.media);
  assert.deepEqual(reopened.read().creators, store.read().creators);
  reopened.close();
  const media = await fetch(`${baseURL}${uploaded.data.media}`, {
    headers: { "x-demo-role": "admin" },
  });
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), actualImage);
});

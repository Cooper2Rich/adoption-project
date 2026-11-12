import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { currentEligibility } from "../server/eligibility.ts";
import { adoptionAds } from "../src/public-demo/adoption-ads.ts";
import {
  addAdoptionShowcase,
  adoptionCampaignId,
  adoptionProjectId,
} from "../src/public-demo/adoption-showcase.ts";

test("the remaining adoption film retains its original full-length bytes and audio track", () => {
  assert.deepEqual(
    adoptionAds.map((ad) => ad.title),
    ["The Girl in the Middle"],
  );
  for (const ad of adoptionAds) {
    const bytes = readFileSync(
      new URL(`../public${ad.media}`, import.meta.url),
    );
    assert.equal(bytes.length, ad.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), ad.digest);
    assert.ok(ad.durationSeconds >= 60 && ad.durationSeconds < 61);
    assert.ok(
      bytes.includes(Buffer.from("mp4a")),
      "original AAC audio is retained",
    );
    assert.ok(
      readFileSync(new URL(`../public${ad.poster}`, import.meta.url)).length >
        1000,
    );
  }
});

test("existing browsers retire Duality once while preserving the remaining ad, campaign and financial records", () => {
  const state = {
    nonprofits: [],
    creators: [],
    managedCampaigns: [],
    projects: [],
    posts: [],
    activity: [],
    support: [{ adId: "adoption-duality", amountCents: 10000 }],
    sampleFinancials: { retained: true },
  };
  addAdoptionShowcase(state);
  delete state.adoptionDualityRemovalVersion;
  state.posts[0].caption = "Keep this edit";
  state.posts.push({
    ...structuredClone(state.posts[0]),
    id: "adoption-duality",
    title: "Duality",
    caption: "Retained historical caption",
    media: "/videos/adoption/duality.mp4",
  });
  state.projects[0].description =
    "The Girl in the Middle and Duality, presented as two separate full-length video ads.";
  const funding = structuredClone({
    support: state.support,
    samples: state.sampleFinancials,
  });
  addAdoptionShowcase(state);
  assert.deepEqual(
    state.posts.map((p) => p.id),
    ["adoption-girl-in-the-middle"],
  );
  assert.equal(state.posts[0].caption, "Keep this edit");
  assert.equal(state.removedDemoAds[0].caption, "Retained historical caption");
  assert.equal(state.projects[0].description.includes("Duality"), false);
  assert.deepEqual(
    { support: state.support, samples: state.sampleFinancials },
    funding,
  );
  const after = structuredClone(state);
  addAdoptionShowcase(state);
  assert.deepEqual(state, after);
});

test("the explicit import creates one campaign with one child project and one ad, without replaying or replacing records", () => {
  const state = {
    nonprofits: [],
    creators: [],
    managedCampaigns: [],
    projects: [],
    posts: [],
    activity: [],
    projectRequests: [{ id: "preserved" }],
    sampleFinancials: { marker: "preserved" },
    support: [{ id: "retained" }],
  };
  addAdoptionShowcase(state);
  assert.equal(state.managedCampaigns.length, 1);
  assert.equal(state.managedCampaigns[0].name, "Adoption Is");
  assert.equal(state.projects.length, 1);
  assert.equal(state.projects[0].name, "ACU ad competition");
  assert.equal(state.projects[0].campaignId, adoptionCampaignId);
  assert.notEqual(adoptionCampaignId, adoptionProjectId);
  assert.equal(state.posts.length, 1);
  assert.ok(
    state.posts.every(
      (p) =>
        p.projectId === adoptionProjectId &&
        currentEligibility(p, state.projects[0]),
    ),
  );
  state.posts[0].caption = "A retained edit";
  state.posts[0].withdrawnAt = new Date().toISOString();
  state.managedCampaigns[0].status = "archived";
  const before = structuredClone(state);
  addAdoptionShowcase(state);
  assert.deepEqual(state, before);
});

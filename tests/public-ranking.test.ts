import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEMO_TARGETS,
  rankPublicAds,
  scorePublicAd,
} from "../src/public-demo/ranking.ts";
const ad = (id, values = {}) => ({
  id,
  projectId: "campaign-a",
  impressions: 50000,
  clicks: 2000,
  donatedCents: 250000,
  ...values,
});

test("PRD weights use capped square roots: 40 impressions / 30 total clicks / 30 raised", () => {
  assert.equal(
    scorePublicAd(ad("x", { impressions: 25, clicks: 36, donatedCents: 64 }), {
      impressions: 100,
      clicks: 100,
      donatedCents: 100,
    }),
    62,
  );
  assert.equal(scorePublicAd(ad("x")), 100);
  assert.equal(
    scorePublicAd(
      ad("x", { impressions: 100000, clicks: 4000, donatedCents: 500000 }),
    ),
    100,
  );
  assert.equal(
    scorePublicAd(ad("zero", { impressions: 0, clicks: 0, donatedCents: 0 })),
    0,
  );
});

test("each campaign receives its own top 25, without mutation or cross-campaign normalization", () => {
  const ads = ["campaign-a", "campaign-b"].flatMap((projectId) =>
    Array.from({ length: 30 }, (_, i) =>
      ad(projectId + i, {
        projectId,
        impressions: 500 + i,
        clicks: 20 + i,
        donatedCents: 100 + i,
      }),
    ),
  );
  const before = structuredClone(ads);
  for (const campaignId of ["campaign-a", "campaign-b"]) {
    const ranked = rankPublicAds(ads, campaignId);
    assert.equal(ranked.length, 25);
    assert.ok(ranked.every((row) => row.projectId === campaignId));
    assert.equal(ranked[0].id, campaignId + "29");
    assert.equal(ranked.at(-1).id, campaignId + "5");
    assert.equal(ranked[0].rank, 1);
  }
  assert.deepEqual(ads, before);
});

test("ranking is weighted performance instead of donation volume", () => {
  const ranked = rankPublicAds(
    [
      ad("donations", { impressions: 0, clicks: 0 }),
      ad("reach", { donatedCents: 0 }),
    ],
    "campaign-a",
  );
  assert.equal(ranked[0].id, "reach");
  assert.equal(ranked[0].score, 70);
});

test("equal unrounded scores break by clicks, raised funds, then impressions; CTR is excluded", () => {
  const ranked = rankPublicAds(
    [
      ad("higher-ctr", { impressions: 50000 }),
      ad("more-clicks", { impressions: 100000, clicks: 2100 }),
      ad("more-raised", { donatedCents: 300000 }),
      ad("more-impressions", { impressions: 60000 }),
    ],
    "campaign-a",
  );
  assert.deepEqual(
    ranked.map((row) => row.id),
    ["more-clicks", "more-raised", "more-impressions", "higher-ctr"],
  );
  assert.ok(ranked.every((row) => row.score === 100));
});

test("true ties share competition ranks, while display rounding cannot create a tie", () => {
  const tied = rankPublicAds(
    [ad("b"), ad("a"), ad("c", { donatedCents: 0 })],
    "campaign-a",
  );
  assert.deepEqual(
    tied.map((row) => [row.id, row.rank]),
    [
      ["a", 1],
      ["b", 1],
      ["c", 3],
    ],
  );
  const precise = rankPublicAds(
    [
      ad("a", { donatedCents: 1000000000000 }),
      ad("z", { donatedCents: 1000000000001 }),
    ],
    "campaign-a",
    { ...DEMO_TARGETS, donatedCents: 1000000000000000 },
  );
  assert.equal(precise[0].score.toFixed(2), precise[1].score.toFixed(2));
  assert.equal(precise[0].id, "z");
  assert.deepEqual(
    precise.map((row) => row.rank),
    [1, 2],
  );
});

test("missing or invalid inputs remain unranked, and targets must be positive finite integers", () => {
  for (const invalid of [null, -1, NaN, Infinity, 0.5]) {
    for (const field of ["impressions", "clicks", "donatedCents"]) {
      assert.equal(scorePublicAd(ad("x", { [field]: invalid })), null);
    }
  }
  assert.deepEqual(
    rankPublicAds([ad("missing", { clicks: null })], "campaign-a"),
    [],
  );
  assert.deepEqual(rankPublicAds([], "campaign-a"), []);
  assert.throws(
    () => scorePublicAd(ad("x"), { ...DEMO_TARGETS, impressions: 0 }),
    /positive safe integers/,
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { adoptionAds } from "../src/public-demo/adoption-ads.ts";
import { adoptionSampleMetrics } from "../src/public-demo/adoption-demo-data.ts";
import {
  backfillAdoptionSampleWins,
  capturePastResults,
  completedWindow,
  pastPeriods,
} from "../src/public-demo/leaderboard-history.ts";
import { samplePerformanceDays } from "../src/public-demo/leaderboard-periods.ts";
import { simulateLeaders } from "../src/public-demo/leaderboard-simulation.ts";
import { rankPublicAds } from "../src/public-demo/ranking.ts";
const now = new Date("2026-10-24T18:00:00Z");
const totals = { impressions: 20000, clicks: 800, donatedCents: 90000 };
const ad = (id, projectId = "campaign") => ({
  id,
  title: id,
  creator: "Creator",
  projectId,
  ...totals,
  performanceDays: samplePerformanceDays(id, totals, now),
});

test("past selectors exclude active days and weeks across UTC boundaries", () => {
  assert.equal(pastPeriods("daily", now)[0], "2026-10-23");
  assert.deepEqual(pastPeriods("weekly", now), [
    "2026-10-12",
    "2026-10-05",
    "2026-09-28",
    "2026-09-21",
  ]);
  assert.equal(completedWindow("daily", "2026-10-24", now), null);
  assert.equal(completedWindow("weekly", "2026-10-19", now), null);
  assert.equal(
    completedWindow("weekly", "2026-10-12", now).through,
    "2026-10-18",
  );
  assert.equal(
    pastPeriods("weekly", new Date("2026-10-26T00:00:00Z"))[0],
    "2026-10-19",
  );
});

test("completed winners are frozen, retain exact ties and never invent missing evidence", () => {
  const first = ad("first");
  const second = { ...first, id: "second" };
  const campaigns = [
    { id: "campaign", name: "Campaign" },
    { id: "empty", name: "Empty" },
  ];
  const results = capturePastResults([first, second], campaigns, [], now);
  assert.equal(results.length, 22);
  assert.ok(
    results
      .filter((r) => r.campaignId === "campaign")
      .every((r) => r.winners.length === 2),
  );
  assert.ok(
    results
      .filter((r) => r.campaignId === "empty")
      .every((r) => r.winners.length === 0),
  );
  const before = structuredClone(results);
  const changed = simulateLeaders([first, second], 10).map((a) => ({
    ...a,
    title: "Edited",
    performanceDays: [],
  }));
  assert.deepEqual(
    capturePastResults(changed, campaigns, results, now),
    before,
  );
  assert.deepEqual(results, before);
});

test("demo bursts move leaders through scoring while metrics grow and source records stay intact", () => {
  const ads = [
    ad("a"),
    ad("b"),
    ad("c"),
    { ...ad("missing"), clicks: null },
    ad("other", "other"),
  ];
  const before = structuredClone(ads);
  const leaders = [];
  let previous = ads;
  for (let tick = 1; tick <= 8; tick++) {
    const updated = simulateLeaders(ads, tick);
    leaders.push(rankPublicAds(updated, "campaign")[0].id);
    updated.forEach((a, i) => {
      for (const key of ["impressions", "clicks", "donatedCents"]) {
        if (a[key] !== null) assert.ok(a[key] >= previous[i][key]);
      }
    });
    assert.equal(updated[3].clicks, null);
    assert.deepEqual(updated[0].performanceDays, before[0].performanceDays);
    previous = updated;
  }
  assert.deepEqual(leaders.slice(0, 3), ["b", "c", "a"]);
  assert.deepEqual(ads, before);
});

test("Yakira's daily and weekly sample wins fill old empty periods once and retain captured winners", () => {
  for (const date of ["2026-10-25T18:00:00Z", "2026-10-26T00:00:00Z"]) {
    const at = new Date(date);
    const girl = {
      ...adoptionAds[0],
      campaignId: "adoption-is",
      creator: "Yakira",
      ...adoptionSampleMetrics,
      performanceDays: samplePerformanceDays(
        adoptionAds[0].id,
        adoptionSampleMetrics,
        at,
      ),
    };
    const campaigns = [
      { id: "adoption-is", name: "Adoption Is" },
      { id: "empty", name: "Empty" },
    ];
    const empty = capturePastResults([], campaigns, [], at);
    const before = structuredClone(empty);
    const filled = backfillAdoptionSampleWins([girl], empty, at);
    assert.deepEqual(empty, before);
    assert.equal(filled.length, empty.length);
    for (const period of ["daily", "weekly"]) {
      const wins = filled.filter(
        (r) => r.campaignId === "adoption-is" && r.period === period,
      );
      assert.equal(wins.length, period === "daily" ? 7 : 4);
      assert.ok(wins.every((r) => r.winners.length === 1));
      assert.ok(wins.every((r) => r.winners[0].creator === "Yakira"));
      assert.ok(wins.every((r) => r.winners[0].score > 0));
      assert.ok(wins.every((r) => !r.winners[0].performanceDays));
    }
    assert.ok(
      filled
        .filter((r) => r.campaignId === "empty")
        .every((r) => !r.winners.length),
    );
    assert.deepEqual(backfillAdoptionSampleWins([girl], filled, at), filled);
    assert.deepEqual(
      backfillAdoptionSampleWins(
        [{ ...girl, title: "Edited", performanceDays: [] }],
        filled,
        at,
      ),
      filled,
    );
    assert.deepEqual(
      backfillAdoptionSampleWins(
        [{ ...girl, media: "/replacement.mp4" }],
        empty,
        at,
      ),
      empty,
    );
    assert.deepEqual(backfillAdoptionSampleWins([], empty, at), empty);
    const fresh = capturePastResults([girl], campaigns, [], at);
    assert.deepEqual(fresh, filled);
  }
});

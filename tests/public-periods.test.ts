import assert from "node:assert/strict";
import { test } from "node:test";
import {
  leaderboardWindow,
  periodAd,
  samplePerformanceDays,
} from "../src/public-demo/leaderboard-periods.ts";
import { rankPublicAds } from "../src/public-demo/ranking.ts";
const at = new Date("2026-10-24T18:00:00Z");
const totals = { impressions: 32400, clicks: 1296, donatedCents: 215000 };
const makeAd = (id = "nocturne-midnight", values = totals) => ({
  id,
  projectId: "campaign",
  ...values,
  performanceDays: samplePerformanceDays(id, values, at),
});

test("demo daily and Monday-based weekly windows use exact UTC boundaries across rollover", () => {
  assert.deepEqual(
    leaderboardWindow("daily", new Date("2026-10-25T00:00:00Z")),
    {
      period: "daily",
      startsOn: "2026-10-25",
      endsBefore: "2026-10-26",
      through: "2026-10-25",
    },
  );
  assert.deepEqual(leaderboardWindow("weekly", at), {
    period: "weekly",
    startsOn: "2026-10-19",
    endsBefore: "2026-10-26",
    through: "2026-10-24",
  });
  assert.equal(
    leaderboardWindow("weekly", new Date("2026-10-26T00:00:00Z")).startsOn,
    "2026-10-26",
  );
  assert.equal(
    leaderboardWindow("weekly", new Date("2027-01-01T12:00:00Z")).startsOn,
    "2026-12-28",
  );
});

test("dated demo metrics conserve weekly totals and produce independent daily winners", () => {
  const ads = [
    makeAd(),
    makeAd("nocturne-espresso", {
      impressions: 21800,
      clicks: 981,
      donatedCents: 168000,
    }),
  ];
  const before = structuredClone(ads);
  const week = ads.map((ad) => periodAd(ad, leaderboardWindow("weekly", at)));
  assert.deepEqual(
    [week[0].impressions, week[0].clicks, week[0].donatedCents],
    Object.values(totals),
  );
  assert.equal(rankPublicAds(week, "campaign")[0].id, "nocturne-midnight");
  const day = ads.map((ad) => periodAd(ad, leaderboardWindow("daily", at)));
  assert.equal(rankPublicAds(day, "campaign")[0].id, "nocturne-espresso");
  assert.equal(day[0].impressions, 4860);
  assert.deepEqual(ads, before);
});

test("period aggregation excludes previous weeks and future days without using all-time totals", () => {
  const ad = makeAd();
  ad.performanceDays.push(
    {
      date: "2026-10-18",
      impressions: 999999,
      clicks: 99999,
      donatedCents: 9999999,
    },
    {
      date: "2026-10-25",
      impressions: 999999,
      clicks: 99999,
      donatedCents: 9999999,
    },
  );
  const row = periodAd(ad, leaderboardWindow("weekly", at));
  assert.equal(row.impressions, totals.impressions);
  assert.equal(row.donatedCents, totals.donatedCents);
});

test("missing, partial and duplicate day buckets stay unranked; explicit zeroes remain known", () => {
  for (const days of [
    undefined,
    [],
    [{ date: "2026-10-24", impressions: null, clicks: 0, donatedCents: 0 }],
    [
      { date: "2026-10-24", impressions: 1, clicks: 1, donatedCents: 1 },
      { date: "2026-10-24", impressions: 1, clicks: 1, donatedCents: 1 },
    ],
  ]) {
    assert.equal(
      periodAd(
        { ...makeAd(), performanceDays: days },
        leaderboardWindow("daily", at),
      ).impressions,
      null,
    );
  }
  const zero = periodAd(
    {
      ...makeAd(),
      performanceDays: [
        { date: "2026-10-24", impressions: 0, clicks: 0, donatedCents: 0 },
      ],
    },
    leaderboardWindow("daily", at),
  );
  assert.equal(zero.impressions, 0);
  const missingDay = makeAd();
  missingDay.performanceDays.shift();
  assert.equal(
    periodAd(missingDay, leaderboardWindow("weekly", at)).clicks,
    null,
  );
  const monday = new Date("2026-10-26T00:00:00Z");
  assert.deepEqual(
    samplePerformanceDays("nocturne-midnight", totals, monday).filter(
      (day) => day.date >= "2026-10-26",
    ),
    [{ date: "2026-10-26", ...totals }],
  );
});

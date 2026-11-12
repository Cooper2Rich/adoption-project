import assert from "node:assert/strict";
import { test } from "node:test";
import { creatorLeaderboardWins } from "../src/public-demo/creator-wins.ts";

test("creator wins use saved attribution, support ties and exclude other creators and active periods", () => {
  const now = new Date("2026-10-25T18:00:00Z");
  const girl = {
    id: "girl",
    creatorId: "yakira",
    creator: "Yakira",
    title: "The Girl in the Middle",
    rank: 1,
    score: 65.93,
  };
  const other = {
    id: "other-ad",
    creatorId: "other",
    creator: "Other",
    rank: 1,
  };
  const record = (period, date, winners) => ({
    campaignId: "adoption-is",
    campaignName: "Adoption Is",
    period,
    date,
    winners,
  });
  const history = [
    record("weekly", "2026-10-12", [girl]),
    record("daily", "2026-10-24", [girl, other]),
    record("daily", "2026-10-23", [other]),
    record("daily", "2026-10-25", [girl]),
    record("weekly", "2026-10-19", [girl]),
    record("daily", "2026-10-22", [{ ...girl, rank: 2 }]),
  ];
  const before = structuredClone(history);
  const wins = creatorLeaderboardWins("yakira", history, now);
  assert.equal(wins.length, 2);
  assert.equal(wins[0].period, "daily");
  assert.equal(wins[0].joint, true);
  assert.equal(wins[1].period, "weekly");
  assert.equal(wins[1].joint, false);
  assert.ok(wins.every((win) => win.ad.creatorId === "yakira"));
  assert.deepEqual(creatorLeaderboardWins("new-creator", history, now), []);
  assert.deepEqual(history, before);
});

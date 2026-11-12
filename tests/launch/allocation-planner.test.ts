import assert from "node:assert/strict";
import test from "node:test";
import { planAllocation } from "../../convex/allocation/planner.ts";
import { allocationInput } from "./fixtures.ts";

test("S1-03 fixed baselines and residual boosts include every exact cutoff tie", () => {
  const result = planAllocation(allocationInput());
  assert.equal(result.status, "ready");
  assert.deepEqual(
    result.targets.map((row) => [
      row.entryId,
      row.baselineCents + row.boostCents,
    ]),
    [
      ["a", 2500],
      ["b", 2500],
      ["c", 1500],
      ["d", 1500],
    ],
  );
  assert.equal(result.boostCents, 2000);
  assert.equal(result.uncommittedCents, 2000);
  assert.equal(result.selectedCount, 2);
});

test("S1-10 missing entrant scores hold every new boost without inventing zero performance", () => {
  const input = allocationInput();
  input.entries[3].metrics = {
    impressions: null,
    clicks: null,
    raisedCents: null,
  };
  const result = planAllocation(input);
  assert.equal(result.status, "boosts-held");
  assert.equal(result.baselineCents, 6000);
  assert.equal(result.boostCents, 0);
  assert.equal(result.targets[3].score, null);
  assert.match(result.reasons.join(" "), /score coverage/i);
  assert.equal(
    result.targets.every((entry) => entry.boostCents === 0),
    true,
  );
});

test("S1-06 Chicago admission proration respects ordinary, spring and fall day lengths", () => {
  for (const [at, baseline, expected] of [
    ["2026-11-11T18:00:00Z", 1000, 500],
    ["2026-03-08T17:00:00Z", 2300, 1200],
    ["2026-11-01T18:00:00Z", 2500, 1200],
  ] as const) {
    const input = allocationInput();
    input.at = Date.parse(at);
    input.finance.asOf = input.at;
    input.settings.baselineCents = baseline;
    input.settings.boostPercent = 0;
    input.entries = [{ ...input.entries[0], admittedAt: input.at }];
    assert.equal(planAllocation(input).baselineCents, expected);
  }
});

test("S1-04 healthy startup splits only the residual boost pool", () => {
  const input = allocationInput();
  input.scoreCoverage = "startup";
  input.entries.forEach(
    (entry) =>
      (entry.metrics = { impressions: null, clicks: null, raisedCents: null }),
  );
  const result = planAllocation(input);
  assert.equal(result.status, "ready");
  assert.deepEqual(
    result.targets.map((row) => row.baselineCents + row.boostCents),
    [2000, 2000, 2000, 2000],
  );
  assert.equal(result.uncommittedCents, 2000);
});

test("S1-05 unavailable provider shares are held without redistribution", () => {
  const input = allocationInput();
  input.providers.tiktok = "blocked";
  const row = planAllocation(input).targets[0];
  assert.equal(row.metaCents, 1500);
  assert.equal(row.tiktokCents, 1000);
  assert.equal(row.heldTiktokCents, 1000);
  input.entries[3].state = "stopping";
  const reduced = planAllocation(input);
  assert.equal(reduced.occupiedSlots, 4);
  assert.equal(reduced.eligibleEntries, 3);
  assert.equal(
    reduced.targets.some((entry) => entry.entryId === "d"),
    false,
  );
});

test("S1-07 full-run protection and additional obligations bound residual cash without double deduction", () => {
  const input = allocationInput();
  input.authority.totalLimitCents = 100000;
  input.finance.availableCents = 70000;
  input.finance.remainingBaselineReserveCents = 66000;
  input.finance.obligations = [
    { id: "already-held", amountCents: 20000, coverage: "provider" },
    { id: "unbilled", amountCents: 1000, coverage: "local" },
  ];
  const result = planAllocation(input);
  assert.equal(result.headroomCents, 3000);
  assert.equal(result.boostCents, 1500);
  assert.equal(result.uncommittedCents, 1500);
});

test("S1-07 unreliable, stale, missing and invalid funding inputs yield explicit zero-allocation blocks", () => {
  const cases: ((input: ReturnType<typeof allocationInput>) => void)[] = [
    (input) => (input.finance.status = "unknown"),
    (input) => (input.finance.safety = null),
    (input) => (input.finance.asOf -= 300001),
    (input) => (input.finance.availableCents = -100),
    (input) => (input.finance.remainingBaselineReserveCents = 5999),
    (input) => (input.finance.availableCents = 5999),
    (input) => (input.settings.baselineCents = 0),
    (input) => (input.settings.baselineCents = 1.5),
    (input) => (input.settings.baselineCents = Number.MAX_SAFE_INTEGER),
    (input) => (input.settings.boostPercent = 101),
    (input) => (input.settings.topCount = 0),
    (input) => (input.settings.targets.clicks = 0),
    (input) => (input.settings.tiktokPercent = 41),
    (input) => (input.authority.capacity = 3),
    (input) => input.entries.push({ ...input.entries[0] }),
    (input) => (input.entries[0].createdAt = NaN),
    (input) => (input.entries[0].id = ""),
    (input) => {
      if (input.finance.safety) input.finance.safety.revision = "";
    },
    (input) =>
      (input.finance.obligations = [
        { id: "same-cost", amountCents: 1, coverage: "provider" },
        { id: "same-cost", amountCents: 1, coverage: "local" },
      ]),
  ];
  for (const change of cases) {
    const input = allocationInput();
    change(input);
    const result = planAllocation(input);
    assert.equal(result.status, "blocked", JSON.stringify(input));
    assert.equal(result.targets.length, 0);
    assert.equal(result.reasons.length > 0, true);
  }
});

test("S1-10 an inconsistent startup label cannot award private bonuses to a missing-score entrant", () => {
  const input = allocationInput();
  input.scoreCoverage = "startup";
  input.entries[3].metrics = {
    impressions: null,
    clicks: null,
    raisedCents: null,
  };
  const result = planAllocation(input);
  assert.equal(result.status, "boosts-held");
  assert.equal(result.baselineCents, 6000);
  assert.equal(result.boostCents, 0);
});

test("S1-06 one-cent remainders follow creation order and Meta wins exact provider remainders", () => {
  const input = allocationInput();
  input.settings.baselineCents = 1;
  input.settings.boostPercent = 100;
  input.settings.metaPercent = input.settings.tiktokPercent = 50;
  input.entries = [input.entries[1], input.entries[0]];
  input.entries.forEach(
    (entry) =>
      (entry.metrics = { impressions: 100, clicks: 100, raisedCents: 100 }),
  );
  input.finance.availableCents = 3;
  input.finance.remainingBaselineReserveCents = 2;
  const result = planAllocation(input);
  assert.equal(
    result.targets.find((row) => row.entryId === "a")?.boostCents,
    1,
  );
  assert.equal(
    result.targets.find((row) => row.entryId === "b")?.boostCents,
    0,
  );
  assert.deepEqual(
    result.targets.map((row) => [row.metaCents, row.tiktokCents]),
    [
      [1, 0],
      [1, 1],
    ],
  );
  assert.equal(result.uncommittedCents, 0);
});

test("S1-06 no-entry and zero-authority boundaries never allocate money", () => {
  const input = allocationInput();
  input.entries = [];
  input.authority.dailyLimitCents = input.authority.totalLimitCents = 0;
  input.finance.availableCents =
    input.finance.remainingBaselineReserveCents = 0;
  const result = planAllocation(input);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.targets, []);
  assert.equal(result.baselineCents + result.boostCents, 0);
});

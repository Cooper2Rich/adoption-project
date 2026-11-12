import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignBudgetBreakdown } from "../src/public-demo/campaign-budget.ts";

test("platform budgets, spending and remaining cents reconcile including uneven splits", () => {
  const rules = { campaignLimitCents: 101, metaPercent: 33 },
    spent = { meta: 5, tiktok: 7 };
  const report = campaignBudgetBreakdown(rules, spent);
  assert.deepEqual(report.rows, [
    { platform: "meta", allocatedCents: 33, spentCents: 5, remainingCents: 28 },
    {
      platform: "tiktok",
      allocatedCents: 68,
      spentCents: 7,
      remainingCents: 61,
    },
  ]);
  assert.equal(report.spentCents, 12);
  assert.equal(report.remainingCents, 89);
  assert.equal(
    report.rows.reduce((sum, row) => sum + row.remainingCents, 0),
    report.remainingCents,
  );
  assert.deepEqual(rules, { campaignLimitCents: 101, metaPercent: 33 });
  assert.deepEqual(spent, { meta: 5, tiktok: 7 });
});

test("overruns remain visible instead of manufacturing available budget", () => {
  const report = campaignBudgetBreakdown(
    { campaignLimitCents: 100000, metaPercent: 30 },
    { meta: 42000, tiktok: 28000 },
  );
  assert.equal(report.rows[0].remainingCents, -12000);
  assert.equal(report.rows[1].remainingCents, 42000);
  assert.equal(report.remainingCents, 30000);
  const over = campaignBudgetBreakdown(
    { campaignLimitCents: 60000, metaPercent: 50 },
    { meta: 42000, tiktok: 28000 },
  );
  assert.equal(over.remainingCents, -10000);
  const zero = campaignBudgetBreakdown(
    { campaignLimitCents: 0, metaPercent: 0 },
    { meta: 0, tiktok: 0 },
  );
  assert.equal(zero.remainingCents, 0);
  assert.throws(() =>
    campaignBudgetBreakdown(
      { campaignLimitCents: 100, metaPercent: 101 },
      { meta: 0, tiktok: 0 },
    ),
  );
  assert.throws(() =>
    campaignBudgetBreakdown(
      { campaignLimitCents: 100, metaPercent: 50 },
      { meta: -1, tiktok: 0 },
    ),
  );
});

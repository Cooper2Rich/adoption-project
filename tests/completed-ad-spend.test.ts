import assert from "node:assert/strict";
import { test } from "node:test";
import { completedAdSpendReport } from "../src/public-demo/completed-ad-spend.ts";

test("completed spend examples reconcile by project and platform without cross-campaign leakage", () => {
  const coffee = completedAdSpendReport([
    { id: "nocturne-coffee-showcase-v1" },
  ]);
  assert.equal(coffee.rows.length, 4);
  assert.equal(coffee.totalCents, 70000);
  assert.deepEqual(coffee.byPlatform, { meta: 42000, tiktok: 28000 });
  const river = completedAdSpendReport([{ id: "fictional-river-showcase-v1" }]);
  assert.equal(river.totalCents, 200000);
  const adoption = completedAdSpendReport([{ id: "acu-ad-competition" }]);
  assert.equal(adoption.totalCents, 150000);
  assert.ok(
    adoption.rows.every((row) => row.creative === "The Girl in the Middle"),
  );
  assert.equal(
    completedAdSpendReport([{ id: "new-campaign-project" }]).totalCents,
    0,
  );
  assert.equal(completedAdSpendReport([]).rows.length, 0);
});

test("sample visibility, repeated visits and caller changes do not mutate history or workspace records", () => {
  const projects = [
    {
      id: "nocturne-coffee-showcase-v1",
      status: "archived",
      campaignId: "retained",
    },
  ];
  const before = structuredClone(projects);
  const first = completedAdSpendReport([...projects, ...projects]);
  assert.equal(first.totalCents, 70000);
  const hidden = completedAdSpendReport(projects, false);
  assert.deepEqual(hidden, {
    rows: [],
    byPlatform: { meta: 0, tiktok: 0 },
    totalCents: 0,
  });
  first.rows[0].amountCents = 999999;
  assert.equal(completedAdSpendReport(projects).totalCents, 70000);
  assert.deepEqual(projects, before);
});

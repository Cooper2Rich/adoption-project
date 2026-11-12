import { expect, test } from "@playwright/test";
import { navigate, selectCreator } from "./helpers.ts";

test("sample earnings and application payments populate by default, reconcile and survive migration without changing saved giving", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./#/explore");
  await expect(page.locator(".ad-card")).toHaveCount(7);
  // Model an existing visitor with retained viewer history, before the sample migration.
  await page.evaluate(() => {
    const key = "slander-public-workspace-v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    delete state.sampleFinancials;
    delete state.adoptionDemoDataVersion;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem(
      "slander-public-viewers-v1",
      JSON.stringify({
        profiles: [
          {
            id: "viewer",
            name: "Retained viewer",
            email: "retained@example.test",
            role: "viewer",
          },
        ],
        activeId: "viewer",
        support: [
          {
            id: "retained-funding",
            viewerId: "viewer",
            adId: "nocturne-midnight",
            title: "Retained title",
            amountCents: 2500,
            at: "2026-10-20T12:00:00Z",
          },
        ],
      }),
    );
  });
  const before = await page.evaluate(() =>
    localStorage.getItem("slander-public-viewers-v1"),
  );
  await page.reload();
  await selectCreator(page, "Nocturne Studio · fictional");
  await navigate(page, "My ads");
  await expect(page.locator(".creator-earnings-link")).toContainText(
    "$1,040.00",
  );
  await navigate(page, "Earnings");
  const summary = page.locator(".earnings-summary > div");
  await expect(summary.nth(0)).toContainText("$1,040.00");
  await expect(summary.nth(1)).toContainText("$440.00");
  await expect(summary.nth(2)).toContainText("$600.00");
  await expect(
    page.locator(".sample-payment-history .earnings-row"),
  ).toHaveCount(2);
  await expect(page.locator(".info-banner")).toContainText("$25.00");
  await page.screenshot({
    path: `test-results/sample-creator-earnings-${info.project.name}.png`,
    fullPage: true,
  });
  const stored = await page.evaluate(() =>
    JSON.stringify(
      JSON.parse(localStorage.getItem("slander-public-workspace-v1")!)
        .sampleFinancials,
    ),
  );
  await page.reload();
  await expect(summary.nth(2)).toContainText("$600.00");
  expect(
    await page.evaluate(() =>
      JSON.stringify(
        JSON.parse(localStorage.getItem("slander-public-workspace-v1")!)
          .sampleFinancials,
      ),
    ),
  ).toBe(stored);
  await page
    .getByRole("checkbox", { name: "Include sample activity" })
    .uncheck();
  await expect(summary.nth(0)).toContainText("$0.00");
  await expect(summary.nth(2)).toContainText("$0.00");
  await page.getByRole("checkbox", { name: "Include sample activity" }).check();
  await selectCreator(page, "Alex River · fictional");
  await navigate(page, "Earnings");
  await expect(summary.nth(0)).toContainText("$640.00");
  await expect(summary.nth(2)).toContainText("$400.00");
  await expect(page.locator(".creator-earnings")).not.toContainText(
    "Your midnight ritual",
  );
  await page.getByLabel("Demo role").selectOption("admin");
  await navigate(page, "Funding");
  const fees = page.locator(".funding-summary > div").last();
  await expect(fees).toContainText("$1,405.00");
  await expect(fees).toContainText("Paid: $890.00 · Outstanding: $515.00");
  const coffee = page
    .locator(".funding-campaign")
    .filter({ hasText: "Nocturne Coffee" });
  await expect(
    coffee
      .locator(".funding-metrics > div")
      .filter({ hasText: "Paid to application" }),
  ).toContainText("$340.00");
  await expect(coffee).toContainText("Outstanding: $180.00");
  await page.getByLabel("Sort campaign funding").selectOption("app-fees");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/sample-application-payments-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("checkbox", { name: "Include sample activity" })
    .uncheck();
  await expect(fees).toContainText("Paid: $0.00 · Outstanding: $0.00");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("slander-public-viewers-v1"),
    ),
  ).toBe(before);
  expect(errors).toEqual([]);
});

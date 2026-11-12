import { expect, test } from "@playwright/test";
import { navigate, selectCreator } from "./helpers.ts";

test("Yakira's ad has illustrative metrics, a current daily and weekly leader position and matching sample earnings", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-10-24T18:00:00Z") });
  await page.goto("./#/explore");
  await page.getByLabel("Filter by cause").selectOption("Adoption");
  const card = page.locator(".ad-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Yakira");
  await expect(card.locator(".ad-stats dd")).toHaveText([
    "40,000",
    "4.00%",
    "$2,000.00",
  ]);
  // Simulate an older browser before the credit/sample migration, without resetting its other data.
  await page.evaluate(() => {
    const key = "slander-public-workspace-v1",
      state = JSON.parse(localStorage.getItem(key)!);
    delete state.adoptionDemoDataVersion;
    state.sampleFinancials.contributions =
      state.sampleFinancials.contributions.filter(
        (c: { id: string }) =>
          c.id !== "sample-finance-v1-adoption-girl-in-the-middle",
      );
    state.posts.find(
      (p: { id: string }) => p.id === "adoption-girl-in-the-middle",
    ).caption = "Retained caption before sample upgrade";
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.getByLabel("Filter by cause").selectOption("Adoption");
  await expect(card).toContainText("Retained caption before sample upgrade");
  await page.goto("./#/leaderboard?campaign=adoption-is&period=weekly");
  const row = page.locator(".leaderboard-table tbody tr");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("The Girl in the Middle");
  await expect(row).toContainText("Yakira");
  await expect(row).toContainText("40,000");
  await expect(row).toContainText("1,600");
  await expect(row).toContainText("$2,000.00");
  await expect(page.locator(".leader-badge")).toHaveText("Current leader");
  await page.getByRole("tab", { name: "Daily", exact: true }).click();
  await expect(row).toContainText("20,000");
  await expect(row).toContainText("800");
  await expect(row).toContainText("$1,000.00");
  await page.getByRole("tab", { name: "Weekly", exact: true }).click();
  await page.getByLabel("Search leaderboard").fill("Yakira");
  await expect(row).toHaveCount(1);
  await page.getByLabel("Search leaderboard").fill("");
  await page.screenshot({
    path: `test-results/adoption-leaderboard-${info.project.name}.png`,
    fullPage: true,
  });
  await selectCreator(page, "Yakira");
  await navigate(page, "Earnings");
  await page.getByRole("checkbox", { name: "Include sample activity" }).check();
  const earnings = page.locator(".earnings-summary > div");
  await expect(earnings.nth(0)).toContainText("$200.00");
  await expect(earnings.nth(1)).toContainText("$200.00");
  await expect(earnings.nth(2)).toContainText("$0.00");
  await expect(page.locator(".earnings-row")).toContainText(
    "The Girl in the Middle",
  );
  await page.reload();
  await expect(earnings.nth(0)).toContainText("$200.00");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("slander-public-workspace-v1")!,
        ).sampleFinancials.contributions.filter(
          (c: { id: string }) =>
            c.id === "sample-finance-v1-adoption-girl-in-the-middle",
        ).length,
    ),
  ).toBe(1);
  await page
    .getByRole("checkbox", { name: "Include sample activity" })
    .uncheck();
  await expect(earnings.nth(0)).toContainText("$0.00");
  expect(errors).toEqual([]);
});

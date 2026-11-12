import { expect, test } from "@playwright/test";
import { navigate, selectCreator } from "./helpers.ts";

test("Yakira sees her public daily and weekly win snapshots alongside earnings, including after her project is archived", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-25T18:00:00Z") });
  await page.goto("./");
  await selectCreator(page, "Yakira");
  await navigate(page, "Earnings");
  const wins = page.getByRole("region", {
    name: "Past leaderboard wins",
    exact: true,
  });
  const daily = wins.getByRole("region", {
    name: "Past daily wins",
    exact: true,
  });
  const weekly = wins.getByRole("region", {
    name: "Past weekly wins",
    exact: true,
  });
  await expect(daily).toContainText("7 wins");
  await expect(weekly).toContainText("4 wins");
  for (const card of [daily, weekly]) {
    await expect(card).toContainText("The Girl in the Middle");
    await expect(card).toContainText("Yakira");
    await expect(card.locator(".creator-win-metrics dd")).toHaveCount(4);
  }
  await expect(daily).toContainText("Daily winner · sample");
  await expect(weekly).toContainText("Weekly winner · sample");
  const summary = page.locator(".earnings-summary > div");
  await expect(summary.nth(0)).toContainText("$200.00");
  await daily
    .getByLabel("Your past daily wins")
    .selectOption("adoption-is:daily:2026-10-23:adoption-girl-in-the-middle");
  await weekly
    .getByLabel("Your past weekly wins")
    .selectOption("adoption-is:weekly:2026-10-05:adoption-girl-in-the-middle");
  const expected = await weekly
    .locator(".creator-win-metrics dd")
    .allTextContents();
  await weekly.getByRole("link", { name: "View weekly result" }).click();
  const row = page
    .getByRole("table", { name: "Past weekly winners for Adoption Is" })
    .locator("tbody tr");
  await expect(row).toContainText("Yakira");
  for (const value of expected) await expect(row).toContainText(value);
  await page.goto("./#/earnings");
  await expect(daily).toContainText("Yakira");
  await page
    .getByRole("checkbox", { name: "Include sample activity" })
    .uncheck();
  await expect(wins).toContainText("Sample wins are hidden");
  await expect(wins.locator(".creator-win-card")).toHaveCount(0);
  await expect(summary.nth(0)).toContainText("$0.00");
  await page.getByRole("checkbox", { name: "Include sample activity" }).check();
  await expect(daily).toContainText("Yakira");
  // Saved winner attribution survives the ad leaving public discovery.
  await page.evaluate(() => {
    const key = "slander-public-workspace-v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.projects.find(
      (project: { id: string }) => project.id === "acu-ad-competition",
    ).status = "archived";
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await expect(daily).toContainText("7 wins");
  await expect(weekly).toContainText("4 wins");
  await expect(summary.nth(0)).toContainText("$200.00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/yakira-creator-wins-${info.project.name}.png`,
    fullPage: true,
  });
  await selectCreator(page, "Maya Chen");
  await navigate(page, "Earnings");
  await expect(wins).not.toContainText("Yakira");
  await expect(wins).not.toContainText("The Girl in the Middle");
  await expect(daily).toContainText("Maya Chen");
  await expect(weekly).toContainText("Maya Chen");
  expect(errors).toEqual([]);
});

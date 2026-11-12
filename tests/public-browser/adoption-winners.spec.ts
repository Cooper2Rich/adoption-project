import { expect, test } from "@playwright/test";

test("Yakira has completed daily and weekly sample wins, including in older browsers with empty captures", async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date("2026-10-25T18:00:00Z") });
  await page.goto(
    "./#/leaderboard?campaign=adoption-is&view=past&period=daily",
  );
  const board = page.getByRole("region", {
    name: "Adoption Is leaderboard",
    exact: true,
  });
  const row = board.locator("tbody tr");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("The Girl in the Middle");
  await expect(row).toContainText("Yakira");
  await expect(board.locator(".winner-badge")).toHaveText("Daily winner");
  await expect(page.getByLabel("Past daily winners")).toHaveValue("2026-10-24");
  const original = await page.evaluate(() => {
    const key = "ripple-leaderboard-history-v1";
    const records = JSON.parse(localStorage.getItem(key)!);
    const others = records.filter(
      (r: { campaignId: string }) => r.campaignId !== "adoption-is",
    );
    localStorage.setItem(
      key,
      JSON.stringify(
        records.map((r: { campaignId: string }) =>
          r.campaignId === "adoption-is" ? { ...r, winners: [] } : r,
        ),
      ),
    );
    return others;
  });
  await page.reload();
  await expect(row).toContainText("Yakira");
  await expect(board.locator(".winner-badge")).toHaveText("Daily winner");
  await page.getByLabel("Past daily winners").selectOption("2026-10-23");
  await expect(row).toContainText("Yakira");
  await page.getByLabel("Past weekly winners").selectOption("2026-10-12");
  await expect(board.locator(".winner-badge")).toHaveText("Weekly winner");
  await expect(row).toContainText("The Girl in the Middle");
  await expect(row).toContainText("Yakira");
  for (const field of ["Impressions", "Link clicks", "Funding", "Score"]) {
    await expect(row.locator(`[data-label="${field}"]`)).not.toContainText(
      "N/A",
    );
  }
  const snapshot = await row.allTextContents();
  await page.clock.runFor(600001);
  expect(await row.allTextContents()).toEqual(snapshot);
  await page.reload();
  await expect(row).toHaveText(snapshot);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("ripple-leaderboard-history-v1")!).filter(
        (r: { campaignId: string }) => r.campaignId !== "adoption-is",
      ),
    ),
  ).toEqual(original);
  await expect(page.locator(".leaderboard-note").first()).toContainText(
    "Fictional past winners",
  );
  await page.getByLabel("Search leaderboard").fill("Yakira");
  await expect(row).toHaveCount(1);
  await page.getByLabel("Search leaderboard").fill("");
  await page.screenshot({
    path: `test-results/yakira-past-winners-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("tab", { name: "Current leaderboard", exact: true })
    .click();
  await expect(board.locator(".winner-badge")).toHaveCount(0);
  await expect(board.locator(".leader-badge")).toHaveText("Current leader");
});

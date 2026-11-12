import { expect, test } from "@playwright/test";

test("current leaders move while completed daily and weekly winners stay fixed", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-24T18:00:00Z") });
  await page.goto("./#/leaderboard?campaign=nocturne-coffee-showcase-v1");
  const board = page.locator(".campaign-board");
  const rows = board.locator("tbody tr");
  await expect(
    page.getByRole("tab", { name: "Current leaderboard", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(board.locator(".winner-badge")).toHaveCount(0);
  await expect(board.locator(".leader-badge")).toHaveText("Current leader");
  await expect(rows.first()).toContainText("Your midnight ritual");
  for (const label of ["Impressions", "Link clicks", "Funding"]) {
    await expect(rows.first().locator(`[data-label="${label}"]`)).toBeVisible();
  }
  await page.clock.runFor(600001);
  await expect(rows.first()).toContainText("A little obsession");
  await expect(board.getByLabel("Up 1 place", { exact: true })).toHaveCount(1);
  await expect(board.getByLabel("Down 1 place", { exact: true })).toHaveCount(
    1,
  );
  await page.getByRole("tab", { name: "Daily", exact: true }).click();
  await expect(board.locator(".leaderboard-leading")).toContainText(
    "A little obsession",
  );
  await expect(page.locator(".leaderboard-date")).toContainText(
    "Oct 24, 2026 · UTC · in progress",
  );
  await page.getByRole("tab", { name: "Past winners", exact: true }).click();
  await expect(page.getByLabel("Past daily winners")).toHaveValue("2026-10-23");
  await expect(board.locator(".winner-badge")).toHaveText("Daily winner");
  await expect(
    page.getByLabel("Past daily winners").locator('option[value="2026-10-24"]'),
  ).toHaveCount(0);
  await page.getByLabel("Past weekly winners").selectOption("2026-10-12");
  await expect(board.locator(".winner-badge")).toHaveText("Weekly winner");
  const result = await rows.allTextContents();
  await page.clock.runFor(600000);
  expect(await rows.allTextContents()).toEqual(result);
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Past winners", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Past weekly winners")).toHaveValue(
    "2026-10-12",
  );
  expect(await rows.allTextContents()).toEqual(result);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("rankings and countdown share a repeating ten-minute deadline across periods and delayed timers", async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date("2026-10-24T18:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-24T18:01:00Z"));
  await page.goto(
    "./#/leaderboard?campaign=nocturne-coffee-showcase-v1&period=daily",
  );
  const countdown = page.getByRole("timer", {
    name: "Time until next leaderboard update",
  });
  const board = page.locator(".campaign-board");
  const rows = board.locator("tbody tr");
  const schedule = page.locator(".public-leaderboard");
  await expect(rows).toHaveCount(3);
  await expect(countdown).toHaveText("Next update 10:00");
  await page.clock.runFor(6100);
  await expect(schedule).toHaveAttribute("data-simulation-step", "0");
  await expect(countdown).toHaveText("Next update 09:54");
  await page.getByRole("tab", { name: "Weekly", exact: true }).click();
  await expect(countdown).toHaveText("Next update 09:54");
  const before = await rows.allTextContents();
  await page.clock.runFor(592901);
  await expect(countdown).toHaveText("Next update 00:01");
  expect(await rows.allTextContents()).toEqual(before);
  await expect(schedule).toHaveAttribute("data-simulation-step", "0");
  await page.clock.runFor(1000);
  await expect(countdown).toHaveText("Next update 10:00");
  await expect(schedule).toHaveAttribute("data-simulation-step", "1");
  await expect(rows.first()).toContainText("A little obsession");
  await page.clock.runFor(600000);
  await expect(countdown).toHaveText("Next update 10:00");
  await expect(schedule).toHaveAttribute("data-simulation-step", "2");
  await expect(rows.first()).toContainText("A seat after dark");
  await page.clock.fastForward(1220000);
  await expect(countdown).toHaveText("Next update 09:40");
  await expect(schedule).toHaveAttribute("data-simulation-step", "4");
  await page.screenshot({
    path: `test-results/leaderboard-countdown-${info.project.name}.png`,
    fullPage: true,
  });
});

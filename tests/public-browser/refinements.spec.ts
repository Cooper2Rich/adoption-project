import { expect, test } from "@playwright/test";
import { navigate, openRiverCampaign, selectOwner } from "./helpers.ts";

test("leaderboard scopes campaigns, searches creators and opens ad profiles", async ({
  page,
}) => {
  await page.goto("./#/explore");
  await expect(page.locator(".ad-description")).toHaveCount(7);
  await expect(page.locator(".card-fund").first()).toContainText(
    "Fund ad spend",
  );
  await page.getByRole("link", { name: "Leaderboard", exact: true }).click();
  const rows = page.locator(".leaderboard-table tbody tr");
  await expect(rows).toHaveCount(7);
  await expect(page.locator(".campaign-board")).toHaveCount(5);
  await expect(
    page
      .locator(".campaign-board")
      .filter({ hasText: "Nocturne Coffee — after dark" })
      .locator("tbody tr"),
  ).toHaveCount(3);
  await expect(
    page.getByRole("columnheader", { name: "CTR", exact: true }),
  ).toHaveCount(0);
  await page
    .getByText("Scoring method & demo targets", { exact: true })
    .click();
  await expect(page.locator(".leaderboard-scoring")).toContainText(
    "50,000 impressions",
  );
  await expect(page.locator(".leaderboard-scoring")).toContainText(
    "2,000 total link clicks",
  );
  await expect(page.locator(".leaderboard-scoring")).toContainText(
    "$2,500.00 raised",
  );
  await expect
    .poll(() =>
      page
        .locator(".leaderboard-ad img")
        .first()
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page
    .getByLabel("Leaderboard campaign")
    .selectOption("nocturne-coffee-showcase-v1");
  await expect(rows.first()).toContainText("Your midnight ritual");
  await page
    .getByLabel("Leaderboard campaign")
    .selectOption("fictional-river-showcase-v1");
  await expect(rows).toHaveCount(0);
  await expect(page.locator(".campaign-board")).toContainText("0 / 25 ads");
  await page
    .getByLabel("Leaderboard campaign")
    .selectOption("nocturne-coffee-showcase-v1");
  await expect(rows).toHaveCount(3);
  await expect(page.locator(".campaign-board")).toHaveCount(1);
  await expect(rows.first().locator("td").last()).toHaveText("84.17");
  await page.getByLabel("Search leaderboard").fill("obsession");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("02");
  await page.getByLabel("Search leaderboard").fill("Nocturne Studio");
  await expect(rows).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await rows.first().getByRole("link").click();
  await expect(page.locator(".profile-copy h1")).toHaveText(
    "Your midnight ritual",
  );
  await page
    .getByRole("link", { name: "Campaign leaderboard", exact: false })
    .click();
  await expect(page.getByLabel("Leaderboard campaign")).toHaveValue(
    "nocturne-coffee-showcase-v1",
  );
  await page.reload();
  await expect(page.getByLabel("Leaderboard campaign")).toHaveValue(
    "nocturne-coffee-showcase-v1",
  );
  await expect(page.locator(".campaign-board")).toHaveCount(1);
});

test("admin creatives show video thumbnails and searchable creator names without bulky sidebar cards", async ({
  page,
}) => {
  await page.goto("./#/explore");
  await page.getByLabel("Demo role").selectOption("admin");
  await expect(page.locator(".workspace-hero")).toHaveCount(0);
  await expect(
    page.locator(".sidebar-note, .sidebar-user, .workspace-symbol"),
  ).toHaveCount(0);
  await expect(page.locator(".workspace-identity .avatar")).toHaveCount(1);
  await navigate(page, "Creatives");
  await expect(
    page.getByRole("heading", { name: "Creatives.", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search workspace").fill("Nocturne Studio");
  await expect(page.locator(".post-row")).toHaveCount(3);
  await expect(page.locator(".post-thumbnail video")).toHaveCount(3);
  await expect(page.locator(".creative-byline").first()).toContainText(
    "Nocturne Studio",
  );
  const video = page.locator(".post-thumbnail video").first();
  await video.hover();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
  await page.getByLabel("Search workspace").fill("midnight ritual");
  await expect(page.locator(".post-row")).toHaveCount(1);
  await page.getByLabel("Search workspace").fill("Nocturne Coffee");
  await expect(page.locator(".post-row")).toHaveCount(3);
  await navigate(page, "Activity");
  await expect(page.locator(".activity-list")).toHaveCSS(
    "background-color",
    "rgb(11, 17, 25)",
  );
  await navigate(page, "Archives");
  await expect(
    page.locator(".empty-state, .archive-project").first(),
  ).toHaveCSS("background-color", "rgb(11, 17, 25)");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("owner creatives and campaign funding share compact dark surfaces", async ({
  page,
}) => {
  await page.goto("./#/explore");
  await selectOwner(page, "Nocturne Coffee · fictional");
  await navigate(page, "Creatives");
  await expect(page.locator(".post-thumbnail video")).toHaveCount(3);
  await expect(page.locator(".creative-byline").first()).toContainText(
    "Nocturne Studio",
  );
  await page.getByLabel("Demo role").selectOption("admin");
  await openRiverCampaign(page);
  await expect(page.locator(".market-intro")).toHaveCount(0);
  await page.getByRole("tab", { name: "Funding", exact: true }).click();
  await expect(page.locator(".metric-card")).toHaveCount(4);
  await expect(page.locator(".metric-card").first()).toHaveCSS(
    "background-color",
    "rgb(11, 17, 25)",
  );
  const height = await page
    .locator(".metric-card")
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThan(190);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

import { expect, test, type Locator, type Page } from "@playwright/test";
import { navigate, selectCreator, selectOwner } from "./helpers.ts";

async function preview(
  page: Page,
  container: Locator,
  target: Locator = container,
  natural = false,
) {
  const video = container.locator("video").first();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThan(1);
  await target.hover();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
  if (natural) {
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
        timeout: 6000,
        intervals: [100],
      })
      .toBeGreaterThan(4);
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
        timeout: 2500,
        intervals: [50],
      })
      .toBeLessThan(1);
  }
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 4.2;
    v.dispatchEvent(new Event("timeupdate"));
  });
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking))
    .toBe(false);
  expect(
    await video.evaluate((v: HTMLVideoElement) => v.currentTime),
  ).toBeGreaterThan(4);
  for (let repeat = 0; repeat < 2; repeat++) {
    const resetTime = await video.evaluate((v: HTMLVideoElement) => {
      v.currentTime = 5.1;
      v.dispatchEvent(new Event("timeupdate"));
      return v.currentTime;
    });
    expect(resetTime).toBeLessThan(0.1);
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking))
      .toBe(false);
    expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  }
  await page.mouse.move(0, 0);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeLessThan(0.1);
}

test("five-second previews repeat from ad cards, profiles, leaderboards and all workspace roles", async ({
  page,
}) => {
  test.slow();
  await page.goto("./#/explore");
  const card = page.locator(".ad-card").first();
  await preview(page, card, card.locator("h3"), true);
  await card
    .getByRole("link", { name: "View Your midnight ritual", exact: true })
    .click();
  await preview(page, page.locator(".profile-media"));
  await page
    .getByRole("link", { name: "Campaign leaderboard", exact: false })
    .click();
  const row = page.locator(".leaderboard-table tbody tr").first();
  await preview(page, row, row.locator("[data-label='Funding']"));
  await page.getByLabel("Demo role").selectOption("admin");
  await navigate(page, "Creatives");
  await page.getByLabel("Search workspace").fill("midnight ritual");
  await preview(page, page.locator(".post-row").first());
  await selectOwner(page, "Nocturne Coffee · fictional");
  await navigate(page, "Creatives");
  await preview(
    page,
    page
      .locator(".post-row")
      .filter({ has: page.locator("video") })
      .first(),
  );
  await selectCreator(page, "Nocturne Studio · fictional");
  await navigate(page, "My ads");
  await preview(page, page.locator(".creator-card").first());
  await page
    .locator(".creator-card")
    .first()
    .getByRole("button", { name: "View Your midnight ritual", exact: true })
    .click();
  await preview(page, page.getByRole("dialog").locator(".preview-column"));
});

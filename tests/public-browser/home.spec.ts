import { expect, test } from "@playwright/test";

test("guest home explains the mission, shows weekly campaign leaders and links to frozen past results", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-27T18:00:00Z") });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Stories travel further together." }),
  ).toBeVisible();
  const current = page.getByRole("region", { name: "This week’s leaders" });
  const past = page.getByRole("region", { name: "Last week’s top performers" });
  await expect(current.locator(".ad-card")).toHaveCount(4);
  await expect(past.locator(".ad-card")).toHaveCount(4);
  await expect(current).toContainText("Oct 26 – Nov 1");
  await expect(past).toContainText("Oct 19 – Oct 25");
  const currentGirl = current
    .locator(".ad-card")
    .filter({ hasText: "The Girl in the Middle" });
  await expect(currentGirl).toContainText("Weekly campaign leader");
  await expect(currentGirl.locator(".ad-stats dd")).toHaveText([
    "40,000",
    "4.00%",
    "$2,000.00",
  ]);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("slander-public-viewers-v1"),
    ),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("slander-public-access-v1")),
  ).toBeNull();
  const original = await past.locator(".ad-stats").allTextContents();
  await page.getByRole("link", { name: "Past winners", exact: true }).click();
  await expect(page.getByLabel("Past weekly winners")).toHaveValue(
    "2026-10-19",
  );
  await expect(page.locator(".leaderboard-table tbody tr")).toHaveCount(4);
  await page.goto("./");
  await expect(past.locator(".ad-stats")).toHaveCount(4);
  expect(await past.locator(".ad-stats").allTextContents()).toEqual(original);
  await page.locator(".hero-how-link").click();
  await expect(
    page.getByRole("heading", { name: "From a story to something more." }),
  ).toBeInViewport();
  await page.screenshot({
    path: `test-results/ripple-home-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("home video previews start on scroll, loop muted, pause offscreen and allow explicit sound", async ({
  page,
}) => {
  await page.goto("./");
  await page.mouse.move(0, 0);
  const current = page.getByRole("region", { name: "This week’s leaders" });
  const video = current.locator("video").first();
  await video.scrollIntoViewIfNeeded();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 5.2;
    v.dispatchEvent(new Event("timeupdate"));
  });
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeLessThan(1);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await video.scrollIntoViewIfNeeded();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  const card = current
    .locator(".ad-card")
    .filter({ has: page.locator("video") })
    .first();
  await card.getByRole("button", { name: /^Play / }).click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.1);
  expect(
    await video.evaluate((v: HTMLVideoElement) => ({
      muted: v.muted,
      controls: v.controls,
    })),
  ).toEqual({ muted: false, controls: true });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
});

test("guest can pause automatic previews and reduced motion keeps them still", async ({
  page,
}) => {
  await page.goto("./");
  const hero = page.locator(".hero-feature video");
  await hero.scrollIntoViewIfNeeded();
  await expect
    .poll(() => hero.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  await page
    .getByRole("button", { name: "Pause previews", exact: true })
    .click();
  await expect
    .poll(() => hero.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  const video = page
    .getByRole("region", { name: "This week’s leaders" })
    .locator("video")
    .first();
  await video.scrollIntoViewIfNeeded();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await page
    .getByRole("button", { name: "Resume previews", exact: true })
    .click();
  await hero.scrollIntoViewIfNeeded();
  await expect
    .poll(() => hero.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => hero.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await page.reload();
  await video.scrollIntoViewIfNeeded();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
});

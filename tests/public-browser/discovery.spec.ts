import { expect, test } from "@playwright/test";
import { navigate, openWorkspaceMenu, selectCreator } from "./helpers.ts";

test("public discovery previews video, opens profiles, filters, and supports ad spend as a viewer", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./#/explore");
  const discoveryUrl = page.url();
  await expect(
    page.getByRole("heading", { name: "Discover ads." }),
  ).toBeVisible();
  const cards = page.locator(".ad-card");
  await expect(cards).toHaveCount(7);
  await expect(page.getByLabel("Demo role")).toHaveValue("public");
  const treeCard = cards.filter({
    has: page.getByRole("heading", {
      name: "It starts with one tree",
      exact: true,
    }),
  });
  await expect(treeCard).toContainText("24,800");
  await expect(treeCard).toContainText("3.50%");
  await expect(treeCard).toContainText("$1,860.00");
  const video = cards.first().locator("video");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThan(1);
  await video.hover();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
  await page.getByRole("heading", { name: "Discover ads." }).hover();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await cards
    .first()
    .getByRole("button", { name: "Play Your midnight ritual" })
    .click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.1);
  expect(
    await video.evaluate((v: HTMLVideoElement) => ({
      muted: v.muted,
      controls: v.controls,
      loop: v.loop,
    })),
  ).toEqual({ muted: false, controls: true, loop: false });
  await page.getByRole("heading", { name: "Discover ads." }).hover();
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await expect(page).toHaveURL(discoveryUrl);
  await video.evaluate((v: HTMLVideoElement) => v.pause());
  await page.getByLabel("Search ads").fill("no such story");
  await expect(cards).toHaveCount(0);
  await page.getByLabel("Search ads").fill("");
  await page.getByLabel("Filter by cause").selectOption("Food & community");
  await expect(cards).toHaveCount(1);
  await page.getByLabel("Filter by cause").selectOption("All causes");
  await page.getByLabel("Filter by cause").blur();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: `test-results/discovery-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "View It starts with one tree", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "It starts with one tree", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".profile-media img")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Fund ad spend" }).click();
  await page.getByLabel("Your name").fill("Demo Donor");
  await page.getByLabel("Email address").fill("viewer@example.test");
  await page.getByRole("button", { name: "Create viewer profile" }).click();
  await expect(page.getByText("Contributing as")).toBeVisible();
  await page.getByLabel("Amount in USD").fill("37.50");
  await page
    .getByRole("button", { name: "Confirm simulated contribution" })
    .click();
  await expect(page.getByRole("status")).toContainText("$37.50");
  await page.getByRole("button", { name: "Keep discovering" }).click();
  await expect(page.locator(".spend-callout")).toContainText("$37.50");
  await page.getByRole("link", { name: "My giving", exact: true }).click();
  await expect(page.locator(".giving-total")).toHaveText("$37.50");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("slander-public-viewers-v1")!).support
          .length,
    ),
  ).toBe(1);
  await page.reload();
  await expect(page.locator(".giving-total")).toHaveText("$37.50");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("slander-public-viewers-v1")!)
          .profiles[0].role,
    ),
  ).toBe("viewer");
  expect(
    await page.evaluate(() => localStorage.getItem("slander-public-access-v1")),
  ).toBeNull();
  await page.getByLabel("Demo role").selectOption("admin");
  await navigate(page, "Funding");
  await page
    .getByRole("checkbox", { name: "Include sample activity" })
    .uncheck();
  await expect(page.getByText("$37.50", { exact: true }).first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("creators have current and past ads; public excludes archived or held ads", async ({
  page,
}, info) => {
  await page.goto("./#/explore");
  await selectCreator(page, "Maya Chen");
  await navigate(page, "My ads");
  await openWorkspaceMenu(page);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link"),
  ).toHaveCount(2);
  await expect(page.locator(".creator-card")).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: "Small hands, big impact", exact: true }),
  ).not.toBeVisible();
  await page.evaluate(() => {
    const key = "slander-public-workspace-v1",
      state = JSON.parse(localStorage.getItem(key)!);
    state.projects.find(
      (p: { id: string }) => p.id === "greener-tomorrow",
    ).status = "archived";
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole("tab", { name: "Past ads" }).click();
  await expect(page.locator(".creator-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "It starts with one tree", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View past ad" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Your archived creative",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("./#/archives");
  await expect(
    page.getByRole("heading", { name: "Past ads.", exact: true }),
  ).toBeVisible();
  await page.goto("./#/spending");
  await expect(
    page.getByRole("heading", { name: "My ads.", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/creator-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("Demo role").selectOption("public");
  await expect(page.locator(".ad-card")).toHaveCount(5);
  await page.goto("./#/ads/sample-1");
  await expect(
    page.getByRole("heading", { name: "This ad is unavailable." }),
  ).toBeVisible();
});

test("reduced motion prevents automatic preview; viewer profiles can be left and reopened", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./#/explore");
  const preview = page.locator(".ad-card-media video").first();
  await preview.focus();
  await expect
    .poll(() => preview.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await page.getByRole("link", { name: "Viewer account", exact: true }).click();
  await page.getByLabel("Your name").fill("Viewer Two");
  await page.getByLabel("Email address").fill("two@example.test");
  await page.getByRole("button", { name: "Create viewer profile" }).click();
  await page.getByRole("button", { name: "Leave viewer profile" }).click();
  await page
    .getByLabel("Saved viewer profiles")
    .selectOption({ label: "Viewer Two · two@example.test" });
  await expect(
    page.getByRole("heading", { name: "Hello, Viewer Two." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("public ad grid shows five compact cards and adapts without horizontal scrolling", async ({
  page,
}, info) => {
  await page.goto("./#/explore");
  await expect(page.locator(".ad-card")).toHaveCount(7);
  for (const [width, columns] of [
    [1440, 5],
    [1024, 4],
    [713, 2],
    [390, 1],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator(".ad-grid").evaluate((grid) => {
      const cards = [...grid.querySelectorAll(".ad-card")];
      const first = cards[0].getBoundingClientRect();
      return {
        columns: cards.filter(
          (card) => Math.abs(card.getBoundingClientRect().top - first.top) < 1,
        ).length,
        firstTop: first.top,
        firstBottom: first.bottom,
        width: document.documentElement.scrollWidth,
      };
    });
    expect(layout.columns, `columns at ${width}px`).toBe(columns);
    expect(layout.width).toBeLessThanOrEqual(width);
    expect(layout.firstTop).toBeLessThan(400);
    if (width === 1440) {
      expect(layout.firstBottom).toBeLessThan(900);
      await page.screenshot({
        path: `test-results/compact-grid-${info.project.name}.png`,
        fullPage: true,
      });
    }
  }
});

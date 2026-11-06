import { test, expect, type Page } from "@playwright/test";

async function contextMenu(page: Page, area: string) {
  const open = page.getByRole("button", {
    name: "Show secondary sidebar",
    exact: true,
  });
  if (await open.isVisible()) await open.click();
  const mobile = page.locator(".public-mobile-context");
  if (
    (await mobile.isVisible()) &&
    (await mobile.getAttribute("open")) === null
  ) {
    await mobile.locator("summary").first().click();
  }
  return page.getByRole("navigation", {
    name: `${area} navigation`,
    exact: true,
  });
}

async function mainTab(page: Page, name: string) {
  const rail = page.getByRole("navigation", { name: "Workspace shortcuts" });
  const nav = (await rail.isVisible())
    ? rail
    : page.getByRole("navigation", { name: "Mobile public navigation" });
  await nav.getByRole("link", { name, exact: true }).click();
}

test("Discover sidebar navigates causes and campaigns with persistent filters and active states", async ({
  page,
}, info) => {
  await page.goto("./#/explore");
  let nav = await contextMenu(page, "Discover");
  await expect(
    nav.getByRole("link", { name: "All ads", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Our mission" })).toHaveCount(0);
  await nav
    .getByRole("link", { name: "Coffee & culture", exact: true })
    .click();
  await expect(page.getByLabel("Filter by cause")).toHaveValue(
    "Coffee & culture",
  );
  await expect(page.locator(".ad-card")).toHaveCount(3);
  await page.reload();
  nav = await contextMenu(page, "Discover");
  await expect(
    nav.getByRole("link", { name: "Coffee & culture", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Adoption Is", exact: true }).click();
  await expect(page).toHaveURL(/#\/explore\?campaign=adoption-is$/);
  await expect(page.locator(".ad-card")).toHaveCount(1);
  await page
    .getByRole("link", { name: "View The Girl in the Middle", exact: true })
    .click();
  nav = await contextMenu(page, "Discover");
  await expect(nav.getByRole("link", { name: "Ad details" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const primary = page.getByRole("navigation", {
    name:
      info.project.name === "mobile"
        ? "Mobile public navigation"
        : "Workspace shortcuts",
  });
  await expect(
    primary.getByRole("link", { name: "Discover ads", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page).toHaveURL(/#\/explore\?campaign=adoption-is$/);
  await expect(page.locator(".ad-card")).toHaveCount(1);
  await page.goForward();
  nav = await contextMenu(page, "Discover");
  await nav.getByRole("link", { name: "All ads", exact: true }).click();
  await expect(page.locator(".ad-card")).toHaveCount(7);
  await page.getByLabel("Search ads").fill("midnight");
  await expect(page.locator(".ad-card")).toHaveCount(1);
  await (
    await contextMenu(page, "Discover")
  )
    .getByRole("link", { name: "All ads", exact: true })
    .click();
  await expect(page.getByLabel("Search ads")).toHaveValue("");
  await expect(page.locator(".ad-card")).toHaveCount(7);
  await page.screenshot({
    path: `test-results/context-discover-${info.project.name}.png`,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("main tabs get distinct menus and Home section links scroll within Home", async ({
  page,
}) => {
  await page.goto("./");
  let nav = await contextMenu(page, "Home");
  await expect(
    nav.getByRole("link", { name: "All ads", exact: true }),
  ).toHaveCount(0);
  await nav
    .getByRole("link", { name: "This week’s leaders", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "This week’s leaders" }),
  ).toBeInViewport();
  nav = await contextMenu(page, "Home");
  await expect(
    nav.getByRole("link", { name: "This week’s leaders", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Our mission", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Our mission.",
    }),
  ).toBeInViewport();
  await mainTab(page, "Discover ads");
  nav = await contextMenu(page, "Discover");
  await expect(nav.getByRole("link", { name: "Our mission" })).toHaveCount(0);
  await expect(
    nav.getByRole("link", { name: "All ads", exact: true }),
  ).toBeVisible();
});

test("Leaders sidebar changes periods and past results while retaining campaign scope", async ({
  page,
}) => {
  await page.goto("./#/leaderboard?campaign=nocturne-coffee-showcase-v1");
  let nav = await contextMenu(page, "Leaders");
  await expect(
    nav.getByRole("link", { name: "Weekly leaders", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Daily leaders", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Daily", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Leaderboard campaign")).toHaveValue(
    "nocturne-coffee-showcase-v1",
  );
  nav = await contextMenu(page, "Leaders");
  await nav
    .getByRole("link", { name: "Past weekly winners", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Past winners", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Past weekly winners")).not.toHaveValue("");
  nav = await contextMenu(page, "Leaders");
  await expect(
    nav.getByRole("link", { name: "Past weekly winners", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Adoption Is", exact: true }).click();
  await expect(page.getByLabel("Leaderboard campaign")).toHaveValue(
    "adoption-is",
  );
  await expect(
    page.getByRole("tab", { name: "Past winners", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await (
    await contextMenu(page, "Leaders")
  )
    .getByRole("link", { name: "Past daily winners", exact: true })
    .click();
  await expect(page.getByLabel("Past daily winners")).not.toHaveValue("");
  await page.reload();
  await expect(
    (await contextMenu(page, "Leaders")).getByRole("link", {
      name: "Past daily winners",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "page");
});

test("Profile menu follows viewer state and role previews remain available without Studio", async ({
  page,
}, info) => {
  await page.goto("./#/viewer");
  let nav = await contextMenu(page, "Profile");
  await expect(
    nav.getByRole("link", { name: "Giving history", exact: true }),
  ).toHaveCount(0);
  await nav
    .getByRole("link", { name: "Create a profile", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create a viewer profile" }),
  ).toBeInViewport();
  await page.getByLabel("Your name").fill("Navigation Viewer");
  await page.getByLabel("Email address").fill("navigation@example.test");
  await page
    .getByRole("button", { name: "Create viewer profile", exact: true })
    .click();
  nav = await contextMenu(page, "Profile");
  await expect(
    nav.getByRole("link", { name: "Create a profile", exact: true }),
  ).toHaveCount(0);
  await nav.getByRole("link", { name: "Giving history", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My giving", exact: true }),
  ).toBeInViewport();
  await (
    await contextMenu(page, "Profile")
  )
    .getByRole("link", { name: "Switch profile", exact: true })
    .click();
  await page.getByRole("button", { name: "Leave viewer profile" }).click();
  nav = await contextMenu(page, "Profile");
  await nav.getByRole("link", { name: "Saved profiles", exact: true }).click();
  await expect(page.getByLabel("Saved viewer profiles")).toBeInViewport();
  await page.getByLabel("Demo role").selectOption("admin");
  await expect(
    page.getByRole("heading", { name: "Campaigns.", exact: true }),
  ).toBeVisible();
  if (info.project.name === "desktop") {
    await page.getByLabel("Demo role").selectOption("public");
    await expect(
      page.getByRole("button", { name: "Studio", exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Demo role").selectOption("admin");
    await expect(page.getByLabel("Demo role")).toHaveValue("admin");
  }
});

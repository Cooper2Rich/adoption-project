import { test, expect, type Page } from "@playwright/test";
import { selectCreator, selectOwner } from "./helpers";

function primary(page: Page, mobile: boolean) {
  return page.getByRole("navigation", {
    name: mobile ? "Mobile public navigation" : "Workspace shortcuts",
    exact: true,
  });
}

test("main tabs toggle secondary menus while preserving the page and filters", async ({
  page,
}, info) => {
  const mobile = info.project.name === "mobile";
  await page.goto("./#/explore?cause=Adoption");
  await expect(page.locator(".ad-card")).toHaveCount(1);
  const discover = primary(page, mobile).getByRole("link", {
    name: "Discover ads",
    exact: true,
  });
  const url = page.url();
  const closeSidebar = page.getByRole("button", {
    name: "Hide secondary sidebar",
    exact: true,
    includeHidden: true,
  });
  await expect(closeSidebar).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Show secondary sidebar", exact: true }),
  ).toHaveCount(0);
  await expect(discover).toHaveAttribute("aria-expanded", "false");
  await discover.click();
  await expect(discover).toHaveAttribute("aria-expanded", "true");
  await expect(closeSidebar).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Discover navigation", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(url);
  await discover.click();
  await expect(discover).toHaveAttribute("aria-expanded", "false");
  await expect(closeSidebar).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Discover navigation", exact: true }),
  ).toBeHidden();
  await expect(page.getByLabel("Filter by cause")).toHaveValue("Adoption");
  await expect(page.locator(".ad-card")).toHaveCount(1);
  await discover.focus();
  await page.keyboard.press("Enter");
  await expect(discover).toHaveAttribute("aria-expanded", "true");
  await page.reload();
  await expect(closeSidebar).toHaveCount(1);
  if (!mobile) {
    await closeSidebar.click();
    await expect(closeSidebar).toHaveCount(0);
    await expect(page).toHaveURL(url);
    await page.reload();
    await expect(closeSidebar).toHaveCount(0);
  }
  for (const [name, area] of [
    ["About adoption.is", "About adoption.is"],
    ["Home", "Home"],
    ["Leaderboard", "Leaders"],
    ["Viewer account", "Profile"],
  ]) {
    const tab = primary(page, mobile).getByRole("link", { name, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByRole("navigation", { name: `${area} navigation`, exact: true }),
    ).toBeVisible();
    const currentUrl = page.url();
    await tab.click();
    await expect(tab).toHaveAttribute("aria-expanded", "false");
    await expect(page).toHaveURL(currentUrl);
  }
  await page.reload();
  await expect(
    primary(page, mobile).getByRole("link", {
      name: "Viewer account",
      exact: true,
    }),
  ).toHaveAttribute("aria-expanded", "false");
});

const roleCases = [
  { role: "creator", tabs: ["My ads", "Earnings", "Projects", "Profile"] },
  {
    role: "nonprofit",
    tabs: ["Projects", "Creatives", "Ad spending", "Activity", "Profile"],
  },
  {
    role: "admin",
    tabs: [
      "Campaigns",
      "Project requests",
      "Creatives",
      "Funding",
      "Activity",
      "Profile",
    ],
  },
];
for (const scenario of roleCases) {
  test(
    scenario.role + " has relevant main tabs and contextual secondary menus",
    async ({ page }, info) => {
      const mobile = info.project.name === "mobile";
      await page.goto("./#/explore");
      if (scenario.role === "creator") await selectCreator(page, "Maya Chen");
      else if (scenario.role === "nonprofit")
        await selectOwner(page, "Nocturne Coffee · fictional");
      else await page.getByLabel("Demo role").selectOption("admin");
      const main = page.getByRole("navigation", {
        name: mobile ? "Mobile workspace navigation" : "Workspace shortcuts",
        exact: true,
      });
      for (const publicName of [
        "Home",
        "Discover ads",
        "About adoption.is",
        "Leaderboard",
        "Viewer account",
      ]) {
        await expect(
          main.getByRole("link", { name: publicName, exact: true }),
        ).toHaveCount(0);
      }
      const access = await page.evaluate(() =>
        localStorage.getItem("slander-public-access-v1"),
      );
      for (const name of scenario.tabs) {
        const tab = main.getByRole("link", { name, exact: true });
        if ((await tab.getAttribute("aria-expanded")) === "true") {
          await tab.click();
          await expect(tab).toHaveAttribute("aria-expanded", "false");
        }
        await tab.click();
        await expect(tab).toHaveAttribute("aria-current", "page");
        await expect(tab).toHaveAttribute("aria-expanded", "true");
        await expect(
          page.getByRole("navigation", {
            name: "Main navigation",
            exact: true,
          }),
        ).toBeVisible();
        const url = page.url();
        await tab.click();
        await expect(tab).toHaveAttribute("aria-expanded", "false");
        await expect(page.locator(".sidebar")).toBeHidden();
        await expect(
          page.getByRole("button", {
            name: "Hide secondary sidebar",
            exact: true,
            includeHidden: true,
          }),
        ).toHaveCount(0);
        await expect(page).toHaveURL(url);
        await tab.click();
        await expect(tab).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByLabel("Demo role")).toHaveValue(scenario.role);
        await expect(
          page.getByRole("button", {
            name: "Hide secondary sidebar",
            exact: true,
            includeHidden: true,
          }),
        ).toHaveCount(1);
        expect(
          await page.evaluate(() =>
            localStorage.getItem("slander-public-access-v1"),
          ),
        ).toBe(access);
      }
      await page.screenshot({
        path:
          "test-results/role-navigation-" +
          scenario.role +
          "-" +
          info.project.name +
          ".png",
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (!mobile) {
        const desktopSize = page.viewportSize()!;
        const lastTab = scenario.tabs[scenario.tabs.length - 1];
        await page.setViewportSize({ width: 390, height: 844 });
        const mobileMain = page.getByRole("navigation", {
          name: "Mobile workspace navigation",
          exact: true,
        });
        await mobileMain
          .getByRole("link", { name: lastTab, exact: true })
          .click();
        await expect(
          mobileMain.getByRole("link", { name: lastTab, exact: true }),
        ).toHaveAttribute("aria-expanded", "true");
        await page.setViewportSize(desktopSize);
        await page
          .getByRole("button", { name: "Hide secondary sidebar", exact: true })
          .click();
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(
          mobileMain.getByRole("link", { name: lastTab, exact: true }),
        ).toHaveAttribute("aria-expanded", "false");
        await mobileMain
          .getByRole("link", { name: lastTab, exact: true })
          .click();
        await expect(
          mobileMain.getByRole("link", { name: lastTab, exact: true }),
        ).toHaveAttribute("aria-expanded", "true");
        await page.setViewportSize(desktopSize);
      }
      await page.getByLabel("Demo role").selectOption("public");
      await expect(
        primary(page, mobile).getByRole("link", {
          name: "Discover ads",
          exact: true,
        }),
      ).toBeVisible();
    },
  );
}

test("Creator earnings sections keep the Earnings main tab selected", async ({
  page,
}, info) => {
  await page.goto("./#/explore");
  await selectCreator(page, "Maya Chen");
  const main = page.getByRole("navigation", {
    name:
      info.project.name === "mobile"
        ? "Mobile workspace navigation"
        : "Workspace shortcuts",
    exact: true,
  });
  await main.getByRole("link", { name: "Earnings", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Earnings by ad", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Earnings by ad", exact: true }),
  ).toBeInViewport();
  await expect(
    main.getByRole("link", { name: "Earnings", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator('.sidebar a[aria-current="page"]')).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Earnings by ad", exact: true }),
  ).toBeInViewport();
  await expect(
    main.getByRole("link", { name: "Earnings", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  // A report finishing after reload must not push the requested section away.
  await page
    .getByRole("heading", { name: "Earnings by ad", exact: true })
    .evaluate((heading) => {
      const lateContent = document.createElement("div");
      lateContent.style.height = "900px";
      heading.before(lateContent);
    });
  await expect(
    page.getByRole("heading", { name: "Earnings by ad", exact: true }),
  ).toBeInViewport();
  await page.keyboard.press("Control+Home");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

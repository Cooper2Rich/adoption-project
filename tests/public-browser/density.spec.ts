import { test, expect, type Page } from "@playwright/test";
import { navigate, selectCreator, selectOwner } from "./helpers";

async function expectNormalZoom(page: Page) {
  expect(
    await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      zoom: getComputedStyle(document.body).zoom,
      transform: getComputedStyle(document.body).transform,
    })),
  ).toEqual({ overflow: false, zoom: "1", transform: "none" });
}

for (const theme of ["light", "dark"]) {
  test(`${theme} wide layouts use available space without enlarging controls`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "Wide-screen regression");
    for (const width of [1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1050 });
      await page.goto("./");
      await page.getByLabel("Website theme").selectOption(theme);
      const content = await page.locator(".discovery-content").boundingBox();
      const hero = await page.locator(".hero-feature").boundingBox();
      expect(content!.width).toBeGreaterThan(width - 400);
      expect(hero!.width).toBeGreaterThan(content!.width * 0.4);
      expect(hero!.height).toBeLessThanOrEqual(340);
      const showcases = page.locator(".home-showcase");
      const firstShowcase = await showcases.first().boundingBox();
      const lastCard = await showcases
        .first()
        .locator(".ad-card")
        .last()
        .boundingBox();
      expect(
        Math.abs(
          lastCard!.x +
            lastCard!.width -
            firstShowcase!.x -
            firstShowcase!.width,
        ),
      ).toBeLessThan(2);
      if (width >= 1800) {
        const secondShowcase = await showcases.nth(1).boundingBox();
        expect(Math.abs(firstShowcase!.y - secondShowcase!.y)).toBeLessThan(2);
      }
      await expectNormalZoom(page);
      await page.screenshot({
        path: `test-results/full-width-home-${theme}-${width}.png`,
        fullPage: true,
      });
      await page.goto("./#/explore");
      if (width >= 1920) {
        expect(
          await page
            .locator(".ad-grid")
            .evaluate(
              (grid) =>
                getComputedStyle(grid).gridTemplateColumns.split(" ").length,
            ),
        ).toBeGreaterThan(5);
      }
      await expectNormalZoom(page);
      await page.goto("./#/about");
      const about = await page.locator(".brm-about").boundingBox();
      expect(about!.width).toBeGreaterThan(content!.width - 60);
      await expectNormalZoom(page);
      await page.goto("./#/viewer");
      const viewer = await page.locator(".viewer-form").boundingBox();
      expect(viewer!.width).toBeGreaterThan(content!.width - 60);
      await expectNormalZoom(page);
      await selectCreator(page);
      await page.goto("./#/profile");
      const profile = await page.locator(".role-profile-page").boundingBox();
      const details = await page
        .locator('[aria-labelledby="role-details"]')
        .boundingBox();
      const account = await page
        .locator('[aria-labelledby="account-settings"]')
        .boundingBox();
      expect(profile!.width).toBeGreaterThan(width - 400);
      expect(Math.abs(details!.y - account!.y)).toBeLessThan(2);
      expect(account!.x).toBeGreaterThan(details!.x + details!.width);
      await expectNormalZoom(page);
      await page.screenshot({
        path: `test-results/full-width-${theme}-${width}.png`,
        fullPage: true,
      });
      await page.getByLabel("Demo role").selectOption("public");
    }
  });

  test(`${theme} public pages are compact at normal zoom`, async ({
    page,
  }, info) => {
    await page.goto("./");
    await page.getByLabel("Website theme").selectOption(theme);
    await expect(page.locator("#home-title")).toBeVisible();
    expect(
      await page
        .locator("#home-title")
        .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
    ).toBeLessThanOrEqual(48);
    expect(
      (await page.locator(".hero-feature").boundingBox())!.height,
    ).toBeLessThanOrEqual(340);
    await expectNormalZoom(page);
    await page.screenshot({
      path: `test-results/density-home-${theme}-${info.project.name}.png`,
      fullPage: true,
    });
    for (const route of ["/about", "/explore", "/leaderboard", "/viewer"]) {
      await page.goto(`./#${route}`);
      await expect(page.getByLabel("Website theme")).toHaveValue(theme);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expectNormalZoom(page);
      if (route === "/viewer") {
        await expect(page.locator(".viewer-form")).toHaveCSS(
          "padding-top",
          info.project.name === "mobile" ? "14px" : "16px",
        );
        await page
          .getByLabel("Your name", { exact: true })
          .fill("Compact viewer");
        await page
          .getByLabel("Email address", { exact: true })
          .fill("compact@example.com");
        await page
          .getByRole("button", { name: "Create viewer profile", exact: true })
          .click();
        await expect(page.locator(".viewer-form")).toHaveCount(0);
        await expectNormalZoom(page);
      }
    }
    await page.goto("./#/explore");
    await page.locator(".ad-card").first().getByRole("link").first().click();
    await expect(page.locator(".profile-copy h1")).toBeVisible();
    await expect(page.locator(".profile-copy h1")).toHaveCSS(
      "font-size",
      "28px",
    );
    await expectNormalZoom(page);
  });

  test(`${theme} role pages and profiles share compact sizing`, async ({
    page,
  }, info) => {
    await page.goto("./#/explore");
    await page.getByLabel("Website theme").selectOption(theme);
    for (const role of ["creator", "nonprofit", "admin"]) {
      if (role === "creator") await selectCreator(page);
      else if (role === "nonprofit") await selectOwner(page);
      else await page.getByLabel("Demo role").selectOption(role);
      for (const label of role === "creator"
        ? ["My ads", "Earnings", "Projects"]
        : role === "nonprofit"
          ? ["Projects", "Creatives", "Ad spending", "Activity"]
          : [
              "Campaigns",
              "Project requests",
              "Creatives",
              "Funding",
              "Activity",
            ]) {
        await navigate(page, label);
        await expect(page.locator(".page-heading h1").first()).toBeVisible();
        await expect(page.locator(".page-heading h1").first()).toHaveCSS(
          "font-size",
          "24px",
        );
        await expectNormalZoom(page);
      }
      await page.goto("./#/profile");
      const panel = page.locator(".role-profile-panel").first();
      await expect(panel).toBeVisible();
      await expect(panel).toHaveCSS(
        "padding-top",
        info.project.name === "mobile" ? "14px" : "16px",
      );
      await expect(page.locator(".role-profile-summary h2")).toHaveCSS(
        "font-size",
        "20px",
      );
      await expect(page.getByLabel("Website theme")).toHaveValue(theme);
      if (info.project.name === "mobile") {
        expect(
          (await page.getByLabel("Color theme", { exact: true }).boundingBox())!
            .height,
        ).toBeGreaterThanOrEqual(44);
      }
      await expectNormalZoom(page);
      await page.screenshot({
        path: `test-results/density-profile-${role}-${theme}-${info.project.name}.png`,
        fullPage: true,
      });
    }
  });
}

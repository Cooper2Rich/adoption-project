import { expect, test } from "@playwright/test";

test("laptop feed fits five readable cards with navigation closed and four with the secondary sidebar open", async ({
  page,
}, info) => {
  await page.goto("./#/explore");
  await expect(page.locator(".ad-card")).toHaveCount(7);
  await page.setViewportSize({ width: 1366, height: 900 });
  const columns = () =>
    page
      .locator(".ad-grid")
      .evaluate(
        (grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length,
      );
  await expect(
    page.getByRole("button", { name: "Studio", exact: true }),
  ).toHaveCount(0);
  await expect.poll(columns).toBe(5);
  await page
    .getByRole("button", { name: "Hide main navigation", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Workspace shortcuts" }),
  ).toBeHidden();
  for (const width of [1366, 1440, 1536]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(columns).toBe(5);
    const card = page.locator(".ad-card").first();
    const fonts = await card.evaluate((node) => ({
      title: parseFloat(getComputedStyle(node.querySelector("h3")!).fontSize),
      value: parseFloat(getComputedStyle(node.querySelector("dd")!).fontSize),
      creator: parseFloat(
        getComputedStyle(node.querySelector(".ad-byline")!).fontSize,
      ),
    }));
    expect(fonts.title).toBeGreaterThanOrEqual(14);
    expect(fonts.value).toBeGreaterThanOrEqual(14);
    expect(fonts.creator).toBeGreaterThanOrEqual(12);
    expect(
      (await card.locator(".ad-card-media").boundingBox())!.height,
    ).toBeLessThan(190);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: `test-results/five-cards-${info.project.name}.png`,
  });
  await page
    .getByRole("button", { name: "Show main navigation", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Workspace shortcuts", exact: true })
    .getByRole("link", { name: "Discover ads", exact: true })
    .click();
  await expect.poll(columns).toBe(4);
  await page.setViewportSize({ width: 1366, height: 900 });
  await expect.poll(columns).toBe(4);
  await expect(
    page
      .getByRole("navigation", { name: "Discover navigation", exact: true })
      .getByRole("link", { name: "All ads", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/four-cards-${info.project.name}.png`,
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Hide secondary sidebar", exact: true }),
  ).toBeVisible();
  await expect.poll(columns).toBe(4);
  await page
    .getByRole("button", { name: "Hide secondary sidebar", exact: true })
    .click();
  await expect.poll(columns).toBe(5);
  await page
    .getByRole("button", { name: "Hide main navigation", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Show main navigation", exact: true }),
  ).toBeVisible();
  await expect.poll(columns).toBe(5);
});

test("public About tab explains BRM's purpose and has its own section navigation", async ({
  page,
}, info) => {
  await page.goto("./#/explore");
  const primary = page.getByRole("navigation", {
    name:
      info.project.name === "mobile"
        ? "Mobile public navigation"
        : "Workspace shortcuts",
    exact: true,
  });
  await primary
    .getByRole("link", { name: "About adoption.is", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Good causes deserve to be heard." }),
  ).toBeVisible();
  await expect(page.locator(".about-why")).toContainText(
    "OUR MISSION & VISION",
  );
  await expect(page.locator(".about-why")).toContainText(
    "[Mission statement placeholder",
  );
  await expect(
    primary.getByRole("link", { name: "About adoption.is", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  if (info.project.name === "mobile") {
    const menu = page.locator(".public-mobile-context");
    if ((await menu.getAttribute("open")) === null)
      await menu.locator("summary").first().click();
  }
  const nav = page.getByRole("navigation", {
    name: "About adoption.is navigation",
    exact: true,
  });
  await nav
    .getByRole("link", { name: "How a ripple grows", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "It starts with a story." }),
  ).toBeInViewport();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "It starts with a story." }),
  ).toBeInViewport();
  await expect(page.locator(".about-demo")).toContainText(
    "does not collect payments or deliver live ads",
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("slander-public-viewers-v1"),
    ),
  ).toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/about-brm-${info.project.name}.png`,
    fullPage: true,
  });
});

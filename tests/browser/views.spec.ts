import { expect, test, type Page } from "@playwright/test";

async function navigate(page: Page, name: string) {
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name, exact: false })
    .click();
}
async function selectNonprofit(page: Page, name: string) {
  await page
    .getByLabel("Nonprofit organization", { exact: true })
    .selectOption({ label: name });
  await page.getByRole("button", { name: "Open nonprofit workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Our projects.", exact: true }),
  ).toBeVisible();
}
async function selectCreator(page: Page, name: string) {
  await page
    .getByLabel("Creator profile", { exact: true })
    .selectOption({ label: name });
  await page.getByRole("button", { name: "Open creator studio" }).click();
  await expect(
    page.getByRole("heading", { name: "Published projects.", exact: true }),
  ).toBeVisible();
}

test("late nonprofit A response cannot repopulate nonprofit B after an identity switch", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.getByLabel("Demo role").selectOption("nonprofit");
  await selectNonprofit(page, "One Tree Collective");
  const options = await (await page.request.get("/api/demo-options")).json();
  const oldId = options.nonprofits.find(
    (n: { name: string }) => n.name === "One Tree Collective",
  ).id;
  let release!: () => void;
  let captured!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route("**/api/workspace", async (route) => {
    if (route.request().headers()["x-demo-nonprofit"] === oldId) {
      const response = await route.fetch();
      captured();
      await pending;
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await started;
  if (await page.getByRole("button", { name: "Open navigation" }).isVisible())
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Change nonprofit" }).click();
  await expect(
    page.getByRole("heading", { name: "A greener tomorrow", exact: true }),
  ).not.toBeVisible();
  await selectNonprofit(page, "The Open Table");
  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/workspace") &&
      response.request().headers()["x-demo-nonprofit"] === oldId,
  );
  release();
  await oldResponse;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(
    page.getByRole("heading", { name: "A seat at every table", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A greener tomorrow", exact: true }),
  ).not.toBeVisible();
});

test("nonprofit selection gates data and limits settings and reviews to its organization", async ({
  page,
}, testInfo) => {
  await page.goto("/posts");
  await expect(
    page.getByRole("heading", { name: "More than a meal" }),
  ).toBeVisible();
  await page.getByLabel("Demo role").selectOption("nonprofit");
  await expect(
    page.getByRole("heading", { name: "Choose your nonprofit." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "More than a meal" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("link", { name: "Platform exceptions", exact: false }),
  ).not.toBeVisible();
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-nonprofit-selection.png`,
    animations: "disabled",
    fullPage: true,
  });
  await selectNonprofit(page, "One Tree Collective");
  await expect(
    page.getByRole("heading", { name: "A greener tomorrow", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A seat at every table", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", {
        name: "A greener tomorrow",
        exact: true,
      }),
    })
    .click();
  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  await expect(
    page.getByLabel("Nonprofit name", { exact: true }),
  ).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("button", { name: "Submit a post", exact: true }),
  ).not.toBeVisible();
  await navigate(page, "All submissions");
  await expect(
    page.getByRole("heading", { name: "It starts with one tree", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "More than a meal", exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "It starts with one tree" }),
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve post", exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  if (await page.getByRole("button", { name: "Open navigation" }).isVisible())
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Change nonprofit" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your nonprofit." }),
  ).toBeVisible();
  await selectNonprofit(page, "The Open Table");
  await expect(
    page.getByRole("heading", { name: "A seat at every table" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A greener tomorrow" }),
  ).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Choose your nonprofit." }),
  ).toBeVisible();
});

test("creator views contain only published projects and personal submissions without management controls", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/projects/room-to-grow");
  await page.getByLabel("Demo role").selectOption("creator");
  await expect(
    page.getByRole("heading", { name: "Choose your creator profile." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Room to grow" }),
  ).not.toBeVisible();
  await selectCreator(page, "Maya Chen");
  await expect(
    page.getByRole("heading", { name: "Room to grow" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "New project" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Draft", exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", {
        name: "A greener tomorrow",
        exact: true,
      }),
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Project settings" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add Instagram account" }),
  ).not.toBeVisible();
  await expect(page.locator(".account-panel")).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Small hands, big impact" }),
  ).not.toBeVisible();
  await navigate(page, "My creatives");
  await expect(
    page.getByRole("heading", { name: "Good things are shared" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "It starts with one tree" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "More than a meal" }),
  ).not.toBeVisible();
  await navigate(page, "My creatives");
  await expect(
    page.getByRole("heading", { name: "Good things are shared" }),
  ).toBeVisible();
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "Good things are shared" }),
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit & resubmit" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve post" }),
  ).not.toBeVisible();
  await expect(
    page.getByText("Instagram account pending", { exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await navigate(page, "Eligible library & counts");
  await expect(
    page.getByRole("heading", { name: "Creator leaderboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Rooted in community" }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-creator-leaderboard.png`,
    animations: "disabled",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: "Rooted in community" }) })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit & resubmit" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Post details" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Evaluation & history" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  if (await page.getByRole("button", { name: "Open navigation" }).isVisible())
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Change creator" }).click();
  await selectCreator(page, "Alex Rivera");
  await navigate(page, "All submissions");
  await expect(
    page.getByRole("heading", { name: "More than a meal" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "It starts with one tree" }),
  ).not.toBeVisible();
  await page.getByLabel("Demo role").selectOption("admin");
  await navigate(page, "Projects");
  await expect(
    page.getByRole("heading", { name: "Room to grow" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible();
  expect(errors).toEqual([]);
});

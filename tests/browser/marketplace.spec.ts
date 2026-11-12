import { expect, test, type Page } from "@playwright/test";
const id = "fictional-river-showcase-v1";
async function openCampaign(page: Page) {
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
    .getByRole("link", { name: "Campaigns", exact: true })
    .click();
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", {
        name: "A little louder for living rivers",
      }),
    })
    .click();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test("complete fictional campaign journey: terms, eligibility, tracked giving, scoped reports and statement", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/campaigns");
  await expect(
    page.getByRole("heading", { name: "Find your next good story." }),
  ).toBeVisible();
  const setup = await (
    await page.request.get("/api/demo/showcase", {
      headers: { "x-demo-role": "admin" },
    })
  ).json();
  if (!setup.ready)
    await page
      .getByRole("button", { name: "Initialize fictional showcase" })
      .click();
  await expect(
    page.getByRole("link").filter({
      has: page.getByRole("heading", {
        name: "A little louder for living rivers",
      }),
    }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-market-discovery.png`,
    fullPage: true,
  });
  await page.getByLabel("Demo role").selectOption("creator");
  await page
    .getByLabel("Creator profile", { exact: true })
    .selectOption({ label: "Alex River · fictional" });
  await page.getByRole("button", { name: "Open creator studio" }).click();
  // Desktop and mobile share the showcase. Wait for saved consent before acting.
  const participationLoaded = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/campaigns/${id}/records/participations`) &&
      response.ok(),
  );
  await openCampaign(page);
  const participation = await (await participationLoaded).json();
  const accept = page.getByRole("button", {
    name: "Accept campaign terms",
    exact: true,
  });
  await expect(
    page.getByRole("button", { name: /Terms accepted|Accept campaign terms/ }),
  ).toBeVisible();
  if (participation.items.length === 0) await accept.click();
  await expect(
    page.getByRole("button", { name: "✓ Terms accepted" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Submit sample creative", exact: true })
    .click();
  await expect(
    page.getByText("Automatically eligible", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create tracked giving link" })
    .click();
  await expect(
    page.getByRole("link", { name: "Open tracked giving page" }),
  ).toHaveAttribute("href", /^\/r\//);
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-market-eligible.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Open tracked giving page" }).click();
  await expect(page).toHaveURL(new RegExp(`/campaigns/${id}/give`));
  await expect(page.getByLabel("Simulated gift amount (USD)")).toHaveValue(
    "100",
  );
  await page.getByRole("button", { name: "Confirm simulated gift" }).click();
  await expect(page.getByText("SIMULATED GIFT CONFIRMED")).toBeVisible();
  await expect(
    page.locator("dl").getByText("$10.00", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("dl").getByText("$90.00", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("dl").getByText("+1", { exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-market-gift.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Return to campaign" }).click();
  await page.getByLabel("Demo role").selectOption("nonprofit");
  await page
    .getByLabel("Nonprofit organization", { exact: true })
    .selectOption({ label: "Riverkind Collective · fictional" });
  await page.getByRole("button", { name: "Open nonprofit workspace" }).click();
  await openCampaign(page);
  await page.getByRole("tab", { name: "Funding" }).click();
  await expect(page.getByText("$600.00", { exact: true })).toBeVisible();
  await expect(page.getByText("$400.00", { exact: true })).toBeVisible();
  await noOverflow(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(page.getByRole("heading", { name: "77.5 / 100" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-market-performance.png`,
    fullPage: true,
  });
  await page.getByLabel("Demo role").selectOption("admin");
  await page.getByRole("tab", { name: "Settlement" }).click();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Preview & export sample week" })
    .click();
  const file = await downloading;
  expect(file.suggestedFilename()).toBe(
    "adoption.is-fictional-sample-statement.json",
  );
  await expect(
    page.getByText(/Sample statement exported\. This current sample week/),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-market-statement.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("public giving opens without selecting a private demo identity", async ({
  page,
  request,
}) => {
  await request.post("/api/demo/showcase", {
    headers: { "x-demo-role": "admin" },
    data: {},
  });
  await page.addInitScript(() =>
    localStorage.setItem("slander-role", "creator"),
  );
  await page.goto(`/campaigns/${id}/give`);
  await expect(
    page.getByRole("heading", { name: "Be part of the story." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm simulated gift" }),
  ).toBeEnabled();
  await expect(
    page.getByText("Choose your creator profile."),
  ).not.toBeVisible();
});

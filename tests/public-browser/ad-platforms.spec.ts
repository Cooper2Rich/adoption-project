import { expect, test, type Page } from "@playwright/test";
import {
  navigate,
  openWorkspaceMenu,
  selectCreator,
  selectOwner,
} from "./helpers.ts";

async function openCoffee(page: Page) {
  await page.goto("./#/explore");
  await page.getByLabel("Demo role").selectOption("admin");
  await page
    .getByRole("link", { name: /^Ad platforms for Nocturne Coffee/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ad platforms.", exact: true }),
  ).toBeVisible();
}
async function connect(page: Page, provider: string) {
  await page
    .getByRole("button", { name: `Connect ${provider} (demo)`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "fictional USD accounts",
  );
  await page
    .getByRole("button", { name: "Save demo connection", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: provider, exact: true }),
  ).toContainText("Demo account selected");
}
async function enable(page: Page) {
  await page
    .getByRole("checkbox", {
      name: "Enable demo automation for this campaign",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save spending rules", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Preview next allocation", exact: true }),
  ).toBeEnabled();
}
async function currentSetup(page: Page) {
  return page.evaluate(() => {
    const campaignId = location.hash.split("/")[2];
    return JSON.parse(localStorage.getItem("slander-public-workspace-v1")!)
      .adPlatformSetups[campaignId];
  });
}

test("campaign connections, spending rules and allocation previews persist without placing spend", async ({
  page,
}, info) => {
  const errors: string[] = [],
    providerCalls: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/graph\.facebook\.com|business-api\.tiktok\.com/.test(request.url()))
      providerCalls.push(request.url());
  });
  await openCoffee(page);
  const financialBefore = await page.evaluate(() => ({
    viewers: localStorage.getItem("slander-public-viewers-v1"),
    samples: JSON.parse(localStorage.getItem("slander-public-workspace-v1")!)
      .sampleFinancials,
  }));
  await expect(
    page.getByRole("button", { name: "Preview next allocation", exact: true }),
  ).toBeDisabled();
  await connect(page, "Meta");
  await connect(page, "TikTok");
  await page.getByLabel("Daily limit (USD)", { exact: true }).fill("0.29");
  await page.getByLabel("Campaign cap (USD)", { exact: true }).fill("1000.00");
  await page.getByLabel("Meta allocation (%)", { exact: true }).fill("70");
  await enable(page);
  await page
    .getByRole("button", { name: "Preview next allocation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "No ad spend was placed",
  );
  const saved = await currentSetup(page);
  expect(saved.rules.dailyLimitCents).toBe(29);
  expect(saved.preview.plannedCents + saved.preview.unallocatedCents).toBe(29);
  expect(saved.preview.plannedCents).toBe(29);
  expect(
    saved.preview.rows
      .filter((row: { platform: string }) => row.platform === "meta")
      .reduce(
        (sum: number, row: { amountCents: number }) => sum + row.amountCents,
        0,
      ),
  ).toBe(20);
  expect(
    saved.preview.rows
      .filter((row: { platform: string }) => row.platform === "tiktok")
      .reduce(
        (sum: number, row: { amountCents: number }) => sum + row.amountCents,
        0,
      ),
  ).toBe(9);
  await page.reload();
  await expect(
    page.getByLabel("Daily limit (USD)", { exact: true }),
  ).toHaveValue("0.29");
  await expect(
    page.getByLabel("Meta allocation (%)", { exact: true }),
  ).toHaveValue("70");
  await expect(
    page.getByRole("table", {
      name: "Demo allocations by platform and creative",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save spending rules", exact: true }),
  ).toBeDisabled();
  expect((await currentSetup(page)).preview.rows).toEqual(saved.preview.rows);
  const financialAfter = await page.evaluate(() => ({
    viewers: localStorage.getItem("slander-public-viewers-v1"),
    samples: JSON.parse(localStorage.getItem("slander-public-workspace-v1")!)
      .sampleFinancials,
  }));
  expect(financialAfter).toEqual(financialBefore);
  await openWorkspaceMenu(page);
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("link", { name: "Ad platforms", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.screenshot({
    path: `test-results/ad-platforms-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Disconnect Meta", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Demo automation paused",
  );
  await expect(
    page.getByRole("checkbox", {
      name: "Enable demo automation for this campaign",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Preview next allocation", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Meta allocation (%)", { exact: true }).fill("0");
  await enable(page);
  await page
    .getByRole("button", { name: "Preview next allocation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "No ad spend was placed",
  );
  expect(
    (await currentSetup(page)).preview.rows.every(
      (row: { platform: string }) => row.platform === "tiktok",
    ),
  ).toBe(true);
  expect(providerCalls).toEqual([]);
  expect(errors).toEqual([]);
});

test("connections stay campaign-specific and archived campaigns pause demo automation", async ({
  page,
}, info) => {
  await openCoffee(page);
  const coffeeUrl = page.url();
  await connect(page, "Meta");
  await navigate(page, "Campaigns");
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  const name = `Ad platform demo ${info.project.name}`;
  await page.getByLabel("Campaign name", { exact: true }).fill(name);
  await page
    .getByLabel("Organization", { exact: true })
    .selectOption({ label: "Nocturne Coffee · fictional" });
  await page
    .getByLabel("Description", { exact: true })
    .fill("A campaign with isolated platform settings.");
  await page
    .getByRole("button", { name: "Create campaign", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("link", { name: `Ad platforms for ${name}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Connect Meta (demo)", exact: true }),
  ).toBeEnabled();
  const newUrl = page.url();
  await connect(page, "Meta");
  await connect(page, "TikTok");
  await enable(page);
  await page
    .getByRole("button", { name: "Preview next allocation", exact: true })
    .click();
  await expect(
    page.getByText(
      "Meta has no eligible creatives. Its share stays unallocated.",
      { exact: true },
    ),
  ).toBeVisible();
  const setup = await currentSetup(page);
  expect(setup.preview.plannedCents).toBe(0);
  expect(setup.preview.unallocatedCents).toBe(10000);
  await page
    .getByRole("button", { name: "Archive campaign", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archive campaign", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Preview next allocation", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", {
      name: "Enable demo automation for this campaign",
      exact: true,
    }),
  ).not.toBeChecked();
  await page.reload();
  await expect(
    page.getByRole("checkbox", {
      name: "Enable demo automation for this campaign",
      exact: true,
    }),
  ).toBeDisabled();
  expect((await currentSetup(page)).rules.enabled).toBe(false);
  await page.goto(coffeeUrl);
  await expect(
    page.getByRole("button", { name: "Disconnect Meta", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect TikTok (demo)", exact: true }),
  ).toBeVisible();
  await selectOwner(page, "Nocturne Coffee · fictional");
  await page.goto(newUrl);
  await expect(page).toHaveURL(/#\/projects$/);
  await expect(
    page.getByRole("button", { name: "Connect Meta (demo)", exact: true }),
  ).toHaveCount(0);
  await selectCreator(page, "Maya Chen");
  await page.goto(newUrl);
  await expect(page).toHaveURL(/#\/projects$/);
});

test("missing connections and invalid caps cannot enable automation", async ({
  page,
}) => {
  await openCoffee(page);
  await page
    .getByRole("checkbox", {
      name: "Enable demo automation for this campaign",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save spending rules", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Connect a demo Meta account",
  );
  await connect(page, "Meta");
  await page.getByLabel("Meta allocation (%)", { exact: true }).fill("100");
  await page.getByLabel("Daily limit (USD)", { exact: true }).fill("200");
  await page.getByLabel("Campaign cap (USD)", { exact: true }).fill("100");
  await page
    .getByRole("checkbox", {
      name: "Enable demo automation for this campaign",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save spending rules", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "daily limit cannot exceed",
  );
  expect((await currentSetup(page)).rules.enabled).toBe(false);
  await page.getByLabel("Daily limit (USD)", { exact: true }).fill("50");
  await page
    .getByRole("button", { name: "Save spending rules", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Preview next allocation", exact: true }),
  ).toBeEnabled();
});

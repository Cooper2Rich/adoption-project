import { expect, test, type Page } from "@playwright/test";
import { navigate, selectOwner } from "./helpers.ts";

async function coffeeOverview(page: Page) {
  await page.goto("./#/explore");
  await page.getByLabel("Demo role").selectOption("admin");
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", {
        name: "Nocturne Coffee — after dark",
        exact: true,
      }),
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Campaign ad spend", exact: true }),
  ).toBeVisible();
}
const history = (page: Page) =>
  page.getByRole("region", { name: "Completed ad spend", exact: true });

test("allocation is editable within the campaign overview and stays in sync with Ad platforms", async ({
  page,
}, info) => {
  await coffeeOverview(page);
  const overview = page.url();
  await expect(history(page).getByRole("table")).toBeVisible();
  await expect(history(page).locator("tbody tr")).toHaveCount(4);
  await expect(history(page)).toContainText("$700.00");
  await page.locator(".campaign-allocation-setup > summary").click();
  await page.getByLabel("Daily limit (USD)", { exact: true }).fill("145.00");
  await page.getByLabel("Campaign cap (USD)", { exact: true }).fill("1800.00");
  await page.getByLabel("Meta allocation (%)", { exact: true }).fill("65");
  await page
    .getByRole("button", { name: "Save spending rules", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Spending rules saved");
  await expect(page).toHaveURL(overview);
  await page
    .getByRole("link", {
      name: "Configure Meta and TikTok connections ↗",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Daily limit (USD)", { exact: true }),
  ).toHaveValue("145.00");
  await expect(
    page.getByLabel("Campaign cap (USD)", { exact: true }),
  ).toHaveValue("1800.00");
  await expect(
    page.getByLabel("Meta allocation (%)", { exact: true }),
  ).toHaveValue("65");
  await expect(history(page).locator("tbody tr")).toHaveCount(4);
  await page.goto(overview);
  await page.locator(".campaign-allocation-setup > summary").click();
  await expect(
    page.getByLabel("Daily limit (USD)", { exact: true }),
  ).toHaveValue("145.00");
  await page.screenshot({
    path: `test-results/campaign-spend-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("completed sample spending is scoped, hideable and never changes financial records", async ({
  page,
}) => {
  await coffeeOverview(page);
  const finance = await page.evaluate(() => ({
    viewers: localStorage.getItem("slander-public-viewers-v1"),
    financials: JSON.parse(localStorage.getItem("slander-public-workspace-v1")!)
      .sampleFinancials,
  }));
  await expect(history(page)).toContainText("$420.00");
  await expect(history(page)).toContainText("$280.00");
  await history(page)
    .getByRole("checkbox", { name: "Include sample activity", exact: true })
    .uncheck();
  await expect(history(page).getByRole("table")).toHaveCount(0);
  await page.reload();
  await expect(
    history(page).getByRole("checkbox", {
      name: "Include sample activity",
      exact: true,
    }),
  ).not.toBeChecked();
  await history(page)
    .getByRole("checkbox", { name: "Include sample activity", exact: true })
    .check();
  await expect(history(page).locator("tbody tr")).toHaveCount(4);
  await navigate(page, "Ad spending");
  await expect(history(page)).toContainText("$700.00");
  await navigate(page, "Campaigns");
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", {
        name: "A little louder for living rivers",
        exact: true,
      }),
    })
    .click();
  await expect(history(page)).toContainText("$2,000.00");
  await expect(history(page)).not.toContainText("Your midnight ritual");
  await navigate(page, "Campaigns");
  await page
    .getByRole("link", { name: "Ad platforms for Adoption Is", exact: true })
    .click();
  await expect(history(page)).toContainText("$1,500.00");
  await selectOwner(page, "Nocturne Coffee · fictional");
  await navigate(page, "Ad spending");
  await expect(history(page)).toContainText("$700.00");
  await expect(history(page)).not.toContainText("River stories");
  expect(
    await page.evaluate(() => ({
      viewers: localStorage.getItem("slander-public-viewers-v1"),
      financials: JSON.parse(
        localStorage.getItem("slander-public-workspace-v1")!,
      ).sampleFinancials,
    })),
  ).toEqual(finance);
});

test("archiving retains sample spend and locks allocation controls", async ({
  page,
}) => {
  await coffeeOverview(page);
  await page
    .getByRole("button", { name: "Archive campaign", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archive campaign", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(history(page).locator("tbody tr")).toHaveCount(4);
  await page.locator(".campaign-allocation-setup > summary").click();
  await expect(
    page.getByLabel("Daily limit (USD)", { exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(history(page)).toContainText("$700.00");
});

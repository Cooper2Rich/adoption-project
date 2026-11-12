import { expect, test, type Page } from "@playwright/test";
import { navigate } from "./helpers.ts";

const breakdown = (page: Page) =>
  page.getByRole("region", { name: "Campaign budget breakdown", exact: true });
async function openCoffee(page: Page) {
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
  await expect(breakdown(page)).toBeVisible();
}
function platform(page: Page, name: string) {
  return breakdown(page).getByRole("region", {
    name: `${name} budget`,
    exact: true,
  });
}
async function configure(
  page: Page,
  cap: string,
  meta: string,
  daily = "100.00",
) {
  await page.getByLabel("Campaign cap (USD)", { exact: true }).fill(cap);
  await page.getByLabel("Meta allocation (%)", { exact: true }).fill(meta);
  await page.getByLabel("Daily limit (USD)", { exact: true }).fill(daily);
  await page
    .getByRole("button", { name: "Save spending rules", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Spending rules saved");
}

test("campaign budget reconciles and updates after saving allocation on every campaign page", async ({
  page,
}, info) => {
  await openCoffee(page);
  await expect(
    breakdown(page).locator(".ad-platform-summary strong"),
  ).toHaveText(["$1,000.00", "$700.00", "$300.00"]);
  await expect(platform(page, "Meta").locator("dd")).toHaveText([
    "$500.00",
    "$420.00",
    "$80.00",
  ]);
  await expect(platform(page, "TikTok").locator("dd")).toHaveText([
    "$500.00",
    "$280.00",
    "$220.00",
  ]);
  await page.locator(".campaign-allocation-setup > summary").click();
  await configure(page, "2000.00", "60");
  await expect(
    breakdown(page).locator(".ad-platform-summary strong"),
  ).toHaveText(["$2,000.00", "$700.00", "$1,300.00"]);
  await expect(platform(page, "Meta").locator("dd")).toHaveText([
    "$1,200.00",
    "$420.00",
    "$780.00",
  ]);
  await expect(platform(page, "TikTok").locator("dd")).toHaveText([
    "$800.00",
    "$280.00",
    "$520.00",
  ]);
  await page.reload();
  await expect(breakdown(page)).toContainText("$1,300.00");
  await navigate(page, "Ad platforms");
  await expect(breakdown(page)).toContainText("$1,300.00");
  await navigate(page, "Ad spending");
  await expect(breakdown(page)).toContainText("$1,300.00");
  await page
    .getByRole("checkbox", { name: "Include sample activity", exact: true })
    .uncheck();
  await expect(
    breakdown(page).locator(".ad-platform-summary strong"),
  ).toHaveText(["$2,000.00", "$0.00", "$2,000.00"]);
  await expect(breakdown(page)).toContainText("Sample history is excluded");
  await page
    .getByRole("checkbox", { name: "Include sample activity", exact: true })
    .check();
  await expect(breakdown(page)).toContainText("$1,300.00");
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({
    path: `test-results/campaign-budget-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("overspending stays visible with negative remaining balances", async ({
  page,
}) => {
  await openCoffee(page);
  await page.locator(".campaign-allocation-setup > summary").click();
  await configure(page, "600.00", "50");
  await expect(
    breakdown(page).locator(".ad-platform-summary strong"),
  ).toHaveText(["$600.00", "$700.00", "-$100.00"]);
  await expect(platform(page, "Meta").locator("dd")).toHaveText([
    "$300.00",
    "$420.00",
    "-$120.00",
  ]);
  await expect(platform(page, "Meta")).toContainText(
    "Over allocation by $120.00",
  );
  await expect(platform(page, "TikTok").locator("dd")).toHaveText([
    "$300.00",
    "$280.00",
    "$20.00",
  ]);
  await page.reload();
  await expect(breakdown(page)).toContainText("-$100.00");
});

test("allocation previews cannot exceed the remaining total or platform budget", async ({
  page,
}) => {
  await openCoffee(page);
  await navigate(page, "Ad platforms");
  for (const name of ["Meta", "TikTok"]) {
    await page
      .getByRole("button", { name: `Connect ${name} (demo)`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save demo connection", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page
    .getByRole("checkbox", {
      name: "Enable demo automation for this campaign",
      exact: true,
    })
    .check();
  await configure(page, "1000.00", "50", "400.00");
  await page
    .getByRole("button", { name: "Preview next allocation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "No ad spend was placed",
  );
  const preview = await page.evaluate(() => {
    const id = location.hash.split("/")[2];
    return JSON.parse(localStorage.getItem("slander-public-workspace-v1")!)
      .adPlatformSetups[id].preview;
  });
  expect(preview.budgetCents).toBe(30000);
  expect(preview.plannedCents).toBe(23000);
  expect(preview.unallocatedCents).toBe(7000);
  expect(
    preview.rows
      .filter((row: { platform: string }) => row.platform === "meta")
      .reduce(
        (sum: number, row: { amountCents: number }) => sum + row.amountCents,
        0,
      ),
  ).toBe(8000);
  await expect(breakdown(page)).toContainText("$300.00");
});

import { expect, test, type Page } from "@playwright/test";
import { navigate } from "./helpers.ts";

async function coffee(page: Page) {
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
    page.getByRole("region", { name: "Ad budget breakdown", exact: true }),
  ).toBeVisible();
}
const adCard = (page: Page, id: string) =>
  page.locator(`.ad-budget-card[data-ad-id="${id}"]`);

test("each ad shows reconciled platform budgets that update with campaign settings", async ({
  page,
}, info) => {
  await coffee(page);
  await expect(page.locator(".ad-budget-card")).toHaveCount(3);
  const midnight = adCard(page, "nocturne-midnight");
  await expect(midnight.locator("tbody tr").nth(0).locator("td")).toHaveText([
    "$166.66",
    "$240.00",
    "-$73.34",
  ]);
  await expect(midnight.locator("tbody tr").nth(1).locator("td")).toHaveText([
    "$166.66",
    "$160.00",
    "$6.66",
  ]);
  await expect(midnight.locator(".ad-budget-totals dd")).toHaveText([
    "$333.32",
    "$400.00",
    "-$66.68",
  ]);
  await page.locator(".campaign-allocation-setup > summary").click();
  await page.getByLabel("Campaign cap (USD)", { exact: true }).fill("2000");
  await page.getByLabel("Meta allocation (%)", { exact: true }).fill("60");
  await page
    .getByRole("button", { name: "Save spending rules", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Spending rules saved");
  await expect(midnight.locator("tbody tr").nth(0).locator("td")).toHaveText([
    "$400.00",
    "$240.00",
    "$160.00",
  ]);
  await expect(midnight.locator("tbody tr").nth(1).locator("td")).toHaveText([
    "$266.66",
    "$160.00",
    "$106.66",
  ]);
  await page.reload();
  await expect(midnight.locator(".ad-budget-totals dd")).toHaveText([
    "$666.66",
    "$400.00",
    "$266.66",
  ]);
  await navigate(page, "Ad spending");
  await expect(midnight.locator(".ad-budget-totals dd")).toHaveText([
    "$666.66",
    "$400.00",
    "$266.66",
  ]);
  await page
    .getByRole("checkbox", { name: "Include sample activity", exact: true })
    .uncheck();
  await expect(midnight.locator(".ad-budget-totals dd")).toHaveText([
    "$666.66",
    "$0.00",
    "$666.66",
  ]);
  await page
    .getByRole("checkbox", { name: "Include sample activity", exact: true })
    .check();
  await expect(midnight.locator(".ad-budget-totals dd")).toHaveText([
    "$666.66",
    "$400.00",
    "$266.66",
  ]);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.screenshot({
    path: `test-results/ad-budget-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("historical ads retain spent amounts and empty campaigns show unassigned allocation", async ({
  page,
}, info) => {
  await coffee(page);
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
  await expect(adCard(page, "sample-river-financial-story")).toContainText(
    "Historical · sample",
  );
  await expect(
    adCard(page, "sample-river-financial-story").locator(
      ".ad-budget-totals dd",
    ),
  ).toHaveText(["$0.00", "$2,000.00", "-$2,000.00"]);
  await expect(page.locator(".ad-budget-unassigned")).toContainText(
    "$1,000.00",
  );
  await navigate(page, "Campaigns");
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  const name = `Empty ad budgets ${info.project.name}`;
  await page.getByLabel("Campaign name", { exact: true }).fill(name);
  await page
    .getByLabel("Organization", { exact: true })
    .selectOption({ label: "Nocturne Coffee · fictional" });
  await page
    .getByLabel("Description", { exact: true })
    .fill("A fresh campaign with unassigned ad budgets.");
  await page
    .getByRole("button", { name: "Create campaign", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .click();
  await expect(
    page.getByText("No ads in this campaign yet.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".ad-budget-card")).toHaveCount(0);
  await expect(page.locator(".ad-budget-unassigned")).toContainText(
    "$1,000.00",
  );
});

test("previews skip exhausted per-ad allocations while respecting platform and campaign limits", async ({
  page,
}) => {
  await coffee(page);
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
  await page.getByLabel("Daily limit (USD)", { exact: true }).fill("400");
  await page
    .getByRole("checkbox", {
      name: "Enable demo automation for this campaign",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save spending rules", exact: true })
    .click();
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
  expect(preview.plannedCents).toBe(23000);
  expect(
    preview.rows.filter((row: { platform: string }) => row.platform === "meta"),
  ).toEqual([
    expect.objectContaining({ adId: "nocturne-afterhours", amountCents: 8000 }),
  ]);
  expect(
    preview.rows.filter(
      (row: { platform: string }) => row.platform === "tiktok",
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ adId: "nocturne-midnight", amountCents: 666 }),
      expect.objectContaining({
        adId: "nocturne-afterhours",
        amountCents: 4667,
      }),
      expect.objectContaining({ adId: "nocturne-espresso", amountCents: 9667 }),
    ]),
  );
});

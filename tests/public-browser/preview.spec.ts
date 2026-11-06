import { test, expect } from "@playwright/test";
import {
  navigate,
  selectCreator,
  selectOwner,
  openRiverCampaign,
} from "./helpers";

test("earlier campaign-preview consent, creative and gift survive the full-site upgrade", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("slander-public-workspace-v1")) return;
    const at = new Date().toISOString();
    localStorage.setItem(
      "slander-public-preview-v1",
      JSON.stringify({
        accepted: true,
        posts: [
          {
            id: "public-sample-creative",
            projectId: "fictional-river-showcase-v1",
            title: "Earlier public creative",
            creator: "Alex River · fictional",
            caption: "A fictional river story.",
            format: "photo",
            media: "/adoption-project/images/forest.jpg",
            mediaType: "image",
            revision: 1,
            createdAt: at,
            updatedAt: at,
            history: [],
            feedback: "",
          },
        ],
        intents: [
          {
            id: "earlier-gift",
            amountCents: 10000,
            attributed: true,
            createdAt: at,
            result: {
              amountCents: 10000,
              creatorCents: 1000,
              beneficiaryCents: 9000,
              votes: 1,
              unallocatedCents: 0,
            },
          },
        ],
      }),
    );
  });
  await page.goto("./");
  await selectCreator(page);
  await openRiverCampaign(page);
  await expect(
    page.getByRole("button", { name: "✓ Terms accepted" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Automatically eligible", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Earlier public creative/)).toBeVisible();
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(page.getByText("$90.00", { exact: true })).toBeVisible();
});

test("public preview works without an API server and persists only browser sample data", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [],
    apiRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.startsWith("/api/"))
      apiRequests.push(req.url());
  });
  await page.goto("./");
  await selectCreator(page);
  await openRiverCampaign(page);
  await expect(page.locator(".campaign-cover")).toBeVisible();
  expect(
    await page
      .locator(".campaign-cover")
      .evaluate((img) => (img as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Accept project terms", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Submit sample creative", exact: true })
    .click();
  await expect(
    page.getByText("Automatically eligible", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create tracked giving link" })
    .click();
  await page.getByRole("link", { name: "Open tracked giving page" }).click();
  await page.getByRole("button", { name: "Confirm simulated gift" }).click();
  await expect(page.getByText("$100.00", { exact: true })).toBeVisible();
  await expect(page.getByText("$10.00", { exact: true })).toBeVisible();
  await expect(page.getByText("$90.00", { exact: true })).toBeVisible();
  await expect(page.getByText("+1", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/public-${info.project.name}-gift.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Return to project" }).click();
  await navigate(page, "Earnings");
  await page
    .getByRole("checkbox", { name: "Include sample activity" })
    .uncheck();
  await expect(page.locator(".earnings-summary > div").first()).toContainText(
    "$10.00",
  );
  await expect(page.locator(".earnings-sources")).toContainText(
    "Recorded cause-gift commissions $10.00",
  );
  await page.screenshot({
    path: `test-results/creator-earnings-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("Demo role").selectOption("admin");
  await openRiverCampaign(page);
  await page.getByRole("tab", { name: "Funding" }).click();
  await expect(page.getByText("$600.00", { exact: true })).toBeVisible();
  await expect(page.getByText("$400.00", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(page.getByRole("heading", { name: "77.5 / 100" })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Funding" }).click();
  await expect(page.getByText("$10.00", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Settlement" }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Preview & export sample week" })
    .click();
  const file = await download;
  const { readFile } = await import("node:fs/promises");
  const statement = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(statement.statement.creatorCents).toBe(1000);
  expect(statement.statement.beneficiaryCents).toBe(9000);
  expect(statement.statement.votes).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/public-${info.project.name}-statement.png`,
    fullPage: true,
  });
  const clean = await context.browser()!.newContext();
  const cleanPage = await clean.newPage();
  await cleanPage.goto(page.url());
  await cleanPage.getByLabel("Demo role").selectOption("admin");
  await openRiverCampaign(cleanPage);
  await cleanPage.getByRole("tab", { name: "Funding" }).click();
  await expect(
    cleanPage.getByText("$0.00", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    cleanPage.getByRole("button", { name: "Terms accepted", exact: false }),
  ).not.toBeVisible();
  await clean.close();
  expect(errors).toEqual([]);
  expect(apiRequests).toEqual([]);
});

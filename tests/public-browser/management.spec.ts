import { expect, test } from "@playwright/test";
import { navigate, openWorkspaceMenu, selectOwner } from "./helpers.ts";

test("owners request projects; only Admin assigns a campaign and approval creates a pricing-pending draft", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./#/explore");
  await selectOwner(page);
  const mainNav = () =>
    page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    mainNav().getByRole("link", { name: "Campaigns", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Request new project", exact: true })
    .click();
  const projectName = `River request ${info.project.name}`;
  await page.getByLabel("Project name", { exact: true }).fill(projectName);
  await page
    .getByLabel("About the project", { exact: true })
    .fill("A requested project for the river organization.");
  await page
    .getByLabel("Creator brief", { exact: true })
    .fill("Tell an accurate river story using authorized media.");
  await page
    .getByRole("button", { name: "Send request to Admin", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Project requests");
  await expect(page.locator(".project-request")).toContainText("pending");
  await page.reload();
  await expect(page.locator(".project-request")).toContainText(projectName);
  await page.goto("./#/campaigns/fictional-river-showcase-v1");
  await expect(page).toHaveURL(/#\/projects$/);
  await expect(
    page.locator(".project-card").filter({ hasText: projectName }),
  ).toHaveCount(0);
  await selectOwner(page, "Nocturne Coffee · fictional");
  await navigate(page, "Project requests");
  await expect(page.locator(".project-request")).toHaveCount(0);
  await page.getByLabel("Demo role").selectOption("admin");
  await expect(
    mainNav().getByRole("link", { name: "Projects", exact: true }),
  ).toHaveCount(0);
  await expect(
    mainNav().getByRole("link", { name: "Ad spending", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  const campaignName = `New river campaign ${info.project.name}`;
  await page.getByLabel("Campaign name", { exact: true }).fill(campaignName);
  await page
    .getByLabel("Organization", { exact: true })
    .selectOption({ label: "Riverkind Collective · fictional" });
  await page
    .getByLabel("Description", { exact: true })
    .fill("Campaign for the requested river project.");
  await page
    .getByRole("button", { name: "Create campaign", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Project requests");
  await page
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await page
    .getByLabel("Assign to campaign", { exact: true })
    .selectOption({ label: campaignName });
  await page
    .getByRole("button", { name: "Approve as draft", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".project-request")).toContainText(
    "Approved · draft",
  );
  const stored = await page.evaluate((name) => {
    const value = JSON.parse(
      localStorage.getItem("slander-public-workspace-v1")!,
    );
    return {
      project: value.projects.find((p: { name: string }) => p.name === name),
      request: value.projectRequests[0],
      count: value.projects.filter((p: { name: string }) => p.name === name)
        .length,
    };
  }, projectName);
  expect(stored.count).toBe(1);
  expect(stored.project.status).toBe("draft");
  expect(stored.project.pricingStatus).toBe("pending");
  expect(stored.project.campaignId).toBe(stored.request.campaignId);
  await page.getByRole("link", { name: "Open project", exact: true }).click();
  await openWorkspaceMenu(page);
  await expect(
    mainNav().getByRole("link", { name: "Ad spending", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  await expect(
    page.getByLabel("Project status").locator('option[value="active"]'),
  ).toHaveAttribute("disabled", "");
  // Tampering with the client control must not bypass the pricing gate.
  await page
    .getByLabel("Project status")
    .locator('option[value="active"]')
    .evaluate((option: HTMLOptionElement) => {
      option.disabled = false;
    });
  await page.getByLabel("Project status").selectOption("active");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "pricing is not configured",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await selectOwner(page);
  await expect(
    page.locator(".project-card").filter({ hasText: projectName }),
  ).toHaveCount(1);
  await navigate(page, "Project requests");
  await expect(page.locator(".project-request")).toContainText(
    "Approved · draft",
  );
  await page.screenshot({
    path: `test-results/owner-project-requests-${info.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("Admin funding uses recorded 10/5/85 allocations and campaign archives retain funding and project history", async ({
  page,
}, info) => {
  await page.goto("./#/explore");
  await page
    .locator(".ad-card")
    .first()
    .getByRole("button", { name: "Fund ad spend", exact: true })
    .click();
  await page.getByLabel("Your name", { exact: true }).fill("Funding Viewer");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("funding-viewer@example.test");
  await page
    .getByRole("button", { name: "Create viewer profile", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "The creator receives 10%",
  );
  await expect(page.getByRole("dialog")).not.toContainText("hosting platform");
  await page.getByLabel("Amount in USD", { exact: true }).fill("100");
  await page
    .getByRole("button", {
      name: "Confirm simulated contribution",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "$100.00",
  );
  await page
    .getByRole("button", { name: "Keep discovering", exact: true })
    .click();
  await page.evaluate(() => {
    const key = "slander-public-viewers-v1",
      state = JSON.parse(localStorage.getItem(key)!);
    const first = state.support[0];
    state.support.push({
      id: "legacy-fund",
      viewerId: first.viewerId,
      adId: first.adId,
      title: first.title,
      amountCents: 2500,
      at: new Date().toISOString(),
    });
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.getByLabel("Demo role").selectOption("admin");
  await navigate(page, "Funding");
  await page
    .getByRole("checkbox", { name: "Include sample activity" })
    .uncheck();
  const summary = page.locator(".funding-summary > div");
  await expect(summary.nth(0)).toContainText("$125.00");
  await expect(summary.nth(1)).toContainText("$10.00");
  await expect(summary.nth(2)).toContainText("$85.00");
  await expect(summary.nth(3)).toContainText("$5.00");
  await expect(page.locator(".info-banner")).toContainText("$25.00");
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", {
        name: "Nocturne Coffee — after dark ↗",
        exact: true,
      }),
    })
    .click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await openWorkspaceMenu(page);
  await expect(
    nav.getByRole("link", { name: "Projects", exact: true }),
  ).toBeVisible();
  await navigate(page, "Ad spending");
  await expect(page.locator(".creator-summary")).toContainText("$125.00");
  await page
    .getByRole("button", { name: "Archive campaign", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archive campaign", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Archived projects");
  await expect(page.locator(".archive-project")).toHaveCount(1);
  await navigate(page, "All campaigns");
  await navigate(page, "Archived campaigns");
  await expect(page.locator(".managed-campaign")).toContainText(
    "Nocturne Coffee",
  );
  await page.getByLabel("Demo role").selectOption("public");
  await expect(page.locator(".ad-card")).toHaveCount(4);
  await page.getByLabel("Demo role").selectOption("admin");
  await navigate(page, "Archived campaigns");
  await page
    .getByRole("button", { name: "Restore campaign", exact: true })
    .click();
  await expect(page.locator(".managed-campaign")).toHaveCount(0);
  await navigate(page, "Funding");
  await expect(summary.nth(0)).toContainText("$125.00");
  await expect(summary.nth(2)).toContainText("$85.00");
  const records = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("slander-public-viewers-v1")!).support,
  );
  expect(records).toHaveLength(2);
  expect(records[0].allocation).toEqual({
    policy: "ad-fund-10-5-85-v1",
    creatorCents: 1000,
    appUseFeeCents: 500,
    beneficiaryCents: 8500,
  });
  expect(records[1].allocation).toBeUndefined();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/admin-campaign-funding-${info.project.name}.png`,
    fullPage: true,
  });
});

import { expect, test } from "@playwright/test";
import { navigate, selectCreator } from "./helpers.ts";

test("creators see their earned commissions and retained past-ad earnings; Admin sees application fees separately from payments", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./#/explore");
  await page
    .locator(".ad-card")
    .first()
    .getByRole("button", { name: "Fund ad spend", exact: true })
    .click();
  await page.getByLabel("Your name", { exact: true }).fill("Earnings Viewer");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("earnings@example.test");
  await page
    .getByRole("button", { name: "Create viewer profile", exact: true })
    .click();
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
  await selectCreator(page, "Nocturne Studio · fictional");
  await navigate(page, "My ads");
  await page
    .getByRole("checkbox", { name: "Include sample activity" })
    .uncheck();
  await expect(page.locator(".creator-earnings-link")).toContainText("$10.00");
  await expect(
    page
      .locator(".creator-card")
      .filter({ hasText: "Your midnight ritual" })
      .locator(".ad-earnings"),
  ).toContainText("$10.00");
  await page.locator(".creator-earnings-link").click();
  const summary = page.locator(".earnings-summary > div");
  await expect(summary.nth(0)).toContainText("$10.00");
  await expect(summary.nth(1)).toContainText("$10.00");
  await expect(summary.nth(2)).toContainText("$0.00");
  await expect(page.locator(".earnings-row")).toContainText(
    "Your midnight ritual",
  );
  await page
    .getByRole("textbox", { name: "Search workspace" })
    .fill("no matching ad");
  await expect(page.locator(".earnings-row")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search workspace" }).fill("");
  // Past projects retain the immutable contribution allocation.
  await page.evaluate(() => {
    const key = "slander-public-workspace-v1",
      state = JSON.parse(localStorage.getItem(key)!);
    state.projects.find(
      (p: { id: string }) => p.id === "nocturne-coffee-showcase-v1",
    ).status = "archived";
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await expect(summary.nth(0)).toContainText("$10.00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/creator-earnings-${info.project.name}.png`,
    fullPage: true,
  });
  await selectCreator(page, "Maya Chen");
  await navigate(page, "Earnings");
  await expect(summary.nth(0)).toContainText("$0.00");
  await expect(page.locator(".earnings-row")).toHaveCount(0);
  await page.getByLabel("Demo role").selectOption("admin");
  await navigate(page, "Funding");
  await page.getByLabel("Sort campaign funding").selectOption("app-fees");
  const campaign = page
    .locator(".funding-campaign")
    .filter({ hasText: "Nocturne Coffee" });
  await expect(
    campaign
      .locator(".funding-metrics > div")
      .filter({ hasText: "Application fees accrued" }),
  ).toContainText("$5.00");
  const payment = campaign
    .locator(".funding-metrics > div")
    .filter({ hasText: "Paid to application" });
  await expect(payment.locator("dd")).toHaveText("$0.00");
  await expect(payment).toContainText("Outstanding: $5.00");
  await expect(page.locator(".funding-summary > div").last()).toContainText(
    "Paid: $0.00 · Outstanding: $5.00",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/application-fees-${info.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

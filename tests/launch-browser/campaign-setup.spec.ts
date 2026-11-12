import { expect, test } from "@playwright/test";
import { preview } from "vite";

test("T01 built production entry requires configured Clerk and never uses a fixture session", async ({
  page,
}, testInfo) => {
  const server = await preview({
    configFile: "vite.launch.config.ts",
    preview: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  const address = server.httpServer.address();
  if (!address || typeof address === "string")
    throw new Error("Missing owned preview port");
  const sessionRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/__allocation/session"))
      sessionRequests.push(request.url());
  });
  try {
    await page.goto(
      `http://127.0.0.1:${address.port}/launch-preview.html?workspace=manager`,
    );
    await expect(
      page.getByRole("heading", { name: "Manager sign-in unavailable" }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Clerk sign-in");
    await expect(
      page.getByRole("button", { name: "Campaign setup", exact: true }),
    ).toHaveCount(0);
    expect(sessionRequests).toEqual([]);
    await page.goto(`http://127.0.0.1:${address.port}/launch-preview.html`);
    await expect(
      page.getByRole("heading", { name: "Campaign unavailable" }),
    ).toBeVisible();
    await expect(page.getByText("Clerk sign-in")).toHaveCount(0);
    expect(sessionRequests).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("production-sign-in-unconfigured.png"),
      fullPage: true,
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("T01 manager validates creates locks and reopens adoption.is rules in another session", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?workspace=manager");
  await page
    .getByRole("button", { name: "Campaign setup", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Set your campaign rules." }),
  ).toBeVisible();
  await expect(
    page.getByText(/No platform administrator authority/),
  ).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(3);
  await expect(page.getByText(/Isolation control|nonprofit-b/)).toHaveCount(0);
  await page
    .getByLabel("Campaign start", { exact: true })
    .fill("2026-12-01T12:00");
  await page
    .getByLabel("Campaign end", { exact: true })
    .fill("2026-11-01T12:00");
  await page
    .getByLabel("Earning start", { exact: true })
    .fill("2026-11-01T12:00");
  await page
    .getByLabel("Earning end", { exact: true })
    .fill("2027-04-01T12:00");
  await page.getByLabel("Commission percent").fill("10.25");
  await page.getByLabel("Daily impressions target").fill("100");
  await page.getByLabel("Daily total clicks target").fill("50");
  await page.getByLabel("Daily fundraising target USD").fill("100.50");
  await page.getByLabel("Weekly impressions target").fill("1000");
  await page.getByLabel("Weekly total clicks target").fill("500");
  await page.getByLabel("Weekly fundraising target USD").fill("1000.50");
  await page.getByLabel("Daily prize USD").fill("100.25");
  await page.getByLabel("Daily prize time").fill("23:59");
  await page.getByLabel("Weekly prize USD").fill("500.25");
  await page.getByLabel("Weekly prize day").selectOption("0");
  await page.getByLabel("Weekly prize time").fill("23:59");
  await page.getByLabel("Weekly replenishment USD").fill("1000.25");
  await page.getByLabel("Replenishment day").selectOption("1");
  await page.getByLabel("Replenishment time").fill("09:00");
  await page.getByLabel("Creator payment day").selectOption("5");
  await page.getByLabel("Creator payment time").fill("14:00");
  await page.getByRole("button", { name: "Create and lock campaign" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Campaign rules could not be saved",
  );
  await expect(
    page.getByRole("heading", { name: "Set your campaign rules." }),
  ).toBeVisible();
  await page
    .getByLabel("Campaign end", { exact: true })
    .fill("2027-03-01T12:00");
  await page.screenshot({
    path: testInfo.outputPath("campaign-create.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Create and lock campaign" }).click();
  await expect(
    page.getByRole("heading", { name: "Campaign rules are locked." }),
  ).toBeVisible();
  const summary = page.getByRole("region", { name: "Locked campaign rules" });
  await expect(summary).toContainText("10.25%");
  await expect(summary).toContainText("$100.50 fundraising");
  await expect(summary).toContainText("$1,000.50 fundraising");
  await expect(summary).toContainText("$100.25");
  await expect(summary).toContainText("$500.25");
  await expect(summary).toContainText("$1,000.25 · Monday 09:00");
  await expect(summary).toContainText("Friday 14:00");
  await expect(summary).toContainText("Wednesday 12:00 America/Chicago");
  await expect(summary).toContainText("campaignSetup:create");
  await expect(summary).toContainText("campaign-rules-v1");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  const persisted = await summary.innerText();
  const context = await browser.newContext({
    viewport: testInfo.project.use.viewport,
  });
  try {
    const second = await context.newPage();
    await second.goto(new URL("/?workspace=manager", page.url()).toString());
    await second
      .getByRole("button", { name: "Campaign setup", exact: true })
      .click();
    await expect(
      second.getByRole("region", { name: "Locked campaign rules" }),
    ).toHaveText(persisted, { useInnerText: true });
    await expect(
      second.getByRole("button", { name: "Create and lock campaign" }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("campaign-locked.png"),
    fullPage: true,
  });
});

test("T01 invalid session visibly fails closed without exposing workspace records", async ({
  page,
}) => {
  await page.route("**/__allocation/session", async (route) => {
    const response = await route.fetch();
    const session = await response.json();
    const parts = session.token.split(".");
    parts[2] = (parts[2][0] === "a" ? "b" : "a") + parts[2].slice(1);
    await route.fulfill({
      response,
      json: { ...session, token: parts.join(".") },
    });
  });
  await page.goto("/?workspace=manager");
  await expect(page.getByRole("alert")).toContainText("Session unavailable");
  await expect(
    page.getByRole("button", { name: "Campaign setup", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/manager-a|nonprofit-a|campaign-rules-v1/),
  ).toHaveCount(0);
});

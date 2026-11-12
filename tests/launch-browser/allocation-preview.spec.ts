import { test, expect } from "@playwright/test";

test("manager saves a real persisted preview and retrieves it in a fresh session", async ({
  page,
  browser,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("button", { name: "Save new preview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save new preview" }).click();
  await expect(page.getByTestId("baseline-total")).toHaveText("$60.00");
  await expect(page.getByTestId("boost-total")).toHaveText("$20.00");
  await expect(page.getByTestId("uncommitted-total")).toHaveText("$20.00");
  await expect(page.getByRole("status")).toContainText(
    "No money or ad slots reserved",
  );
  await page.getByLabel("Residual boost share").fill("25");
  await page.getByRole("button", { name: "Save new preview" }).click();
  await expect(page.getByTestId("boost-total")).toHaveText("$10.00");
  const context = await browser.newContext();
  try {
    const second = await context.newPage();
    await second.goto(new URL("/", page.url()).toString(), {
      waitUntil: "domcontentloaded",
    });
    await expect(second.getByTestId("boost-total")).toHaveText("$10.00");
    await expect(second.getByLabel("Residual boost share")).toHaveValue("25");
    await expect(
      second.getByRole("heading", { name: "Saved previews" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
  await page.getByLabel("Residual boost share").fill("50");
  await page.getByRole("button", { name: "Save new preview" }).click();
  await expect(page.getByTestId("boost-total")).toHaveText("$20.00");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("allocation-preview.png"),
    fullPage: true,
  });
});

test("private backend configuration cannot be served through the public build cache", async ({
  request,
}) => {
  const source = await (await request.get("/src/launch/main.tsx")).text();
  const cachePath = source.match(/\/[@]fs\/[^"']+?\/vite-cache\//)?.[0];
  expect(
    cachePath,
    "Expected an owned public dependency cache path",
  ).toBeTruthy();
  const privatePath = cachePath!.replace(
    /vite-cache\/$/,
    ".convex/local/default/config.json",
  );
  const response = await request.head(privatePath);
  expect(response.status()).toBe(403);
  const crossOrigin = await request.get("/__allocation/session", {
    headers: { Origin: "https://unrelated.invalid" },
  });
  expect(crossOrigin.status()).toBe(403);
});

test("healthy startup shares only residual boosts and incomplete reports hold boosts", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Snapshot scenario").selectOption("startup");
  await page.getByRole("button", { name: "Save new preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Allocation preview ready" }),
  ).toBeVisible();
  await expect(page.getByTestId("boost-total")).toHaveText("$20.00");
  await expect(
    page
      .getByRole("row", { name: /Entry A/ })
      .getByRole("cell")
      .last(),
  ).toHaveText("$20.00");
  await page.getByLabel("Snapshot scenario").selectOption("incomplete");
  await page.getByRole("button", { name: "Save new preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Baseline protected. Boosts held." }),
  ).toBeVisible();
  await expect(page.getByTestId("baseline-total")).toHaveText("$60.00");
  await expect(page.getByTestId("boost-total")).toHaveText("$0.00");
  await expect(page.getByText("Incomplete entries: d")).toBeVisible();
  await expect(
    page.getByText(/Recipients: administrator, manager-a/).first(),
  ).toBeVisible();
  await page.getByLabel("Snapshot scenario").selectOption("complete");
  await page.getByRole("button", { name: "Save new preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Allocation preview ready" }),
  ).toBeVisible();
  await expect(page.getByTestId("boost-total")).toHaveText("$20.00");
  await page
    .getByRole("region", { name: "Saved previews" })
    .getByRole("button")
    .filter({ hasText: "Boosts held" })
    .first()
    .click();
  await expect(page.getByTestId("boost-total")).toHaveText("$0.00");
});

test("unknown finances block allocations and unavailable provider shares remain held", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Snapshot scenario").selectOption("unknown");
  await page.getByRole("button", { name: "Save new preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Funding plan blocked" }),
  ).toBeVisible();
  await expect(page.getByTestId("baseline-total")).toHaveText("$0.00");
  await expect(
    page
      .getByText("Reliable financial evidence is required", { exact: true })
      .first(),
  ).toBeVisible();
  await page.getByLabel("Snapshot scenario").selectOption("provider");
  await page.getByRole("button", { name: "Save new preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Allocation preview ready" }),
  ).toBeVisible();
  const row = page.getByRole("row", { name: /Entry A/ });
  await expect(row.getByRole("cell").nth(2)).toHaveText("$15.00");
  await expect(row.getByRole("cell").nth(3)).toContainText("$10.00");
  await expect(
    page.getByRole("table").getByText("Held", { exact: true }),
  ).toHaveCount(4);
});

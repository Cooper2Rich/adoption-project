import { expect, test } from "@playwright/test";
import { navigate, selectCreator, selectOwner } from "./helpers.ts";

test("full site: project settings, scoped profiles, upload, failed checks, revision, handoff and activity", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [],
    apiRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.goto("./");
  await page.getByLabel("Demo role").selectOption("admin");
  await expect(
    page.getByRole("heading", { name: "Campaigns.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A greener tomorrow", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/full-public-${info.project.name}-projects.png`,
    fullPage: true,
  });
  await navigate(page, "All submissions");
  await expect(
    page.getByRole("heading", { name: "It starts with one tree", exact: true }),
  ).toBeVisible();
  await navigate(page, "Platform exceptions");
  await expect(
    page.getByRole("heading", { name: "Rooted in community", exact: true }),
  ).toBeVisible();
  await navigate(page, "Eligible creatives");
  await expect(
    page.getByRole("heading", { name: "It starts with one tree", exact: true }),
  ).toBeVisible();
  const projectName = "A greener tomorrow";
  await selectCreator(page, "Maya Chen");
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: projectName, exact: true }),
    })
    .click();
  await page
    .getByRole("button", { name: "Submit a post", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Post title", { exact: true })
    .fill("Roots for the future");
  await page
    .getByLabel("Upload creative")
    .setInputFiles("public/images/seedling.jpg");
  await expect
    .poll(() =>
      page
        .getByRole("dialog")
        .getByRole("img", { name: "Roots for the future", exact: true })
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page
    .getByLabel("Instagram caption")
    .fill("Come grow a greener neighborhood with our fictional community.");
  await page
    .getByRole("checkbox", { name: /I include these exact disclosure/ })
    .check();
  await page
    .getByRole("button", { name: "Submit & evaluate", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const creative = () =>
    page.getByRole("button").filter({
      has: page.getByRole("heading", {
        name: "Roots for the future",
        exact: true,
      }),
    });
  await creative().click();
  await expect(
    page.getByText("RIGHTS_REQUIRED", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit & resubmit" }).click();
  await page.getByRole("checkbox", { name: /I have the rights/ }).check();
  await page.getByRole("button", { name: "Save & evaluate revision" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await creative().click();
  await expect(
    page.getByText("Automatically eligible", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/2 retained revisions/)).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await creative().click();
  await expect
    .poll(() =>
      page
        .getByRole("dialog")
        .locator(".ig-media")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Demo role").selectOption("admin");
  await page
    .locator(".managed-campaign")
    .filter({
      has: page.getByRole("heading", { name: projectName, exact: true }),
    })
    .getByRole("link")
    .click();
  await page
    .locator(".project-card")
    .filter({
      has: page.getByRole("heading", { name: projectName, exact: true }),
    })
    .click();
  await page
    .getByRole("button", { name: "Add Instagram account", exact: true })
    .click();
  await page
    .getByLabel("Nonprofit Instagram account", { exact: true })
    .fill("@fictional.garden");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await creative().click();
  await expect(
    page.getByText("Ready for Instagram handoff", { exact: true }),
  ).toBeVisible();
  const details = page.waitForEvent("download");
  await page.getByRole("button", { name: "Post details" }).click();
  const { readFile } = await import("node:fs/promises");
  const exported = JSON.parse(
    await readFile((await (await details).path())!, "utf8"),
  );
  expect(exported.post.revision).toBe(2);
  const media = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save creative" }).click();
  expect(await (await media).failure()).toBeNull();
  await page
    .getByLabel("Exception reason or corrected fact")
    .fill("Fictional permission check");
  await page
    .getByLabel("Supporting evidence")
    .fill("Demo-only sample evidence");
  await page.getByRole("button", { name: "Record scoped rights hold" }).click();
  await expect(
    page.getByRole("dialog").getByText("On hold", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Exception reason or corrected fact")
    .fill("Please review this fictional permission");
  await page.getByRole("button", { name: "Appeal this hold" }).click();
  await page
    .getByLabel("Exception reason or corrected fact")
    .fill("Fictional sample permission confirmed");
  await page
    .getByLabel("Supporting evidence")
    .fill("Demo-only corrected evidence");
  await page
    .getByRole("button", { name: "Record corrected hold fact & rerun" })
    .click();
  await expect(
    page.getByText("Automatically eligible", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await navigate(page, "Activity");
  await expect(
    page.getByRole("heading", { name: "Workspace activity.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Fictional sample permission confirmed/),
  ).toBeVisible();
  await selectOwner(page, "One Tree Collective");
  await expect(
    page.getByRole("heading", { name: projectName, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A seat at every table", exact: true }),
  ).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/full-public-${info.project.name}-owner.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(apiRequests).toEqual([]);
});

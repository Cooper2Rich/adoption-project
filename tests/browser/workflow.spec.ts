import { test, expect } from "@playwright/test";

test("project setup, upload, automatic eligibility, immutable revision and pairing", async ({
  page,
}, testInfo) => {
  const projectName = `Community in bloom ${testInfo.project.name} ${Date.now()}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/projects");
  await expect(
    page.getByRole("heading", { name: "Projects.", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-projects.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name", { exact: true }).fill(projectName);
  await page
    .getByLabel("Nonprofit name", { exact: true })
    .fill("Community Garden Foundation");
  await page
    .getByLabel("About the project")
    .fill("Help our neighborhood grow more green spaces.");
  await page
    .getByLabel("Creator brief", { exact: true })
    .fill("Share a hopeful story about local gardens.");
  await page.getByLabel("Project status").selectOption("active");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: projectName, exact: true }),
    })
    .click();
  await expect(
    page.getByRole("heading", { name: projectName, exact: true }),
  ).toBeVisible();
  await page.getByLabel("Demo role").selectOption("creator");
  await page
    .getByLabel("Creator profile", { exact: true })
    .selectOption({ label: "Maya Chen" });
  await page.getByRole("button", { name: "Open creator studio" }).click();
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
  await expect(page.getByLabel("Demo role")).toHaveValue("creator");
  await page
    .getByLabel("Post title", { exact: true })
    .fill("Roots for the future");
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
    "Maya Chen",
  );
  await expect(page.getByLabel("Your name", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await page
    .getByLabel("Upload creative")
    .setInputFiles("public/images/seedling.jpg");
  await expect(
    page.getByText("Change your creative", { exact: true }),
  ).toBeVisible();
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
    .fill("Come plant a greener future with us. #CommunityGardens");
  await page
    .getByRole("checkbox", { name: /I include these exact disclosure/ })
    .check();
  await page
    .getByRole("button", { name: "Submit & evaluate", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Roots for the future" }),
  ).toBeVisible();
  await page.getByLabel("Demo role").selectOption("admin");
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "Roots for the future" }),
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve post", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByText("RIGHTS_REQUIRED", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Needs fixes", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Demo role").selectOption("creator");
  await page
    .getByLabel("Creator profile", { exact: true })
    .selectOption({ label: "Maya Chen" });
  await page.getByRole("button", { name: "Open creator studio" }).click();
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: projectName, exact: true }),
    })
    .click();
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "Roots for the future" }),
    })
    .click();
  await expect(
    page.getByText("RIGHTS_REQUIRED", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit & resubmit" }).click();
  await page
    .getByLabel("Instagram caption")
    .fill(
      "Join Community Garden Foundation and plant a greener future with us.",
    );
  await page.getByRole("checkbox", { name: /I have the rights/ }).check();
  await page.getByRole("button", { name: "Save & evaluate revision" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByLabel("Demo role").selectOption("admin");
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "Roots for the future" }),
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Evaluation & history" }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-review.png`,
    fullPage: true,
  });
  await expect(
    page.getByText("Automatically eligible", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/2 retained revisions/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve post", exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Add Instagram account", exact: true })
    .click();
  await page
    .getByLabel("Nonprofit Instagram account", { exact: true })
    .fill("@community.garden");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "@community.garden", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "@community.garden", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "Roots for the future" }),
    })
    .click();
  await expect(
    page.getByText("Ready for Instagram handoff", { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Post details" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^slander-.+\.json$/);
  const mediaDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save creative" }).click();
  const mediaDownload = await mediaDownloadPromise;
  expect(mediaDownload.suggestedFilename()).toMatch(
    /^adoption\.is-creative\.(jpeg|jpg)$/,
  );
  expect(await mediaDownload.failure()).toBeNull();
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-private-media.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("/projects/seat-at-the-table");
  await expect(
    page.getByRole("button", { name: "Add Instagram account" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("navigation, search, filters, and keyboard modal close work", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.getByLabel("Search workspace").fill("does-not-exist");
  await expect(page.getByText("No projects match your search.")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "Draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Room to grow" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A greener tomorrow" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "List view" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "New project" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  if (await page.getByRole("button", { name: "Open navigation" }).isVisible())
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("link", { name: "Platform exceptions", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Platform exceptions." }),
  ).toBeVisible();
  await page.getByLabel("Filter by project").selectOption("greener-tomorrow");
  await expect(
    page.getByRole("heading", { name: "More than a meal" }),
  ).not.toBeVisible();
});

test("campaign owner edits policy while platform handles scoped evidence and appeals", async ({
  page,
  request,
}, testInfo) => {
  const options = await (await request.get("/api/demo-options")).json();
  const creator = options.creators.find(
    (c: { name: string }) => c.name === "Maya Chen",
  );
  const nonprofit = options.nonprofits.find(
    (n: { name: string }) => n.name === "One Tree Collective",
  );
  const today = new Date().toISOString().slice(0, 10);
  const name = `Eligibility lab ${testInfo.project.name}`;
  const created = await request.post("/api/projects", {
    headers: { "x-demo-role": "admin" },
    data: {
      name,
      nonprofit: nonprofit.name,
      category: "Environment",
      description: "Fictional policy and exception lab.",
      brief: "Share a community story.",
      cover: "forest",
      startDate: today,
      endDate: "2099-12-31",
      status: "active",
      instagram: "one.tree",
    },
  });
  expect(created.status()).toBe(201);
  const project = await created.json();
  const submitted = await request.post(`/api/projects/${project.id}/posts`, {
    headers: { "x-demo-role": "creator", "x-demo-creator": creator.id },
    data: {
      title: `${name} creative`,
      caption: "Our fictional community plants trees.",
      creator: creator.name,
      format: "photo",
      media: "/images/seedling.jpg",
      mediaType: "image",
      rights: true,
      channel: "instagram",
      destination: project.eligibilityPolicy.destinations[0],
      disclosures: {
        compensation: project.eligibilityPolicy.compensationDisclosure,
        beneficiary: project.eligibilityPolicy.beneficiaryDisclosure,
      },
      acceptedTermsVersion: "local-v1",
    },
  });
  expect(submitted.status()).toBe(201);
  await page.goto(`/projects/${project.id}`);
  await page.getByLabel("Demo role").selectOption("nonprofit");
  await page
    .getByLabel("Nonprofit organization", { exact: true })
    .selectOption(nonprofit.id);
  await page.getByRole("button", { name: "Open nonprofit workspace" }).click();
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .click();
  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Eligibility policy", exact: true })
    .click();
  await expect(
    page.getByLabel("Authorized destinations (one per line)"),
  ).toHaveValue(project.eligibilityPolicy.destinations[0]);
  await page.getByLabel("Campaign terms version").fill("local-v2");
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-eligibility-policy.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: `${name} creative`, exact: true }),
    })
    .click();
  await expect(
    page.getByText("CURRENT_TERMS_REQUIRED", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve post" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record scoped rights hold" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Demo role").selectOption("admin");
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: `${name} creative`, exact: true }),
    })
    .click();
  await page
    .getByLabel("Exception reason or corrected fact")
    .fill("Fictional license complaint");
  await page
    .getByLabel("Supporting evidence")
    .fill("DEMO complaint reference 12");
  await page.getByRole("button", { name: "Record scoped rights hold" }).click();
  await expect(
    page.getByRole("dialog").getByText("On hold", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Exception reason or corrected fact")
    .fill("License belongs to a different asset");
  await page.getByRole("button", { name: "Appeal this hold" }).click();
  await expect(
    page.getByText("Appeal: License belongs to a different asset"),
  ).toBeVisible();
  await page
    .getByLabel("Exception reason or corrected fact")
    .fill("Complaint identified wrong asset");
  await page
    .getByLabel("Supporting evidence")
    .fill("Verified fictional license record 13");
  await page
    .getByRole("button", { name: "Record corrected hold fact & rerun" })
    .click();
  await expect(
    page.getByRole("dialog").getByText("Needs fixes", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("CURRENT_TERMS_REQUIRED", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-exception-evidence.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

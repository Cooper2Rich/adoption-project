import { expect, test, type Page } from "@playwright/test";
import { openWorkspaceMenu, selectCreator, selectOwner } from "./helpers.ts";

async function openProfile(page: Page, mobile: boolean) {
  const main = page.getByRole("navigation", {
    name: mobile ? "Mobile workspace navigation" : "Workspace shortcuts",
    exact: true,
  });
  await main.getByRole("link", { name: "Profile", exact: true }).click();
  return main;
}

const cases = [
  {
    role: "creator",
    label: "Creator",
    nameLabel: "Display name",
    detailLabel: "Portfolio URL",
    detail: "https://example.com/portfolio",
    alert: "Project invitations",
    digest: "Earnings summary frequency",
  },
  {
    role: "nonprofit",
    label: "Campaign Owner",
    nameLabel: "Organization name",
    detailLabel: "Organization website",
    detail: "https://example.com/mission",
    alert: "Project request decisions",
    digest: "Campaign report frequency",
  },
  {
    role: "admin",
    label: "Admin",
    nameLabel: "Display name",
    detailLabel: "Team",
    detail: "Campaign operations",
    alert: "Eligibility exceptions",
    digest: "Review digest frequency",
  },
];

for (const scenario of cases) {
  test(`${scenario.label} profile saves details and role-specific settings`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("./#/explore");
    if (scenario.role === "creator") await selectCreator(page, "Maya Chen");
    else if (scenario.role === "nonprofit")
      await selectOwner(page, "Nocturne Coffee · fictional");
    else await page.getByLabel("Demo role").selectOption("admin");
    const mobile = info.project.name === "mobile";
    const main = await openProfile(page, mobile);
    await expect(
      page.getByRole("heading", {
        name: `${scenario.label} profile`,
        exact: true,
      }),
    ).toBeVisible();
    const name = `${scenario.label} demo profile`;
    await page.getByLabel(scenario.nameLabel, { exact: true }).fill(name);
    await page
      .getByLabel("Contact email", { exact: true })
      .fill("demo@example.com");
    await page
      .getByLabel(scenario.detailLabel, { exact: true })
      .fill(scenario.detail);
    await page.getByLabel("Preferred reporting time zone").selectOption("UTC");
    await page.getByLabel(scenario.digest).selectOption("Monthly");
    await page
      .getByRole("checkbox", { name: scenario.alert, exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByText("Changes saved on this browser.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".workspace-identity strong")).toHaveText(name);
    await page.reload();
    await expect(
      page.getByLabel(scenario.nameLabel, { exact: true }),
    ).toHaveValue(name);
    await expect(page.getByLabel("Contact email", { exact: true })).toHaveValue(
      "demo@example.com",
    );
    await expect(
      page.getByLabel(scenario.detailLabel, { exact: true }),
    ).toHaveValue(scenario.detail);
    await expect(page.getByLabel("Preferred reporting time zone")).toHaveValue(
      "UTC",
    );
    await expect(page.getByLabel(scenario.digest)).toHaveValue("Monthly");
    await expect(
      page.getByRole("checkbox", { name: scenario.alert, exact: true }),
    ).not.toBeChecked();
    await page
      .getByLabel(scenario.nameLabel, { exact: true })
      .fill("Unsaved edit");
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(
      page.getByLabel(scenario.nameLabel, { exact: true }),
    ).toHaveValue(name);
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeDisabled();
    await openWorkspaceMenu(page);
    const secondary = page.getByRole("navigation", {
      name: "Main navigation",
      exact: true,
    });
    await expect(secondary.getByRole("link")).toHaveCount(5);
    await secondary
      .getByRole("link", { name: "Appearance", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Appearance", exact: true }),
    ).toBeInViewport();
    await openWorkspaceMenu(page);
    await secondary
      .getByRole("link", { name: "Account settings", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Account settings", exact: true }),
    ).toBeInViewport();
    await expect(
      main.getByRole("link", { name: "Profile", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Account settings", exact: true }),
    ).toBeInViewport();
    await page.keyboard.press("Control+Home");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.screenshot({
      path: `test-results/profile-${scenario.role}-${info.project.name}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (mobile) {
      await page.setViewportSize({ width: 320, height: 700 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

test("profile preferences are isolated between identities and roles", async ({
  page,
}, info) => {
  await page.goto("./#/explore");
  const mobile = info.project.name === "mobile";
  await selectCreator(page, "Maya Chen");
  await openProfile(page, mobile);
  await page.getByLabel("Display name", { exact: true }).fill("Maya's profile");
  await page
    .getByRole("checkbox", { name: "Project invitations", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await selectCreator(page, "Alex River · fictional");
  await openProfile(page, mobile);
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
    "Alex River · fictional",
  );
  await expect(
    page.getByRole("checkbox", { name: "Project invitations", exact: true }),
  ).toBeChecked();
  await selectOwner(page, "Nocturne Coffee · fictional");
  await openProfile(page, mobile);
  await expect(page.getByLabel("Organization name")).toHaveValue(
    "Nocturne Coffee · fictional",
  );
  await expect(page.getByLabel("Portfolio URL")).toHaveCount(0);
  await page.getByLabel("Organization name").fill("Coffee community");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await selectOwner(page, "Riverkind Collective · fictional");
  await openProfile(page, mobile);
  await expect(page.getByLabel("Organization name")).toHaveValue(
    "Riverkind Collective · fictional",
  );
  await selectOwner(page, "Nocturne Coffee · fictional");
  await openProfile(page, mobile);
  await expect(page.getByLabel("Organization name")).toHaveValue(
    "Coffee community",
  );
  await page.getByLabel("Demo role").selectOption("admin");
  await openProfile(page, mobile);
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
    "Demo Administrator",
  );
  await expect(page.getByLabel("Organization website")).toHaveCount(0);
  await selectCreator(page, "Maya Chen");
  await openProfile(page, mobile);
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
    "Maya's profile",
  );
  await expect(
    page.getByRole("checkbox", { name: "Project invitations", exact: true }),
  ).not.toBeChecked();
});

test("failed profile saves preserve edits without changing the saved identity", async ({
  page,
}, info) => {
  await page.goto("./#/explore");
  await page.getByLabel("Demo role").selectOption("admin");
  await openProfile(page, info.project.name === "mobile");
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Unsaved administrator");
  await page
    .getByLabel("Upload profile picture", { exact: true })
    .setInputFiles("public/images/forest.jpg");
  await expect(
    page.getByRole("button", { name: "Replace profile picture", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("ripple-public-role-profile-v1:"))
        throw new DOMException("Storage full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your changes could not be saved",
  );
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
    "Unsaved administrator",
  );
  await expect(page.locator(".workspace-identity strong")).toHaveText(
    "Demo Administrator",
  );
  await expect(page.locator(".profile-image-upload img")).toBeVisible();
  await expect(
    page.locator(".workspace-identity img, .role-profile-summary img"),
  ).toHaveCount(0);
  await expect(
    page.getByText("Changes saved on this browser.", { exact: true }),
  ).toHaveCount(0);
});

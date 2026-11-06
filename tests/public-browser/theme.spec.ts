import { test, expect } from "@playwright/test";
import { selectCreator, selectOwner } from "./helpers";

test("adoption.is branding and themes follow every workspace", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  const picker = page.getByLabel("Website theme");
  await expect(picker).toHaveValue("light");
  await expect(page).toHaveTitle(/adoption\.is/);
  await expect(page.locator(".adoption-logo:visible").first()).toHaveAttribute(
    "aria-label",
    "adoption.is",
  );
  await expect(page.locator("body")).not.toContainText(
    /Kindred Reach|Blue Ripple|Welcome to Slander/,
  );
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    /kindred-reach-favicon\.png/,
  );
  const mark = page.locator(".adoption-logo:visible .adoption-mark").first();
  await expect(mark).toHaveAttribute("src", /brand\/adoption-is-mark\.png$/);
  await expect(mark).toBeVisible();
  await expect
    .poll(() => mark.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(324);
  await expect(page.locator("#home-title")).toHaveCSS(
    "text-transform",
    "uppercase",
  );
  await expect(page.locator(".hero-actions .button.primary")).toHaveCSS(
    "background-color",
    "rgb(111, 77, 56)",
  );
  await expect(page.locator(".hero-actions .button.primary")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  for (const route of ["/", "/about", "/explore", "/leaderboard", "/viewer"]) {
    await page.goto(`./#${route}`);
    await expect(picker).toHaveValue("light");
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(246, 243, 237)",
    );
    await expect(page).toHaveTitle(/adoption\.is/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await picker.selectOption("dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(19, 27, 43)",
  );
  await selectCreator(page);
  await expect(picker).toHaveValue("dark");
  await selectOwner(page);
  await expect(picker).toHaveValue("dark");
  await page.getByLabel("Demo role").selectOption("admin");
  await page.reload();
  await expect(picker).toHaveValue("dark");
  expect(errors).toEqual([]);
});

for (const role of ["creator", "nonprofit", "admin"]) {
  test(`${role} profile changes appearance immediately and persists it`, async ({
    page,
  }) => {
    await page.goto("./#/explore");
    if (role === "creator") await selectCreator(page);
    else if (role === "nonprofit") await selectOwner(page);
    else await page.getByLabel("Demo role").selectOption("admin");
    await page.goto("./#/profile");
    const profileTheme = page.getByLabel("Color theme", { exact: true });
    const headerTheme = page.getByLabel("Website theme");
    await expect(profileTheme).toHaveValue("light");
    await profileTheme.selectOption("dark");
    await expect(headerTheme).toHaveValue("dark");
    await expect(page.locator(".role-profile-panel").first()).toHaveCSS(
      "background-color",
      "rgb(27, 38, 56)",
    );
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeDisabled();
    await page.reload();
    await expect(profileTheme).toHaveValue("dark");
    await headerTheme.selectOption("light");
    await expect(profileTheme).toHaveValue("light");
    await expect(page.locator(".role-profile-panel").first()).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
  });
}

test("theme updates synchronize across tabs and reset to light", async ({
  page,
  context,
}) => {
  await page.goto("./");
  const other = await context.newPage();
  await other.goto("./");
  await page.getByLabel("Website theme").selectOption("dark");
  await expect(other.getByLabel("Website theme")).toHaveValue("dark");
  await page.evaluate(() => localStorage.removeItem("adoption-is-theme-v1"));
  await expect(other.getByLabel("Website theme")).toHaveValue("light");
});

test("unavailable storage still allows session theme changes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "adoption-is-theme-v1")
        throw new Error("Storage unavailable");
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "adoption-is-theme-v1")
        throw new Error("Storage unavailable");
      return setItem.call(this, key, value);
    };
  });
  await page.goto("./");
  await page.getByLabel("Website theme").selectOption("dark");
  await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
});

test("adoption.is ignores previous brand theme preferences", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("kindred-reach-theme-v1", "dark"),
  );
  await page.goto("./");
  await expect(page.getByLabel("Website theme")).toHaveValue("light");
});

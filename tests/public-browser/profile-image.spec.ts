import { expect, test, type Page } from "@playwright/test";
import { openWorkspaceMenu, selectCreator, selectOwner } from "./helpers.ts";

async function profileTab(page: Page, mobile: boolean) {
  const main = page.getByRole("navigation", {
    name: mobile ? "Mobile workspace navigation" : "Workspace shortcuts",
    exact: true,
  });
  await main.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page.locator(".profile-image-upload")).toBeVisible();
}

async function upload(
  page: Page,
  label: string,
  path = "public/images/forest.jpg",
) {
  await page.getByLabel(`Upload ${label}`, { exact: true }).setInputFiles(path);
  await expect(
    page.getByRole("button", { name: `Replace ${label}`, exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".profile-image-upload img")).toBeVisible();
  return page.locator(".profile-image-upload img").getAttribute("src");
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Changes saved on this browser.", { exact: true }),
  ).toBeVisible();
}

for (const role of ["creator", "nonprofit", "admin"]) {
  test(`${role} can preview, save, replace and remove its profile image`, async ({
    page,
  }, info) => {
    const mobile = info.project.name === "mobile";
    const label =
      role === "nonprofit" ? "organization logo" : "profile picture";
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("./#/explore");
    if (role === "creator") await selectCreator(page, "Maya Chen");
    else if (role === "nonprofit")
      await selectOwner(page, "Nocturne Coffee · fictional");
    else await page.getByLabel("Demo role").selectOption("admin");
    await profileTab(page, mobile);
    const mainImage = page
      .getByRole("navigation", {
        name: mobile ? "Mobile workspace navigation" : "Workspace shortcuts",
        exact: true,
      })
      .getByRole("link", { name: "Profile", exact: true })
      .locator("img");
    const first = await upload(page, label);
    expect(first).toMatch(/^data:image\/webp;base64,/);
    await expect(page.locator(".role-profile-summary img")).toHaveCount(0);
    await expect(page.locator(".workspace-identity img")).toHaveCount(0);
    await save(page);
    await expect(page.locator(".role-profile-summary img")).toHaveAttribute(
      "src",
      first!,
    );
    await expect(page.locator(".workspace-identity img")).toHaveAttribute(
      "src",
      first!,
    );
    await expect(mainImage).toHaveAttribute("src", first!);
    await page.reload();
    await expect(page.locator(".role-profile-summary img")).toHaveAttribute(
      "src",
      first!,
    );
    await expect
      .poll(() =>
        page
          .locator(".role-profile-summary img")
          .evaluate(
            (image: HTMLImageElement) =>
              image.complete &&
              image.naturalWidth > 0 &&
              Math.max(image.naturalWidth, image.naturalHeight) <= 512,
          ),
      )
      .toBe(true);
    await expect(page.locator(".role-profile-summary img")).toHaveCSS(
      "object-fit",
      role === "nonprofit" ? "contain" : "cover",
    );
    await openWorkspaceMenu(page);
    await expect(page.locator(".workspace-identity img")).toBeVisible();
    await expect(page.locator(".workspace-identity .avatar")).toHaveCSS(
      "border-radius",
      role === "nonprofit" ? "8px" : "50%",
    );
    await page.screenshot({
      path: `test-results/profile-image-${role}-${info.project.name}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const second = await upload(page, label, "public/images/seedling.jpg");
    expect(second).not.toBe(first);
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(page.locator(".profile-image-upload img")).toHaveAttribute(
      "src",
      first!,
    );
    await expect(page.locator(".workspace-identity img")).toHaveAttribute(
      "src",
      first!,
    );
    // Re-selecting the same file after discarding should still process it.
    await upload(page, label, "public/images/seedling.jpg");
    await save(page);
    await page.reload();
    await expect(page.locator(".workspace-identity img")).toHaveAttribute(
      "src",
      second!,
    );
    await page
      .getByRole("button", { name: `Remove ${label}`, exact: true })
      .click();
    await expect(page.locator(".profile-image-upload img")).toHaveCount(0);
    await expect(page.locator(".role-profile-summary img")).toHaveAttribute(
      "src",
      second!,
    );
    await save(page);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: /profile$/, level: 1 }),
    ).toBeVisible();
    await expect(
      page.locator(
        ".role-profile-summary img, .workspace-identity img, .profile-image-upload img",
      ),
    ).toHaveCount(0);
    await expect(mainImage).toHaveCount(0);
    await expect(page.locator(".role-profile-summary .avatar")).not.toBeEmpty();
    expect(errors).toEqual([]);
  });
}

test("invalid or oversized uploads preserve the saved image", async ({
  page,
}, info) => {
  await page.goto("./#/explore");
  await page.getByLabel("Demo role").selectOption("admin");
  await profileTab(page, info.project.name === "mobile");
  const image = await upload(page, "profile picture");
  await save(page);
  const input = page.getByLabel("Upload profile picture", { exact: true });
  await input.setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "This image could not be opened",
  );
  await expect(page.locator(".profile-image-upload img")).toHaveAttribute(
    "src",
    image!,
  );
  await input.setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("notes"),
  });
  await expect(page.getByRole("alert")).toHaveText(
    "Choose a JPG, PNG or WebP image.",
  );
  await input.setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toHaveText(
    "Choose an image up to 5 MB.",
  );
  await expect(page.locator(".workspace-identity img")).toHaveAttribute(
    "src",
    image!,
  );
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
});

test("profile pictures and logos stay with the selected identity and role", async ({
  page,
}, info) => {
  const mobile = info.project.name === "mobile";
  await page.goto("./#/explore");
  await selectCreator(page, "Maya Chen");
  await profileTab(page, mobile);
  const creatorImage = await upload(page, "profile picture");
  await save(page);
  await selectCreator(page, "Alex River · fictional");
  await profileTab(page, mobile);
  await expect(
    page.locator(".workspace-identity img, .role-profile-summary img"),
  ).toHaveCount(0);
  await selectOwner(page, "Nocturne Coffee · fictional");
  await profileTab(page, mobile);
  await expect(page.locator(".workspace-identity img")).toHaveCount(0);
  const logo = await upload(
    page,
    "organization logo",
    "public/images/seedling.jpg",
  );
  await save(page);
  await selectOwner(page, "Riverkind Collective · fictional");
  await profileTab(page, mobile);
  await expect(
    page.locator(".workspace-identity img, .role-profile-summary img"),
  ).toHaveCount(0);
  await page.getByLabel("Demo role").selectOption("admin");
  await profileTab(page, mobile);
  await expect(
    page.locator(".workspace-identity img, .role-profile-summary img"),
  ).toHaveCount(0);
  await selectCreator(page, "Maya Chen");
  await expect(page.locator(".workspace-identity img")).toHaveAttribute(
    "src",
    creatorImage!,
  );
  await selectOwner(page, "Nocturne Coffee · fictional");
  await expect(page.locator(".workspace-identity img")).toHaveAttribute(
    "src",
    logo!,
  );
});

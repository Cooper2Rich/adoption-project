import { expect, test } from "@playwright/test";

test("ordinary workspace errors still retry without reloading the document", async ({
  page,
}) => {
  await page.goto("./#/explore");
  await expect(page.locator(".ad-card")).toHaveCount(7);
  await page.route("**/assets/api-*.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `let fail = true;
    export async function publicApi(path) {
      if (fail) { if (path === '/workspace') fail = false; throw new Error('Temporary workspace problem'); }
      return path === '/demo-options' ? {creators: [], nonprofits: []} : {projects: [], posts: [], approvedPosts: [], activity: []};
    }`,
    }),
  );
  await page.getByLabel("Demo role").selectOption("admin");
  await expect(page.getByRole("alert")).toContainText(
    "Temporary workspace problem",
  );
  await expect(
    page.getByRole("button", { name: "Reload demo", exact: true }),
  ).toHaveCount(0);
  const url = page.url();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Campaigns.", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page).toHaveURL(url);
});

test("a missing deployment chunk offers a real reload and preserves browser data", async ({
  page,
}) => {
  await page.goto("./#/explore");
  await expect(page.locator(".ad-card")).toHaveCount(7);
  const originalIds = await page.evaluate(() => {
    localStorage.setItem(
      "slander-public-viewers-v1",
      JSON.stringify({
        profiles: [
          {
            id: "saved-viewer",
            name: "Saved viewer",
            email: "saved@example.test",
            role: "viewer",
          },
        ],
        activeId: "saved-viewer",
        support: [
          {
            id: "saved-gift",
            viewerId: "saved-viewer",
            adId: "sample-1",
            title: "It starts with one tree",
            amountCents: 2500,
            at: "2026-10-24T12:00:00Z",
          },
        ],
      }),
    );
    return JSON.parse(localStorage.getItem("slander-public-workspace-v1")!)
      .posts.map((post: { id: string }) => post.id)
      .sort();
  });
  await page.route("**/assets/api-*.js", (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/plain",
      body: "Removed deployment asset",
    }),
  );
  await page.getByLabel("Demo role").selectOption("admin");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Reload");
  await expect(page.getByRole("alert")).not.toContainText(
    "Failed to fetch dynamically imported module",
  );
  const reload = page.getByRole("button", { name: "Reload demo", exact: true });
  await expect(reload).toBeVisible();
  await page.unroute("**/assets/api-*.js");
  await reload.click();
  await expect(page).toHaveURL(/v=\d+.*#\/campaigns$/);
  await expect(
    page.getByRole("heading", { name: "Campaigns.", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Demo role")).toHaveValue("admin");
  const saved = await page.evaluate(() => ({
    viewer: JSON.parse(localStorage.getItem("slander-public-viewers-v1")!),
    ids: JSON.parse(localStorage.getItem("slander-public-workspace-v1")!)
      .posts.map((post: { id: string }) => post.id)
      .sort(),
  }));
  expect(saved.ids).toEqual(originalIds);
  expect(saved.viewer.activeId).toBe("saved-viewer");
  expect(saved.viewer.support[0].amountCents).toBe(2500);
});

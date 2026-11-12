import { expect, test } from "@playwright/test";
import { navigate, selectCreator } from "./helpers.ts";

test("creators retain their withdrawn, ended, archived and unpublished ads without seeing another creator's history", async ({
  page,
}) => {
  await page.goto("./#/explore");
  await expect(page.locator(".ad-card")).toHaveCount(7);
  await page.evaluate(() => {
    const key = "slander-public-workspace-v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    const campaign = state.projects.find(
      (p: { id: string }) => p.id === "nocturne-coffee-showcase-v1",
    );
    const original = state.posts.find(
      (p: { id: string }) => p.id === "nocturne-midnight",
    );
    for (const reason of [
      "withdrawn",
      "ended",
      "archived",
      "unpublished",
      "foreign",
    ]) {
      const project = {
        ...structuredClone(campaign),
        id: `history-${reason}`,
        name: `Past ${reason} campaign`,
      };
      if (reason === "ended") project.endDate = "2026-01-01";
      if (reason === "archived" || reason === "foreign")
        project.status = "archived";
      if (reason === "unpublished") project.status = "draft";
      const post = {
        ...structuredClone(original),
        id: `history-${reason}-ad`,
        title: `Historical ${reason} film`,
        projectId: project.id,
      };
      if (reason === "withdrawn") post.withdrawnAt = new Date().toISOString();
      if (reason === "foreign") post.creatorId = "another-creator";
      state.projects.push(project);
      state.posts.push(post);
    }
    localStorage.setItem(key, JSON.stringify(state));
  });
  await selectCreator(page, "Nocturne Studio · fictional");
  await navigate(page, "Past ads");
  await expect(
    page.getByRole("heading", { name: "Past ads.", exact: true }),
  ).toBeVisible();
  const cards = page.locator(".creator-card");
  await expect(cards).toHaveCount(4);
  await expect(
    page.getByRole("tab", { name: "Past ads", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByText("Historical foreign film", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".past-ad-badge")).toHaveText([
    "Withdrawn",
    "Campaign ended",
    "Campaign archived",
    "Campaign unpublished",
  ]);
  await expect(cards.getByRole("button", { name: "View & edit" })).toHaveCount(
    0,
  );
  await page.getByLabel("Search workspace").fill("unpublished");
  await expect(cards).toHaveCount(1);
  await cards.getByRole("button", { name: "View past ad" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Historical unpublished film",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "retained for your records",
  );
  await expect
    .poll(() =>
      page
        .getByRole("dialog")
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.readyState),
    )
    .toBeGreaterThan(1);
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Edit & resubmit" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await expect(cards).toHaveCount(4);
  await page.getByRole("tab", { name: "Current", exact: true }).click();
  await expect(cards).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

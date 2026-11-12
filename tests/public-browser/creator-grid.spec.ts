import { expect, test } from "@playwright/test";
import { navigate, selectCreator } from "./helpers.ts";

test("compact creator cards adapt to the workspace and play private media in current ads and personal archives", async ({
  page,
}, info) => {
  await page.goto("./#/explore");
  await expect(page.locator(".ad-card")).toHaveCount(7);
  // Model an existing private upload using a real bundled film. It has no
  // public projection, so the creator player must use its scoped media access.
  await page.evaluate(async () => {
    const blob = await (
      await fetch(
        document.querySelector<HTMLVideoElement>(".ad-card video")!.src,
      )
    ).blob();
    const media = "/api/media/private-creator-film";
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("slander-public-media-v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("files", "readwrite");
      transaction.objectStore("files").put(blob, media);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    const key = "slander-public-workspace-v1",
      state = JSON.parse(localStorage.getItem(key)!);
    const post = state.posts.find(
      (p: { id: string }) => p.id === "nocturne-midnight",
    );
    post.media = media;
    state.creativeHolds.push({
      id: "private-film-hold",
      postId: post.id,
      code: "EVIDENCE_CONFLICT",
      reason: "Private upload fixture awaiting review.",
      evidence: "Browser test fixture",
    });
    state.uploads.push({
      media,
      mediaType: "video",
      creatorId: post.creatorId,
    });
    localStorage.setItem(key, JSON.stringify(state));
  });
  await selectCreator(page, "Nocturne Studio · fictional");
  await navigate(page, "My ads");
  const cards = page.locator(".creator-card"),
    first = cards.first(),
    video = first.locator("video");
  await expect(cards).toHaveCount(3);
  await expect(
    cards.nth(1).getByRole("link", { name: "Public profile ↗" }),
  ).toBeVisible();
  await expect(
    first.getByRole("link", { name: "Public profile ↗" }),
  ).toHaveCount(0);
  await expect(first.locator(".ad-stats dd")).toHaveText(["N/A", "N/A", "N/A"]);
  await expect(video).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.duration))
    .toBeGreaterThanOrEqual(15);
  await first
    .getByRole("button", { name: "Play Your midnight ritual" })
    .click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.1);
  await video.evaluate((v: HTMLVideoElement) => v.pause());
  for (const [width, columns] of [
    [1440, 3],
    [713, 2],
    [390, 1],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page
          .locator(".creator-ads .ad-grid")
          .evaluate(
            (grid) =>
              getComputedStyle(grid).gridTemplateColumns.split(" ").length,
          ),
      )
      .toBe(columns);
    expect((await first.boundingBox())!.width).toBeLessThan(400);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 1440)
      await page.screenshot({
        path: `test-results/creator-compact-${info.project.name}.png`,
        fullPage: true,
      });
  }
  await page.evaluate(() => {
    const key = "slander-public-workspace-v1",
      state = JSON.parse(localStorage.getItem(key)!);
    state.projects.find(
      (p: { id: string }) => p.id === "nocturne-coffee-showcase-v1",
    ).status = "archived";
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole("tab", { name: "Past ads" }).click();
  await expect(cards).toHaveCount(3);
  await expect(video).toHaveAttribute("src", /^blob:/);
  await first
    .getByRole("button", { name: "Play Your midnight ritual" })
    .click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.1);
  await first.getByRole("button", { name: "View past ad" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Your archived creative",
  );
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Demo role").selectOption("public");
  await expect(page.locator(".ad-card")).toHaveCount(4);
  await expect(
    page.getByRole("heading", { name: "Your midnight ritual", exact: true }),
  ).toHaveCount(0);
});

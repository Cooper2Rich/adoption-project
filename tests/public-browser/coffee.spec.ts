import { expect, test } from "@playwright/test";
import { navigate, selectCreator } from "./helpers.ts";

test("finished coffee collection has three playable films over 15 seconds, with sound and scoped creator access", async ({
  page,
}, info) => {
  await page.goto("./#/explore");
  await page.getByLabel("Filter by cause").selectOption("Coffee & culture");
  await expect(page.locator(".ad-card")).toHaveCount(3);
  await expect(page.locator(".ad-duration")).toHaveCount(3);
  const videos = page.locator(".ad-card video");
  for (const video of await videos.all()) {
    await expect(video).toHaveAttribute("src", /-filmed-v2\.webm\?v=20261024$/);
    await expect
      .poll(() =>
        video.evaluate(
          (element: HTMLVideoElement) =>
            Number.isFinite(element.duration) && element.duration >= 15,
        ),
      )
      .toBe(true);
    expect(
      await video.evaluate((element: HTMLVideoElement) => element.duration),
    ).toBeLessThan(18);
    const response = await page.request.get((await video.getAttribute("src"))!);
    expect(response.ok()).toBe(true);
    expect((await response.body()).includes(Buffer.from("A_OPUS"))).toBe(true);
  }
  await page.getByLabel("Filter by cause").blur();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: `test-results/coffee-${info.project.name}-discovery.png`,
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "View Your midnight ritual", exact: true })
    .click();
  const player = page.locator(".profile-media video");
  // Use the native controls to choose full playback rather than the new
  // muted hover preview that may already be running under the pointer.
  await player.dispatchEvent("pointerdown");
  await player.evaluate((video: HTMLVideoElement) => video.play());
  await expect
    .poll(() => player.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeGreaterThan(0.1);
  expect(await player.evaluate((video: HTMLVideoElement) => video.muted)).toBe(
    false,
  );
  await player.evaluate((video: HTMLVideoElement) => {
    video.currentTime = 14;
  });
  await expect
    .poll(() => player.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeGreaterThan(14);
  await player.evaluate((video: HTMLVideoElement) => video.pause());
  await page.screenshot({
    path: `test-results/coffee-${info.project.name}-film.png`,
    fullPage: true,
  });
  await selectCreator(page, "Nocturne Studio · fictional");
  await navigate(page, "My ads");
  await expect(page.locator(".creator-card")).toHaveCount(3);
  const creatorCard = page.locator(".creator-card").first();
  const creatorVideo = creatorCard.locator("video");
  await expect(creatorCard).toContainText("32,400");
  await creatorCard
    .getByRole("button", { name: "Play Your midnight ritual" })
    .click();
  await expect
    .poll(() =>
      creatorVideo.evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(0.1);
  expect(
    await creatorVideo.evaluate((video: HTMLVideoElement) => ({
      muted: video.muted,
      controls: video.controls,
      loop: video.loop,
    })),
  ).toEqual({ muted: false, controls: true, loop: false });
  await page.getByRole("heading", { name: "My ads.", exact: true }).hover();
  expect(
    await creatorVideo.evaluate((video: HTMLVideoElement) => video.paused),
  ).toBe(false);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "View Your midnight ritual", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await creatorVideo.evaluate((video: HTMLVideoElement) => video.paused),
  ).toBe(true);
  await expect
    .poll(() =>
      page
        .getByRole("dialog")
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.duration),
    )
    .toBeGreaterThanOrEqual(15);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({
    path: `test-results/coffee-${info.project.name}-creator.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator(".creator-card")).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("old photo-based coffee ads receive a new filmed revision without losing edits, withdrawals or giving", async ({
  page,
}) => {
  await page.goto("./#/explore");
  await expect(page.locator(".ad-card")).toHaveCount(7);
  const previous = await page.evaluate(() => {
    const key = "slander-public-workspace-v1",
      state = JSON.parse(localStorage.getItem(key)!);
    state.coffeeShowcaseVersion = 1;
    for (const post of state.posts.filter((p: { id: string }) =>
      p.id.startsWith("nocturne-"),
    ))
      post.media = `/videos/${post.id}.webm`;
    const edited = state.posts.find(
      (p: { id: string }) => p.id === "nocturne-midnight",
    );
    edited.title = "My edited coffee story";
    const withdrawn = state.posts.find(
      (p: { id: string }) => p.id === "nocturne-afterhours",
    );
    withdrawn.withdrawnAt = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem(
      "slander-public-viewers-v1",
      JSON.stringify({
        profiles: [],
        activeId: null,
        support: [{ id: "kept-gift", adId: edited.id, amountCents: 4200 }],
      }),
    );
    return {
      revision: edited.revision,
      snapshots: edited.snapshots.length,
      withdrawnAt: withdrawn.withdrawnAt,
    };
  });
  await page.reload();
  await expect(page.locator(".ad-card")).toHaveCount(6);
  await page.reload();
  await expect(page.locator(".ad-card")).toHaveCount(6);
  const saved = await page.evaluate(() => ({
    workspace: JSON.parse(localStorage.getItem("slander-public-workspace-v1")!),
    viewers: JSON.parse(localStorage.getItem("slander-public-viewers-v1")!),
  }));
  const edited = saved.workspace.posts.find(
    (p: { id: string }) => p.id === "nocturne-midnight",
  );
  expect(edited.media).toContain("-filmed-v2.webm");
  expect(edited.title).toBe("My edited coffee story");
  expect(edited.revision).toBe(previous.revision + 1);
  expect(edited.snapshots.length).toBe(previous.snapshots + 1);
  expect(
    saved.workspace.posts.find(
      (p: { id: string }) => p.id === "nocturne-afterhours",
    ).withdrawnAt,
  ).toBe(previous.withdrawnAt);
  expect(saved.viewers.support[0].amountCents).toBe(4200);
});

test("Blue Ripple Media controls and text remain readable in public and creator views", async ({
  page,
}) => {
  const check = async (selectors: string[]) => {
    const results = await page.evaluate((selectors) => {
      const rgba = (value: string) =>
        (value.match(/[\d.]+/g) || []).map(Number);
      const luminance = (rgb: number[]) =>
        rgb
          .slice(0, 3)
          .map((v) => {
            const c = v / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          })
          .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0);
      return selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector))
          .filter(
            (element) =>
              element.getBoundingClientRect().width &&
              !(element as HTMLButtonElement).disabled,
          )
          .map((element) => {
            const foreground = rgba(getComputedStyle(element).color);
            let background = [0, 0, 0];
            const layers = [];
            let parent: HTMLElement | null = element;
            while (parent) {
              layers.unshift(rgba(getComputedStyle(parent).backgroundColor));
              parent = parent.parentElement;
            }
            for (const layer of layers) {
              const alpha = layer[3] ?? 1;
              background = background.map(
                (c, i) => (layer[i] || 0) * alpha + c * (1 - alpha),
              );
            }
            const a = luminance(foreground),
              b = luminance(background);
            return {
              selector,
              text: element.innerText.slice(0, 45),
              contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
            };
          }),
      );
    }, selectors);
    expect(results.length).toBeGreaterThan(5);
    for (const result of results)
      expect(
        result.contrast,
        `${result.selector}: ${result.text}`,
      ).toBeGreaterThanOrEqual(4.5);
  };
  await page.goto("./#/explore");
  await expect(page.locator(".ad-card")).toHaveCount(7);
  await check([
    ".button.primary",
    ".button.secondary",
    ".metrics-note",
    ".ad-stats dt",
    ".inline-play",
    ".ad-duration",
    ".demo-view-picker select",
    ".public-notice",
  ]);
  await selectCreator(page, "Nocturne Studio · fictional");
  await navigate(page, "My ads");
  await expect(page.locator(".creator-card")).toHaveCount(3);
  await check([
    ".button.primary",
    ".button.secondary",
    ".metrics-note",
    ".ad-stats dt",
    ".nav-item.active",
    ".tabs button.active",
    ".role-switch select",
  ]);
});

test("existing browser workspace upgrades once while preserving viewer history and creative edits", async ({
  page,
}) => {
  await page.goto("./#/explore");
  await expect(page.locator(".ad-card")).toHaveCount(7);
  await page.evaluate(() => {
    const key = "slander-public-workspace-v1",
      state = JSON.parse(localStorage.getItem(key)!);
    delete state.coffeeShowcaseVersion;
    state.posts = state.posts.filter(
      (p: { id: string }) => !p.id.startsWith("nocturne-"),
    );
    state.projects = state.projects.filter(
      (p: { id: string }) => !p.id.startsWith("nocturne-"),
    );
    state.posts.find((p: { id: string }) => p.id === "sample-1").feedback =
      "Preserve my demo edits";
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem(
      "slander-public-viewers-v1",
      JSON.stringify({
        profiles: [],
        activeId: null,
        support: [{ id: "existing-gift", adId: "sample-1", amountCents: 2500 }],
      }),
    );
  });
  await page.reload();
  await expect(page.locator(".ad-card")).toHaveCount(7);
  await page.reload();
  await expect(page.locator(".ad-card")).toHaveCount(7);
  const stored = await page.evaluate(() => ({
    workspace: JSON.parse(localStorage.getItem("slander-public-workspace-v1")!),
    viewers: JSON.parse(localStorage.getItem("slander-public-viewers-v1")!),
  }));
  expect(
    stored.workspace.posts.find((p: { id: string }) => p.id === "sample-1")
      .feedback,
  ).toBe("Preserve my demo edits");
  expect(stored.viewers.support[0].amountCents).toBe(2500);
});

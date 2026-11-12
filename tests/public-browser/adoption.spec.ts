import { expect, test } from "@playwright/test";
import { navigate } from "./helpers.ts";

test("Adoption Is contains the ACU project and the original 60-second ad with sound and previews", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./#/explore");
  await page.getByLabel("Filter by cause").selectOption("Adoption");
  const cards = page.locator(".ad-card");
  await expect(cards).toHaveCount(1);
  await expect(page.locator(".ad-duration")).toHaveText(["1:00"]);
  for (const title of ["The Girl in the Middle"]) {
    const card = cards.filter({
      has: page.getByRole("heading", { name: title, exact: true }),
    });
    const video = card.locator("video");
    await expect(video).toHaveAttribute("src", /\/videos\/adoption\/.+\.mp4/);
    await expect(video).toHaveAttribute(
      "poster",
      /\/images\/adoption\/.+\.jpg/,
    );
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.duration))
      .toBeGreaterThanOrEqual(60);
    expect(
      await video.evaluate((v: HTMLVideoElement) => v.duration),
    ).toBeLessThan(61);
    await expect(card.locator(".ad-stats dd")).toHaveText([
      "40,000",
      "4.00%",
      "$2,000.00",
    ]);
    await card.hover();
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(0.1);
    await video.evaluate((v: HTMLVideoElement) => {
      v.currentTime = 5.2;
      v.dispatchEvent(new Event("timeupdate"));
    });
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeLessThan(1);
    await page.mouse.move(1, 1);
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
      .toBe(true);
    await card
      .getByRole("button", { name: `Play ${title}`, exact: true })
      .click();
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(0.1);
    expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(false);
    await video.evaluate((v: HTMLVideoElement) => v.pause());
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/adoption-public-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("Demo role").selectOption("admin");
  const campaign = page.getByRole("link").filter({
    has: page.getByRole("heading", { name: "Adoption Is", exact: true }),
  });
  await campaign.click();
  const project = page.getByRole("link").filter({
    has: page.getByRole("heading", {
      name: "ACU ad competition",
      exact: true,
    }),
  });
  await expect(project).toBeVisible();
  await project.click();
  await expect(
    page.getByRole("heading", { name: "ACU ad competition", exact: true }),
  ).toBeVisible();
  await navigate(page, "Creatives");
  await expect(page.locator(".post-row")).toHaveCount(1);
  await expect(page.locator(".post-thumbnail video")).toHaveCount(1);
  await page.screenshot({
    path: `test-results/adoption-admin-${info.project.name}.png`,
    fullPage: true,
  });
  const before = await page.evaluate(() => {
    const state = JSON.parse(
      localStorage.getItem("slander-public-workspace-v1")!,
    );
    state.posts.find(
      (p: { id: string }) => p.id === "adoption-girl-in-the-middle",
    ).caption = "Retained imported ad edit";
    const girl = state.posts.find(
      (p: { id: string }) => p.id === "adoption-girl-in-the-middle",
    );
    state.posts.push({
      ...structuredClone(girl),
      id: "adoption-duality",
      title: "Duality",
      media: "/videos/adoption/duality.mp4",
    });
    delete state.adoptionDualityRemovalVersion;
    localStorage.setItem("slander-public-workspace-v1", JSON.stringify(state));
    return {
      posts: state.posts.length - 1,
      financials: JSON.stringify(state.sampleFinancials),
    };
  });
  await page.reload();
  await expect(page.locator(".post-row")).toHaveCount(1);
  const after = await page.evaluate(() => {
    const state = JSON.parse(
      localStorage.getItem("slander-public-workspace-v1")!,
    );
    return {
      posts: state.posts.length,
      financials: JSON.stringify(state.sampleFinancials),
      caption: state.posts.find(
        (p: { id: string }) => p.id === "adoption-girl-in-the-middle",
      ).caption,
    };
  });
  expect(after).toEqual({ ...before, caption: "Retained imported ad edit" });
  await expect(page.locator(".post-row")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Duality", exact: true }),
  ).toHaveCount(0);
  await page.goto("./#/ads/adoption-duality");
  await expect(
    page.getByRole("heading", { name: "This ad is unavailable." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

import { expect, test, type Locator } from "@playwright/test";

async function scale(image: Locator) {
  return image.evaluate(
    (element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a,
  );
}

test("how-to cards use loaded local photos in both themes without overflow", async ({
  page,
}, info) => {
  await page.goto("./#/?section=how-it-works");
  const photos = page.locator(".how-step-visual img");
  await expect(photos).toHaveCount(3);
  await expect(page.locator(".how-step-visual svg")).toHaveCount(0);
  for (const theme of ["dark", "light"]) {
    await page.getByLabel("Website theme").selectOption(theme);
    for (const card of await page.locator(".how-steps > div").all()) {
      await expect(card.locator(":scope > span")).toHaveCSS(
        "color",
        "rgb(213, 184, 147)",
      );
      await expect(card.locator("h3")).toHaveCSS("color", "rgb(255, 255, 255)");
    }
    for (const photo of await photos.all()) {
      await photo.scrollIntoViewIfNeeded();
      await expect(photo).toBeVisible();
      await expect(photo).toHaveAttribute("alt", /.+/);
      await expect(photo).toHaveAttribute(
        "src",
        /images\/how-(discover|connect|amplify)\.jpg$/,
      );
      await expect
        .poll(() =>
          photo.evaluate(
            (image: HTMLImageElement) =>
              image.complete && image.naturalWidth > 0,
          ),
        )
        .toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator(".how-steps").screenshot({
      path:
        "test-results/home-photos-" + theme + "-" + info.project.name + ".png",
    });
  }
});

test("photos pan and zoom out in the same frame on hover and keyboard focus", async ({
  page,
}, info) => {
  await page.goto("./#/?section=how-it-works");
  await expect(page.locator(".how-steps > div")).toHaveCount(3);
  for (const card of await page.locator(".how-steps > div").all()) {
    const frame = card.locator(".how-step-visual");
    const photo = frame.locator("img");
    await page.mouse.move(0, 0);
    await frame.scrollIntoViewIfNeeded();
    await expect.poll(() => scale(photo)).toBeCloseTo(1.22, 2);
    const originalFrame = await frame.boundingBox();
    const originalTransform = await photo.evaluate(
      (image) => getComputedStyle(image).transform,
    );
    await frame.hover();
    await expect.poll(() => scale(photo)).toBeCloseTo(1, 2);
    expect(await frame.boundingBox()).toEqual(originalFrame);
    const revealedTransform = await photo.evaluate(
      (image) => getComputedStyle(image).transform,
    );
    expect(revealedTransform).not.toBe(originalTransform);
    await page.mouse.move(0, 0);
    await expect.poll(() => scale(photo)).toBeCloseTo(1.22, 2);
    await card.getByRole("link").focus();
    await expect.poll(() => scale(photo)).toBeCloseTo(1, 2);
    await page.locator(".hero-how-link").focus();
    await expect.poll(() => scale(photo)).toBeCloseTo(1.22, 2);
  }
  await page.locator(".how-step-visual").first().hover();
  await page.locator(".how-steps").screenshot({
    path: "test-results/home-photos-hover-" + info.project.name + ".png",
  });
});

test("reduced motion shows wide photos without animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./#/?section=how-it-works");
  await expect(page.locator(".how-step-visual img")).toHaveCount(3);
  for (const photo of await page.locator(".how-step-visual img").all()) {
    await expect.poll(() => scale(photo)).toBe(1);
    await expect(photo).toHaveCSS("transition-duration", "0s");
    await photo.hover();
    await expect.poll(() => scale(photo)).toBe(1);
    await expect(photo).toHaveCSS("transition-duration", "0s");
  }
});

test.describe("touch devices", () => {
  test.use({ hasTouch: true, isMobile: true });
  test("show wide photos without requiring hover", async ({ page }) => {
    await page.goto("./#/?section=how-it-works");
    await expect(page.locator(".how-step-visual img")).toHaveCount(3);
    for (const photo of await page.locator(".how-step-visual img").all()) {
      await photo.scrollIntoViewIfNeeded();
      await expect(photo).toBeVisible();
      await expect.poll(() => scale(photo)).toBe(1);
    }
  });
});

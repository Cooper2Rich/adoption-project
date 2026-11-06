import { test, expect, type Locator, type Page } from "@playwright/test";

async function scale(image: Locator) {
  return image.evaluate(
    (element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a,
  );
}

// The app scrolls to the top once ads load, so wait for them before scrolling.
async function openHome(page: Page) {
  await page.goto("./#/");
  await page.locator(".hero-feature-copy a").waitFor();
  await page.locator(".mission-scene").waitFor();
}

type Placement = "full" | "half" | "cut-top" | "above" | "below";

// Scrolls the window so the Our Why card sits at the requested placement,
// retrying while late-loading content above it shifts the layout.
async function place(page: Page, placement: Placement) {
  await expect
    .poll(() => scrollTo(page, placement), { timeout: 5000 })
    .toBe(true);
}

async function scrollTo(page: Page, placement: Placement) {
  await scrollOnce(page, placement);
  await page.waitForTimeout(150);
  return page.evaluate((placement) => {
    const { top, bottom } = document
      .querySelector(".mission-scene")!
      .getBoundingClientRect();
    if (placement === "full") return top >= 0 && bottom <= innerHeight;
    if (placement === "above") return bottom < 0;
    if (placement === "below") return top > innerHeight;
    return top < innerHeight && bottom > 0 && (top < 0 || bottom > innerHeight);
  }, placement);
}

async function scrollOnce(page: Page, placement: Placement) {
  await page.evaluate((placement) => {
    const card = document.querySelector(".mission-scene")!;
    const { top, height } = card.getBoundingClientRect();
    const cardTop = top + scrollY;
    const target = {
      full: cardTop - (innerHeight - height) / 2,
      half: cardTop - innerHeight + height / 2,
      "cut-top": cardTop + height * 0.4,
      above: cardTop + height + 60,
      below: cardTop - innerHeight - 60,
    }[placement];
    scrollTo({ top: Math.max(0, target), behavior: "instant" });
  }, placement);
}

async function step(page: Page) {
  return Number(
    await page.locator(".mission-visual").getAttribute("data-step"),
  );
}

async function expectPopulates(page: Page) {
  const visual = page.locator(".mission-visual");
  const nodes = visual.locator(".mission-node");
  const arrows = visual.locator(".mission-arrow");
  await expect(nodes.nth(0)).toHaveClass(/is-shown/);
  await expect(nodes.nth(2)).not.toHaveClass(/is-shown/);
  await expect(arrows.nth(0)).toHaveClass(/is-drawn/);
  await expect(nodes.nth(1)).toHaveClass(/is-shown/);
  await expect(arrows.nth(1)).toHaveClass(/is-drawn/);
  await expect(nodes.nth(2)).toHaveClass(/is-shown/);
  await expect(visual).toHaveAttribute("data-complete", "");
  for (const photo of await nodes.locator("img").all()) {
    await expect.poll(() => scale(photo)).toBeCloseTo(1, 2);
  }
}

test("Our Why uses loaded photos over a landscape backdrop in both themes", async ({
  page,
}, info) => {
  await page.goto("./#/?section=mission");
  const visual = page.locator(".mission-visual");
  const backdrop = visual.locator(".mission-backdrop");
  await expect(backdrop).toHaveAttribute("src", /images\/why-landscape\.jpg$/);
  const photos = visual.locator(".mission-node-photo img");
  await expect(photos).toHaveCount(3);
  await expect(visual.locator(".mission-node-label")).toHaveText([
    "Creators",
    "Causes",
    "Community",
  ]);
  await expect(visual.locator(".mission-arrow")).toHaveCount(2);
  for (const theme of ["dark", "light"]) {
    await page.getByLabel("Website theme").selectOption(theme);
    await place(page, "full");
    await expect(visual).toHaveAttribute("data-complete", "");
    for (const image of [backdrop, ...(await photos.all())]) {
      await expect
        .poll(() =>
          image.evaluate(
            (element: HTMLImageElement) =>
              element.complete && element.naturalWidth > 0,
          ),
        )
        .toBe(true);
    }
    for (const photo of await photos.all()) {
      await expect(photo).toHaveAttribute("alt", /.+/);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect.poll(() => scale(photos.last())).toBeCloseTo(1, 2);
    await visual.screenshot({
      path: "test-results/home-why-" + theme + "-" + info.project.name + ".png",
    });
  }
});

test("populates on a timer once fully in view, then stays while scrolling on", async ({
  page,
}, info) => {
  await openHome(page);
  await place(page, "above");
  await place(page, "half");
  await page.waitForTimeout(1500);
  expect(await step(page)).toBe(0);
  await page.locator(".mission-visual").screenshot({
    path: "test-results/home-why-empty-" + info.project.name + ".png",
  });

  await place(page, "full");
  await expectPopulates(page);

  await place(page, "cut-top");
  await page.waitForTimeout(800);
  await expect(page.locator(".mission-visual")).toHaveAttribute(
    "data-complete",
    "",
  );
});

test("populates again when scrolled back up onto the card", async ({
  page,
}) => {
  await openHome(page);
  await place(page, "full");
  await expect(page.locator(".mission-visual")).toHaveAttribute(
    "data-complete",
    "",
  );
  await place(page, "above");
  await expect.poll(() => step(page)).toBe(0);
  await place(page, "full");
  await expectPopulates(page);
});

test("populates again when scrolled back down onto the card", async ({
  page,
}) => {
  await openHome(page);
  const offscreenAtTop = await page.evaluate(
    () =>
      document.querySelector(".mission-scene")!.getBoundingClientRect().top +
        scrollY >
      innerHeight,
  );
  test.skip(!offscreenAtTop, "card is visible at the top of this viewport");
  await place(page, "full");
  await expect(page.locator(".mission-visual")).toHaveAttribute(
    "data-complete",
    "",
  );
  await place(page, "below");
  await expect.poll(() => step(page)).toBe(0);
  await place(page, "full");
  await expectPopulates(page);
});

test("reduced motion shows the card fully populated without animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHome(page);
  const visual = page.locator(".mission-visual");
  await expect(visual).toHaveAttribute("data-complete", "");
  await place(page, "above");
  await page.waitForTimeout(300);
  await expect(visual).toHaveAttribute("data-complete", "");
  for (const photo of await visual.locator(".mission-node-photo img").all()) {
    await expect.poll(() => scale(photo)).toBe(1);
  }
});

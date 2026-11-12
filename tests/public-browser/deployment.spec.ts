import { expect, test } from "@playwright/test";

test("published demo loads its application, assets and Kindred Reach favicon", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#root")).not.toBeEmpty();
  await expect(
    page.getByRole("banner").getByRole("link", { name: "adoption.is home" }),
  ).toBeVisible();
  const assetUrls = await page
    .locator('script[src], link[rel="stylesheet"], link[rel="icon"]')
    .evaluateAll((elements) =>
      elements.map((element) =>
        element instanceof HTMLScriptElement
          ? element.src
          : (element as HTMLLinkElement).href,
      ),
    );
  const basePath = new URL(page.url()).pathname;
  for (const assetUrl of assetUrls) {
    expect(new URL(assetUrl).pathname).toMatch(new RegExp("^" + basePath));
    const response = await request.get(assetUrl);
    expect(response.ok(), assetUrl).toBe(true);
  }
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    /kindred-reach-favicon\.png$/,
  );
  expect(errors).toEqual([]);
});

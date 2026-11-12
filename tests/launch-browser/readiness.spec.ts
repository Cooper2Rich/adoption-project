import { test, expect as baseExpect } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { resolve } from "node:path";
const expect = baseExpect.configure({ timeout: 30_000 });
test("T09 scoped launch gates remain visible, persist incidents and deny paid activation across sessions", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(150_000);
  const base = String(info.project.use.baseURL),
    scope = { campaignId: "adoption" };
  async function actor(identity = "manager-a") {
    const session = await (
      await page.request.get(
        `${base}/__allocation/session?identity=${identity}`,
      )
    ).json();
    const client = new ConvexHttpClient(session.url);
    client.setAuth(session.token);
    return client;
  }
  const manager = await actor(),
    admin = await actor("administrator");
  for (const client of [manager, admin])
    await client.mutation(
      makeFunctionReference<"mutation">("operatorIncidents:registerContact"),
      scope,
    );
  await manager.mutation(
    makeFunctionReference<"mutation">("operatorIncidents:configure"),
    { ...scope, designatedOperator: "administrator" },
  );
  const scenario = async (value: string) =>
    expect(
      (
        await page.request.post(`${base}/__allocation/readiness`, {
          data: { scenario: value },
        })
      ).status(),
    ).toBe(200);
  await page.goto("/?workspace=manager");
  const navigate = async (target = page, name = "Launch readiness") =>
    target.getByRole("button", { name, exact: true }).click();
  await navigate();
  await expect(
    page.getByRole("heading", { name: "Launch readiness", exact: true }),
  ).toBeVisible();
  for (const gate of ["PG-01", "PG-02", "PG-03", "PG-04", "PG-05", "PG-06"])
    await expect(page.getByTestId(`gate-${gate}`)).toHaveCount(1);
  await expect(
    page.getByText("Paid activation blocked", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Public advertising contribution checkout is unavailable/),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await manager.query(
            makeFunctionReference<"query">("readiness:read"),
            scope,
          )
        ).blockers.length,
    )
    .toBe(23);
  await page
    .getByRole("button", { name: "Check paid activation", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Paid activation denied" }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(`.codex/ralph/t09-${info.project.name}-blocked.png`),
    fullPage: false,
  });
  await scenario("configure");
  await scenario("recover");
  const component = page.getByTestId("readiness-stripe-eligibility");
  await expect(
    component.getByText("Controlled pass · unvalidated", { exact: true }),
  ).toBeVisible();
  await component.getByText("Scope and evidence", { exact: true }).click();
  await expect(
    component.getByText(/Reviewed owner: administrator/),
  ).toBeVisible();
  await expect(
    component.getByText(/Source: owned-readiness-validator/),
  ).toBeVisible();
  await expect(component.getByText(/Recorded blocker: Resolved/)).toBeVisible();
  await component.scrollIntoViewIfNeeded();
  if (info.project.name === "mobile")
    await page.addStyleTag({
      content: ".launch-readiness .tag { font-family: monospace; }",
    });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: resolve(`.codex/ralph/t09-${info.project.name}-evidence.png`),
    fullPage: false,
  });
  const context = await browser.newContext({
    ...info.project.use,
    baseURL: base,
  } as any);
  try {
    const second = await context.newPage();
    await second.goto("/?workspace=manager");
    await navigate(second);
    await expect(
      second
        .getByTestId("readiness-stripe-eligibility")
        .getByText("Controlled pass · unvalidated", { exact: true }),
    ).toBeVisible();
    await scenario("fail");
    await expect(component.getByText("Unmet", { exact: true })).toBeVisible();
    await expect(
      second
        .getByTestId("readiness-stripe-eligibility")
        .getByText("Unmet", { exact: true }),
    ).toBeVisible();
    await navigate(page, "Operator incidents");
    const card = page
      .getByTestId("incident-readiness-stripe-eligibility")
      .filter({ hasText: "Trusted validation reported an unmet prerequisite" });
    await expect(card.getByText("Open", { exact: true })).toBeVisible();
    await expect(
      card.getByText("1 journaled attempts · 1 confirmed failures"),
    ).toHaveCount(2);
    await scenario("recover");
    const recovered = page
      .getByTestId("incident-readiness-stripe-eligibility")
      .filter({ hasText: "Controlled validation recovered" })
      .first();
    await expect(
      recovered.getByText("Resolved", { exact: true }),
    ).toBeVisible();
    await expect(
      recovered.getByRole("heading", { name: "Recovery notice" }),
    ).toHaveCount(1);
    const recoveryNotice = recovered.getByRole("region", {
      name: "recovery notice",
    });
    await expect(
      recoveryNotice.getByText(
        /: (Provider accepted; awaiting delivery confirmation|Recipient mail server accepted)/,
      ),
    ).toHaveCount(2);
    await recovered.scrollIntoViewIfNeeded();
    // Other durable email rows may finish rendering above this article. Wait
    // for its actual viewport bounds before taking an element screenshot.
    let previousBounds = "",
      stableSamples = 0;
    await expect
      .poll(
        async () => {
          const bounds = JSON.stringify(await recovered.boundingBox());
          stableSamples = bounds === previousBounds ? stableSamples + 1 : 0;
          previousBounds = bounds;
          return stableSamples;
        },
        { intervals: [100, 250, 500] },
      )
      .toBeGreaterThanOrEqual(2);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    // Capture the stable document rectangle directly: an element screenshot
    // can scroll again while live rows above it finish updating.
    let captureStable = false;
    async function documentBounds() {
      const bounds = await recovered.boundingBox();
      expect(bounds).not.toBeNull();
      const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
      return {
        x: bounds!.x + scroll.x,
        y: bounds!.y + scroll.y,
        width: bounds!.width,
        height: bounds!.height,
      };
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const bounds = await documentBounds();
      await page.screenshot({
        path: resolve(`.codex/ralph/t09-${info.project.name}-recovery.png`),
        fullPage: true,
        clip: bounds,
      });
      const after = await documentBounds();
      // Full-page capture can move the visual viewport on mobile. Compare
      // document coordinates and allow subpixel rounding only.
      if (
        (["x", "y", "width", "height"] as const).every(
          (key) => Math.abs(bounds[key] - after[key]) < 1,
        )
      ) {
        captureStable = true;
        break;
      }
    }
    expect(captureStable).toBe(true);
    await page.reload();
    await navigate();
    await page
      .getByRole("button", { name: "Check paid activation", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Paid activation denied" }),
    ).toBeVisible();
    const data = await manager.query(
      makeFunctionReference<"query">("readiness:read"),
      scope,
    );
    expect(data.paidAllowed).toBe(false);
    expect(data.collection.available).toBe(false);
    expect(JSON.stringify(data)).not.toMatch(
      /@|Bearer|RESEND_API_KEY|providerBinding|"payload"|nonprofit-b/,
    );
    const creator = await actor("creator-a");
    await expect(
      creator.mutation(
        makeFunctionReference<"mutation">("readiness:checkPaidActivation"),
        scope,
      ),
    ).rejects.toThrow(/FORBIDDEN/);
  } finally {
    await context.close();
  }
});

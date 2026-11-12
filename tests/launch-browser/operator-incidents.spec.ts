import { test, expect as baseExpect } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { resolve } from "node:path";
const expect = baseExpect.configure({ timeout: 30_000 });
test("T08 manager dashboard keeps failed incidents, durable history and one recovery notice", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(150_000);
  const base = String(info.project.use.baseURL),
    scope = { campaignId: "adoption" };
  async function client(identity?: string) {
    const session = await (
      await page.request.get(
        `${base}/__allocation/session${identity ? `?identity=${identity}` : ""}`,
      )
    ).json();
    const actor = new ConvexHttpClient(session.url);
    actor.setAuth(session.token);
    return actor;
  }
  const manager = await client(),
    administrator = await client("administrator");
  await administrator.mutation(
    makeFunctionReference<"mutation">("operatorIncidents:registerContact"),
    scope,
  );
  await page.goto("/?workspace=manager");
  await page
    .getByRole("button", { name: "Operator incidents", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Operator incidents", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Register my verified email" })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Your verified email is registered" }),
  ).toBeVisible();
  await page
    .getByLabel("Designated platform operator identity")
    .fill("creator-a");
  await page.getByRole("button", { name: "Save designated operator" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "could not be saved" }),
  ).toBeVisible();
  await page
    .getByLabel("Designated platform operator identity")
    .fill("administrator");
  await page.getByRole("button", { name: "Save designated operator" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Designated operator saved" }),
  ).toBeVisible();
  const scenario = async (value: string) =>
    expect(
      (
        await page.request.post(`${base}/__allocation/incidents`, {
          data: { scenario: value },
        })
      ).status(),
    ).toBe(200);
  await scenario("fail");
  const card = page.getByTestId("incident-t08-browser");
  await expect(card).toHaveCount(1);
  await expect(
    card.getByText("Required launch approval is missing", { exact: true }),
  ).toBeVisible();
  await expect(card.getByText("Open", { exact: true })).toBeVisible();
  await expect(
    card.getByText("1 journaled attempts · 1 confirmed failures"),
  ).toHaveCount(2);
  await scenario("exhaust");
  await expect(card.getByText(/Email delivery failed/)).toHaveCount(2);
  await expect(card.getByText("Open", { exact: true })).toBeVisible();
  await card
    .getByText("Source and incident history (1)", { exact: true })
    .click();
  await expect(
    card.getByText(/owned-browser-launch-check/).first(),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(`.codex/ralph/t08-${info.project.name}-failed.png`),
    fullPage: true,
  });
  const second = await browser.newContext({
    ...info.project.use,
    baseURL: base,
  } as any);
  try {
    const other = await second.newPage();
    await other.goto("/?workspace=manager");
    await other
      .getByRole("button", { name: "Operator incidents", exact: true })
      .click();
    await expect(other.getByText(/Email delivery failed/)).toHaveCount(2);
    await page.reload();
    await page
      .getByRole("button", { name: "Operator incidents", exact: true })
      .click();
    await expect(page.getByText(/Email delivery failed/)).toHaveCount(2);
    await scenario("recover");
    await expect(card.getByText("Resolved", { exact: true })).toBeVisible();
    await expect(
      card.getByRole("heading", { name: "Recovery notice" }),
    ).toHaveCount(1);
    await expect(
      card.getByText(/Provider accepted; awaiting delivery confirmation/),
    ).toHaveCount(2);
    await expect(
      other
        .getByTestId("incident-t08-browser")
        .getByText("Resolved", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: resolve(`.codex/ralph/t08-${info.project.name}-recovered.png`),
      fullPage: true,
    });
    await scenario("unknown");
    const open = page
      .getByTestId("incident-t08-browser")
      .filter({ hasText: "Required launch approval is missing" });
    await expect(page.getByTestId("incident-t08-browser")).toHaveCount(2);
    await expect(open.getByText(/Send outcome uncertain/)).toHaveCount(2);
    await page.screenshot({
      path: resolve(`.codex/ralph/t08-${info.project.name}-unknown.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const snapshot = await manager.query(
      makeFunctionReference<"query">("operatorIncidents:list"),
      scope,
    );
    expect(JSON.stringify(snapshot)).not.toMatch(
      /@|Bearer|providerBinding|RESEND_API_KEY|"payload"/,
    );
  } finally {
    await second.close();
  }
});

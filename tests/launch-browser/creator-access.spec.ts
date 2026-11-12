import { test, expect, type BrowserContext } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { campaignRules as rules } from "../launch/fixtures";

async function creatorIdentity(context: BrowserContext, identity: string) {
  await context.route("**/__allocation/session", async (route) => {
    const target = new URL(route.request().url());
    target.searchParams.set("identity", identity);
    const response = await route.fetch({ url: target.toString() });
    await route.fulfill({ response });
  });
}
test("T02 manager dispatch failure retry and creator blocked terms acceptance reopen and revocation", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const base = String(info.project.use.baseURL ?? "http://127.0.0.1:3210");
  const session = await (
    await page.request.get(`${base}/__allocation/session`)
  ).json();
  const manager = new ConvexHttpClient(session.url);
  manager.setAuth(session.token);
  try {
    await manager.mutation("campaignSetup:create", {
      campaignId: "adoption",
      operationId: "t02-browser-rules",
      rules,
    });
  } catch (error) {
    expect(String(error)).toMatch(/RULES_LOCKED/);
  }
  await page.goto("/");
  await page
    .getByRole("button", { name: "Creator invitations", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Invite your creators." }),
  ).toBeVisible();
  await page.request.post(`${base}/__allocation/clerk-mode`, {
    data: "failed",
  });
  await page.getByLabel("Invited email").fill("creator-a@creators.example");
  await page
    .getByRole("button", { name: "Save invitation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Clerk invitation failed",
  );
  await page.screenshot({
    path: `.codex/ralph/t02-${info.project.name}-invitation-failed.png`,
    fullPage: true,
  });
  await page.request.post(`${base}/__allocation/clerk-mode`, {
    data: "confirmed",
  });
  await page
    .getByRole("button", { name: "Check or retry Clerk invitation" })
    .click();
  await expect(page.getByRole("status")).toContainText("confirmed");
  const href = await page
    .getByRole("link", { name: "Creator entry link" })
    .getAttribute("href");
  expect(href).toBeTruthy();
  const creatorContext = await browser.newContext({
    viewport: info.project.use.viewport,
  });
  await creatorIdentity(creatorContext, "creator-a");
  const creator = await creatorContext.newPage();
  const target = `${base}/${href}`;
  try {
    await creator.goto(target);
    await expect(
      creator.getByRole("heading", { name: "Participation terms unavailable" }),
    ).toBeVisible();
    await expect(
      creator.getByRole("button", { name: "Complete campaign signup" }),
    ).toBeDisabled();
    await creator.screenshot({
      path: `.codex/ralph/t02-${info.project.name}-missing-terms.png`,
      fullPage: true,
    });
    const configured = await page.request.post(`${base}/__allocation/terms`);
    expect(configured.ok()).toBe(true);
    await expect(
      creator.getByRole("region", { name: "Participation terms" }),
    ).toBeVisible();
    await expect(creator.getByRole("note")).toContainText(
      "Synthetic agreement",
    );
    await expect(
      creator.getByRole("region", { name: "Participation terms" }),
    ).toContainText("retain ownership");
    await expect(
      creator.getByRole("region", { name: "Participation terms" }),
    ).toContainText("without additional approval per submission or placement");
    await expect(
      creator.getByRole("button", { name: "Complete campaign signup" }),
    ).toBeDisabled();
    await creator.getByRole("checkbox").check();
    await creator
      .getByRole("button", { name: "Complete campaign signup" })
      .click();
    await expect(
      creator.getByRole("heading", { name: "Your participation is recorded." }),
    ).toBeVisible();
    const accepted = creator.getByRole("region", {
      name: "Participation acceptance",
    });
    await expect(accepted).toContainText("synthetic-test-v1");
    await expect(accepted).toContainText("creator-a");
    await expect(accepted).toContainText("creatorAccess:accept");
    await expect(
      creator.getByRole("region", { name: "Private creator records" }),
    ).toBeVisible();
    await expect(creator.getByText(/creator-b|nonprofit-b/)).toHaveCount(0);
    expect(
      await creator.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await creator.screenshot({
      path: `.codex/ralph/t02-${info.project.name}-accepted.png`,
      fullPage: true,
    });
    const saved = await accepted.innerText();
    await creator.reload();
    await expect(
      creator.getByRole("region", { name: "Participation acceptance" }),
    ).toHaveText(saved, { useInnerText: true });
    await creator.screenshot({
      path: `.codex/ralph/t02-${info.project.name}-reopened.png`,
      fullPage: true,
    });
    const wrongContext = await browser.newContext({
      viewport: info.project.use.viewport,
    });
    await creatorIdentity(wrongContext, "wrong-person");
    try {
      const wrong = await wrongContext.newPage();
      await wrong.goto(target);
      await expect(
        wrong.getByRole("heading", { name: "Workspace unavailable" }),
      ).toBeVisible();
      await expect(
        wrong.getByRole("link", { name: "Clerk sign-in and recovery" }),
      ).toBeVisible();
      await expect(
        wrong.getByText(/creator-a@|synthetic-test-v1|creatorAccess:accept/),
      ).toHaveCount(0);
      await wrong.screenshot({
        path: `.codex/ralph/t02-${info.project.name}-forwarded-denied.png`,
        fullPage: true,
      });
    } finally {
      await wrongContext.close();
    }
    await page
      .getByRole("button", {
        name: "Revoke creator-a@creators.example",
        exact: true,
      })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Creator access revoked",
    );
    await expect(
      creator.getByRole("heading", { name: "Workspace unavailable" }),
    ).toBeVisible();
    await expect(
      creator.getByText(/synthetic-test-v1|creatorAccess:accept/),
    ).toHaveCount(0);
    await creator.screenshot({
      path: `.codex/ralph/t02-${info.project.name}-revoked.png`,
      fullPage: true,
    });
  } finally {
    await creatorContext.close();
  }
});

test("T02 public campaign entry never requests a Clerk or fixture session", async ({
  page,
}, info) => {
  const sessions: string[] = [];
  page.on("request", (request) => {
    const target = new URL(request.url());
    if (
      target.pathname === "/__allocation/session" ||
      /(^|\.)clerk\.(com|accounts\.dev)$/.test(target.hostname)
    )
      sessions.push(request.url());
  });
  await page.goto("/?workspace=public");
  await expect(
    page.getByRole("heading", { name: "adoption.is", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Visit adoption.is to view and donate" }),
  ).toHaveAttribute("href", "https://adoption.is");
  expect(sessions).toEqual([]);
  await page.screenshot({
    path: `.codex/ralph/t02-${info.project.name}-public.png`,
    fullPage: true,
  });
});

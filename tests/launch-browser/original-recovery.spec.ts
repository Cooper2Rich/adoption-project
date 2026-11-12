import { expect as baseExpect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { campaignRules } from "../launch/fixtures.ts";
import { videoBytes } from "../launch/video-fixtures.ts";
const expect = baseExpect.configure({ timeout: 30_000 });

test("T07 administrator confirmation, thirty-day recovery, uncertain and permanent status; current manager denial", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const base = String(info.project.use.baseURL),
    scope = { campaignId: "adoption" };
  const session = await (
    await page.request.get(`${base}/__allocation/session`)
  ).json();
  const manager = new ConvexHttpClient(session.url);
  manager.setAuth(session.token);
  try {
    await manager.mutation(
      makeFunctionReference<"mutation">("campaignSetup:create"),
      { ...scope, operationId: "t07-browser-rules", rules: campaignRules },
    );
  } catch (error) {
    expect(String(error)).toMatch(/RULES_LOCKED/);
  }
  const invitation = await manager.mutation(
    makeFunctionReference<"mutation">("creatorAccess:invite"),
    {
      ...scope,
      email: "recovery-creator@creators.example",
      operationId: "t07-browser-invite",
    },
  );
  await manager.action("clerkInvitations:dispatch", {
    ...scope,
    invitationId: invitation._id,
    kind: "create",
  });
  await page.request.post(`${base}/__allocation/terms`);
  const ownerSession = await (
    await page.request.get(
      `${base}/__allocation/session?identity=recovery-creator`,
    )
  ).json();
  const creator = new ConvexHttpClient(session.url);
  creator.setAuth(ownerSession.token);
  const workspace = await creator.query(
    makeFunctionReference<"query">("creatorAccess:workspace"),
    scope,
  );
  await creator.mutation(
    makeFunctionReference<"mutation">("creatorAccess:accept"),
    {
      ...scope,
      invitationId: invitation._id,
      termsId: workspace.terms._id,
      version: workspace.terms.version,
      operationId: "t07-browser-accept",
      confirmed: true,
    },
  );
  const bytes = await videoBytes({ color: "orange" });
  async function upload(name: string) {
    const record = await creator.mutation(
      makeFunctionReference<"mutation">("videos:reserve"),
      {
        ...scope,
        operationId: name,
        filename: name + ".mp4",
        size: bytes.length,
      },
    );
    const headers = { Authorization: `Bearer ${ownerSession.token}` };
    expect(
      (
        await page.request.put(
          `${base}/api/videos?action=local-upload&uploadId=${record._id}`,
          { headers, data: bytes },
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post(
          `${base}/api/videos?action=verify&uploadId=${record._id}`,
          { headers },
        )
      ).status(),
    ).toBe(200);
    return record._id as string;
  }
  const uploadId = await upload("T07 owned recovery"),
    deletedId = await upload("T07 owned purge");
  await page.goto(`${base}/?workspace=manager`);
  await page
    .getByRole("button", { name: "Creative review", exact: true })
    .click();
  const managerRecord = page
    .getByRole("region", { name: "Video processing status" })
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", {
        name: "T07 owned recovery.mp4",
        exact: true,
      }),
    });
  await expect(
    managerRecord.getByText("Original archive: retained", { exact: true }),
  ).toBeVisible();
  await expect(
    managerRecord.getByRole("button", { name: "Request original deletion" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Confirm deletion with 30-day recovery" }),
  ).toHaveCount(0);
  const adminContext = await browser.newContext({
    viewport: info.project.use.viewport,
    acceptDownloads: true,
  });
  await adminContext.route("**/__allocation/session", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("identity", "administrator");
    await route.fulfill({
      response: await route.fetch({ url: url.toString() }),
    });
  });
  const admin = await adminContext.newPage();
  try {
    await admin.goto(`${base}/?workspace=manager`);
    await admin
      .getByRole("button", { name: "Creative review", exact: true })
      .click();
    const record = admin
      .getByRole("region", { name: "Video processing status" })
      .getByRole("article")
      .filter({
        has: admin.getByRole("heading", {
          name: "T07 owned recovery.mp4",
          exact: true,
        }),
      });
    await expect(
      record.getByRole("button", { name: "Request original deletion" }),
    ).toBeVisible();
    await record
      .getByRole("button", { name: "Request original deletion" })
      .click();
    await record
      .getByRole("button", { name: "Cancel deletion request" })
      .click();
    await expect(
      record.getByText("Original archive: retained", { exact: true }),
    ).toBeVisible();
    await record
      .getByRole("button", { name: "Request original deletion" })
      .click();
    const confirmation = record.getByRole("group", {
      name: "Confirm original deletion",
    });
    await confirmation.getByLabel("Type DELETE ORIGINAL").fill("delete");
    await expect(
      confirmation.getByRole("button", {
        name: "Confirm deletion with 30-day recovery",
      }),
    ).toBeDisabled();
    await confirmation
      .getByLabel("Type DELETE ORIGINAL")
      .fill("DELETE ORIGINAL");
    await record.scrollIntoViewIfNeeded();
    await record.screenshot({
      path: `.codex/ralph/t07-${info.project.name}-confirmation.png`,
    });
    await confirmation
      .getByRole("button", { name: "Confirm deletion with 30-day recovery" })
      .click();
    await expect(
      record.getByText("Original archive: pending", { exact: true }),
    ).toBeVisible();
    await expect(
      record.getByText(/Original bytes are retained for 30 elapsed days/),
    ).toBeVisible();
    await record
      .getByRole("button", { name: "Get original download link" })
      .click();
    await expect(
      record.getByRole("link", { name: "Download exact original" }),
    ).toBeVisible();
    const downloadEvent = admin.waitForEvent("download");
    await record.getByRole("link", { name: "Download exact original" }).click();
    await (await downloadEvent).path();
    await record.scrollIntoViewIfNeeded();
    await record.screenshot({
      path: `.codex/ralph/t07-${info.project.name}-pending.png`,
    });
    await record
      .getByRole("button", { name: "Restore original and cancel purge" })
      .click();
    await expect(
      record.getByText("Original archive: restored", { exact: true }),
    ).toBeVisible();
    await record
      .getByRole("button", { name: /Original deletion audit/ })
      .count()
      .catch(() => 0);
    await record.scrollIntoViewIfNeeded();
    await record.screenshot({
      path: `.codex/ralph/t07-${info.project.name}-restored.png`,
    });
    await record
      .getByRole("button", { name: "Request original deletion" })
      .click();
    await record.getByLabel("Type DELETE ORIGINAL").fill("DELETE ORIGINAL");
    await record
      .getByRole("button", { name: "Confirm deletion with 30-day recovery" })
      .click();
    await expect(
      record.getByText("Original archive: pending", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await page.request.post(`${base}/__allocation/original-recovery`, {
          data: { uploadId, relativeToDeadline: 0, mode: "unknown-before" },
        })
      ).status(),
    ).toBe(200);
    await record
      .getByRole("button", { name: "Retry / reconcile original purge" })
      .click();
    await expect(
      record.getByText("Original archive: unknown", { exact: true }),
    ).toBeVisible();
    await expect(
      record.getByRole("button", { name: "Restore original and cancel purge" }),
    ).toHaveCount(0);
    await expect(
      record.getByRole("button", { name: "Get original download link" }),
    ).toBeDisabled();
    await expect(
      record.getByText(/physical deletion is unconfirmed/),
    ).toBeVisible();
    await record.scrollIntoViewIfNeeded();
    await record.screenshot({
      path: `.codex/ralph/t07-${info.project.name}-unknown.png`,
    });
    expect(
      (
        await page.request.post(`${base}/__allocation/original-recovery`, {
          data: { uploadId, clearClock: true, mode: "normal" },
        })
      ).status(),
    ).toBe(200);
    const purge = admin
      .getByRole("region", { name: "Video processing status" })
      .getByRole("article")
      .filter({
        has: admin.getByRole("heading", {
          name: "T07 owned purge.mp4",
          exact: true,
        }),
      });
    await purge
      .getByRole("button", { name: "Request original deletion" })
      .click();
    await purge.getByLabel("Type DELETE ORIGINAL").fill("DELETE ORIGINAL");
    await purge
      .getByRole("button", { name: "Confirm deletion with 30-day recovery" })
      .click();
    await expect(
      purge.getByText("Original archive: pending", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await page.request.post(`${base}/__allocation/original-recovery`, {
          data: { uploadId: deletedId, relativeToDeadline: 0 },
        })
      ).status(),
    ).toBe(200);
    const priorDeadline = await creator.query(
      makeFunctionReference<"query">("originalArchives:status"),
      { ...scope, uploadId: deletedId },
    );
    await purge
      .getByRole("button", { name: "Reconfirm deletion authority" })
      .click();
    await expect(
      purge.getByText(/This does not start a new recovery window/),
    ).toBeVisible();
    await expect(
      purge.getByText(/purge is immediately eligible/),
    ).toBeVisible();
    await purge.getByLabel("Type DELETE ORIGINAL").fill("DELETE ORIGINAL");
    await purge.screenshot({
      path: `.codex/ralph/t07-${info.project.name}-reconfirm.png`,
    });
    await purge
      .getByRole("button", {
        name: "Reconfirm with unchanged recovery deadline",
      })
      .click();
    await expect(purge.getByText(/authority reconfirmed/)).toBeVisible();
    const reconfirmed = await creator.query(
      makeFunctionReference<"query">("originalArchives:status"),
      { ...scope, uploadId: deletedId },
    );
    expect(reconfirmed.purgeAt).toBe(priorDeadline.purgeAt);
    expect(reconfirmed.generation).toBe(priorDeadline.generation);
    await purge
      .getByRole("button", { name: "Restore original and cancel purge" })
      .click();
    await expect(purge.getByText(/VIDEO_RECOVERY_CLOSED/)).toBeVisible();
    await purge
      .getByRole("button", { name: "Retry / reconcile original purge" })
      .click();
    await expect(
      purge.getByText("Original archive: permanently deleted", { exact: true }),
    ).toBeVisible();
    await expect(purge.getByText(/Physical absence confirmed/)).toBeVisible();
    await purge.scrollIntoViewIfNeeded();
    await purge.screenshot({
      path: `.codex/ralph/t07-${info.project.name}-deleted.png`,
    });
    await purge.getByText(/Original deletion audit/).click();
    await expect(
      purge.getByText(/archive:storage-worker/).first(),
    ).toBeVisible();
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await page.request.post(`${base}/__allocation/original-recovery`, {
      data: { uploadId, clearClock: true, mode: "normal" },
    });
    await adminContext.close();
  }
});

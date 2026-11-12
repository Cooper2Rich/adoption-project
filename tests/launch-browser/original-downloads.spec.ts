import { expect as baseExpect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { campaignRules } from "../launch/fixtures.ts";
import { videoBytes } from "../launch/video-fixtures.ts";

const expect = baseExpect.configure({ timeout: 30_000 });
test("T06 private archive downloads through creator and manager UI, historical revision and two-session revocation", async ({
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
      { ...scope, operationId: "t06-browser-rules", rules: campaignRules },
    );
  } catch (error) {
    expect(String(error)).toMatch(/RULES_LOCKED/);
  }
  const invitation = await manager.mutation(
    makeFunctionReference<"mutation">("creatorAccess:invite"),
    {
      ...scope,
      email: "archive-creator@creators.example",
      operationId: "t06-browser-invite",
    },
  );
  await manager.action("clerkInvitations:dispatch", {
    ...scope,
    invitationId: invitation._id,
    kind: "create",
  });
  await page.request.post(`${base}/__allocation/terms`);
  await page.request.post(`${base}/__allocation/mux`, {
    data: { mode: "ready" },
  });
  const first = await browser.newContext({
    viewport: info.project.use.viewport,
    acceptDownloads: true,
  });
  const second = await browser.newContext({
    viewport: info.project.use.viewport,
    acceptDownloads: true,
  });
  for (const context of [first, second])
    await context.route("**/__allocation/session", async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set("identity", "archive-creator");
      await route.fulfill({
        response: await route.fetch({ url: url.toString() }),
      });
    });
  const creator = await first.newPage(),
    otherSession = await second.newPage();
  const bytes = await videoBytes({ color: "purple" }),
    corrected = await videoBytes({ color: "green" });
  const hash = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  const settleFrame = async (player: ReturnType<typeof page.locator>) => {
    await expect(player).toHaveJSProperty("readyState", 4);
    await player.evaluate(
      (video: HTMLVideoElement) =>
        new Promise<void>((resolve) => {
          video.addEventListener("seeked", () => resolve(), { once: true });
          video.currentTime = 0.2;
        }),
    );
  };
  const download = async (
    owner: typeof page,
    container: ReturnType<typeof page.locator>,
    expected: Buffer,
  ) => {
    await container
      .getByRole("button", { name: "Get original download link", exact: true })
      .click();
    await expect(container).toContainText("Private link issued");
    const link = container.getByRole("link", {
      name: "Download exact original",
      exact: true,
    });
    const capability = await link.getAttribute("href");
    const event = owner.waitForEvent("download");
    await link.click();
    const result = await event;
    expect(await result.failure()).toBeNull();
    expect(hash(await readFile((await result.path())!))).toBe(hash(expected));
    expect(result.suggestedFilename()).toBe("family-original.mp4");
    return capability!;
  };
  try {
    await creator.goto(
      `${base}/?workspace=creator&invitation=${invitation._id}`,
    );
    await creator.getByRole("checkbox").check();
    await creator
      .getByRole("button", { name: "Complete campaign signup" })
      .click();
    const videos = creator.getByRole("region", {
      name: "Your video submissions",
      exact: true,
    });
    await expect(videos).toBeVisible();
    await creator
      .getByLabel("Video title", { exact: true })
      .fill("Archive family story");
    await creator
      .getByLabel("Video description", { exact: true })
      .fill("Private exact original archive journey.");
    await creator
      .getByLabel("MP4 original video", { exact: true })
      .setInputFiles({
        name: "family-original.mp4",
        mimeType: "video/mp4",
        buffer: bytes,
      });
    await creator
      .getByRole("button", { name: "Submit video for review", exact: true })
      .click();
    await expect(videos).toContainText("Video submitted for fresh review");
    const entry = (
      await manager.query(
        makeFunctionReference<"query">("photos:workspace"),
        scope,
      )
    ).find((row: any) =>
      row.versions.some((v: any) => v.title === "Archive family story"),
    );
    const creatorEntry = videos.getByRole("article").filter({
      has: creator.getByRole("heading", {
        name: "Archive family story",
        exact: true,
      }),
    });
    const archive = creatorEntry.locator(
      '[aria-label="Private original version 1"]',
    );
    const issued = await download(creator, archive, bytes);
    await expect(archive).toContainText("even after access is revoked");
    await settleFrame(
      creatorEntry.getByLabel("Processed video review", { exact: true }),
    );
    await creatorEntry.screenshot({
      path: `.codex/ralph/t06-${info.project.name}-creator-original.png`,
    });
    await otherSession.goto(
      `${base}/?workspace=creator&invitation=${invitation._id}`,
    );
    await expect(
      otherSession.getByRole("region", {
        name: "Your video submissions",
        exact: true,
      }),
    ).toContainText("Archive family story");
    await page.goto(`${base}/?workspace=manager`);
    await page
      .getByRole("button", { name: "Creative review", exact: true })
      .click();
    const review = page.getByRole("article", {
      name: `Review ${entry._id}`,
      exact: true,
    });
    await download(
      page,
      review.locator('[aria-label="Private original version 1"]'),
      bytes,
    );
    await settleFrame(
      review.getByLabel("Processed video review", { exact: true }),
    );
    await review.screenshot({
      path: `.codex/ralph/t06-${info.project.name}-manager-original.png`,
    });
    // Correct preapproval creative through the UI: revision 1 becomes historical
    // and revision 2 binds different original bytes under the same entry.
    await creator
      .getByRole("button", {
        name: "Correct Archive family story",
        exact: true,
      })
      .click();
    await creator
      .getByLabel("MP4 original video", { exact: true })
      .setInputFiles({
        name: "family-original.mp4",
        mimeType: "video/mp4",
        buffer: corrected,
      });
    await creator
      .getByRole("button", { name: "Submit video correction", exact: true })
      .click();
    await expect(creatorEntry).toContainText("Version 2");
    await creatorEntry
      .getByText("Video revision history (2 versions)", { exact: true })
      .click();
    await download(
      creator,
      creatorEntry.locator('[aria-label="Private original version 1"]'),
      bytes,
    );
    await download(
      creator,
      creatorEntry.locator('[aria-label="Private original version 2"]'),
      corrected,
    );
    await settleFrame(
      creatorEntry.getByLabel("Processed video review", { exact: true }),
    );
    expect(
      await creator.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await creatorEntry.screenshot({
      path: `.codex/ralph/t06-${info.project.name}-archived-revision.png`,
    });
    await page
      .getByRole("button", { name: "Creator invitations", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Revoke archive-creator@creators.example",
        exact: true,
      })
      .click();
    await expect(
      creator.getByRole("heading", {
        name: "Workspace unavailable",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      otherSession.getByRole("heading", {
        name: "Workspace unavailable",
        exact: true,
      }),
    ).toBeVisible();
    await otherSession.screenshot({
      path: `.codex/ralph/t06-${info.project.name}-revoked-session.png`,
      fullPage: true,
    });
    const actor = await (
      await page.request.get(
        `${base}/__allocation/session?identity=archive-creator`,
      )
    ).json();
    const denied = await page.request.post(
      `${base}/api/videos?action=original-ticket&uploadId=${entry.versions?.[0]?.video ?? (await manager.query(makeFunctionReference<"query">("photos:entry"), { ...scope, entryId: entry._id })).versions[0].video}`,
      {
        headers: { Authorization: `Bearer ${actor.token}` },
        data: { operationId: "revoked-browser" },
      },
    );
    expect(denied.status()).toBe(403);
    // The original already-issued link remains a bounded bearer capability.
    const stillValid = await page.request.get(base + issued);
    expect(stillValid.status()).toBe(200);
    expect(hash(await stillValid.body())).toBe(hash(bytes));
    await page.goto(base + "/");
    await expect(
      page.getByRole("button", {
        name: "Get original download link",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      await creator.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  } finally {
    await first.close();
    await second.close();
  }
});

import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { campaignRules as rules } from "../launch/fixtures.ts";
import { videoBytes } from "../launch/video-fixtures.ts";

test("T04 creator and manager original upload, failed processing, retry, playback and fresh revisions", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const base = String(info.project.use.baseURL ?? "http://127.0.0.1:3210"),
    scope = { campaignId: "adoption" };
  const session = await (
      await page.request.get(`${base}/__allocation/session`)
    ).json(),
    manager = new ConvexHttpClient(session.url);
  manager.setAuth(session.token);
  try {
    await manager.mutation(
      makeFunctionReference<"mutation">("campaignSetup:create"),
      {
        ...scope,
        operationId: "t04-browser-rules",
        rules,
      },
    );
  } catch (error) {
    expect(String(error)).toMatch(/RULES_LOCKED/);
  }
  const invitation = await manager.mutation(
    makeFunctionReference<"mutation">("creatorAccess:invite"),
    {
      ...scope,
      email: "video-creator@creators.example",
      operationId: "t04-browser-invite",
    },
  );
  await manager.action("clerkInvitations:dispatch", {
    ...scope,
    invitationId: invitation._id,
    kind: "create",
  });
  const context = await browser.newContext({
    viewport: info.project.use.viewport,
  });
  await context.route("**/__allocation/session", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("identity", "video-creator");
    await route.fulfill({
      response: await route.fetch({ url: url.toString() }),
    });
  });
  const creator = await context.newPage();
  try {
    await creator.goto(
      `${base}/?workspace=creator&invitation=${invitation._id}`,
    );
    if (
      await creator
        .getByRole("heading", { name: "Participation terms unavailable" })
        .isVisible()
    )
      await page.request.post(`${base}/__allocation/terms`);
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
      .fill("Together in motion");
    await creator
      .getByLabel("Video description", { exact: true })
      .fill("An original supporting adoption.is families.");
    await creator
      .getByLabel("MP4 original video", { exact: true })
      .setInputFiles({
        name: "corrupt.mp4",
        mimeType: "video/mp4",
        buffer: Buffer.from("invalid source bytes"),
      });
    await creator
      .getByRole("button", { name: "Submit video for review", exact: true })
      .click();
    await expect(videos).toContainText("VIDEO_FORMAT");
    await creator.screenshot({
      path: `.codex/ralph/t04-${info.project.name}-invalid.png`,
      fullPage: true,
    });
    await creator
      .getByRole("button", { name: "Start a new upload", exact: true })
      .click();
    await page.request.post(`${base}/__allocation/mux`, {
      data: { mode: "reject" },
    });
    await creator
      .getByLabel("MP4 original video", { exact: true })
      .setInputFiles({
        name: "together.mp4",
        mimeType: "video/mp4",
        buffer: await videoBytes(),
      });
    await creator
      .getByRole("button", { name: "Submit video for review", exact: true })
      .click();
    await expect(videos).toContainText("Video submitted for fresh review");
    await expect(
      videos.getByRole("region", { name: "Video processing status" }),
    ).toContainText("failed");
    const rows = await manager.query(
        makeFunctionReference<"query">("photos:workspace"),
        scope,
      ),
      entry = rows.find((row: any) =>
        row.versions.some((v: any) => v.title === "Together in motion"),
      );
    expect(entry).toBeTruthy();
    await page.goto(base);
    await page
      .getByRole("button", { name: "Photo review", exact: true })
      .click();
    const review = page.getByRole("article", { name: `Review ${entry._id}` });
    await review
      .getByRole("button", { name: "Approve unchanged creative", exact: true })
      .click();
    await expect(review.getByRole("status")).toContainText("VIDEO_NOT_READY");
    await creator.screenshot({
      path: `.codex/ralph/t04-${info.project.name}-failed.png`,
      fullPage: true,
    });
    await page.request.post(`${base}/__allocation/mux`, {
      data: { mode: "processing" },
    });
    const status = videos
      .getByRole("region", { name: "Video processing status" })
      .getByRole("article")
      .filter({
        has: creator.getByRole("heading", {
          name: "together.mp4",
          exact: true,
        }),
      });
    await status
      .getByRole("button", { name: "Retry / refresh processing", exact: true })
      .click();
    await expect(status).toContainText("processing");
    await creator.screenshot({
      path: `.codex/ralph/t04-${info.project.name}-processing.png`,
      fullPage: true,
    });
    const uploadId = entry.versions[0].video;
    expect(
      (
        await page.request.post(`${base}/__allocation/mux`, {
          data: { uploadId, status: "ready" },
        })
      ).ok(),
    ).toBeTruthy();
    await expect(status.getByText("ready", { exact: true })).toBeVisible();
    const player = status.getByLabel("Processed video review", { exact: true });
    await expect(player).toHaveJSProperty("readyState", 4);
    await player.evaluate(async (video: HTMLVideoElement) => {
      video.muted = true;
      await video.play();
    });
    await expect
      .poll(() =>
        player.evaluate((video: HTMLVideoElement) => video.currentTime),
      )
      .toBeGreaterThan(0.1);
    await player.evaluate((video: HTMLVideoElement) => video.pause());
    await creator.screenshot({
      path: `.codex/ralph/t04-${info.project.name}-creator-ready.png`,
      fullPage: true,
    });
    // The manager view also plays the processed bytes before fresh review.
    await page.reload();
    await page
      .getByRole("button", { name: "Photo review", exact: true })
      .click();
    await expect(
      review.getByLabel("Processed video review", { exact: true }),
    ).toHaveJSProperty("readyState", 4);
    await review
      .getByRole("textbox")
      .fill("Please add context in the description.");
    await review
      .getByRole("button", { name: "Request revisions", exact: true })
      .click();
    await expect(videos).toContainText("revisions");
    await creator
      .getByRole("button", { name: "Correct Together in motion", exact: true })
      .click();
    await creator
      .getByLabel("Video description", { exact: true })
      .fill("A family story with creator-owned footage and context.");
    await creator
      .getByRole("button", { name: "Submit video correction", exact: true })
      .click();
    await expect(videos).toContainText("Version 2");
    await review
      .getByRole("button", { name: "Approve unchanged creative", exact: true })
      .click();
    await expect(review).toContainText("Approved unchanged creative");
    await page.screenshot({
      path: `.codex/ralph/t04-${info.project.name}-manager-reviewed.png`,
      fullPage: true,
    });
    await page.request.post(`${base}/__allocation/mux`, {
      data: { mode: "ready" },
    });
    await creator
      .getByRole("button", { name: "Correct Together in motion", exact: true })
      .click();
    await creator
      .getByLabel("Video title", { exact: true })
      .fill("A different original");
    await creator
      .getByLabel("MP4 original video", { exact: true })
      .setInputFiles({
        name: "replacement.mp4",
        mimeType: "video/mp4",
        buffer: await videoBytes({ color: "blue" }),
      });
    await creator
      .getByRole("button", { name: "Submit video correction", exact: true })
      .click();
    await expect(videos).toContainText(
      "Replacement saved as a separate pending entry",
    );
    const saved = await manager.query(
        makeFunctionReference<"query">("photos:workspace"),
        scope,
      ),
      replacement = saved.find((row: any) => row.replacementOf === entry._id);
    expect(replacement).toBeTruthy();
    expect(replacement.status).toBe("pending");
    await creator.reload();
    await expect(
      creator.getByRole("region", {
        name: "Your video submissions",
        exact: true,
      }),
    ).toContainText("A different original");
    await creator.screenshot({
      path: `.codex/ralph/t04-${info.project.name}-replacement.png`,
      fullPage: true,
    });
    expect(
      await creator.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await manager.mutation(
      makeFunctionReference<"mutation">("creatorAccess:revoke"),
      {
        ...scope,
        invitationId: invitation._id,
        operationId: "t04-browser-revoke",
      },
    );
    await creator.reload();
    await expect(
      creator
        .getByText(/access.*(unavailable|denied)|permission|revoked/i)
        .first(),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

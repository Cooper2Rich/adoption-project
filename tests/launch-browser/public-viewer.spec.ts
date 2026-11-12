import { expect, test } from "@playwright/test";
import { build, preview } from "vite";
import { join } from "node:path";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { servePhotoRequest } from "../../api/photos.ts";
import { pngBytes } from "../launch/photo-fixtures.ts";
import { videoBytes } from "../launch/video-fixtures.ts";
import {
  mutation,
  query,
  preparePublicCreator,
} from "../launch/public-fixtures.ts";

test("T05 built public homepage detail tracked origin private routes and failed media retry", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240_000);
  const backend = await createLocalBackend();
  const directory = join(backend.directory, "public-browser-build");
  let server: Awaited<ReturnType<typeof preview>> | undefined;
  const scope = { campaignId: "adoption" },
    manager = backend.client("manager-a"),
    creator = backend.client("public-creator");
  const sessions: string[] = [],
    errors: string[] = [];
  page.on("request", (request) => {
    if (/__allocation\/session|clerk\.(com|accounts\.dev)/.test(request.url()))
      sessions.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await build({
      configFile: "vite.launch.config.ts",
      logLevel: "error",
      define: {
        "import.meta.env.VITE_CONVEX_URL": JSON.stringify(backend.url),
      },
      build: { outDir: directory, emptyOutDir: true },
    });
    server = await preview({
      configFile: "vite.launch.config.ts",
      build: { outDir: directory },
      preview: { host: "127.0.0.1", port: 0 },
      plugins: [
        {
          name: "owned-public-browser",
          configurePreviewServer(server) {
            server.middlewares.use((req, res, next) => {
              if (req.url?.startsWith("/api/")) {
                void servePhotoRequest(
                  req.url.startsWith("/api/videos")
                    ? backend.videoService
                    : backend.photoService,
                  req,
                  res,
                );
                return;
              }
              if (/^\/(entries|fundraise)\//.test(req.url ?? ""))
                req.url = "/index.html";
              next();
            });
          },
        },
      ],
    });
    const address = server.httpServer.address();
    if (!address || typeof address === "string")
      throw new Error("Missing public preview port");
    const base = `http://127.0.0.1:${address.port}`;
    await page.goto(base);
    await expect(
      page.getByText("No approved ads yet", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
    await page.screenshot({
      path: `.codex/ralph/t05-${info.project.name}-empty.png`,
      fullPage: true,
    });
    await backend.command(
      "run",
      "fixtures:terms",
      JSON.stringify({ campaignSlug: "adoption", synthetic: true }),
    );
    await preparePublicCreator(manager, creator, "public-browser");
    let operation = 0;
    async function upload(kind: string, bytes: Buffer) {
      const record = await mutation(creator, `${kind}:reserve`, {
        ...scope,
        operationId: `upload-${++operation}`,
        filename: kind === "photos" ? "source.png" : "source.mp4",
        size: bytes.length,
        ...(kind === "photos" ? { type: "image/png" } : {}),
      });
      const headers = {
        Authorization: `Bearer ${backend.token("public-creator")}`,
      };
      expect(
        (
          await fetch(
            `${base}/api/${kind}?action=local-upload&uploadId=${record._id}`,
            { method: "PUT", headers, body: bytes },
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await fetch(
            `${base}/api/${kind}?action=verify&uploadId=${record._id}`,
            { method: "POST", headers },
          )
        ).status,
      ).toBe(200);
      return record;
    }
    const original = await upload("photos", await pngBytes());
    const request = {
      ...scope,
      operationId: "public-photo",
      title: "Together for adoption.is",
      description: "A creator's approved campaign story.",
      publicCreatorName: "River Studio",
      photos: [original._id],
    };
    const entry = await mutation(creator, "photos:submit", request);
    for (const status of ["pending", "rejected"]) {
      if (status === "rejected")
        await mutation(manager, "photos:review", {
          ...scope,
          entryId: entry._id,
          expectedVersion: 1,
          operationId: "reject-photo",
          decision: "rejected",
          reason: "Private staff feedback",
        });
      await page.goto(`${base}/entries/${entry._id}`);
      await expect(
        page.getByRole("heading", { name: "Ad unavailable" }),
      ).toBeVisible();
      await expect(
        page.getByText(/Together for|River Studio|Private staff/),
      ).toHaveCount(0);
      expect(
        (
          await page.request.get(
            `${base}/api/photos?action=public&entryId=${entry._id}`,
          )
        ).status(),
      ).toBe(403);
    }
    await mutation(manager, "photos:review", {
      ...scope,
      entryId: entry._id,
      expectedVersion: 1,
      operationId: "approve-photo",
      decision: "approved",
      reason: "",
    });
    await page.goto(base);
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("img")).toHaveJSProperty("naturalWidth", 2);
    await expect(
      page.getByText("By River Studio", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `.codex/ralph/t05-${info.project.name}-homepage.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "View ad and share", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Together for adoption.is",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("img")).toHaveJSProperty("naturalWidth", 2);
    await page.screenshot({
      path: `.codex/ralph/t05-${info.project.name}-detail.png`,
      fullPage: true,
    });
    let fail = true;
    await page.route("**/api/photos?action=public**", (route) =>
      fail
        ? route.fulfill({ status: 503, body: "Unavailable" })
        : route.continue(),
    );
    await page.reload();
    await expect(
      page.getByText("This ad's media is unavailable", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "Support adoption.is through this ad",
        exact: true,
      }),
    ).toHaveAttribute("href", entry.trackedPath);
    await page.screenshot({
      path: `.codex/ralph/t05-${info.project.name}-media-error.png`,
      fullPage: true,
    });
    fail = false;
    await page
      .getByRole("button", { name: "Retry media", exact: true })
      .click();
    await expect(page.getByRole("img")).toHaveJSProperty("naturalWidth", 2);
    await expect(page.getByText("This ad's media is unavailable")).toHaveCount(
      0,
    );
    await page
      .getByRole("link", {
        name: "Support adoption.is through this ad",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("region", { name: "Tracked fundraising" }),
    ).toContainText("entry-specific fundraising link is preserved");
    const canonical = entry.trackedPath;
    for (const source of ["facebook", "instagram", "tiktok", "shared-person"]) {
      await page.goto(
        `${base}${canonical}?utm_source=${source}&entryId=someone-else`,
      );
      await expect(
        page
          .getByRole("region", { name: "Tracked fundraising" })
          .getByRole("link"),
      ).toHaveAttribute("href", canonical);
    }
    await page.screenshot({
      path: `.codex/ralph/t05-${info.project.name}-fundraising-origin.png`,
      fullPage: true,
    });
    const context = await browser.newContext({
      viewport: info.project.use.viewport,
    });
    try {
      const shared = await context.newPage();
      await shared.goto(`${base}${canonical}`);
      await expect(
        shared.getByRole("region", { name: "Tracked fundraising" }),
      ).toContainText("River Studio");
    } finally {
      await context.close();
    }
    await backend.mux.mode("ready");
    const video = await upload("videos", await videoBytes());
    expect(
      (
        await fetch(`${base}/api/videos?action=process&uploadId=${video._id}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${backend.token("public-creator")}`,
          },
        })
      ).status,
    ).toBe(200);
    const videoEntry = await mutation(creator, "photos:submit", {
      ...scope,
      operationId: "public-video",
      title: "A video for families",
      description: "An approved original video campaign entry.",
      publicCreatorName: "River Studio",
      photos: [],
      video: video._id,
    });
    await mutation(manager, "photos:review", {
      ...scope,
      entryId: videoEntry._id,
      expectedVersion: 1,
      operationId: "approve-video",
      decision: "approved",
      reason: "",
    });
    await page.goto(`${base}/entries/${videoEntry._id}`);
    await expect(
      page.getByLabel("A video for families video"),
    ).toHaveJSProperty("videoWidth", 32);
    await page.screenshot({
      path: `.codex/ralph/t05-${info.project.name}-video.png`,
      fullPage: true,
    });
    let videoFail = true;
    await page.route("**/api/videos?action=public**", (route) =>
      videoFail
        ? route.fulfill({ status: 503, body: "Unavailable" })
        : route.continue(),
    );
    await page.reload();
    await expect(
      page.getByText("This ad's media is unavailable", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "Support adoption.is through this ad",
        exact: true,
      }),
    ).toHaveAttribute("href", videoEntry.trackedPath);
    videoFail = false;
    await page
      .getByRole("button", { name: "Retry media", exact: true })
      .click();
    await expect(
      page.getByLabel("A video for families video"),
    ).toHaveJSProperty("videoWidth", 32);
    await mutation(creator, "photos:submit", {
      ...request,
      entryId: entry._id,
      expectedVersion: 1,
      operationId: "unreviewed-change",
      title: "Private unreviewed change",
    });
    await page.goto(`${base}/entries/${entry._id}`);
    await expect(
      page.getByRole("heading", { name: "Ad unavailable" }),
    ).toBeVisible();
    await expect(page.getByText("Private unreviewed change")).toHaveCount(0);
    expect(
      (await query(backend.client(), "publicViewer:campaign")).entries,
    ).toHaveLength(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(sessions).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    if (server)
      await new Promise<void>((resolve) =>
        server!.httpServer.close(() => resolve()),
      );
    await backend.stop();
  }
});

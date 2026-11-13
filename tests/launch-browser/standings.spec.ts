import { expect, test } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createHttpServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { servePhotoRequest } from "../../api/photos.ts";
import { fundraisingEntry } from "../launch/fundraising-fixtures.ts";
import { mutation, query } from "../launch/public-fixtures.ts";
import {
  certify,
  donate,
  emptyFundraising,
  standingsDay as day,
} from "../launch/standings-fixtures.ts";

test("T14 guest daily/weekly standings refresh stored results at 30 seconds and retain delayed standings", async ({
  page,
  context,
}, info) => {
  test.setTimeout(240000);
  await mkdir(".codex/ralph/t14", { recursive: true });
  const backend = await createLocalBackend(),
    inheritedNodeEnv = process.env.NODE_ENV;
  const errors: string[] = [],
    captures: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    const bridge = createHttpServer(
      (req, res) =>
        void servePhotoRequest(
          req.url?.startsWith("/api/fundraising")
            ? backend.fundraisingService
            : backend.photoService,
          req,
          res,
        ),
    );
    bridge.listen(0, "127.0.0.1");
    await once(bridge, "listening");
    const bridgeAddress = bridge.address();
    if (!bridgeAddress || typeof bridgeAddress === "string")
      throw new Error("Owned bridge required");
    const bridgeBase = `http://127.0.0.1:${bridgeAddress.port}`;
    let entry: any;
    try {
      entry = await fundraisingEntry(backend, bridgeBase, "standings-browser");
    } finally {
      await new Promise<void>((resolve, reject) =>
        bridge.close((e) => (e ? reject(e) : resolve())),
      );
    }
    process.env.NODE_ENV = "development";
    server = await createServer({
      configFile: "vite.launch.config.ts",
      mode: "development",
      logLevel: "error",
      cacheDir: await mkdtemp(join(tmpdir(), "slander-standings-browser-")),
      define: {
        "import.meta.env.VITE_LOCAL_LAUNCH_HARNESS":
          JSON.stringify("owned-isolated-run"),
      },
      server: { host: "127.0.0.1", port: 0, strictPort: false },
      plugins: [
        {
          name: "owned-standings-browser",
          configureServer(vite) {
            vite.middlewares.use((req, res, next) => {
              const target = new URL(req.url ?? "/", "http://127.0.0.1");
              if (target.pathname.startsWith("/api/")) {
                void servePhotoRequest(
                  target.pathname === "/api/fundraising"
                    ? backend.fundraisingService
                    : backend.photoService,
                  req,
                  res,
                );
                return;
              }
              if (
                [
                  "/__allocation/public-config",
                  "/__allocation/session",
                ].includes(target.pathname)
              ) {
                res.setHeader("Content-Type", "application/json");
                res.setHeader("Cache-Control", "no-store");
                res.end(
                  JSON.stringify({
                    url: backend.url,
                    ...(target.pathname.endsWith("session")
                      ? { token: backend.token("manager-a") }
                      : {}),
                  }),
                );
                return;
              }
              if (target.pathname === "/")
                req.url = "/launch-preview.html" + target.search;
              next();
            });
          },
        },
      ],
    });
    await server.listen();
    expect(
      /"DEV"\s*:\s*true/.test(
        (await server.transformRequest("/src/launch/main.tsx"))?.code ?? "",
      ),
    ).toBe(true);
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("Owned browser port required");
    const base = `http://127.0.0.1:${address.port}`,
      manager = backend.client("manager-a"),
      selection = { kind: "daily", period: "2026-02-01" };
    const capture = async (label: string) => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const path = `.codex/ralph/t14/${info.project.name}-${label}.png`;
      await page.screenshot({ path, fullPage: true });
      captures.push(path);
    };
    await page.clock.install();
    await page.goto(base);
    await page
      .getByRole("link", { name: "Daily and weekly standings" })
      .click();
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    await page.getByLabel("Chicago period").selectOption("2026-02-01");
    await expect(
      page.getByText("No complete stored result yet.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
    await capture("first-held");
    await certify(backend, entry._id, "impressions", 25);
    await certify(backend, entry._id, "linkClicks", 36);
    await emptyFundraising(backend, entry._id);
    const managerPage = await context.newPage();
    await managerPage.goto(base + "/?workspace=manager");
    await managerPage
      .getByRole("button", { name: "Standings", exact: true })
      .click();
    await managerPage.getByLabel("Chicago period").selectOption("2026-02-01");
    await managerPage
      .getByRole("button", { name: "Publish stored provisional results" })
      .click();
    await expect(
      managerPage.getByText("Refresh stored.", { exact: true }),
    ).toBeVisible();
    await expect(
      managerPage.getByText(/daily 2026-02-01: stored · manager-a/),
    ).toBeVisible();
    await page.clock.runFor(30000);
    await expect(
      page.getByRole("listitem", { name: "Rank 1 Families together" }),
    ).toBeVisible();
    await expect(page.getByText("Score 45.46", { exact: false })).toBeVisible();
    await expect(
      page.getByText("Last successful import: Not available", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Reporting delay: Unknown", { exact: false }),
    ).toBeVisible();
    await capture("daily");
    // Stored data changes via actual signed confirmation + manager publication.
    await donate(backend, base, entry._id, 6400, day.start);
    await managerPage
      .getByRole("button", { name: "Publish stored provisional results" })
      .click();
    await expect(
      managerPage.getByText("Refresh stored.", { exact: true }),
    ).toBeVisible();
    await page.clock.runFor(29999);
    await expect(page.getByText("Score 45.46", { exact: false })).toBeVisible();
    await page.clock.runFor(1);
    await expect(page.getByText("Score 69.46", { exact: false })).toBeVisible();
    await capture("refreshed");
    const daily = (await query(backend.client(), "standings:read", selection))
      .rows;
    // Exact weekly authority remains separate; broader certification cannot invent daily residual.
    const state = await query(manager, "paidMetrics:read", {
      campaignId: "adoption",
    });
    for (const correction of state.correctionState.corrections.filter(
      (c: any) => c.active,
    ))
      await mutation(manager, "paidCorrections:release", {
        campaignId: "adoption",
        correctionId: correction._id,
        reason: "Reviewed weekly replacement",
        expectedRevision: (
          await query(manager, "paidMetrics:read", { campaignId: "adoption" })
        ).correctionState.revision,
        operationId: randomUUID(),
      });
    const week = { start: Date.parse("2026-01-26T06:00:00Z"), end: day.end };
    await certify(backend, entry._id, "impressions", 250, week);
    await certify(backend, entry._id, "linkClicks", 360, week);
    await mutation(manager, "standings:refresh", {
      campaignId: "adoption",
      kind: "weekly",
      period: "2026-01-26",
      operationId: randomUUID(),
    });
    await page.getByLabel("Standings frequency").selectOption("weekly");
    await page.getByLabel("Chicago period").selectOption("2026-01-26");
    await expect(
      page.getByRole("heading", { name: "Weekly · 2026-01-26" }),
    ).toBeVisible();
    await expect(page.getByText("Score 53.05", { exact: false })).toBeVisible();
    await capture("weekly");
    await page.getByLabel("Standings frequency").selectOption("daily");
    await page.getByLabel("Chicago period").selectOption("2026-02-01");
    await expect(
      page.getByText("Some results are delayed", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Score 69.46", { exact: false })).toBeVisible();
    expect(
      (await query(backend.client(), "standings:read", selection)).rows,
    ).toEqual(daily);
    await capture("delayed");
    await backend.runOwnedInternal("fixtures:fundraisingControl", {
      entryId: entry._id,
      cutoff: Date.now() - 1,
    });
    await page.clock.runFor(30000);
    await expect(
      page.getByRole("listitem", { name: "Rank 1 Families together" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("No public ranked ads available."),
    ).toBeVisible();
    await capture("hidden");
    expect(await page.locator("body").textContent()).not.toMatch(
      /paymentId|donationIds|acct_owned|commissionCents|manager-a/,
    );
    expect(errors).toEqual([]);
    await managerPage.close();
    await writeFile(
      `.codex/ralph/t14/${info.project.name}-browser-evidence.json`,
      JSON.stringify(
        {
          story: "T14",
          captures,
          errors,
          refreshIntervalMs: 30000,
          actualConvex: true,
          synthetic: true,
          productionEligible: false,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    try {
      await server?.close();
      await backend.stop();
    } finally {
      if (inheritedNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = inheritedNodeEnv;
    }
  }
});

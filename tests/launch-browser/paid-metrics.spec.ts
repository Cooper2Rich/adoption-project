import { expect, test } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createHttpServer } from "node:http";
import { once } from "node:events";
import { appendFileSync } from "node:fs";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { servePhotoRequest } from "../../api/photos.ts";
import { fundraisingEntry } from "../launch/fundraising-fixtures.ts";
import { mutation, query } from "../launch/public-fixtures.ts";

test("T12 manager maps approved paid placements and inspects values, missing coverage, failed imports and recovery", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  await mkdir(".codex/ralph", { recursive: true });
  await writeFile(
    `.codex/ralph/t12-${info.project.name}-browser-stages.jsonl`,
    "",
  );
  const stage = (name: string) =>
    appendFileSync(
      `.codex/ralph/t12-${info.project.name}-browser-stages.jsonl`,
      JSON.stringify({ at: new Date().toISOString(), stage: name }) + "\n",
    );
  stage("before-backend");
  const backend = await createLocalBackend(),
    inheritedNodeEnv = process.env.NODE_ENV,
    errors: string[] = [];
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  const captures: any[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    stage("after-backend");
    // Exercise the same authenticated photo API before dev dependency startup.
    const bridge = createHttpServer(
      (req, res) => void servePhotoRequest(backend.photoService, req, res),
    );
    bridge.listen(0, "127.0.0.1");
    await once(bridge, "listening");
    const bridgeAddress = bridge.address();
    if (!bridgeAddress || typeof bridgeAddress === "string")
      throw new Error("Owned photo bridge port required");
    let entry: any;
    try {
      entry = await fundraisingEntry(
        backend,
        `http://127.0.0.1:${bridgeAddress.port}`,
        "paid-browser",
        "adoption",
        "public-creator",
        "River Studio",
        stage,
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        bridge.close((error) => (error ? reject(error) : resolve())),
      );
    }
    stage("after-photo-prerequisite");
    process.env.NODE_ENV = "production";
    process.env.NODE_ENV = "development";
    const cacheDir = await mkdtemp(
      join(tmpdir(), "slander-paid-browser-cache-"),
    );
    stage("before-createServer");
    server = await createServer({
      configFile: "vite.launch.config.ts",
      mode: "development",
      logLevel: "error",
      cacheDir,
      define: {
        "import.meta.env.VITE_LOCAL_LAUNCH_HARNESS":
          JSON.stringify("owned-isolated-run"),
      },
      server: { host: "127.0.0.1", port: 0, strictPort: false },
      plugins: [
        {
          name: "owned-paid-browser",
          configureServer(vite) {
            vite.middlewares.use((req, res, next) => {
              const target = new URL(req.url ?? "/", "http://127.0.0.1");
              if (target.pathname.startsWith("/api/")) {
                void servePhotoRequest(
                  target.pathname === "/api/paid-metrics"
                    ? backend.paidService
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
    stage("after-createServer");
    await server.listen();
    stage("after-listen");
    expect(
      /"DEV"\s*:\s*true/.test(
        (await server.transformRequest("/src/launch/main.tsx"))?.code ?? "",
      ),
    ).toBe(true);
    stage("after-bootstrap-transform");
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("Owned browser port required");
    const base = `http://127.0.0.1:${address.port}`,
      manager = backend.client("manager-a"),
      scope = { campaignId: "adoption" };
    let now = Date.now() - 3600000,
      revision = 0;
    const period = {
      start: Date.parse("2026-02-01T06:00:00Z"),
      end: Date.parse("2026-02-02T06:00:00Z"),
    };
    const control = () =>
      backend.runOwnedInternal("fixtures:paidControl", { ...scope, now });
    await control();
    const periodId = await mutation(manager, "paidMetrics:addPeriod", {
      ...scope,
      label: "February 1",
      ...period,
    });
    const proofs = [];
    for (const [provider, platform] of [
      ["meta", "facebook"],
      ["meta", "instagram"],
      ["tiktok", "tiktok"],
    ])
      proofs.push(
        await backend.runOwnedInternal("fixtures:paidEnrollment", {
          ...scope,
          entryId: entry._id,
          provider,
          platform,
          account: `owned-${provider}-a`,
          adId: `owned-ad-${platform}`,
          requiredPeriods: [period],
        }),
      );
    await mkdir(".codex/ralph", { recursive: true });
    const capture = async (name: string, locator: any) => {
      const overflow = await page.evaluate(() => ({
        valid:
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll("body *")]
          .filter(
            (e) =>
              e.getBoundingClientRect().right >
              document.documentElement.clientWidth + 1,
          )
          .map((e) => ({
            tag: e.tagName,
            className: e.className,
            text: e.textContent?.slice(0, 100),
            right: e.getBoundingClientRect().right,
          })),
      }));
      if (!overflow.valid)
        await writeFile(
          `.codex/ralph/t12-${info.project.name}-overflow.json`,
          JSON.stringify(overflow, null, 2),
        );
      expect(overflow.valid).toBe(true);
      const path = `.codex/ralph/t12-${info.project.name}-${name}.png`;
      await locator.screenshot({ path });
      captures.push({ path, at: new Date().toISOString() });
    };
    await page.goto(base + "/?workspace=manager");
    stage("after-page-navigation");
    await page
      .getByRole("button", { name: "Paid performance", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Paid performance", exact: true }),
    ).toBeVisible();
    for (const proof of proofs) {
      await page
        .getByLabel("Approved enrollment", { exact: true })
        .selectOption(proof);
      await page
        .getByRole("button", { name: "Map approved placement", exact: true })
        .click();
      await expect(page.getByRole("status")).toHaveText(
        "Placement mapping saved; source monitoring active.",
      );
    }
    stage("after-ui-mappings");
    const meta = page.getByRole("region", {
        name: "meta source health",
        exact: true,
      }),
      inputs = page.getByRole("region", {
        name: "Period February 1",
        exact: true,
      });
    await expect(
      meta.getByText("No successful import yet", { exact: false }),
    ).toBeVisible();
    await expect(
      inputs.getByText(/Accepted observations: Missing paid impressions/),
    ).toBeVisible();
    await capture(
      "mappings",
      page
        .getByRole("heading", { name: "Approved placement mappings" })
        .locator(".."),
    );
    await capture("first-use", meta);
    let d = await query(manager, "paidMetrics:read", scope),
      source = d.sources.find((s: any) => s.provider === "meta");
    now += 300001;
    await control();
    await backend.runOwnedInternal("paidMetrics:watchdog", {
      sourceId: source._id,
      generation: source.watchGeneration,
    });
    await expect(
      meta.getByText("Import outage", { exact: true }),
    ).toBeVisible();
    await capture("outage", meta);
    const configure = async (extra: any = {}) => {
      d = await query(manager, "paidMetrics:read", scope);
      backend.paidProvider.configure({
        mappings: d.mappings.map((m: any) => ({
          ...m,
          proof: d.enrollments.find((p: any) => p._id === m.enrollmentId),
        })),
        period,
        revision: ++revision,
        dataAsOf: now,
        values: {},
        ...extra,
      });
    };
    const run = async (provider: string, mode = "normal", extra: any = {}) => {
      now += 61000;
      await control();
      await configure(extra);
      backend.paidProvider.mode(mode);
      await page
        .getByRole("button", {
          name: `Import ${provider} · February 1`,
          exact: true,
        })
        .click();
      await expect(page.getByRole("status")).toHaveText(
        "Import operation recorded. Review its outcome and separate coverage below.",
      );
    };
    await run("meta");
    await run("tiktok");
    await expect(
      inputs.getByText(
        /Accepted observations: 400 paid impressions · 40 total link clicks/,
      ),
    ).toBeVisible();
    await expect(
      inputs.getByText("Complete controlled coverage · Finalization held", {
        exact: true,
      }),
    ).toBeVisible();
    await capture("values-coverage", inputs);
    await capture("recovery", meta);
    await run("meta", "normal", {
      values: {
        facebook: { impressions: 0, linkClicks: 0 },
        instagram: { impressions: 0, linkClicks: 0 },
      },
    });
    await expect(
      inputs.getByText("facebook impressions: Known zero (controlled proof)", {
        exact: true,
      }),
    ).toBeVisible();
    await capture("known-zero", inputs);
    await run("meta", "missing-field");
    await expect(
      inputs.getByText("Incomplete coverage · Finalization held", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      inputs
        .getByText("Required placement or metric missing", { exact: true })
        .first(),
    ).toBeVisible();
    await capture("missing-coverage", inputs);
    await run("meta", "wrong-report");
    await expect(meta.getByText(/Latest import failed:/)).toBeVisible();
    await meta.getByText("Import operation history", { exact: true }).click();
    await expect(
      meta.getByText(/failed · processing: report scope/),
    ).toBeVisible();
    await capture("failed-import", meta);
    await page
      .getByRole("button", { name: "Operator incidents", exact: true })
      .click();
    const incident = page.locator(".operator-incident").first();
    await expect(incident.getByText("Resolved", { exact: true })).toBeVisible();
    await expect(
      incident.getByRole("heading", { name: "Detection notice", exact: true }),
    ).toBeVisible();
    await expect(
      incident.getByRole("heading", { name: "Recovery notice", exact: true }),
    ).toBeVisible();
    await capture("incident-recovery", incident);
    expect(errors).toEqual([]);
    stage("after-all-assertions");
    expect(process.env.NODE_ENV).toBe("development");
    await writeFile(
      `.codex/ralph/t12-${info.project.name}-browser-evidence.json`,
      JSON.stringify(
        {
          story: "T12",
          at: new Date().toISOString(),
          periodId,
          synthetic: true,
          productionEligible: false,
          captures,
          errors,
          overflow: false,
        },
        null,
        2,
      ),
    );
  } finally {
    stage("before-teardown");
    try {
      if (server) await server.close();
    } finally {
      try {
        await backend.stop();
      } finally {
        if (inheritedNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = inheritedNodeEnv;
        stage("after-teardown");
      }
    }
  }
});

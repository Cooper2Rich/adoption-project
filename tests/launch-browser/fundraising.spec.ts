import { expect, test } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { servePhotoRequest } from "../../api/photos.ts";
import { fundraisingEntry } from "../launch/fundraising-fixtures.ts";
import { query } from "../launch/public-fixtures.ts";

test("T10 account-free shared checkout pending/confirmed old links and private earnings", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240000);
  const backend = await createLocalBackend();
  const inheritedNodeEnv = process.env.NODE_ENV;
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  const errors: string[] = [],
    publicSessions: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/__allocation\/session/.test(request.url()))
      publicSessions.push(request.url());
  });
  try {
    // Reproduce a preceding production build in this same worker, even when
    // this journey is selected alone. The owned server must scope its own mode.
    process.env.NODE_ENV = "production";
    // Vite's DEV flag and deferred React optimization both follow NODE_ENV.
    // Scope development to the full owned-server lifetime, then restore it.
    process.env.NODE_ENV = "development";
    server = await createServer({
      configFile: "vite.launch.config.ts",
      mode: "development",
      logLevel: "error",
      define: {
        "import.meta.env.VITE_LOCAL_LAUNCH_HARNESS":
          JSON.stringify("owned-isolated-run"),
      },
      server: { host: "127.0.0.1", port: 0, strictPort: false },
      plugins: [
        {
          name: "owned-fundraising-browser",
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
                      ? {
                          token: backend.token(
                            req.headers.cookie?.includes(
                              "ownedIdentity=creator",
                            )
                              ? "public-creator"
                              : "manager-a",
                          ),
                        }
                      : {}),
                  }),
                );
                return;
              }
              if (
                target.pathname === "/" ||
                /^\/(fundraise|entries)(\/|$)/.test(target.pathname)
              )
                req.url = "/launch-preview.html" + target.search;
              next();
            });
          },
        },
      ],
    });
    await server.listen();
    const bootstrap = await server.transformRequest("/src/launch/main.tsx");
    expect(/"DEV"\s*:\s*true/.test(bootstrap?.code ?? "")).toBe(true);
    expect(process.env.NODE_ENV).toBe("development");
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("Missing owned browser port");
    const base = `http://127.0.0.1:${address.port}`,
      entry = await fundraisingEntry(backend, base, "fundraising-browser");
    backend.stripe.browserClock(Date.parse("2026-11-01T07:30:00Z"));
    await mkdir(".codex/ralph", { recursive: true });
    const capture = async (name: string, fullPage = true) => {
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.codex/ralph/t10-${info.project.name}-${name}.png`,
        fullPage,
      });
    };
    await page.goto(
      `${base}${entry.trackedPath}?utm_source=tiktok&entryId=forged`,
    );
    await expect(
      page.getByRole("region", { name: "Tracked fundraising" }),
    ).toContainText("River Studio");
    await expect(page.getByText(/unvalidated Stripe transport/)).toBeVisible();
    await page.getByLabel("Donation amount (USD)").fill("0.55");
    await page
      .getByRole("button", {
        name: "Continue to controlled Stripe checkout",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Controlled Stripe checkout" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Return without confirmation" })
      .click();
    await expect(page.getByText(/Pending provider confirmation/)).toBeVisible();
    expect(
      await query(backend.client("manager-a"), "fundraising:ledger", {
        campaignId: "adoption",
        audience: "manager",
      }),
    ).toHaveLength(0);
    await capture("pending");
    await page
      .getByRole("button", {
        name: "Retry same controlled checkout",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Confirm controlled donation", exact: true })
      .click();
    await expect(
      page.getByText(/Controlled donation confirmed once/),
    ).toBeVisible();
    await capture("confirmed");
    const ledger = await query(
      backend.client("manager-a"),
      "fundraising:ledger",
      { campaignId: "adoption", audience: "manager" },
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0].commissionCents).toBe(6);
    expect(ledger[0].originEntryId).toBe(entry._id);
    expect(publicSessions).toEqual([]);
    const context = await browser.newContext({
      viewport: info.project.use.viewport,
    });
    try {
      const second = await context.newPage();
      await second.goto(`${base}${entry.trackedPath}?utm_source=facebook`);
      await expect(
        second.getByRole("button", {
          name: "Continue to controlled Stripe checkout",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        second.getByText(/confirmed once|paymentId|chargeId/),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
    await page.goto(`${base}/?workspace=manager`);
    await page
      .getByRole("button", { name: "Fundraising ledger", exact: true })
      .click();
    const privateLedger = page.getByRole("region", {
      name: "Private fundraising ledger",
    });
    await expect(
      privateLedger.getByText("$0.55", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      privateLedger.getByText("$0.06", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      privateLedger.getByText(/Unknown · awaiting provider fee evidence/),
    ).toBeVisible();
    await capture("manager-ledger");
    await page
      .context()
      .addCookies([{ name: "ownedIdentity", value: "creator", url: base }]);
    await page.goto(`${base}/?workspace=creator`);
    await expect(
      page.getByRole("heading", {
        name: "Your fundraising earnings",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Private fundraising ledger" })
        .getByText("$0.06", { exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByText("No additional private updates yet.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("No earnings or payment setup records yet.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("heading", { name: "Your fundraising earnings", exact: true })
      .scrollIntoViewIfNeeded();
    await capture("creator-ledger", false);
    await backend.runOwnedInternal("fixtures:fundraisingControl", {
      entryId: entry._id,
      cutoff: Date.parse("2026-11-02T06:00:00Z"),
      reason: "ordinary-removal",
    });
    backend.stripe.browserClock(Date.parse("2026-11-03T07:30:00Z"));
    await page.goto(`${base}${entry.trackedPath}`);
    await expect(
      page.getByText("This preserved link continues supporting the nonprofit."),
    ).toBeVisible();
    await expect(page.getByRole("img")).toHaveCount(0);
    await expect(
      page.getByText(/River Studio|Families together|Approved fundraising/),
    ).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "Start another controlled donation",
        exact: true,
      })
      .click();
    await page.getByLabel("Donation amount (USD)").fill("1.55");
    await page
      .getByRole("button", {
        name: "Continue to controlled Stripe checkout",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Confirm controlled donation", exact: true })
      .click();
    await expect(
      page.getByText(/Controlled donation confirmed once/),
    ).toBeVisible();
    await capture("old-link");
    const rows = await query(
      backend.client("manager-a"),
      "fundraising:ledger",
      { campaignId: "adoption", audience: "manager" },
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].commissionCents).toBe(0);
    expect(rows[1].dailyPeriod).toBe(null);
    await page.goto(`${base}/fundraise`);
    await expect(
      page.getByRole("button", {
        name: "Continue to controlled Stripe checkout",
        exact: true,
      }),
    ).toBeVisible();
    await capture("untracked");
    expect(errors).toEqual([]);
    await writeFile(
      `.codex/ralph/t10-${info.project.name}-browser-evidence.json`,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          synthetic: true,
          validatedForProduction: false,
          journey: [
            "tracked cross-platform account-free",
            "browser return pending",
            "same checkout retry",
            "signed owned confirmation once",
            "second-session privacy",
            "manager itemization",
            "creator earnings",
            "hidden old link nonprofit-only",
            "untracked account-free",
          ],
          assertions: {
            initialCommissionCents: 6,
            oldLinkCommissionCents: 0,
            publicAuthRequests: 0,
            overflow: false,
            pageErrors: errors,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      if (server) await server.close();
    } finally {
      try {
        await backend.stop();
      } finally {
        if (inheritedNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = inheritedNodeEnv;
      }
    }
  }
});

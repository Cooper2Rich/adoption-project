import { expect, test } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { servePhotoRequest } from "../../api/photos.ts";
import { fundraisingEntry } from "../launch/fundraising-fixtures.ts";
import { query } from "../launch/public-fixtures.ts";

test("T11 confirmed refunds preserve finalized prizes and show commission-only negative balance", async ({
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
        path: `.codex/ralph/t11-${info.project.name}-${name}.png`,
        fullPage,
      });
    };

    await page.goto(base + entry.trackedPath);
    await page.getByLabel("Donation amount (USD)").fill("0.55");
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
    const scope = { campaignId: "adoption" },
      manager = backend.client("manager-a");
    const rows = await query(manager, "fundraising:ledger", {
        ...scope,
        audience: "manager",
      }),
      d = rows[0],
      sid = backend.stripe.sessions()[0].id;
    await backend.runOwnedInternal("fixtures:fundraisingEvidence", {
      donationId: d.id,
      action: "obligation",
      facts: {},
    });
    await backend.runOwnedInternal("fixtures:fundraisingEvidence", {
      donationId: d.id,
      action: "paid",
      facts: {
        paymentId: "owned-browser-paid",
        status: "confirmed",
        confirmedAt: d.completedAt + 1000,
        evidence: "Owned historical payment control; no bank action",
      },
    });
    await backend.runOwnedInternal("fixtures:fundraisingEvidence", {
      donationId: d.id,
      action: "finalized",
      facts: {},
    });
    const refund = backend.stripe.refund(sid, 1);
    const response = await backend.stripe.deliver(
      refund,
      base + "/api/fundraising?action=webhook",
    );
    expect(response.status, await response.text()).toBe(200);
    await page.goto(base + "/?workspace=manager");
    await page
      .getByRole("button", { name: "Fundraising ledger", exact: true })
      .click();
    const ledger = page.getByRole("region", {
      name: "Private fundraising ledger",
    });
    const amount = async (label: string, value: string) =>
      expect(
        ledger
          .getByText(label, { exact: true })
          .locator("..")
          .getByText(value, { exact: true }),
      ).toBeVisible();
    await expect(
      ledger.getByText("Creator: River Studio", { exact: true }),
    ).toBeVisible();
    await amount("Negative carryforward", "-$0.01");
    await amount("Commission payable", "$0.00");
    await amount("Original creator commission", "$0.06");
    await amount("Current recognized commission", "$0.05");
    await amount("Confirmed refunds", "$0.01");
    await expect(
      ledger.getByText(/Manager review required: future commissions/),
    ).toBeVisible();
    await expect(
      ledger.getByText(/Fixed prize obligation: \$50.00/),
    ).toBeVisible();
    await expect(
      ledger.getByText(
        /Manager review required · Corrected fundraising: \$0.54/,
      ),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await ledger.screenshot({
      path: `.codex/ralph/t11-${info.project.name}-manager-ledger.png`,
    });
    await page
      .getByRole("button", { name: "Operator incidents", exact: true })
      .click();
    await expect(
      page.getByText("fundraising discrepancy", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("commission overpayment", { exact: true }),
    ).toBeVisible();
    await capture("manager-notices");
    await page
      .context()
      .addCookies([{ name: "ownedIdentity", value: "creator", url: base }]);
    await page.goto(base + "/?workspace=creator");
    const own = page.getByRole("region", {
      name: "Private fundraising ledger",
    });
    // Navigation can finish before the creator's private queries subscribe.
    // Confirm both the donation and balance projections before their amounts.
    await expect(
      own.getByRole("article", {
        name: "Confirmed fundraising donation",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      own.getByRole("article", { name: "Commission balance", exact: true }),
    ).toBeVisible();
    await expect(
      own
        .getByText("Negative carryforward", { exact: true })
        .locator("..")
        .getByText("-$0.01", { exact: true }),
    ).toBeVisible();
    await expect(
      own
        .getByText("Current recognized commission", { exact: true })
        .locator("..")
        .getByText("$0.05", { exact: true }),
    ).toBeVisible();
    await expect(
      own.getByText(/Fixed prize obligation: \$50.00/),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await own.screenshot({
      path: `.codex/ralph/t11-${info.project.name}-creator-ledger.png`,
    });
    const context = await browser.newContext({
      viewport: info.project.use.viewport,
    });
    try {
      const guest = await context.newPage();
      await guest.goto(base + entry.trackedPath);
      await expect(
        guest.getByRole("region", { name: "Private fundraising ledger" }),
      ).toHaveCount(0);
      await expect(
        guest.getByText(/negative|commission balance|paymentId|chargeId/i),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
    expect(errors).toEqual([]);
    await writeFile(
      `.codex/ralph/t11-${info.project.name}-browser-evidence.json`,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          synthetic: true,
          validatedForProduction: false,
          publicDonationCents: 55,
          confirmedRefundCents: 1,
          originalCommissionCents: 6,
          recognizedCommissionCents: 5,
          confirmedPaidCommissionCents: 6,
          negativeCarryforwardCents: -1,
          payableCents: 0,
          preservedFixedPrizeCents: 5000,
          managerNotified: true,
          overflow: false,
          errors,
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

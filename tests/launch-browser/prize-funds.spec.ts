import { expect, test } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { mutation, query } from "../launch/public-fixtures.ts";
import { prizeRules } from "../launch/prize-fixtures.ts";
import { promisedPrizes } from "../../convex/prizePolicy.ts";

test("T15 manager protected prize purposes, shortages, unknown settlement, recovery and revoked access", async ({
  page,
  context,
}, info) => {
  test.setTimeout(240000);
  await mkdir(".codex/ralph/t15", { recursive: true });
  const backend = await createLocalBackend(),
    inheritedNodeEnv = process.env.NODE_ENV,
    scope = { campaignId: "adoption" },
    manager = backend.client("manager-a"),
    captures: string[] = [],
    errors: string[] = [];
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  page.on("pageerror", (e) => errors.push(e.message));
  const read = () => query(manager, "prizeFunds:inspect", scope),
    clock = (now: number, advance = false) =>
      backend.runOwnedInternal("fixtures:prizeControl", {
        ...scope,
        now,
        advance,
      }),
    evidence = (facts: any) =>
      backend.runOwnedInternal("fixtures:prizeEvidence", { ...scope, facts });
  try {
    await clock(Date.parse("2026-02-27T06:00:00Z"));
    await mutation(manager, "campaignSetup:create", {
      ...scope,
      operationId: "browser-t15-rules",
      rules: prizeRules,
    });
    await mutation(manager, "operatorIncidents:registerContact", scope);
    process.env.NODE_ENV = "development";
    server = await createServer({
      configFile: "vite.launch.config.ts",
      mode: "development",
      logLevel: "error",
      cacheDir: await mkdtemp(join(tmpdir(), "slander-prize-browser-")),
      define: {
        "import.meta.env.VITE_LOCAL_LAUNCH_HARNESS":
          JSON.stringify("owned-isolated-run"),
      },
      server: { host: "127.0.0.1", port: 0, strictPort: false },
      plugins: [
        {
          name: "owned-prize-browser",
          configureServer(vite) {
            vite.middlewares.use((req, res, next) => {
              const target = new URL(req.url ?? "/", "http://127.0.0.1");
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
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("Owned browser port required");
    const base = `http://127.0.0.1:${address.port}`;
    expect(
      /"DEV"\s*:\s*true/.test(
        (await server.transformRequest("/src/launch/main.tsx"))?.code ?? "",
      ),
    ).toBe(true);
    const open = async (target = page) => {
      await target.goto(base + "/?workspace=manager");
      await target
        .getByRole("button", { name: "Prize funds", exact: true })
        .click();
      await expect(
        target.getByRole("heading", {
          name: "Protected prize funds",
          exact: true,
        }),
      ).toBeVisible();
    };
    const capture = async (label: string) => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const path = `.codex/ralph/t15/${info.project.name}-${label}.png`;
      await page.screenshot({ path, fullPage: true });
      captures.push(path);
    };
    await open();
    await expect(
      page.getByRole("status").filter({ hasText: "Paid competition held" }),
    ).toBeVisible();
    await capture("missing-evidence");
    const required = promisedPrizes(prizeRules).requiredCents;
    await evidence({
      fundraisingCents: 9999,
      prizeCents: required - 1,
      advertisingCents: 900000,
      reservedCreatorCents: 0,
      advertisingObligationsCents: 900000,
    });
    let r = await read(),
      first = r.occurrences[0];
    await clock(first.advanceAt, true);
    await expect(
      page.getByText(/available 9999; shortfall 1/).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "full promised" }),
    ).toBeVisible();
    await capture("advance-shortage");
    await clock(first.executionAt, true);
    await expect(page.getByText("shortage", { exact: true })).toBeVisible();
    await evidence({
      fundraisingCents: 10000,
      prizeCents: required - 1,
      advertisingCents: 900000,
      advertisingObligationsCents: 900000,
    });
    await clock(first.executionAt + 3600000);
    await page
      .getByRole("button", { name: "Recheck same obligation", exact: true })
      .first()
      .click();
    await expect.poll(async () => (await read()).transfers.length).toBe(1);
    r = await read();
    let transfer = r.transfers[0];
    backend.prize.setMode("lost");
    await backend.runOwnedInternal("prizeJobs:run", {
      transferId: transfer._id,
      generation: transfer.generation,
    });
    await expect(
      page.getByRole("heading", { name: "$100.00 · unknown", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/original transfer requires reconciliation/),
    ).toBeVisible();
    await capture("unknown");
    const second = await context.newPage();
    await open(second);
    await expect(
      second.getByRole("heading", { name: "$100.00 · unknown", exact: true }),
    ).toBeVisible();
    await backend.restart();
    r = await read();
    transfer = r.transfers[0];
    await clock(transfer.nextAt);
    backend.prize.setMode("settled");
    await backend.runOwnedInternal("prizeJobs:run", {
      transferId: transfer._id,
      generation: transfer.generation,
    });
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Full promised prize schedule covered" }),
    ).toBeVisible();
    await expect(
      second
        .getByRole("status")
        .filter({ hasText: "Full promised prize schedule covered" }),
    ).toBeVisible();
    await expect(page.getByText("fulfilled", { exact: true })).toBeVisible();
    await capture("fulfilled");
    await page.getByText("Audit history", { exact: true }).click();
    await expect(
      page.getByText(/settled-once · prize-dispatcher/),
    ).toBeVisible();
    await capture("audit");
    expect(backend.prize.calls.filter((c) => c.method === "POST").length).toBe(
      1,
    );
    await backend.runOwnedInternal("fixtures:readinessControl", {
      ...scope,
      managerActive: false,
    });
    await expect(
      page.getByRole("heading", { name: "Workspace unavailable", exact: true }),
    ).toBeVisible();
    await capture("revoked");
    await second.close();
    await writeFile(
      `.codex/ralph/t15/${info.project.name}-browser-evidence.json`,
      JSON.stringify(
        {
          captures,
          errors: errors.filter(
            (e) => !/FORBIDDEN|Current campaign manager/.test(e),
          ),
          expectedRevokedAccess: true,
          actualFinancialAuthority: "held",
          providerPosts: 1,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    expect(
      errors.filter((e) => !/FORBIDDEN|Current campaign manager/.test(e)),
    ).toEqual([]);
  } finally {
    await server?.close();
    process.env.NODE_ENV = inheritedNodeEnv;
    await backend.stop();
  }
});

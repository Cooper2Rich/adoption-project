import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import test from "node:test";

test(
  "concurrent fixture processes start independent backends and dashboards",
  { timeout: 240000 },
  async () => {
    const moduleUrl = new URL(
      "../../scripts/launch/local-backend.ts",
      import.meta.url,
    ).href;
    const code = `
    import { readFile } from "node:fs/promises";
    import { join } from "node:path";
    const { createLocalBackend } = await import(${JSON.stringify(moduleUrl)});
    let backend;
    try {
      backend = await createLocalBackend();
      const stop = new Promise(resolve => {
        process.stdin.once("data", resolve);
        process.stdin.once("end", resolve);
      });
      const dashboard = JSON.parse(await readFile(join(backend.directory, ".convex/local/default/dashboard.json"), "utf8"));
      console.log(JSON.stringify({ url: backend.url, dashboardPort: dashboard.port }));
      await stop;
    } finally {
      await backend?.stop();
    }
  `;
    const children = Array.from({ length: 2 }, () => {
      const child = spawn(
        process.execPath,
        ["--input-type=module", "-e", code],
        {
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      let diagnostics = "";
      child.stderr.on("data", (chunk) => {
        diagnostics += chunk;
      });
      const closed = once(child, "close");
      const lines = createInterface({ input: child.stdout });
      const ready = Promise.race([
        once(lines, "line").then(
          ([line]): { url: string; dashboardPort: number } => JSON.parse(line),
        ),
        closed.then(([code]) => {
          throw new Error(
            `Fixture process exited before readiness (${code}): ${diagnostics}`,
          );
        }),
      ]).finally(() => lines.close());
      return { child, closed, ready };
    });
    try {
      const [first, second] = await Promise.all(
        children.map((child) => child.ready),
      );
      assert.notEqual(first.url, second.url);
      assert.notEqual(first.dashboardPort, second.dashboardPort);
      for (const backend of [first, second]) {
        const health = await new ConvexHttpClient(backend.url).query(
          makeFunctionReference("preview:health"),
          {},
        );
        assert.equal(health.service, "allocation-preview");
      }
    } finally {
      for (const { child } of children) child.stdin.end();
      await Promise.allSettled(children.map((child) => child.closed));
    }
  },
);

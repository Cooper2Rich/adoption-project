import assert from "node:assert/strict";
import test from "node:test";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";

test(
  "owned CLI JSON excludes stderr warnings and failed commands retain their diagnostics",
  { timeout: 240000 },
  async () => {
    const previous = {
      FORCE_COLOR: process.env.FORCE_COLOR,
      NO_COLOR: process.env.NO_COLOR,
    };
    let backend: Awaited<ReturnType<typeof createLocalBackend>> | undefined;
    try {
      // Playwright sets FORCE_COLOR while the agent shell supplies NO_COLOR.
      // Node warns on stderr before the CLI writes its JSON result to stdout.
      process.env.FORCE_COLOR = "1";
      process.env.NO_COLOR = "1";
      backend = await createLocalBackend();
      const output = await backend.command(
        "run",
        "fixtures:resourceIds",
        JSON.stringify({ campaignSlug: "adoption" }),
      );
      assert.ok(Array.isArray(JSON.parse(output)));
      await assert.rejects(
        backend.command(
          "run",
          "fixtures:changeAuthority",
          JSON.stringify({
            campaignSlug: "missing-campaign",
            revision: "unused",
          }),
        ),
        /Fixture campaign not found/,
      );
    } finally {
      try {
        await backend?.stop();
      } finally {
        for (const [name, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
      }
    }
  },
);

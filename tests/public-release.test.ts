import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import { stagePublic } from "../scripts/stage-public.ts";
import {
  DemoUpdateRequiredError,
  latestDemoUrl,
} from "../src/public-demo/update-recovery.ts";

test("public staging restores old lazy chunks and their dependencies while keeping the new entry point", (t) => {
  const root = mkdtempSync(join(tmpdir(), "slander-release-"));
  t.after(() => {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep))
      throw new Error("Unexpected test cleanup path");
    rmSync(root, { recursive: true, force: true });
  });
  const destination = join(root, "pages"),
    source = join(root, "build");
  mkdirSync(join(destination, "assets"), { recursive: true });
  mkdirSync(join(source, "assets"), { recursive: true });
  const git = (...args) =>
    execFileSync("git", ["-C", destination, ...args], { stdio: "pipe" });
  git("init", "-b", "gh-pages");
  git("config", "user.name", "Release test");
  git("config", "user.email", "test@example.test");
  const old = 'import "./main-old12345.js";';
  writeFileSync(join(destination, "assets/api-old12345.js"), old);
  writeFileSync(
    join(destination, "assets/main-old12345.js"),
    "export const previous = true;",
  );
  writeFileSync(join(destination, "index.html"), "old entry");
  git("add", ".");
  git("commit", "-m", "First public version");
  rmSync(join(destination, "assets/api-old12345.js"));
  rmSync(join(destination, "assets/main-old12345.js"));
  writeFileSync(
    join(destination, "assets/api-next1234.js"),
    "export const next = true;",
  );
  git("add", ".");
  git("commit", "-m", "Previous deployment removed old chunks");
  writeFileSync(join(source, "index.html"), "new entry");
  writeFileSync(
    join(source, "assets/api-new12345.js"),
    "export const current = true;",
  );
  const result = stagePublic(source, destination);
  assert.equal(result.restored, 2);
  assert.equal(
    readFileSync(join(destination, "assets/api-old12345.js"), "utf8"),
    old,
  );
  assert.match(
    readFileSync(join(destination, "assets/main-old12345.js"), "utf8"),
    /previous/,
  );
  assert.match(
    readFileSync(join(destination, "assets/api-next1234.js"), "utf8"),
    /next/,
  );
  assert.equal(
    readFileSync(join(destination, "index.html"), "utf8"),
    "new entry",
  );
  assert.throws(() => stagePublic(source, destination), /has changes/);
});

test("module reload changes only the cache-busting version and retains the route and campaign", () => {
  const original = new URL(
    "https://example.test/slander/?v=old&preview=yes#/leaderboard?campaign=coffee&period=daily",
  );
  const result = new URL(latestDemoUrl(original.href, 123456));
  assert.equal(result.origin, original.origin);
  assert.equal(result.pathname, original.pathname);
  assert.equal(result.hash, original.hash);
  assert.equal(result.searchParams.get("preview"), "yes");
  assert.equal(result.searchParams.get("v"), "123456");
  const error = new DemoUpdateRequiredError(
    new TypeError("Failed to fetch dynamically imported module"),
  );
  assert.match(error.message, /Reload/);
  assert.ok(error.cause instanceof TypeError);
});

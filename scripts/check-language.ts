import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// Inspect both tracked and untracked source, including files added in a PR.
// Compiled output and third-party packages stay outside the source inventory.
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(
    (path) =>
      path && existsSync(path) && !path.startsWith("convex/_generated/"),
  );
const violations = files.filter((path) =>
  /\.(?:js|jsx|mjs|cjs|py|sh|bash|go|rs|rb|php|java|kt|swift|cs|cpp|c)$/i.test(
    path,
  ),
);
if (violations.length) {
  console.error(
    "Repository source must use TypeScript (.ts/.tsx):\n" +
      violations.map((path) => `  ${path}`).join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log("Language check passed: repository source uses TypeScript.");
}

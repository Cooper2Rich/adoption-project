import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function stagePublic(source: any, destination: any) {
  source = resolve(source);
  destination = resolve(destination);
  if (
    !existsSync(join(source, "index.html")) ||
    !existsSync(join(source, "assets"))
  )
    throw new Error("Build the public demo before staging it.");
  const git = (...args: any[]) =>
    execFileSync("git", ["-C", destination, ...args], {
      maxBuffer: 16 * 1024 * 1024,
    });
  if (
    !existsSync(join(destination, ".git")) ||
    git("branch", "--show-current").toString().trim() !== "gh-pages"
  )
    throw new Error("Destination must be the existing gh-pages checkout.");
  if (git("status", "--porcelain").toString().trim())
    throw new Error(
      "The publish checkout has changes. Preserve or commit them before staging.",
    );
  const assets = join(destination, "assets");
  mkdirSync(assets, { recursive: true });
  let restored = 0;
  // Open tabs may not request a lazy chunk until after another deployment.
  // Restore all historical hashed JS/CSS, including the chunks they import.
  for (const revision of git("log", "--format=%H", "--", "assets")
    .toString()
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)) {
    for (const path of git(
      "ls-tree",
      "-r",
      "--name-only",
      revision,
      "--",
      "assets",
    )
      .toString()
      .split(/\r?\n/)) {
      if (!/^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(path))
        continue;
      const target = join(destination, path);
      if (!existsSync(target)) {
        writeFileSync(target, git("show", `${revision}:${path}`));
        restored++;
      }
    }
  }
  // Merge the new build; never delete previous content-addressed asset files.
  for (const entry of readdirSync(source)) {
    if (entry === ".git")
      throw new Error("A public build cannot contain Git metadata.");
    cpSync(join(source, entry), join(destination, entry), { recursive: true });
  }
  if (
    readFileSync(join(source, "index.html"), "utf8") !==
    readFileSync(join(destination, "index.html"), "utf8")
  )
    throw new Error("The published entry point does not match the build.");
  return { restored, assets: readdirSync(assets).length };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const index = process.argv.indexOf("--destination");
  if (index < 0 || !process.argv[index + 1])
    throw new Error(
      "Usage: node scripts/stage-public.ts --destination <existing-gh-pages-checkout>",
    );
  console.log(
    JSON.stringify(stagePublic("public-site", process.argv[index + 1])),
  );
}

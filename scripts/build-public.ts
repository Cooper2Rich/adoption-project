import { execFileSync } from "node:child_process";
import { renameSync, writeFileSync } from "node:fs";

execFileSync(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "build",
    "--config",
    "vite.public.config.ts",
    "--mode",
    "public",
  ],
  { stdio: "inherit" },
);
renameSync("public-site/public-demo.html", "public-site/index.html");
writeFileSync("public-site/.nojekyll", "");

import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

// Interactive operator checkpoints only; never collects credentials or calls
// provider APIs. The local metadata record is not evidence of verified grants.
if (!process.stdin.isTTY || !process.stdout.isTTY)
  throw new Error("Run this wizard in an interactive terminal.");
const directory =
  process.platform === "win32"
    ? join(
        process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
        "Slander",
        "o-01",
      )
    : join(
        process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
        "slander",
        "o-01",
      );
if (process.env.WSL_DISTRO_NAME)
  throw new Error(
    "Run this wizard with Windows Node.js so metadata stays outside OneDrive.",
  );
const file = join(directory, "setup.env");
for (const path of [directory, file]) {
  const stat = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (stat?.isSymbolicLink())
    throw new Error("Metadata destination is a symlink; stopped.");
}
const values = new Map<string, string>();
try {
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const match = line.match(
      /^(O01_[A-Z_]+)=(?:'([^']*)'|"([^"\\$]*)"|([^'"\s]*))$/,
    );
    if (match) values.set(match[1], match[2] ?? match[3] ?? match[4]);
  }
} catch (error: any) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const terminal = createInterface({
  input: process.stdin,
  output: process.stdout,
});
const pending = new Set<string>();
const say = console.log;
const confirm = async (question: string) =>
  /^y/i.test(await terminal.question(`${question} [y/N] `));
async function save(key: string, value: string) {
  values.set(key, value);
  await writeFile(
    file,
    [...values].map(([name, text]: any) => `${name}='${text}'`).join("\n") +
      "\n",
    { mode: 0o600 },
  );
}
async function capture(
  key: string,
  prompt: string,
  pattern: any = /^[a-zA-Z0-9_ .,:+()/=>-]+$/,
) {
  for (;;) {
    const current = values.get(key) ?? "";
    const answer = await terminal.question(
      `${prompt}${current ? " [Enter keeps current]" : ""} `,
    );
    const value = answer || current;
    if (!value) {
      pending.add(key);
      return false;
    }
    if (pattern.test(value)) {
      await save(key, value);
      return true;
    }
    say(
      "Use the requested metadata only; do not paste tokens, passwords or personal details.",
    );
  }
}
async function checkpoint(key: string, question: string) {
  const approved = await confirm(question);
  await save(key, approved ? "operator_confirmed" : "pending");
  if (!approved) pending.add(key);
  return approved;
}
async function run() {
  say("O-01: account setup and approval checkpoints (7 stages)");
  say(
    "1. Provider choice and local metadata; 2–3. Meta app and reporting access; 4–6. TikTok app, role and consent; 7. Historical evidence.",
  );
  say(
    `Values are saved to ${file}. Only provider choice, IDs, zones, roles, permission labels and setup status are recorded.`,
  );
  say(
    "No API calls, CI changes, ad purchases, billing setup or token revocation are performed. Credentials stay in provider tools.",
  );
  if (!(await confirm("Approve these stages and this metadata destination?")))
    return;
  const scope =
    (await terminal.question("Providers [both/meta/tiktok; Enter = both]: ")) ||
    "both";
  if (!["both", "meta", "tiktok"].includes(scope))
    throw new Error("Unknown provider choice; stopped.");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await save("O01_PROVIDERS", scope);
  await save("O01_SETUP_STATUS", "in_progress");
  await save("O01_ACCOUNT_VALIDATION", "not_run");
  if (scope !== "tiktok") {
    say("Stage 2/7 — Meta app: https://developers.facebook.com/apps/");
    say(
      "Sign in yourself and select the isolated reporting app. If creation is needed, follow https://developers.facebook.com/docs/apps/ rather than guessing a use case or broadening permissions.",
    );
    if (
      await confirm(
        "Approve selecting or creating this isolated Meta app through its official guide?",
      )
    ) {
      if (
        await capture(
          "O01_META_APP_ID",
          "App ID (digits; blank leaves pending):",
          /^\d+$/,
        )
      )
        await checkpoint(
          "O01_META_APP_SELECTION",
          "Is this the intended isolated app, with required setup complete?",
        );
      else await save("O01_META_APP_SELECTION", "pending");
    } else {
      await save("O01_META_APP_SELECTION", "pending");
      pending.add("Meta app selection");
    }
    say("Stage 3/7 — Meta account: https://adsmanager.facebook.com/");
    await capture(
      "O01_META_ACCOUNT_ID",
      "Selected isolated ad account ID (digits):",
      /^\d+$/,
    );
    await capture(
      "O01_META_ACCOUNT_ZONE",
      "Displayed timezone (inspect without changing):",
    );
    say(
      "https://business.facebook.com/settings/ — Reporting candidate: ads_read. Endpoint-specific scopes and roles still require validation. Leave pending if no documented reporting-only path exists.",
    );
    if (
      await confirm(
        "Approve only the documented reporting-access assignment for this app/account, if available?",
      )
    ) {
      await capture(
        "O01_META_ROLE_LABEL",
        "Exact assigned reporting role label:",
      );
      await capture(
        "O01_META_PERMISSION_LABELS",
        "Exact reporting permission labels:",
      );
      await checkpoint(
        "O01_META_ACCESS_REVIEW",
        "Have you completed and reviewed this assignment for only the isolated account?",
      );
    } else {
      await save("O01_META_ACCESS_REVIEW", "pending");
      pending.add("Meta reporting access");
    }
  }
  if (scope !== "meta") {
    say("Stage 4/7 — TikTok: https://business-api.tiktok.com/portal/");
    say(
      "Use API for Business > My Apps and the isolated developer app, not Events Manager or Login Kit. Follow the official developer registration/app creation flow; leave pending if unavailable.",
    );
    if (
      await confirm(
        "Approve selecting or creating this isolated TikTok developer app through the official flow?",
      )
    ) {
      if (
        await capture(
          "O01_TIKTOK_APP_ID",
          "Developer App ID:",
          /^[a-zA-Z0-9_-]+$/,
        )
      )
        await checkpoint(
          "O01_TIKTOK_APP_SELECTION",
          "Are the selected app and developer registration ready?",
        );
      else await save("O01_TIKTOK_APP_SELECTION", "pending");
    } else {
      await save("O01_TIKTOK_APP_SELECTION", "pending");
      pending.add("TikTok app selection");
    }
    say(
      "Stage 5/7 — Advertiser: https://ads.tiktok.com/i18n/ — Use the account-name dropdown to locate its advertiser ID.",
    );
    await capture(
      "O01_TIKTOK_ADVERTISER_ID",
      "Selected advertiser ID (digits):",
      /^\d+$/,
    );
    await capture(
      "O01_TIKTOK_ACCOUNT_ZONE",
      "Displayed timezone (Account setup > My account > Basic information, where available):",
    );
    say(
      "https://business.tiktok.com/ — Inspect existing access first. If absent, a Business Center admin can request access under Accounts > Advertiser accounts > Add advertiser account > Request Access. Select Analyst and have the owner review the notification before accepting.",
    );
    if (
      await confirm(
        "Approve reviewing existing Analyst access or requesting it for only this advertiser if absent?",
      )
    )
      await checkpoint(
        "O01_TIKTOK_ROLE_REVIEW",
        "Is Analyst access assigned and approved for this advertiser?",
      );
    else {
      await save("O01_TIKTOK_ROLE_REVIEW", "pending");
      pending.add("TikTok advertiser role approval");
    }
    say(
      "My Apps > selected app: inspect reporting permissions. Reporting > Consolidated Report is a v2 candidate; inventory/metadata access needs separate validation. Leave pending if review or minimum permissions are unresolved.",
    );
    await capture(
      "O01_TIKTOK_PERMISSION_LABELS",
      "Exact reporting permission labels shown:",
    );
    say(
      "Stage 6/7 — Advertiser consent. This repository has no reporting OAuth callback/token exchange. Keep authorization pending until a controlled callback and secure exchange exist; never use the public demo or an arbitrary third party.",
    );
    if (
      (await confirm(
        "Is a separate working callback and secure exchange ready for this isolated app?",
      )) &&
      (await confirm(
        "Approve authorization for only the selected app, permissions and isolated advertiser?",
      ))
    ) {
      say(
        "My Apps > selected app > Basic Information > Advertiser authorization URL. Review and consent yourself. Let the controlled callback and secure exchange receive and store credentials; keep codes and tokens out of this file and chat.",
      );
      await checkpoint(
        "O01_TIKTOK_AUTHORIZATION",
        "Did that flow finish successfully for the selected app/account?",
      );
    } else {
      await save("O01_TIKTOK_AUTHORIZATION", "pending");
      pending.add("TikTok callback, exchange and authorization");
    }
  }
  say("Stage 7/7 — Historical evidence and handoff");
  if (scope !== "tiktok")
    await checkpoint(
      "O01_META_HISTORY_AVAILABLE",
      "Does the Meta account have approved reference delivery, zero controls and boundary history?",
    );
  if (scope !== "meta")
    await checkpoint(
      "O01_TIKTOK_HISTORY_AVAILABLE",
      "Does the TikTok advertiser have approved reference delivery, zero controls and boundary history?",
    );
  await save("O01_SETUP_STATUS", "metadata_recorded_validation_pending");
  await save("O01_SETUP_RECORDED_AT", new Date().toISOString());
  if (pending.size) say("Pending:", [...pending].join(", "));
  say(
    `Local record: ${file}. O-01 remains OPEN; reporting tests are NOT RUN. Resolve pending prerequisites before authorized read-only validation. Do not source or publish this file.`,
  );
}
try {
  await run();
} finally {
  terminal.close();
}

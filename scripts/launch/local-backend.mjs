import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdtemp,
  cp,
  writeFile,
  readFile,
  symlink,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { randomUUID, generateKeyPairSync, sign } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { ConvexHttpClient } from "convex/browser";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cli = join(root, "node_modules/convex/bin/main.js");

async function unusedPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  return port;
}

export async function createLocalBackend({
  fixtureAuth = true,
  onLog = () => {},
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), "slander-preview-"));
  const runId = randomUUID();
  const issuer = `https://allocation-preview.invalid/${runId}`;
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: runId,
    alg: "RS256",
    use: "sig",
  };
  const jwks = `data:text/plain;charset=utf-8;base64,${Buffer.from(JSON.stringify({ keys: [jwk] })).toString("base64")}`;
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      name: "allocation-preview-isolated",
      private: true,
      type: "module",
      dependencies: { convex: "1.49.0" },
    }),
  );
  await symlink(
    join(root, "node_modules"),
    join(directory, "node_modules"),
    "junction",
  );
  await cp(join(root, "convex"), join(directory, "convex"), {
    recursive: true,
  });
  await copyFile(
    join(root, "scripts/launch/fixture-functions.template"),
    join(directory, "convex", "fixtures.ts"),
  );
  await writeFile(
    join(directory, "convex", "auth.config.ts"),
    `export default ${JSON.stringify({ providers: [{ type: "customJwt", issuer, applicationID: "allocation-preview", algorithm: "RS256", jwks }] })};\n`,
  );
  const port = await unusedPort();
  const sitePort = await unusedPort();
  const url = `http://127.0.0.1:${port}`;
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !/^(CONVEX_|VITE_CONVEX_|CLERK_|STRIPE_|MUX_)/i.test(name),
    ),
  );
  environment.CONVEX_AGENT_MODE = "anonymous";
  // Native Windows watchers can abort on a junction whose real path differs
  // from its short temporary path. Poll only this run's owned file observations.
  if (process.platform === "win32") {
    environment.CHOKIDAR_USEPOLLING = "true";
    environment.CHOKIDAR_INTERVAL = "250";
  }
  let child;
  let logs = "";

  async function start() {
    child = spawn(
      process.execPath,
      [
        cli,
        "dev",
        "--typecheck",
        "enable",
        "--tail-logs",
        "disable",
        "--local-cloud-port",
        String(port),
        "--local-site-port",
        String(sitePort),
        "--local-backend-version",
        "precompiled-2026-10-22-1447815",
      ],
      {
        cwd: directory,
        env: environment,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const log = (chunk) => {
      logs = (logs + chunk.toString()).slice(-12000);
      onLog(chunk.toString());
    };
    child.stdout.on("data", log);
    child.stderr.on("data", log);
    child.on("error", (err) => {
      logs += err.message;
    });
    const client = new ConvexHttpClient(url);
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null)
        throw new Error(`Isolated Convex exited (${child.exitCode}): ${logs}`);
      if (
        /error TS\d{4}|TypeScript typecheck.*failed|Failed to push/.test(logs)
      )
        throw new Error(`Isolated Convex compilation failed: ${logs}`);
      try {
        if (
          (await client.query("preview:health", {})).service ===
          "allocation-preview"
        )
          return;
      } catch {
        /* Initial download/startup/push is not yet complete. */
      }
      await delay(300);
    }
    throw new Error(`Isolated Convex startup timed out: ${logs}`);
  }

  async function stop() {
    if (!child || child.exitCode !== null) return;
    // Only the process tree created by this run is terminated.
    if (process.platform === "win32") {
      const killer = spawn(
        "taskkill",
        ["/pid", String(child.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" },
      );
      await once(killer, "exit");
    } else child.kill("SIGTERM");
    if (child.exitCode === null) await once(child, "exit");
  }

  function token(subject, changes = {}) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT", kid: runId }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: subject,
        iss: issuer,
        aud: "allocation-preview",
        iat: now,
        exp: now + 600,
        ...changes,
      }),
    ).toString("base64url");
    const input = `${header}.${payload}`;
    return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
  }

  async function command(...args) {
    const deployment = JSON.parse(
      await readFile(
        join(directory, ".convex/local/default/config.json"),
        "utf8",
      ),
    );
    const selected = await readFile(join(directory, ".env.local"), "utf8");
    if (
      deployment.deploymentName !== "anonymous-agent" ||
      deployment.ports.cloud !== port ||
      !selected.includes("anonymous:anonymous-agent") ||
      !selected.includes(url)
    )
      throw new Error(
        "Refusing command outside this run's owned local deployment",
      );
    const commandChild = spawn(process.execPath, [cli, ...args], {
      cwd: directory,
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    commandChild.stdout.on("data", (chunk) => (output += chunk));
    commandChild.stderr.on("data", (chunk) => (output += chunk));
    const [code] = await once(commandChild, "exit");
    if (code !== 0)
      throw new Error(`Isolated Convex command failed: ${output}`);
    return output;
  }

  try {
    await start();
    await command("env", "set", "ALLOCATION_PREVIEW_FIXTURE_RUN_ID", runId);
    await command("run", "fixtures:seed", JSON.stringify({ runId }));
    if (!fixtureAuth) {
      const fixtureClient = new ConvexHttpClient(url);
      fixtureClient.setAuth(token("manager-a"));
      await fixtureClient.query("preview:campaign", { campaignId: "adoption" });
      // Bootstrap isolated records before switching to the exact application
      // auth configuration. A placeholder issuer needs no real Clerk account.
      await command(
        "env",
        "set",
        "CLERK_JWT_ISSUER_DOMAIN",
        "https://clerk.production.invalid",
      );
      await copyFile(
        join(root, "convex/auth.config.ts"),
        join(directory, "convex/auth.config.ts"),
      );
      let rejected = false;
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        try {
          await fixtureClient.query("preview:campaign", {
            campaignId: "adoption",
          });
        } catch (error) {
          if (
            /auth|token|FORBIDDEN/i.test(String(error)) &&
            (await new ConvexHttpClient(url).query("preview:health", {}))
              .service === "allocation-preview"
          ) {
            rejected = true;
            break;
          }
        }
        await delay(200);
      }
      if (!rejected)
        throw new Error(
          `Application auth configuration did not reject fixture identity: ${logs}`,
        );
    }
    return {
      directory,
      runId,
      url,
      token,
      command,
      stop,
      diagnostics: () => logs,
      restart: async () => {
        await stop();
        await start();
      },
      client(subject, claims) {
        const client = new ConvexHttpClient(url);
        if (subject) client.setAuth(token(subject, claims));
        return client;
      },
      async backendVersion() {
        const config = JSON.parse(
          await readFile(
            join(directory, ".convex/local/default/config.json"),
            "utf8",
          ),
        );
        return config.backendVersion;
      },
    };
  } catch (err) {
    await stop();
    throw err;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(
    "Starting owned isolated Convex backend (first run may download the backend).",
  );
  const backend = await createLocalBackend();
  console.log(
    `Actual Convex health verified at ${backend.url}; isolated state: ${backend.directory}`,
  );
  console.log(`Backend version: ${await backend.backendVersion()}`);
  await backend.stop();
}

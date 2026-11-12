import { makeFunctionReference } from "convex/server";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { servePhotoRequest } from "../../api/photos.ts";
import { createLocalBackend } from "./local-backend.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const portIndex = process.argv.indexOf("--port");
const port = portIndex < 0 ? 3210 : Number(process.argv[portIndex + 1]);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw new Error("Choose an unprivileged local port");
console.log("Starting isolated allocation-preview workspace…");
const backend = await createLocalBackend({
  onLog: (message: string | Uint8Array<ArrayBufferLike>) =>
    process.stderr.write(message),
});
const origin = `http://127.0.0.1:${port}`;
let reportedBackendFailure = false;
const server = await createServer({
  root,
  cacheDir: join(backend.directory, "vite-cache"),
  configFile: join(root, "vite.launch.config.ts"),
  define: {
    "import.meta.env.VITE_LOCAL_LAUNCH_HARNESS":
      JSON.stringify("owned-isolated-run"),
  },
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    watch: { usePolling: process.platform === "win32", interval: 250 },
    fs: { allow: [root, join(backend.directory, "vite-cache")] },
    warmup: { clientFiles: ["./src/launch/main.tsx"] },
  },
  plugins: [
    {
      name: "owned-preview-session",
      configureServer(vite: any) {
        vite.middlewares.use((request: any, response: any, next: any) => {
          if (
            request.url === "/" ||
            request.url.startsWith("/?") ||
            /^\/(entries|fundraise)\//.test(request.url)
          )
            request.url =
              "/launch-preview.html" +
              (request.url.includes("?")
                ? request.url.slice(request.url.indexOf("?"))
                : "");
          const requestUrl = new URL(request.url, origin);
          if (requestUrl.pathname === "/__allocation/public-config") {
            response.setHeader("Content-Type", "application/json");
            response.setHeader("Cache-Control", "no-store");
            response.end(JSON.stringify({ url: backend.url }));
            return;
          }
          if (requestUrl.pathname === "/api/photos") {
            void servePhotoRequest(backend.photoService, request, response);
            return;
          }
          if (requestUrl.pathname === "/api/videos") {
            void servePhotoRequest(backend.videoService, request, response);
            return;
          }
          if (requestUrl.pathname === "/__allocation/readiness") {
            if (
              request.method !== "POST" ||
              request.headers.host !== `127.0.0.1:${port}` ||
              (request.headers.origin && request.headers.origin !== origin)
            ) {
              response.statusCode = 403;
              response.end("Forbidden");
              return;
            }
            let body = "";
            request.on("data", (chunk: any) => {
              body += chunk;
              if (body.length > 1024) request.destroy();
            });
            request.on("end", () => {
              void (async () => {
                const input = JSON.parse(body);
                if (!["configure", "recover", "fail"].includes(input.scenario))
                  throw new Error("Unsupported owned readiness scenario");
                const client = backend.client("administrator"),
                  scope = { campaignId: "adoption" };
                let current = await client.query(
                  makeFunctionReference<"query">("readiness:read"),
                  scope,
                );
                if (input.scenario === "configure") {
                  await client.mutation(
                    makeFunctionReference<"mutation">(
                      "readiness:configureScope",
                    ),
                    {
                      ...scope,
                      expectedVersion: current.configurationVersion,
                      accounts: Object.fromEntries(
                        [
                          "stripe",
                          "meta",
                          "tiktok",
                          "clerk",
                          "blob",
                          "mux",
                          "email",
                        ].map((key, i) => [key, String(i + 1).repeat(64)]),
                      ),
                      selectedProviders: ["meta", "tiktok"],
                    },
                  );
                } else {
                  backend.email.mode(
                    input.scenario === "fail" ? "fail" : "delivered",
                  );
                  const component = current.components.find(
                    (c: any) => c.id === "stripe-eligibility",
                  );
                  await backend.runOwnedInternal("fixtures:readinessProof", {
                    ...scope,
                    nonprofitId: "nonprofit-a",
                    component: "stripe-eligibility",
                    revision: current.revision,
                    account: component.scope.accountBinding,
                    sequence: (component.evidence?.sequence ?? 0) + 1,
                    observedAt: Date.now(),
                    expiresAt: Date.now() + 600_000,
                    reviewer: "administrator",
                    digest: "a".repeat(64),
                    outcome: input.scenario === "fail" ? "failed" : "verified",
                  });
                }
                response.setHeader("Content-Type", "application/json");
                response.end(
                  JSON.stringify({
                    synthetic: true,
                    validatedForProduction: false,
                  }),
                );
              })().catch(() => {
                response.statusCode = 400;
                response.end("Owned readiness fixture failed");
              });
            });
            return;
          }
          if (requestUrl.pathname === "/__allocation/incidents") {
            if (
              request.method !== "POST" ||
              request.headers.host !== `127.0.0.1:${port}` ||
              (request.headers.origin && request.headers.origin !== origin)
            ) {
              response.statusCode = 403;
              response.end("Forbidden");
              return;
            }
            let body = "";
            request.on("data", (chunk: any) => {
              body += chunk;
              if (body.length > 2048) request.destroy();
            });
            request.on("end", () => {
              void (async () => {
                const input = JSON.parse(body);
                const key = "t08-browser";
                if (
                  ![
                    "open",
                    "recover",
                    "fail",
                    "exhaust",
                    "unknown",
                    "dispatch",
                  ].includes(input.scenario)
                )
                  throw new Error("Unsupported owned incident scenario");
                const client = backend.client("manager-a");
                const read = () =>
                  client.query(
                    makeFunctionReference<"query">("operatorIncidents:list"),
                    { campaignId: "adoption" },
                  );
                if (["open", "fail", "unknown"].includes(input.scenario)) {
                  backend.email.mode(
                    input.scenario === "fail"
                      ? "fail"
                      : input.scenario === "unknown"
                        ? "unknown"
                        : "delivered",
                  );
                  const records = await read();
                  const sequence =
                    Math.max(
                      0,
                      ...records
                        .filter((i: any) => i.key === key)
                        .flatMap((i: any) =>
                          i.evidence.map((e: any) => e.sequence),
                        ),
                    ) + 1;
                  await backend.runOwnedInternal("fixtures:incidentControl", {
                    campaignId: "adoption",
                    now: null,
                  });
                  await backend.runOwnedInternal("fixtures:incident", {
                    campaignId: "adoption",
                    key,
                    kind: "launch-blocker",
                    sequence,
                    observedAt: Date.now(),
                    active: true,
                    reason: "Required launch approval is missing",
                    evidence: "owned-browser-launch-check",
                    resolutionRole: "administrator",
                  });
                }
                if (input.scenario === "recover") {
                  backend.email.mode("delivered");
                  const records = await read();
                  const sequence =
                    Math.max(
                      ...records
                        .filter((i: any) => i.key === key)
                        .flatMap((i: any) =>
                          i.evidence.map((e: any) => e.sequence),
                        ),
                    ) + 1;
                  await backend.runOwnedInternal("fixtures:incidentControl", {
                    campaignId: "adoption",
                    now: null,
                  });
                  await backend.runOwnedInternal("fixtures:incident", {
                    campaignId: "adoption",
                    key,
                    kind: "launch-blocker",
                    sequence,
                    observedAt: Date.now(),
                    active: false,
                    reason: "Required launch approval was verified",
                    evidence: "owned-browser-recovery-check",
                    resolutionRole: "administrator",
                  });
                }
                if (["exhaust", "dispatch"].includes(input.scenario)) {
                  for (
                    let n = 0;
                    n < (input.scenario === "exhaust" ? 5 : 1);
                    n++
                  ) {
                    const records = await read();
                    const current = records.find(
                      (i: any) => i.key === key && i.status === "open",
                    );
                    if (!current) throw new Error("Owned incident missing");
                    for (const email of current.notices.flatMap(
                      (notice: any) => notice.emails,
                    )) {
                      await backend.runOwnedInternal(
                        "fixtures:incidentControl",
                        { campaignId: "adoption", now: email.nextAt },
                      );
                      await backend.runOwnedInternal("incidentEmailJobs:run", {
                        emailId: email.id,
                      });
                    }
                  }
                }
                response.setHeader("Content-Type", "application/json");
                response.end(JSON.stringify({ synthetic: true }));
              })().catch(() => {
                response.statusCode = 400;
                response.end("Owned incident fixture failed");
              });
            });
            return;
          }
          if (requestUrl.pathname === "/__allocation/original-recovery") {
            if (
              request.method !== "POST" ||
              request.headers.host !== `127.0.0.1:${port}` ||
              (request.headers.origin && request.headers.origin !== origin)
            ) {
              response.statusCode = 403;
              response.end("Forbidden");
              return;
            }
            let body = "";
            request.on("data", (chunk: any) => (body += chunk));
            request.on("end", () => {
              void (async () => {
                const input = JSON.parse(body);
                if (input.mode) backend.videoStore.archiveMode(input.mode);
                if (input.uploadId)
                  await backend.runOwnedInternal(
                    "fixtures:originalRecovery",
                    Object.fromEntries(
                      Object.entries(input).filter(([key]) => key !== "mode"),
                    ),
                  );
                response.end("Owned archive fixture updated");
              })().catch(() => {
                response.statusCode = 400;
                response.end("Fixture update failed");
              });
            });
            return;
          }
          if (requestUrl.pathname === "/__allocation/mux") {
            if (
              request.method !== "POST" ||
              request.headers.host !== `127.0.0.1:${port}` ||
              (request.headers.origin && request.headers.origin !== origin)
            ) {
              response.statusCode = 403;
              response.end("Forbidden");
              return;
            }
            let body = "";
            request.on("data", (chunk: any) => (body += chunk));
            request.on("end", () => {
              void (async () => {
                const input = JSON.parse(body);
                if (input.mode) {
                  if (
                    ![
                      "processing",
                      "ready",
                      "reject",
                      "unknown",
                      "unknown-absent",
                    ].includes(input.mode)
                  )
                    throw new Error("Unsupported synthetic mode");
                  await backend.mux.mode(input.mode);
                }
                if (input.uploadId) {
                  const record = await backend
                    .client("manager-a")
                    .query(makeFunctionReference<"query">("videos:resource"), {
                      campaignId: "adoption",
                      uploadId: input.uploadId,
                    });
                  await backend.mux.update(record.assetId, {
                    status: input.status ?? "ready",
                  });
                  const event = JSON.stringify({
                    id: `owned-event-${Date.now()}`,
                    type: "video.asset.ready",
                    data: {
                      id: record.assetId,
                      passthrough: `${record._id}:${record.attempt}`,
                    },
                  });
                  const result = await backend.videoService(
                    new Request(`${origin}/api/videos?action=webhook`, {
                      method: "POST",
                      headers: {
                        "mux-signature": backend.mux.signature(event),
                      },
                      body: event,
                    }),
                  );
                  if (!result.ok) throw new Error(await result.text());
                }
                response.end("Owned synthetic Mux state updated");
              })().catch(() => {
                response.statusCode = 400;
                response.end("Synthetic provider update failed");
              });
            });
            return;
          }
          if (requestUrl.pathname === "/__allocation/clerk-mode") {
            if (
              request.method !== "POST" ||
              request.headers.host !== `127.0.0.1:${port}` ||
              (request.headers.origin && request.headers.origin !== origin)
            ) {
              response.statusCode = 403;
              response.end("Forbidden");
              return;
            }
            let body = "";
            request.on("data", (chunk: any) => {
              body += chunk;
            });
            request.on("end", () => {
              if (
                !["confirmed", "failed", "unknown", "unknown-absent"].includes(
                  body,
                )
              ) {
                response.statusCode = 400;
                response.end("Unknown synthetic mode");
                return;
              }
              backend.clerk.mode(body);
              response.end("Owned synthetic provider mode changed");
            });
            return;
          }
          if (requestUrl.pathname === "/__allocation/terms") {
            if (
              request.method !== "POST" ||
              request.headers.host !== `127.0.0.1:${port}` ||
              (request.headers.origin && request.headers.origin !== origin)
            ) {
              response.statusCode = 403;
              response.end("Forbidden");
              return;
            }
            void backend
              .command(
                "run",
                "fixtures:terms",
                JSON.stringify({ campaignSlug: "adoption", synthetic: true }),
              )
              .then(() =>
                response.end(
                  "Configured synthetic terms for owned verification only",
                ),
              )
              .catch(() => {
                response.statusCode = 500;
                response.end("Fixture configuration failed");
              });
            return;
          }
          if (
            requestUrl.pathname !== "/__allocation/session" &&
            request.url !== "/__allocation/health"
          )
            return next();
          if (
            request.method !== "GET" ||
            request.headers.host !== `127.0.0.1:${port}` ||
            (request.headers.origin && request.headers.origin !== origin)
          ) {
            response.statusCode = 403;
            response.end("Forbidden");
            return;
          }
          response.setHeader("Content-Type", "application/json");
          response.setHeader("Cache-Control", "no-store");
          if (request.url.endsWith("health")) {
            void backend
              .client()
              .query(makeFunctionReference<"query">("preview:health"), {})
              .then(() => response.end(JSON.stringify({ ready: true })))
              .catch(() => {
                if (!reportedBackendFailure) {
                  console.error(
                    "Isolated backend became unavailable:\n" +
                      backend.diagnostics(),
                  );
                  reportedBackendFailure = true;
                }
                response.statusCode = 503;
                response.end(JSON.stringify({ ready: false }));
              });
          } else
            response.end(
              JSON.stringify({
                url: backend.url,
                token: backend.token(
                  [
                    "administrator",
                    "creator-a",
                    "creator-b",
                    "video-creator",
                    "public-creator",
                    "archive-creator",
                    "recovery-creator",
                    "wrong-person",
                  ].includes(
                    requestUrl.searchParams.get("identity") ?? "manager-a",
                  )
                    ? (requestUrl.searchParams.get("identity") ?? "manager-a")
                    : "manager-a",
                ),
              }),
            );
        });
      },
    },
  ],
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
  await backend.stop();
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void close().finally(() => process.exit(0));
  });
try {
  await server.listen();
  await backend.command(
    "env",
    "set",
    "VIDEO_ARCHIVE_WORKER_URL",
    `${origin}/api/videos`,
  );
  console.log(`Allocation preview ready: ${origin}`);
} catch (err: any) {
  await close();
  throw err;
}

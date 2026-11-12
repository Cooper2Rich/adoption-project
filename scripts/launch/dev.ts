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
          if (request.url === "/" || request.url.startsWith("/?"))
            request.url = "/launch-preview.html" + request.url.slice(1);
          const requestUrl = new URL(request.url, origin);
          if (requestUrl.pathname === "/api/photos") {
            void servePhotoRequest(backend.photoService, request, response);
            return;
          }
          if (requestUrl.pathname === "/api/videos") {
            void servePhotoRequest(backend.videoService, request, response);
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
                    "creator-a",
                    "creator-b",
                    "video-creator",
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
  console.log(`Allocation preview ready: ${origin}`);
} catch (err: any) {
  await close();
  throw err;
}

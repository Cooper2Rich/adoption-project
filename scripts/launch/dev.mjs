import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createLocalBackend } from "./local-backend.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const portIndex = process.argv.indexOf("--port");
const port = portIndex < 0 ? 3210 : Number(process.argv[portIndex + 1]);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw new Error("Choose an unprivileged local port");
console.log("Starting isolated allocation-preview workspace…");
const backend = await createLocalBackend({
  onLog: (message) => process.stderr.write(message),
});
const origin = `http://127.0.0.1:${port}`;
let reportedBackendFailure = false;
const server = await createServer({
  root,
  cacheDir: join(backend.directory, "vite-cache"),
  configFile: join(root, "vite.launch.config.ts"),
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
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === "/") request.url = "/launch-preview.html";
          if (
            request.url !== "/__allocation/session" &&
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
              .query("preview:health", {})
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
                token: backend.token("manager-a"),
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
} catch (err) {
  await close();
  throw err;
}

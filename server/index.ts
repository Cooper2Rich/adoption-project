import express from "express";
import { createServer as createHttpServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { createStore } from "./store.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const dataDir = resolve(process.env.SLANDER_DATA_DIR || resolve(root, "data"));
const store = createStore(
  resolve(dataDir, "slander.sqlite"),
  process.env.SLANDER_EMPTY !== "1",
);
const app = createApp(store, dataDir);
const server = createHttpServer(app);
if (process.argv.includes("--dev")) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(resolve(root, "dist")));
  app.get("/{*path}", (_req: any, res: any) =>
    res.sendFile(resolve(root, "dist/index.html")),
  );
}
const port = Number(process.env.PORT || 3000);
server.listen(port, "127.0.0.1", () =>
  console.log(`adoption.is is running at http://localhost:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );

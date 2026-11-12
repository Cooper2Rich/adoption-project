import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";
import { createStore } from "../server/store.ts";

export async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "slander-test-"));
  const store = createStore(join(dir, "test.sqlite"));
  const app = createApp(store, dir);
  const server = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  async function request(
    path,
    { method = "GET", body, role = "admin", headers = {} } = {},
  ) {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api${path}`,
      {
        method,
        headers: {
          "x-demo-role": role,
          ...(role === "creator"
            ? { "x-demo-creator": store.read().creators[0].id }
            : {}),
          ...(role === "nonprofit"
            ? { "x-demo-nonprofit": store.read().nonprofits[0].id }
            : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    return { status: response.status, data: await response.json() };
  }
  return {
    request,
    store,
    dir,
    baseURL: `http://127.0.0.1:${server.address().port}`,
  };
}

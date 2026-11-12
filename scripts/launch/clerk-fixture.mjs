import { createServer } from "node:http";
import { once } from "node:events";
// Owned local contract adapter. No real Clerk keys, email or account activity.
export async function createClerkFixture() {
  let mode = "confirmed";
  let gate;
  let writes = 0;
  let reads = 0;
  const rows = [];
  const server = createServer(async (request, response) => {
    if (
      request.headers.authorization !== "Bearer owned-synthetic-clerk-fixture"
    ) {
      response.writeHead(403);
      response.end();
      return;
    }
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("Content-Type", "application/json");
    if (request.method === "GET" && url.pathname === "/v1/invitations") {
      reads++;
      const data = rows.filter(
        (row) => row.email_address === url.searchParams.get("query"),
      );
      response.end(JSON.stringify({ data, total_count: data.length }));
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(404);
      response.end();
      return;
    }
    writes++;
    if (mode === "failed") {
      response.writeHead(422);
      response.end(JSON.stringify({ errors: [{ code: "synthetic_failure" }] }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (url.pathname === "/v1/invitations") {
      const input = JSON.parse(Buffer.concat(chunks).toString());
      if (mode === "unknown-absent") {
        request.socket.destroy();
        return;
      }
      const row = {
        id: `inv_fixture_${rows.length + 1}`,
        email_address: input.email_address,
        public_metadata: input.public_metadata,
        status: "pending",
      };
      rows.push(row);
      if (gate) {
        const current = gate;
        gate = undefined;
        current.entered();
        await current.wait;
      }
      if (mode === "unknown") {
        request.socket.destroy();
        return;
      }
      response.end(JSON.stringify(row));
      return;
    }
    const id = url.pathname.match(/^\/v1\/invitations\/([^/]+)\/revoke$/)?.[1];
    const row = rows.find((row) => row.id === id);
    if (!row) {
      response.writeHead(404);
      response.end();
      return;
    }
    row.status = "revoked";
    if (mode === "unknown") {
      request.socket.destroy();
      return;
    }
    response.end(JSON.stringify(row));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${server.address().port}/v1`,
    pauseNext() {
      let release;
      let entered;
      const wait = new Promise((resolve) => {
        release = resolve;
      });
      const arrived = new Promise((resolve) => {
        entered = resolve;
      });
      gate = { wait, entered };
      return { arrived, release };
    },
    mode(value) {
      mode = value;
    },
    counts: () => ({ writes, reads }),
    rows: () => structuredClone(rows),
    stop: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

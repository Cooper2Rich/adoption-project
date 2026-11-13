import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { prizeSignature } from "../../convex/prizeTransport.ts";
import { stableRequest } from "../../convex/access.ts";

export async function createPrizeFixture() {
  const secret = randomUUID() + randomUUID(),
    records = new Map<string, any>(),
    calls: { method: string; key: string }[] = [];
  let mode:
    | "settled"
    | "pending"
    | "lost"
    | "reject"
    | "bad-signature"
    | "lookup-failed" = "settled";
  const server = createServer(async (req, res) => {
    try {
      const key = req.url?.split("/").at(-1) ?? "",
        binding = JSON.parse(String(req.headers["x-owned-binding"] ?? "null"));
      if (
        !req.url?.startsWith("/owned/prize-transfers/") ||
        binding?.key !== key ||
        req.headers["x-owned-signature"] !==
          prizeSignature(secret, { method: req.method, binding })
      ) {
        res.writeHead(403).end();
        return;
      }
      calls.push({ method: req.method!, key });
      if (req.method === "POST") {
        let raw = "";
        for await (const chunk of req) raw += String(chunk);
        if (stableRequest(JSON.parse(raw)) !== stableRequest(binding)) {
          res.writeHead(400).end();
          return;
        }
        if (mode === "reject") {
          res.writeHead(503).end();
          return;
        }
        const old = records.get(key);
        if (old && stableRequest(old.binding) !== stableRequest(binding)) {
          res.writeHead(409).end();
          return;
        }
        if (!old)
          records.set(key, {
            binding,
            state: mode === "pending" ? "pending" : "settled",
            providerId: "owned_" + randomUUID().replaceAll("-", ""),
            settlementReference: "settled_" + randomUUID().replaceAll("-", ""),
          });
        if (mode === "lost") {
          res.destroy();
          return;
        }
      } else if (req.method !== "GET") {
        res.writeHead(405).end();
        return;
      }
      if (mode === "lookup-failed" && req.method === "GET") {
        res.writeHead(503).end();
        return;
      }
      const row = records.get(key);
      if (!row) {
        res.writeHead(404).end();
        return;
      }
      const { settlementReference, ...pending } = row;
      const result =
        row.state === "pending" ? pending : { ...pending, settlementReference };
      res
        .writeHead(200, {
          "Content-Type": "application/json",
          "X-Owned-Signature":
            mode === "bad-signature"
              ? "invalid"
              : prizeSignature(secret, result),
        })
        .end(JSON.stringify(result));
    } catch {
      res.writeHead(400).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    origin: `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`,
    secret,
    calls,
    records,
    setMode(next: typeof mode) {
      mode = next;
    },
    settle(key: string) {
      const row = records.get(key);
      if (row) row.state = "settled";
    },
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((e) => (e ? reject(e) : resolve()));
      }),
  };
}

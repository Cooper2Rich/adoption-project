import { createServer } from "node:http";
import { once } from "node:events";
// Owned loopback Resend-shaped transport. This cannot establish real email or
// inbox capability. No DNS lookup, external request or real recipient is used.
export async function createEmailFixture() {
  let mode = "delivered";
  const messages = new Map<
    string,
    { id: string; payload: string; last_event: string }
  >();
  const requests: { key: string; payload: string; at: number }[] = [];
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/emails") {
      let payload = "";
      for await (const chunk of req) payload += chunk;
      const key = String(req.headers["idempotency-key"] ?? "");
      requests.push({ key, payload, at: Date.now() });
      const data = JSON.parse(payload);
      if (
        !key ||
        data.to.length !== 1 ||
        !data.to[0].endsWith(".example") ||
        !data.from.endsWith(".example")
      ) {
        res.statusCode = 400;
        res.end("{}");
        return;
      }
      if (["fail", "reject429", "reject401"].includes(mode)) {
        res.statusCode =
          mode === "reject429" ? 429 : mode === "reject401" ? 401 : 422;
        res.end("{}");
        return;
      }
      let message = messages.get(key);
      if (message && message.payload !== payload) {
        res.statusCode = 409;
        res.end("{}");
        return;
      }
      if (!message) {
        message = {
          id: `owned-${messages.size + 1}`,
          payload,
          last_event:
            mode === "async-fail"
              ? "bounced"
              : mode === "delayed"
                ? "delivery_delayed"
                : ["opened", "clicked", "complained"].includes(mode)
                  ? mode
                  : "delivered",
        };
        messages.set(key, message);
      }
      if (mode === "unknown") {
        res.statusCode = 503;
        res.end("{}");
        return;
      }
      res.end(JSON.stringify({ id: message.id }));
    } else if (req.method === "GET" && req.url?.startsWith("/emails/")) {
      const message = [...messages.values()].find(
        (m) => m.id === req.url!.slice(8),
      );
      if (!message) {
        res.statusCode = 404;
        res.end("{}");
        return;
      }
      res.end(
        JSON.stringify({ id: message.id, last_event: message.last_event }),
      );
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`,
    requests,
    messages,
    mode(value: string) {
      if (
        ![
          "delivered",
          "fail",
          "unknown",
          "async-fail",
          "delayed",
          "reject429",
          "reject401",
          "opened",
          "clicked",
          "complained",
        ].includes(value)
      )
        throw new Error("Invalid email fixture mode");
      mode = value;
    },
    stop: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

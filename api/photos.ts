import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { TLSSocket } from "node:tls";
import { blobPhotoStore, createPhotoService } from "../server/launch/photos.ts";

type ApiRequest = IncomingMessage & { body?: unknown };
type MediaService = (request: Request) => Promise<Response>;
export const config = { maxDuration: 300 };
export default async function handler(
  request: ApiRequest,
  response: ServerResponse,
) {
  await servePhotoRequest(
    createPhotoService({
      url: process.env.CONVEX_URL,
      secret: process.env.PHOTO_RECEIPT_SECRET,
      store: blobPhotoStore(),
    }),
    request,
    response,
  );
}

// Support native HTTP streams and metadata JSON parsed by Vercel helpers.
// Video webhook handlers use the separate raw Request route.
export async function servePhotoRequest(
  service: MediaService,
  request: ApiRequest,
  response: ServerResponse,
) {
  try {
    const protocol = (request.socket as TLSSocket).encrypted ? "https" : "http";
    const target = new URL(
      request.url ?? "/",
      `${protocol}://${request.headers.host}`,
    );
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value))
        value.forEach((item) => headers.append(key, item));
      else if (value !== undefined) headers.set(key, value);
    }
    const parsed = request.body;
    const body =
      parsed === undefined
        ? (Readable.toWeb(request) as ReadableStream<Uint8Array>)
        : parsed === null
          ? undefined
          : typeof parsed === "string"
            ? parsed
            : Buffer.isBuffer(parsed)
              ? new Uint8Array(parsed)
              : JSON.stringify(parsed);
    const method = request.method ?? "GET";
    const init: RequestInit & { duplex?: "half" } = {
      method,
      headers,
      ...(!["GET", "HEAD"].includes(method)
        ? { body, duplex: "half" as const }
        : {}),
    };
    const result = await service(new Request(target, init));
    response.writeHead(result.status, Object.fromEntries(result.headers));
    if (result.body) await pipeline(Readable.from(result.body), response);
    else response.end();
  } catch {
    if (!response.headersSent)
      response.writeHead(503, { "Cache-Control": "no-store" });
    response.end(
      "Private photo service unavailable. Retry after reconnecting.",
    );
  }
}

import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  createPhotoService,
  blobPhotoStore,
} from "../server/launch/photos.mjs";

// The launch authority is Convex. This route only streams private bytes and
// attests server-decoded uploads; it never authorizes a browser role.
export const config = { maxDuration: 300 };
export default async function handler(request, response) {
  const service = createPhotoService({
    url: process.env.CONVEX_URL,
    secret: process.env.PHOTO_RECEIPT_SECRET,
    store: blobPhotoStore(),
  });
  await servePhotoRequest(service, request, response);
}
export async function servePhotoRequest(service, request, response) {
  try {
    const target = new URL(request.url, `https://${request.headers.host}`);
    // Vercel's Node helpers may have parsed metadata JSON already. Native
    // HTTP/Vite requests retain the stream. Support both documented shapes.
    const parsedBody = request.body;
    const body =
      parsedBody === undefined
        ? Readable.toWeb(request)
        : parsedBody === null
          ? undefined
          : typeof parsedBody === "string" || Buffer.isBuffer(parsedBody)
            ? parsedBody
            : JSON.stringify(parsedBody);
    const result = await service(
      new Request(target, {
        method: request.method,
        headers: request.headers,
        ...(!["GET", "HEAD"].includes(request.method)
          ? { body, duplex: "half" }
          : {}),
      }),
    );
    response.writeHead(result.status, Object.fromEntries(result.headers));
    if (result.body) await pipeline(Readable.fromWeb(result.body), response);
    else response.end();
  } catch {
    if (!response.headersSent)
      response.writeHead(503, { "Cache-Control": "no-store" });
    response.end(
      "Private photo service unavailable. Retry after reconnecting.",
    );
  }
}

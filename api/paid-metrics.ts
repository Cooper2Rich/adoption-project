import type { IncomingMessage, ServerResponse } from "node:http";
import { servePhotoRequest } from "./photos.ts";
import { createPaidMetricService } from "../server/launch/paid-metrics.ts";
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  // There is intentionally no production provider reader/release authority yet.
  await servePhotoRequest(
    createPaidMetricService({ url: process.env.CONVEX_URL }),
    request,
    response,
  );
}

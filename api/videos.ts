import {
  blobVideoStore,
  createVideoService,
  muxProvider,
} from "../server/launch/videos.ts";

// Preserve raw webhook bytes: signatures cannot authenticate reserialized JSON.
export const maxDuration = 300;
export function GET(request: any) {
  const service = createVideoService({
    url: process.env.CONVEX_URL,
    secret: process.env.VIDEO_RECEIPT_SECRET,
    store: blobVideoStore(),
    provider: muxProvider(),
    sourceOrigin: process.env.VIDEO_SOURCE_ORIGIN,
  });
  return service(request);
}
export const POST = GET;

import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { v } from "convex/values";
import { internalAction } from "./functions.ts";
import { stableRequest } from "./access.ts";
// Durable scheduler invokes the application worker. Missing configuration is a
// visible hold, never an optimistic storage deletion. Admin retry uses this job.
export const purge = internalAction({
  args: { uploadId: v.id("videoUploads"), generation: v.number() },
  handler: async (_ctx, args) => {
    const url = process.env.VIDEO_ARCHIVE_WORKER_URL;
    const secret = process.env.VIDEO_RECEIPT_SECRET;
    if (!url || !secret || secret.length < 32) return;
    const target = new URL(url);
    if (
      target.protocol !== "https:" &&
      !(
        process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID &&
        target.hostname === "127.0.0.1"
      )
    )
      throw new Error("Invalid archive worker origin");
    target.searchParams.set("action", "archive-purge");
    const receipt = { purpose: "archive-job", ...args, at: Date.now() };
    const signature = bytesToHex(
      hmac(
        sha256,
        new TextEncoder().encode(secret),
        new TextEncoder().encode(stableRequest(receipt)),
      ),
    );
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipt, signature }),
    });
    if (!response.ok)
      throw new Error(
        "Archive worker unavailable; reconcile this durable request",
      );
  },
});

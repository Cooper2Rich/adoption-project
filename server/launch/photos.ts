import { get } from "@vercel/blob";
import { handleUpload } from "@vercel/blob/client";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createHash, createHmac } from "node:crypto";
import sharp from "sharp";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a]: any, [b]: any) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]: any) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function blobPhotoStore({ token }: any = {}) {
  return {
    async read(pathname: any) {
      const result = await get(pathname, {
        token,
        access: "private",
        useCache: false,
      });
      if (!result || result.statusCode !== 200)
        throw new Error(
          "PHOTO_NOT_FOUND: Upload has not completed; retry verification",
        );
      return result.stream;
    },
    async token(request: any, body: any, authorize: any) {
      if (body.type !== "blob.generate-client-token")
        throw new Error("UPLOAD_TOKEN: Request a new upload token");
      return handleUpload({
        token,
        request,
        body,
        onBeforeGenerateToken: async (pathname: any, payload: any) => {
          const record = await authorize(JSON.parse(payload ?? "{}").uploadId);
          if (pathname !== record.pathname || record.sha256)
            throw new Error("UPLOAD_PATH: Select a new upload");
          return {
            allowedContentTypes: [record.type],
            maximumSizeInBytes: 100_000_000,
            validUntil: record.expiresAt,
            addRandomSuffix: false,
            allowOverwrite: false,
          };
        },
        // Completion is explicitly verified by reading stored bytes, never by
        // accepting browser size/type or an upload-completed notification.
      });
    },
  };
}
export async function inspectPhoto(stream: any, record: any) {
  let size = 0;
  const parts: any[] = [];
  const hash = createHash("sha256");
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 100_000_000)
      throw new Error(
        "PHOTO_SIZE: Each photo must be at most 100,000,000 bytes",
      );
    parts.push(bytes);
    hash.update(bytes);
  }
  if (!size || size !== record.declaredSize)
    throw new Error(
      "PHOTO_SIZE: Stored bytes differ from the selected file; upload it again",
    );
  const bytes = Buffer.concat(parts);
  const type = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? "image/jpeg"
      : null;
  if (!type || type !== record.type)
    throw new Error(
      "PHOTO_FORMAT: Upload a valid JPEG or PNG matching its file type",
    );
  try {
    const image = sharp(bytes, {
      failOn: "warning",
      limitInputPixels: false,
      animated: true,
    });
    const metadata = await image.metadata();
    if (
      !["jpeg", "png"].includes(metadata.format) ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error("Use a still JPEG/PNG");
    await image.stats(); // Decode pixels to reject corrupt/truncated payloads.
  } catch {
    throw new Error(
      "PHOTO_FORMAT: This photo cannot be decoded as a still JPEG/PNG. Export a valid photo and upload it again",
    );
  }
  return { size, type, sha256: hash.digest("hex") };
}
export function createPhotoService({ url, secret, store, fixtureRunId }: any) {
  return async function photoService(request: any) {
    const json = (body: any, status: any = 200) =>
      Response.json(body, {
        status,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    try {
      if (!url || !secret || secret.length < 32)
        return json(
          {
            error:
              "PHOTO_STORAGE_UNAVAILABLE: Private photo storage is not configured",
          },
          503,
        );
      const authorization = request.headers.get("authorization");
      const target = new URL(request.url);
      const client = new ConvexHttpClient(url);
      if (
        request.method === "GET" &&
        target.searchParams.get("action") === "public"
      ) {
        const value = {
          entryId: target.searchParams.get("entryId"),
          kind: "photo",
          index: Number(target.searchParams.get("index") ?? "0"),
          at: Date.now(),
        };
        const record: any = await client.query(
          makeFunctionReference<"query">("publicViewer:mediaAccess"),
          {
            ...value,
            signature: createHmac("sha256", secret)
              .update(stable(value))
              .digest("hex"),
          },
        );
        if ((record.fixtureRunId ?? undefined) !== fixtureRunId)
          throw new Error("FORBIDDEN: Public media unavailable");
        const bytes = await new Response(
          await store.read(record.pathname),
        ).arrayBuffer();
        const derivative = await sharp(Buffer.from(bytes), {
          limitInputPixels: false,
        })
          .rotate()
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 85 })
          .toBuffer();
        return new Response(new Uint8Array(derivative), {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (!authorization?.startsWith("Bearer "))
        return json(
          { error: "FORBIDDEN: Sign in to access private photos" },
          403,
        );
      client.setAuth(authorization.slice(7));
      const campaignId = target.searchParams.get("campaignId") ?? "adoption";
      const authorize = async (uploadId: any, resource: any = false) => {
        const record = await client.query(
          makeFunctionReference<"query">(
            resource ? "photos:resource" : "photos:uploadAccess",
          ),
          { campaignId, uploadId },
        );
        if ((record.fixtureRunId ?? undefined) !== fixtureRunId)
          throw new Error(
            "FORBIDDEN: Synthetic storage is restricted to its owned run",
          );
        return record;
      };
      const uploadId = target.searchParams.get("uploadId");
      const action = target.searchParams.get("action");
      if (request.method === "GET" && action === "resource") {
        const record = await authorize(uploadId, true);
        const stream = await store.read(record.pathname);
        return new Response(stream, {
          headers: {
            "Content-Type": record.type,
            "Content-Length": String(record.size),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": `inline; filename="photo.${record.type === "image/png" ? "png" : "jpg"}"`,
          },
        });
      }
      if (request.method === "POST" && action === "token")
        return json(
          await store.token(request, await request.json(), authorize),
        );
      if (
        request.method === "PUT" &&
        action === "local-upload" &&
        fixtureRunId &&
        store.write
      ) {
        const record = await authorize(uploadId);
        if (record.sha256)
          throw new Error("UPLOAD_IMMUTABLE: Select a new upload");
        await store.write(record.pathname, request.body);
        return json({ uploaded: true, synthetic: true });
      }
      if (request.method === "POST" && action === "verify") {
        const record = await authorize(uploadId);
        const verified = await inspectPhoto(
          await store.read(record.pathname),
          record,
        );
        const receipt = {
          uploadId: record._id,
          pathname: record.pathname,
          ...verified,
          subject: record.subject,
          verifiedAt: Date.now(),
        };
        const signature = createHmac("sha256", secret)
          .update(stable(receipt))
          .digest("hex");
        return json(
          await client.mutation(
            makeFunctionReference<"mutation">("photos:verify"),
            {
              campaignId,
              receipt,
              signature,
            },
          ),
        );
      }
      return json({ error: "PHOTO_ROUTE: Unsupported photo operation" }, 400);
    } catch (error: any) {
      const message = String(error?.message ?? error);
      // Convex errors may include a request ID and stack. Return only the
      // actionable application line; never return credentials or byte paths.
      const match = message.match(
        /(?:FORBIDDEN|PHOTO_[A-Z_]+|UPLOAD_[A-Z_]+|TERMS_UNAVAILABLE|ACCEPTANCE_REQUIRED):[^\r\n]*/,
      );
      return json(
        {
          error:
            match?.[0] ??
            "PHOTO_UNAVAILABLE: Could not confirm the upload. Check access and retry",
        },
        message.includes("FORBIDDEN") ? 403 : 400,
      );
    }
  };
}

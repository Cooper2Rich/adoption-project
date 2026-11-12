import Mux from "@mux/ts";
import type { WebhookBody } from "@mux/ts/resources/webhooks.mjs";
import { get } from "@vercel/blob";
import { handleUpload } from "@vercel/blob/client";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createHmac, type KeyLike, timingSafeEqual } from "node:crypto";
import { inspectVideo, VIDEO_MAX_BYTES } from "./video-inspection.ts";

export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a]: any, [b]: any) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]: any) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const sign = (value: any, secret: KeyLike) =>
  createHmac("sha256", secret).update(stable(value)).digest("hex");
export function blobVideoStore({ token }: any = {}) {
  return {
    async read(pathname: string) {
      const result = await get(pathname, {
        token,
        access: "private",
        useCache: false,
      });
      if (!result || result.statusCode !== 200)
        throw new Error(
          "VIDEO_INCOMPLETE: Upload has not completed. Resume uploading or retry verification",
        );
      return result.stream;
    },
    async token(request: Request, body: any, authorize: any) {
      if (
        body.type !== "blob.generate-client-token" ||
        body.payload?.multipart !== true
      )
        throw new Error("VIDEO_TOKEN: Request a multipart upload token");
      return handleUpload({
        token,
        request,
        body,
        onBeforeGenerateToken: async (pathname: any, payload: any) => {
          const record = await authorize(JSON.parse(payload ?? "{}").uploadId);
          if (pathname !== record.pathname || record.sha256)
            throw new Error(
              "VIDEO_IMMUTABLE: Use the reserved upload or start a new one",
            );
          return {
            allowedContentTypes: ["video/mp4"],
            maximumSizeInBytes: VIDEO_MAX_BYTES,
            validUntil: record.expiresAt,
            addRandomSuffix: false,
            allowOverwrite: false,
          };
        },
      });
    },
  };
}
export function muxProvider({
  client = new Mux({ maxRetries: 0, timeout: 30_000 }),
  evidenceId = process.env.VIDEO_PROVIDER_EVIDENCE_ID,
}: any = {}) {
  return {
    synthetic: false,
    available: () =>
      !!(
        evidenceId &&
        (client.authorizationToken || (client.tokenId && client.tokenSecret)) &&
        client.webhookSecret &&
        client.jwtSigningKey &&
        client.jwtPrivateKey
      ),
    create: (url: any, identity: any) =>
      client.video.assets.create(
        {
          inputs: [{ url }],
          passthrough: identity,
          playback_policies: ["signed"],
          video_quality: "basic",
        },
        { maxRetries: 0 },
      ),
    async find(identity: string | undefined, id: string | undefined) {
      if (id) {
        try {
          return await client.video.assets.retrieve(id);
        } catch (e: any) {
          if (e.status === 404)
            return { id, passthrough: identity, status: "deleted" };
          throw e;
        }
      }
      let match: any = null;
      for await (const asset of client.video.assets.list({ limit: 100 }))
        if (asset.passthrough === identity) {
          if (match)
            throw new Error(
              "VIDEO_PROVIDER_UNKNOWN: More than one asset matches this attempt; reconcile provider records before retrying",
            );
          match = asset;
        }
      // Absence from a list is not proof that an ambiguous POST never created it.
      return match;
    },
    inputs: (id: string) => client.video.assets.retrieveInputInfo(id),
    unwrap: (body: WebhookBody, headers: any) =>
      client.webhooks.unwrap(body, headers),
    async playback(id: string) {
      return `https://stream.mux.com/${id}.m3u8?token=${await client.jwt.signPlaybackId(id, { expiration: "5m" })}`;
    },
  };
}
export function verifyProviderInput(inputs: string | any[], record: any) {
  if (!Array.isArray(inputs) || inputs.length !== 1)
    throw new Error("VIDEO_FORMAT: Mux could not verify the original input");
  const file = inputs[0].file;
  if (
    !file ||
    !/(^|,)(mov|mp4|m4a|3gp|3g2|mj2)(,|$)/.test(file.container_format ?? "")
  )
    throw new Error("VIDEO_FORMAT: Mux did not confirm an MP4 source");
  const tracks = file.tracks ?? [],
    video = tracks.filter((t: any) => t.type === "video"),
    audio = tracks.filter((t: any) => t.type === "audio");
  if (
    video.length !== 1 ||
    tracks.length !== video.length + audio.length ||
    video.some((t: any) => !["h264", "avc1"].includes(t.encoding)) ||
    audio.some((t: any) => t.encoding !== "aac") ||
    (audio.length === 0) !== (record.audioCodec === "none")
  )
    throw new Error(
      "VIDEO_FORMAT: Original must use H.264 with AAC or no audio",
    );
  // Input-info durations can include AAC encoder priming, edit lists and rounded
  // provider values. The exact rational MP4 presentation duration is validated
  // from original bytes; do not reject an exact 60-second source for that padding.
  for (const t of tracks)
    if (!Number.isFinite(t.duration) || t.duration <= 0)
      throw new Error(
        "VIDEO_DURATION: Provider could not confirm the input track duration",
      );
}

export function createVideoService({
  url,
  secret,
  store,
  provider,
  fixtureRunId,
  sourceOrigin,
}: any) {
  let trustedSourceOrigin: string | undefined;
  try {
    const source = new URL(sourceOrigin);
    if (source.protocol === "https:" && !source.username && !source.password)
      trustedSourceOrigin = source.origin;
  } catch {
    /* Invalid or missing configuration blocks dispatch before claiming an attempt. */
  }
  return async function videoService(request: any) {
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
            error: "VIDEO_UNAVAILABLE: Private video service is not configured",
          },
          503,
        );
      const target = new URL(request.url),
        action = target.searchParams.get("action"),
        uploadId = target.searchParams.get("uploadId"),
        campaignId = target.searchParams.get("campaignId") ?? "adoption";
      const client = new ConvexHttpClient(url);
      const authorization = request.headers.get("authorization");
      if (authorization?.startsWith("Bearer "))
        client.setAuth(authorization.slice(7));
      const checkScope = (record: any) => {
        if (
          (record.fixtureRunId ?? undefined) !== fixtureRunId ||
          !!fixtureRunId !== !!provider.synthetic
        )
          throw new Error(
            "FORBIDDEN: Synthetic video integration is restricted to its owned run",
          );
        return record;
      };
      const authorize = async (id: string | null, resource: any = false) =>
        checkScope(
          await client.query(
            makeFunctionReference<"query">(
              resource ? "videos:resource" : "videos:uploadAccess",
            ),
            { campaignId, uploadId: id },
          ),
        );
      const attest = (receipt: any) =>
        client.mutation(makeFunctionReference<"mutation">("videos:record"), {
          receipt,
          signature: sign(receipt, secret),
        });
      const providerRecord = async (id: string) => {
        const request = { uploadId: id, at: Date.now() };
        return checkScope(
          await client.query(
            makeFunctionReference<"query">("videos:providerAccess"),
            { ...request, signature: sign(request, secret) },
          ),
        );
      };
      const sourceToken = (record: any) => {
        const value = {
          uploadId: record._id,
          attempt: record.attempt,
          expires: record.sourceExpiresAt,
        };
        return Buffer.from(
          JSON.stringify({ ...value, signature: sign(value, secret) }),
        ).toString("base64url");
      };
      if (
        action === "synthetic-playback" &&
        fixtureRunId &&
        provider.synthetic &&
        request.method === "GET"
      ) {
        const grant = JSON.parse(
          Buffer.from(
            target.searchParams.get("grant") ?? "",
            "base64url",
          ).toString(),
        );
        const { signature, ...value } = grant;
        if (value.expires < Date.now() || signature !== sign(value, secret))
          throw new Error("FORBIDDEN: Processed playback grant expired");
        const record = await providerRecord(value.uploadId);
        if (record.state !== "ready" || record.playbackId !== value.playbackId)
          throw new Error("VIDEO_NOT_READY: Processed playback is unavailable");
        return new Response(await provider.playbackBytes(value.playbackId), {
          headers: {
            "Content-Type": "video/mp4",
            "Cache-Control": "private, no-store",
          },
        });
      }
      const confirm = async (
        record: any,
        asset: any,
        eventId: string | undefined = undefined,
      ) => {
        const identity = `${record._id}:${record.attempt}`;
        if (!asset || asset.passthrough !== identity)
          return attest({
            uploadId: record._id,
            at: Date.now(),
            action: "event",
            attempt: record.attempt,
            state: "unknown",
            ...(eventId ? { eventId } : {}),
          });
        let state =
          asset.status === "ready"
            ? "ready"
            : asset.status === "errored"
              ? "failed"
              : asset.status === "deleted"
                ? "deleted"
                : "processing";
        const playbackId = asset.playback_ids?.find(
          (p: any) => p.policy === "signed",
        )?.id;
        if (state === "ready") {
          try {
            verifyProviderInput(await provider.inputs(asset.id), record);
            if (!playbackId) throw new Error("Missing signed playback");
          } catch (e: any) {
            if (String(e.message).startsWith("VIDEO_")) state = "failed";
            else throw e;
          }
        }
        return attest({
          uploadId: record._id,
          at: Date.now(),
          action: "event",
          attempt: record.attempt,
          state,
          assetId: asset.id,
          ...(state === "ready" ? { playbackId } : {}),
          ...(eventId ? { eventId } : {}),
        });
      };
      if (action === "source" && request.method === "GET") {
        const grant = JSON.parse(
          Buffer.from(
            target.searchParams.get("grant") ?? "",
            "base64url",
          ).toString(),
        );
        const { signature, ...value } = grant,
          expected = sign(value, secret);
        if (
          typeof signature !== "string" ||
          signature.length !== expected.length ||
          !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ||
          value.expires < Date.now()
        )
          throw new Error("FORBIDDEN: Source access expired");
        const record = await providerRecord(value.uploadId);
        if (
          !record.sha256 ||
          value.attempt !== record.attempt ||
          value.expires !== record.sourceExpiresAt ||
          !["dispatched", "unknown", "processing"].includes(record.state)
        )
          throw new Error("FORBIDDEN: Source access is no longer active");
        // Source is for one ingestion attempt only. It is never an original-download
        // endpoint for the browser, and never returns a Blob credential or URL.
        return new Response(await store.read(record.pathname), {
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": String(record.size),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (action === "webhook" && request.method === "POST") {
        let event;
        try {
          event = await provider.unwrap(await request.text(), request.headers);
        } catch {
          throw new Error("FORBIDDEN: Unverified Mux callback");
        }
        if (
          ![
            "video.asset.created",
            "video.asset.ready",
            "video.asset.errored",
            "video.asset.deleted",
          ].includes(event.type)
        )
          return json({ ignored: true });
        const identity = event.data?.passthrough,
          match = /^([a-z0-9]+):(\d+)$/.exec(identity ?? "");
        if (!match || !event.id || !event.data?.id)
          throw new Error(
            "FORBIDDEN: Callback source is not bound to a revision",
          );
        const record = await providerRecord(match[1]);
        if (record.attempt !== Number(match[2])) return json({ ignored: true });
        const asset = await provider.find(identity, event.data.id);
        return json(await confirm(record, asset, event.id));
      }
      if (!authorization?.startsWith("Bearer "))
        throw new Error("FORBIDDEN: Sign in to access private videos");
      if (action === "token" && request.method === "POST")
        return json(
          await store.token(request, await request.json(), authorize),
        );
      if (
        action === "local-upload" &&
        request.method === "PUT" &&
        fixtureRunId &&
        store.write
      ) {
        const record = await authorize(uploadId);
        if (record.sha256)
          throw new Error("VIDEO_IMMUTABLE: Use a new original upload");
        await store.write(record.pathname, request.body);
        return json({ uploaded: true, synthetic: true });
      }
      if (action === "verify" && request.method === "POST") {
        const record = await authorize(uploadId);
        if (record.sha256) return json(record);
        let inspected;
        try {
          inspected = await inspectVideo(
            await store.read(record.pathname),
            record.declaredSize,
          );
        } catch (error: any) {
          const message = String(error.message);
          if (/^VIDEO_(FORMAT|DURATION|SIZE):/.test(message))
            await attest({
              uploadId: record._id,
              at: Date.now(),
              action: "invalid",
              attempt: record.attempt,
              error: message,
            });
          throw error;
        }
        return json(
          (
            await attest({
              uploadId: record._id,
              at: Date.now(),
              action: "verified",
              attempt: record.attempt,
              ...inspected,
            })
          ).record,
        );
      }
      if (action === "process" && request.method === "POST") {
        let record = await authorize(uploadId, true);
        if (!provider.available())
          return json(
            {
              error:
                "VIDEO_PROVIDER_UNVERIFIED: Processing is blocked until the media provider evidence and configuration are supplied",
            },
            503,
          );
        if (!trustedSourceOrigin && !fixtureRunId)
          return json(
            {
              error:
                "VIDEO_UNAVAILABLE: A trusted ingestion source origin is required",
            },
            503,
          );
        const claim = await attest({
          uploadId: record._id,
          at: Date.now(),
          action: "claim",
          attempt: record.attempt + 1,
        });
        record = claim.record;
        if (!claim.claimed) {
          if (record.state === "ready") return json(record);
          return json(
            (
              await confirm(
                record,
                await provider.find(
                  `${record._id}:${record.attempt}`,
                  record.assetId,
                ),
              )
            ).record,
          );
        }
        const source = new URL(
          "/api/videos",
          trustedSourceOrigin ?? target.origin,
        );
        source.searchParams.set("action", "source");
        source.searchParams.set("grant", sourceToken(record));
        try {
          return json(
            (
              await confirm(
                record,
                await provider.create(
                  source.toString(),
                  `${record._id}:${record.attempt}`,
                ),
              )
            ).record,
          );
        } catch (error: any) {
          const definite = [400, 401, 403, 422].includes(error.status);
          return json(
            (
              await attest({
                uploadId: record._id,
                at: Date.now(),
                action: "event",
                attempt: record.attempt,
                state: definite ? "failed" : "unknown",
              })
            ).record,
          );
        }
      }
      if (action === "playback" && request.method === "GET") {
        const record = await authorize(uploadId, true);
        if (record.state !== "ready" || !record.sha256 || !record.playbackId)
          throw new Error(
            "VIDEO_NOT_READY: Playback awaits verified processing. Retry processing status",
          );
        const value = {
          uploadId: record._id,
          playbackId: record.playbackId,
          expires: Date.now() + 300_000,
        };
        const playbackUrl = fixtureRunId
          ? `/api/videos?action=synthetic-playback&grant=${Buffer.from(JSON.stringify({ ...value, signature: sign(value, secret) })).toString("base64url")}`
          : await provider.playback(record.playbackId);
        return json({
          url: playbackUrl,
          expiresAt: value.expires,
          synthetic: !!fixtureRunId,
        });
      }
      return json({ error: "VIDEO_ROUTE: Unsupported video operation" }, 400);
    } catch (error: any) {
      const message = String(error?.message ?? error),
        match = message.match(
          /(?:FORBIDDEN|VIDEO_[A-Z_]+|TERMS_UNAVAILABLE|ACCEPTANCE_REQUIRED|OPERATION_CONFLICT|STALE_VERSION):[^\r\n]*/,
        );
      return json(
        {
          error:
            match?.[0] ??
            "VIDEO_UNAVAILABLE: Could not confirm this operation. Reconnect and retry the same original",
        },
        message.includes("FORBIDDEN") ? 403 : 400,
      );
    }
  };
}

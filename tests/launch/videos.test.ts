import Mux from "@mux/ts";
import { getPayloadFromClientToken } from "@vercel/blob/client";
import { makeFunctionReference } from "convex/server";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import test from "node:test";
import { servePhotoRequest } from "../../api/photos.ts";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { inspectVideo } from "../../server/launch/video-inspection.ts";
import {
  blobVideoStore,
  muxProvider,
  verifyProviderInput,
} from "../../server/launch/videos.ts";
import { campaignRules as rules } from "./fixtures.ts";
import { paddedVideo, videoBytes } from "./video-fixtures.ts";

test("T04 official Blob SDK grants exact private multipart path and inclusive 5GB capability (synthetic signing key)", async () => {
  const record = {
    pathname: "videos/owned.mp4",
    expiresAt: Date.now() + 60_000,
  };
  const store = blobVideoStore({
    token: "vercel_blob_rw_synthetic_not-a-provider-credential",
  });
  const body = {
    type: "blob.generate-client-token",
    payload: {
      pathname: record.pathname,
      multipart: true,
      clientPayload: JSON.stringify({ uploadId: "owned" }),
    },
  };
  const request = new Request("https://owned.invalid/api/videos", {
    method: "POST",
  });
  const result = await store.token(request, body, async () => record),
    payload = getPayloadFromClientToken(result.clientToken);
  assert.equal(payload.pathname, record.pathname);
  assert.equal(payload.maximumSizeInBytes, 5_000_000_000);
  assert.equal(payload.validUntil, record.expiresAt);
  assert.deepEqual(payload.allowedContentTypes, ["video/mp4"]);
  assert.equal(payload.allowOverwrite, false);
  assert.equal(payload.addRandomSuffix, false);
  await assert.rejects(
    store.token(
      request,
      { ...body, payload: { ...body.payload, pathname: "videos/foreign.mp4" } },
      async () => record,
    ),
    /VIDEO_IMMUTABLE/,
  );
  await assert.rejects(
    store.token(
      request,
      { ...body, payload: { ...body.payload, multipart: false } },
      async () => record,
    ),
    /VIDEO_TOKEN/,
  );
});

test("T04 official Mux SDK wire contract, no POST retries, exact input fields, and ambiguous correlation (synthetic HTTP)", async () => {
  let calls = 0,
    wire: any;
  const client = new Mux({
    tokenId: "synthetic",
    tokenSecret: "synthetic",
    fetch: async (_request, options) => {
      calls++;
      wire = JSON.parse(String(options?.body));
      return Response.json(
        { error: { message: "synthetic timeout" } },
        { status: 503 },
      );
    },
  });
  const provider = muxProvider({ client, evidenceId: "synthetic-only" });
  await assert.rejects(
    provider.create("https://owned.invalid/source", "revision:1"),
  );
  assert.equal(calls, 1);
  assert.equal(wire.passthrough, "revision:1");
  assert.deepEqual(wire.playback_policies, ["signed"]);
  assert.equal(wire.inputs[0].url, "https://owned.invalid/source");
  const duplicateClient = new Mux({
    tokenId: "synthetic",
    tokenSecret: "synthetic",
    fetch: async () =>
      Response.json({
        data: [
          { id: "one", passthrough: "revision:1" },
          { id: "two", passthrough: "revision:1" },
        ],
      }),
  });
  await assert.rejects(
    muxProvider({ client: duplicateClient, evidenceId: "synthetic-only" }).find(
      "revision:1",
    ),
    /VIDEO_PROVIDER_UNKNOWN/,
  );
  assert.equal(muxProvider({ client, evidenceId: "" }).available(), false);
  verifyProviderInput(
    [
      {
        file: {
          container_format: "mov,mp4,m4a,3gp,3g2,mj2",
          tracks: [
            { type: "video", encoding: "h264", duration: 60 },
            { type: "audio", encoding: "aac", duration: 60.023 },
          ],
        },
      },
    ],
    { audioCodec: "aac" },
  );
  assert.throws(
    () =>
      verifyProviderInput(
        [
          {
            file: {
              container_format: "mp4",
              tracks: [{ type: "video", encoding: "hevc", duration: 1 }],
            },
          },
        ],
        { audioCodec: "none" },
      ),
    /VIDEO_FORMAT/,
  );
});

test("T04 streaming actual MP4 bytes codec, inclusive 60-second and malformed container boundaries", async () => {
  for (const audio of ["none", "aac"]) {
    const bytes = await videoBytes({ duration: 60, audio });
    const result = await inspectVideo(Readable.from(bytes), bytes.length);
    assert.equal(result.duration, 60);
    assert.equal(result.audioCodec, audio);
    assert.equal(
      result.sha256,
      createHash("sha256").update(bytes).digest("hex"),
    );
  }
  for (const options of [
    { duration: 60.04 },
    { video: "mpeg4" },
    { audio: "libmp3lame" },
  ]) {
    const bytes = await videoBytes(options);
    await assert.rejects(
      inspectVideo([bytes], bytes.length),
      /VIDEO_(FORMAT|DURATION)/,
    );
  }
  const bytes = await videoBytes({ faststart: true });
  await assert.rejects(
    inspectVideo([bytes.subarray(0, -1)], bytes.length),
    /VIDEO_FORMAT/,
  );
  const bad = Buffer.from(bytes);
  bad.writeUInt32BE(0xffffffff, 0);
  await assert.rejects(inspectVideo([bad], bad.length), /VIDEO_FORMAT/);
  for (const variant of [
    { extended: true },
    { extended: false },
    { extended: false, zero: true },
  ]) {
    const result = await inspectVideo(
      paddedVideo(bytes, bytes.length + 128, variant),
      bytes.length + 128,
    );
    assert.equal(result.size, bytes.length + 128);
  }
  // The stsd count and decoder descriptors must describe real codec children.
  const count = Buffer.from(bytes),
    stsd = count.indexOf(Buffer.from("stsd"));
  count.writeUInt32BE(2, stsd + 8);
  await assert.rejects(
    inspectVideo([count], count.length),
    /sample description/i,
  );
  const audio = await videoBytes({ audio: "aac" }),
    badAudio = Buffer.from(audio),
    esds = badAudio.indexOf(Buffer.from("esds"));
  badAudio[esds + 8] = 0x7f;
  await assert.rejects(
    inspectVideo([badAudio], badAudio.length),
    /descriptor/i,
  );
});

test(
  "T04 actual Convex original bytes, private source grants, Mux state, revisions and restart",
  { timeout: 900_000 },
  async (t) => {
    const backend = await createLocalBackend();
    const server = createServer(
      (request, response) =>
        void servePhotoRequest(backend.videoService, request, response),
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${(server.address() as any).port}`,
      scope = { campaignId: "adoption" };
    const alice = backend.client("creator-a"),
      bob = backend.client("creator-b"),
      manager = backend.client("manager-a"),
      guest = backend.client();
    let operation = 0;
    const route = (
      action: string,
      id: string,
      subject: string | null = "creator-a",
      options: any = {},
    ) =>
      fetch(`${origin}/api/videos?action=${action}&uploadId=${id}`, {
        ...options,
        headers: {
          ...(subject
            ? { Authorization: `Bearer ${backend.token(subject)}` }
            : {}),
          ...options.headers,
        },
      });
    const reserve = (size: number, actor = alice, extra = {}) =>
      actor.mutation(makeFunctionReference<"mutation">("videos:reserve"), {
        ...scope,
        operationId: `video-${++operation}`,
        filename: "original.mp4",
        size,
        ...extra,
      });
    const submit = (video: string, extra = {}) =>
      alice.mutation(makeFunctionReference<"mutation">("photos:submit"), {
        ...scope,
        operationId: `submit-${++operation}`,
        title: "Original campaign video",
        description: "Creator-owned source for adoption.is",
        photos: [],
        video,
        ...extra,
      });
    async function upload(bytes: Buffer) {
      const record = await reserve(bytes.length);
      assert.equal(
        (
          await route("local-upload", record._id, "creator-a", {
            method: "PUT",
            body: bytes,
          })
        ).status,
        200,
      );
      const result = await route("verify", record._id, "creator-a", {
        method: "POST",
      });
      assert.equal(result.status, 200, await result.clone().text());
      return result.json();
    }
    async function callback(
      record: any,
      type = "video.asset.ready",
      eventId = `event-${++operation}`,
      signature = true,
    ) {
      const body = JSON.stringify({
        id: eventId,
        type,
        data: {
          id: record.assetId,
          passthrough: `${record._id}:${record.attempt}`,
        },
      });
      return route("webhook", "", null, {
        method: "POST",
        headers: {
          "mux-signature": signature ? backend.mux.signature(body) : "forged",
        },
        body,
      });
    }
    let original: any, entry: any, ready: any;
    try {
      await manager.mutation(
        makeFunctionReference<"mutation">("campaignSetup:create"),
        {
          ...scope,
          operationId: "rules",
          rules,
        },
      );
      for (const subject of ["creator-a", "creator-b"]) {
        const invite = await manager.mutation(
          makeFunctionReference<"mutation">("creatorAccess:invite"),
          {
            ...scope,
            email: `${subject}@creators.example`,
            operationId: subject,
          },
        );
        await manager.action("clerkInvitations:dispatch", {
          ...scope,
          invitationId: invite._id,
          kind: "create",
        });
      }
      await t.test(
        "AC01 actual terms/acceptance required before intake and exact retry",
        async () => {
          await assert.rejects(reserve(10), /ACCEPTANCE_REQUIRED/);
          await assert.rejects(
            guest.mutation(
              makeFunctionReference<"mutation">("videos:reserve"),
              {
                ...scope,
                operationId: "guest",
                filename: "source.mp4",
                size: 10,
              },
            ),
            /FORBIDDEN/,
          );
        },
      );
      const terms = JSON.parse(
        await backend.command(
          "run",
          "fixtures:terms",
          JSON.stringify({ campaignSlug: "adoption", synthetic: true }),
        ),
      );
      for (const actor of [alice, bob]) {
        const w = await actor.query(
          makeFunctionReference<"query">("creatorAccess:workspace"),
          scope,
        );
        await actor.mutation(
          makeFunctionReference<"mutation">("creatorAccess:accept"),
          {
            ...scope,
            invitationId: w.invitation._id,
            termsId: terms,
            version: w.terms.version,
            confirmed: true,
            operationId: "accept",
          },
        );
      }
      await t.test(
        "AC01 exact retries, current owner, forged receipts and changed operations",
        async () => {
          const request = {
            ...scope,
            filename: "stable.mp4",
            operationId: "stable-upload",
            size: 10,
          };
          const result = await Promise.all([
            alice.mutation(
              makeFunctionReference<"mutation">("videos:reserve"),
              request,
            ),
            alice.mutation(
              makeFunctionReference<"mutation">("videos:reserve"),
              request,
            ),
          ]);
          assert.equal(result[0]._id, result[1]._id);
          await assert.rejects(
            alice.mutation(
              makeFunctionReference<"mutation">("videos:reserve"),
              { ...request, size: 11 },
            ),
            /OPERATION_CONFLICT/,
          );
          await assert.rejects(
            alice.mutation(makeFunctionReference<"mutation">("videos:record"), {
              receipt: {
                uploadId: result[0]._id,
                at: Date.now(),
                attempt: 0,
                action: "verified",
                size: 10,
                sha256: "a".repeat(64),
                duration: 1,
                videoCodec: "h264",
                audioCodec: "none",
              },
              signature: "forged",
            }),
            /FORBIDDEN/,
          );
          assert.equal(
            (
              await route("verify", result[0]._id, "creator-b", {
                method: "POST",
              })
            ).status,
            403,
          );
          assert.equal(
            (await route("verify", result[0]._id, null, { method: "POST" }))
              .status,
            403,
          );
          await assert.rejects(reserve(5_000_000_001), /VIDEO_SIZE/);
        },
      );
      await t.test(
        "AC02 unsupported and truncated actual files remain invalid with actionable persistent status",
        async () => {
          for (const bytes of [
            Buffer.from("not an mp4"),
            await videoBytes({ video: "mpeg4" }),
            await videoBytes({ audio: "libmp3lame" }),
            await videoBytes({ duration: 60.04 }),
          ]) {
            const record = await reserve(bytes.length);
            await route("local-upload", record._id, "creator-a", {
              method: "PUT",
              body: bytes,
            });
            const result = await route("verify", record._id, "creator-a", {
              method: "POST",
            });
            assert.equal(result.status, 400);
            assert.match(
              (await result.json()).error,
              /VIDEO_(FORMAT|DURATION)/,
            );
            await assert.rejects(submit(record._id), /FORBIDDEN/);
          }
          const rows = await alice.query(
            makeFunctionReference<"query">("videos:workspace"),
            scope,
          );
          assert.ok(rows.some((r: any) => r.state === "invalid" && r.error));
        },
      );
      await t.test(
        "AC01 actual bytes SHA256 and interrupted validation retry preserve one source",
        async () => {
          const bytes = await videoBytes();
          original = await upload(bytes);
          assert.equal(
            original.sha256,
            createHash("sha256").update(bytes).digest("hex"),
          );
          assert.equal(
            (
              await route("local-upload", original._id, "creator-a", {
                method: "PUT",
                body: bytes,
              })
            ).status,
            400,
          );
          const again = await route("verify", original._id, "creator-a", {
            method: "POST",
          });
          assert.equal((await again.json()).sha256, original.sha256);
          await assert.rejects(
            bob.query(makeFunctionReference<"query">("videos:resource"), {
              ...scope,
              uploadId: original._id,
            }),
            /FORBIDDEN/,
          );
          await assert.rejects(
            backend
              .client("manager-b")
              .query(makeFunctionReference<"query">("videos:resource"), {
                ...scope,
                uploadId: original._id,
              }),
            /FORBIDDEN/,
          );
          entry = await submit(original._id);
          const saved = await alice.query(
            makeFunctionReference<"query">("photos:entry"),
            {
              ...scope,
              entryId: entry._id,
            },
          );
          assert.equal(saved.versions[0].video, original._id);
          assert.equal(saved.versions[0].title, "Original campaign video");
          assert.ok(saved.versions[0].acceptanceId);
          assert.equal(saved.subject, "creator-a");
          const review = {
            ...scope,
            entryId: entry._id,
            expectedVersion: 1,
            operationId: "premature-approval",
            decision: "approved",
            reason: "",
          };
          await assert.rejects(
            manager.mutation(
              makeFunctionReference<"mutation">("photos:review"),
              review,
            ),
            /VIDEO_NOT_READY/,
          );
          assert.equal((await route("playback", original._id)).status, 400);
        },
      );
      await t.test(
        "AC03 concurrent ingestion is journaled once; signed bounded source yields exact bytes only to ingestion",
        async () => {
          const before = await backend.mux.calls();
          await Promise.all([
            route("process", original._id, "creator-a", { method: "POST" }),
            route("process", original._id, "creator-a", { method: "POST" }),
          ]);
          assert.equal(await backend.mux.calls(), before + 1);
          const record = await alice.query(
            makeFunctionReference<"query">("videos:resource"),
            {
              ...scope,
              uploadId: original._id,
            },
          );
          assert.ok(record.assetId);
          assert.equal(record.state, "processing");
          const asset = await backend.mux.find(
            `${record._id}:${record.attempt}`,
            record.assetId,
          );
          const source = await fetch(asset.source);
          assert.equal(source.status, 200);
          assert.equal(
            source.headers.get("cache-control"),
            "private, no-store",
          );
          assert.equal(
            createHash("sha256")
              .update(Buffer.from(await source.arrayBuffer()))
              .digest("hex"),
            original.sha256,
          );
          const target = new URL(asset.source);
          target.searchParams.set("grant", "forged");
          assert.notEqual((await fetch(target)).status, 200);
          assert.equal(
            (await callback(record, "video.asset.ready", "forged-event", false))
              .status,
            403,
          );
          await backend.mux.update(record.assetId, { status: "ready" });
          const eventId = "stable-ready-event";
          assert.equal(
            (await callback(record, "video.asset.ready", eventId)).status,
            200,
          );
          assert.equal(
            (await callback(record, "video.asset.ready", eventId)).status,
            200,
          );
          await callback(record, "video.asset.created");
          ready = await alice.query(
            makeFunctionReference<"query">("videos:resource"),
            {
              ...scope,
              uploadId: original._id,
            },
          );
          assert.equal(ready.state, "ready");
          assert.equal((await fetch(asset.source)).status, 403);
          const playback = await route("playback", original._id);
          assert.equal(playback.status, 200);
          const grant = await playback.json();
          const processed = await fetch(origin + grant.url);
          assert.equal(processed.status, 200);
          const processedBytes = Buffer.from(await processed.arrayBuffer());
          assert.ok(processedBytes.length > 500);
          assert.equal(
            (await inspectVideo([processedBytes], processedBytes.length))
              .videoCodec,
            "h264",
          );
          assert.equal(
            (await route("playback", original._id, "creator-b")).status,
            403,
          );
          assert.equal(
            (await route("playback", original._id, null)).status,
            403,
          );
        },
      );
      await t.test(
        "AC04 existing source survives playback removal, known failure retry and unknown absence never creates again",
        async () => {
          const broken = await upload(await videoBytes({ color: "blue" }));
          await backend.mux.mode("unknown-absent");
          const before = await backend.mux.calls();
          await route("process", broken._id, "creator-a", { method: "POST" });
          await backend.mux.mode("ready");
          await route("process", broken._id, "creator-a", { method: "POST" });
          assert.equal(await backend.mux.calls(), before + 1);
          assert.equal(
            (
              await alice.query(
                makeFunctionReference<"query">("videos:resource"),
                {
                  ...scope,
                  uploadId: broken._id,
                },
              )
            ).state,
            "unknown",
          );
          const rejected = await upload(await videoBytes({ color: "green" }));
          await backend.mux.mode("reject");
          await route("process", rejected._id, "creator-a", { method: "POST" });
          assert.equal(
            (
              await alice.query(
                makeFunctionReference<"query">("videos:resource"),
                {
                  ...scope,
                  uploadId: rejected._id,
                },
              )
            ).state,
            "failed",
          );
          await backend.mux.mode("ready");
          const retry = await route("process", rejected._id, "manager-a", {
            method: "POST",
          });
          assert.equal((await retry.json()).state, "ready");
          await backend.mux.update(ready.assetId, { status: "deleted" });
          await callback(ready, "video.asset.deleted");
          const removed = await alice.query(
            makeFunctionReference<"query">("videos:resource"),
            {
              ...scope,
              uploadId: original._id,
            },
          );
          assert.equal(removed.state, "deleted");
          assert.equal(removed.sha256, original.sha256);
          assert.equal((await route("playback", original._id)).status, 400);
          await route("process", original._id, "creator-a", { method: "POST" });
          assert.equal(
            (
              await alice.query(
                makeFunctionReference<"query">("videos:resource"),
                {
                  ...scope,
                  uploadId: original._id,
                },
              )
            ).state,
            "ready",
          );
        },
      );
      await t.test(
        "REQ108 shared revisions, approval and post-approval replacement identity",
        async () => {
          const approved = await manager.mutation(
            makeFunctionReference<"mutation">("photos:review"),
            {
              ...scope,
              entryId: entry._id,
              expectedVersion: 1,
              operationId: "approve-video",
              decision: "approved",
              reason: "",
            },
          );
          assert.equal(approved.status, "approved");
          const edited = await submit(original._id, {
            entryId: entry._id,
            expectedVersion: 1,
            title: "Descriptive edit",
          });
          assert.equal(edited._id, entry._id);
          assert.equal(edited.status, "pending");
          const other = await upload(await videoBytes({ color: "pink" }));
          const replacement = await submit(other._id, {
            entryId: edited._id,
            expectedVersion: 2,
          });
          assert.notEqual(replacement._id, edited._id);
          assert.equal(replacement.replacementOf, edited._id);
          assert.equal(replacement.status, "pending");
          const historical = await alice.query(
            makeFunctionReference<"query">("photos:entry"),
            {
              ...scope,
              entryId: entry._id,
            },
          );
          assert.equal(historical.versions.length, 2);
          assert.equal(historical.versions[0].title, "Original campaign video");
        },
      );
      await t.test(
        "AC01/02 actual inclusive 5,000,000,000-byte valid MP4 round trip and independently hashed stored bytes",
        async () => {
          const bytes = await videoBytes({ duration: 60 });
          const record = await reserve(5_000_000_000),
            expected = createHash("sha256");
          async function* measured() {
            for await (const chunk of paddedVideo(bytes, 5_000_000_000)) {
              expected.update(chunk);
              yield chunk;
            }
          }
          const written = await route("local-upload", record._id, "creator-a", {
            method: "PUT",
            body: Readable.toWeb(Readable.from(measured())),
            duplex: "half",
          });
          assert.equal(written.status, 200, await written.text());
          const verified = await route("verify", record._id, "creator-a", {
            method: "POST",
          });
          assert.equal(verified.status, 200, await verified.clone().text());
          const result = await verified.json();
          assert.equal(result.size, 5_000_000_000);
          assert.equal(result.duration, 60);
          assert.equal(result.sha256, expected.digest("hex"));
          const saved = await submit(result._id);
          assert.ok(saved._id);
          console.log(
            `T04 actual original boundary: bytes=${result.size}, seconds=${result.duration}, sha256=${result.sha256}`,
          );
        },
      );
      await t.test(
        "AC03/04 durable restart, historical reads after missing terms and current revocation",
        async () => {
          await backend.restart();
          const restored = await alice.query(
            makeFunctionReference<"query">("videos:resource"),
            {
              ...scope,
              uploadId: original._id,
            },
          );
          assert.equal(restored.sha256, original.sha256);
          assert.equal(restored.state, "ready");
          await backend.command(
            "run",
            "fixtures:removeTerms",
            JSON.stringify({ campaignSlug: "adoption" }),
          );
          assert.ok(
            (
              await alice.query(
                makeFunctionReference<"query">("videos:workspace"),
                scope,
              )
            ).length,
          );
          assert.equal((await route("playback", original._id)).status, 200);
          await assert.rejects(reserve(10), /TERMS_UNAVAILABLE/);
          await backend.command(
            "run",
            "fixtures:revoke",
            JSON.stringify({
              subject: "creator-a",
              nonprofitId: "nonprofit-a",
            }),
          );
          assert.equal((await route("playback", original._id)).status, 403);
          await assert.rejects(
            alice.query(
              makeFunctionReference<"query">("videos:workspace"),
              scope,
            ),
            /FORBIDDEN/,
          );
        },
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await backend.stop();
    }
  },
);

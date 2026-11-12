import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { servePhotoRequest } from "../../api/photos.ts";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { pngBytes, jpegBytes } from "./photo-fixtures.ts";
import { videoBytes } from "./video-fixtures.ts";
import { mutation, query, preparePublicCreator } from "./public-fixtures.ts";

test(
  "T05 account-free persistent public records, current approval, origin links and private archives",
  { timeout: 600_000 },
  async (t) => {
    const backend = await createLocalBackend();
    const server = createServer(
      (req, res) =>
        void servePhotoRequest(
          req.url?.startsWith("/api/videos")
            ? backend.videoService
            : backend.photoService,
          req,
          res,
        ),
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    const manager = backend.client("manager-a"),
      creator = backend.client("public-creator"),
      guest = backend.client(),
      other = backend.client("manager-b");
    const scope = { campaignId: "adoption" };
    let operation = 0;
    const route = (
      kind: string,
      action: string,
      id: string,
      options: any = {},
      auth: boolean | string = false,
    ) =>
      fetch(
        `${origin}/api/${kind}?action=${action}&${action === "public" ? "entryId" : "uploadId"}=${id}`,
        {
          ...options,
          headers: auth
            ? {
                Authorization: `Bearer ${backend.token(typeof auth === "string" ? auth : "public-creator")}`,
              }
            : undefined,
        },
      );
    const submit = (photos: string[], extra: any = {}) =>
      mutation(creator, "photos:submit", {
        ...scope,
        operationId: `submit-${++operation}`,
        title: "A real approved fixture",
        description:
          "Owned verification creative, not production campaign content.",
        publicCreatorName: "River Studio",
        photos,
        ...extra,
      });
    const review = (entry: any, decision = "approved", actor = manager) =>
      mutation(actor, "photos:review", {
        ...scope,
        entryId: entry._id,
        expectedVersion: entry.version,
        operationId: `review-${++operation}`,
        decision,
        reason: decision === "approved" ? "" : "Private review feedback",
      });
    async function upload(kind: string, bytes: Buffer, type = "image/png") {
      const record = await mutation(creator, `${kind}:reserve`, {
        ...scope,
        operationId: `upload-${++operation}`,
        filename:
          kind === "photos" ? "private-original.png" : "private-original.mp4",
        size: bytes.length,
        ...(kind === "photos" ? { type } : {}),
      });
      assert.equal(
        (
          await route(
            kind,
            "local-upload",
            record._id,
            { method: "PUT", body: bytes },
            true,
          )
        ).status,
        200,
      );
      const verified = await route(
        kind,
        "verify",
        record._id,
        { method: "POST" },
        true,
      );
      assert.equal(verified.status, 200, await verified.clone().text());
      return verified.json();
    }
    try {
      assert.deepEqual(
        (await query(guest, "publicViewer:campaign")).entries,
        [],
      );
      await backend.command(
        "run",
        "fixtures:terms",
        JSON.stringify({ campaignSlug: "adoption", synthetic: true }),
      );
      await preparePublicCreator(manager, creator, "public");
      const photo = await upload("photos", await pngBytes());
      const [entry, retriedEntry] = await Promise.all([
        submit([photo._id], { operationId: "concurrent-create" }),
        submit([photo._id], { operationId: "concurrent-create" }),
      ]);
      assert.equal(entry._id, retriedEntry._id);
      assert.equal(entry.trackedPath, `/fundraise/${entry._id}`);
      await t.test(
        "AC02 pending/rejected/direct media and capability denial reveal no private details",
        async () => {
          for (const decision of ["pending", "rejected"]) {
            if (decision === "rejected") await review(entry, "rejected");
            assert.equal(
              await query(guest, "publicViewer:entry", { entryId: entry._id }),
              null,
            );
            assert.equal(
              await query(guest, "publicViewer:fundraising", {
                entryId: entry._id,
              }),
              null,
            );
            assert.equal(
              (await route("photos", "public", entry._id)).status,
              403,
            );
            await assert.rejects(
              query(guest, "photos:entry", { ...scope, entryId: entry._id }),
              /FORBIDDEN/,
            );
          }
          await assert.rejects(
            query(guest, "publicViewer:mediaAccess", {
              entryId: entry._id,
              kind: "photo",
              index: 0,
              at: Date.now(),
              signature: "forged",
            }),
            /FORBIDDEN/,
          );
          await assert.rejects(review(entry, "approved", other), /FORBIDDEN/);
          await assert.rejects(review(entry, "approved", creator), /FORBIDDEN/);
          const denied = await route("photos", "public", entry._id);
          assert.doesNotMatch(
            await denied.text(),
            /River Studio|private-original|photos\/|creators.example|Private review/,
          );
        },
      );
      await review(entry);
      const publicEntry = await query(guest, "publicViewer:entry", {
        entryId: entry._id,
      });
      await t.test(
        "AC01 approved waiting creative projects safe attribution and campaign records with sanitized photos",
        async () => {
          assert.equal(publicEntry.creator, "River Studio");
          assert.equal(
            (await query(guest, "publicViewer:campaign")).entries[0].id,
            entry._id,
          );
          assert.doesNotMatch(
            JSON.stringify(publicEntry),
            /subject|acceptanceId|sha256|pathname|photos\/|creators.example|actor|reason|fixtureRunId/,
          );
          const image = await route("photos", "public", entry._id);
          assert.equal(image.status, 200);
          const bytes = Buffer.from(await image.arrayBuffer());
          assert.equal((await sharp(bytes).metadata()).format, "jpeg");
          assert.notDeepEqual(bytes, await pngBytes());
          assert.equal(
            (await route("photos", "resource", photo._id)).status,
            403,
          );
          assert.equal(
            (await route("photos", "public", entry._id + "&index=99")).status,
            403,
          );
          const before = await query(manager, "reservations:state", scope);
          assert.equal(before.reservedSlots, 0);
        },
      );
      await t.test(
        "AC03 exact retries, origin resolution across platforms, descriptive review and replacement identity",
        async () => {
          const request = {
            ...scope,
            operationId: "stable-submit",
            title: "Same creative",
            description: "Description awaiting review",
            photos: [photo._id],
            entryId: entry._id,
            expectedVersion: 1,
          };
          const edit = await mutation(creator, "photos:submit", request);
          assert.equal(edit._id, entry._id);
          assert.equal(edit.trackedPath, entry.trackedPath);
          assert.equal(
            (await mutation(creator, "photos:submit", request))._id,
            edit._id,
          );
          await assert.rejects(
            mutation(creator, "photos:submit", {
              ...request,
              title: "conflict",
            }),
            /OPERATION_CONFLICT/,
          );
          assert.equal(
            await query(guest, "publicViewer:entry", { entryId: entry._id }),
            null,
          );
          assert.equal(
            (await route("photos", "public", entry._id)).status,
            403,
          );
          await review(edit);
          assert.equal(
            (await query(guest, "publicViewer:entry", { entryId: entry._id }))
              .creator,
            "River Studio",
          );
          const origin1 = await query(guest, "publicViewer:fundraising", {
            entryId: entry._id,
          });
          const origin2 = await query(guest, "publicViewer:fundraising", {
            entryId: entry._id,
          });
          assert.equal(origin1.originEntryId, entry._id);
          assert.deepEqual(origin1, origin2);
          assert.equal(origin1.checkout, "unavailable");
          const replacementPhoto = await upload(
            "photos",
            await jpegBytes(),
            "image/jpeg",
          );
          const replacement = await submit([replacementPhoto._id], {
            entryId: entry._id,
            expectedVersion: 2,
          });
          assert.notEqual(replacement._id, entry._id);
          assert.notEqual(replacement.trackedPath, entry.trackedPath);
          assert.equal(replacement.replacementOf, entry._id);
          assert.equal(
            await query(guest, "publicViewer:entry", {
              entryId: replacement._id,
            }),
            null,
          );
          await review(replacement);
          assert.equal(
            (await query(guest, "publicViewer:campaign")).entries.length,
            2,
          );
          const saved = await query(creator, "photos:entry", {
            ...scope,
            entryId: entry._id,
          });
          assert.equal(saved.versions.length, 2);
          assert.equal(saved.events.length, 5);
          assert.ok(
            saved.events.every(
              (e: any) =>
                e.actor && e.source && e.at && e.version && e.operationId,
            ),
          );
        },
      );
      await t.test(
        "AC04 missing photo bytes preserve origin access and retry after restoration",
        async () => {
          const path = join(
            backend.directory,
            "private-photo-fixture",
            photo.pathname.slice(7),
          );
          await rename(path, path + ".held");
          try {
            assert.notEqual(
              (await route("photos", "public", entry._id)).status,
              200,
            );
            assert.equal(
              (
                await query(guest, "publicViewer:fundraising", {
                  entryId: entry._id,
                })
              ).originEntryId,
              entry._id,
            );
          } finally {
            await rename(path + ".held", path);
          }
          assert.equal(
            (await route("photos", "public", entry._id)).status,
            200,
          );
        },
      );
      await t.test(
        "AC01 video approved signed playback, private source denial and new replacement origin",
        async () => {
          await backend.mux.mode("ready");
          const original = await upload("videos", await videoBytes());
          assert.equal(
            (
              await route(
                "videos",
                "process",
                original._id,
                { method: "POST" },
                true,
              )
            ).status,
            200,
          );
          const video = await submit([], {
            video: original._id,
            title: "Verified public video",
          });
          assert.equal(
            (await route("videos", "public", video._id)).status,
            403,
          );
          await review(video);
          const playback = await route("videos", "public", video._id);
          assert.equal(playback.status, 200, await playback.clone().text());
          const body = await playback.json();
          const processed = await fetch(new URL(body.url, origin));
          assert.equal(processed.status, 200);
          assert.ok((await processed.arrayBuffer()).byteLength > 100);
          assert.equal(
            (await route("videos", "resource", original._id)).status,
            403,
          );
          assert.equal(
            (await route("videos", "playback", original._id)).status,
            403,
          );
          const edit = await submit([], {
            video: original._id,
            entryId: video._id,
            expectedVersion: 1,
            title: "Unreviewed title",
          });
          assert.equal((await fetch(new URL(body.url, origin))).status, 403);
          assert.equal(
            (await route("videos", "public", video._id)).status,
            403,
          );
          await review(edit);
          const nextOriginal = await upload(
            "videos",
            await videoBytes({ color: "blue" }),
          );
          await route(
            "videos",
            "process",
            nextOriginal._id,
            { method: "POST" },
            true,
          );
          const replacement = await submit([], {
            video: nextOriginal._id,
            entryId: video._id,
            expectedVersion: 2,
          });
          assert.notEqual(replacement._id, video._id);
          await review(replacement);
          assert.equal(
            (await route("videos", "public", video._id)).status,
            200,
          );
          assert.equal(
            (await route("videos", "public", replacement._id)).status,
            200,
          );
        },
      );
      await t.test(
        "Attribution stays stable across unnamed entries and distinguishes creators without private identifiers",
        async () => {
          const first = await submit([photo._id], { publicCreatorName: "" });
          const second = await submit([photo._id], { publicCreatorName: "" });
          await review(first);
          await review(second);
          const a = await query(guest, "publicViewer:entry", {
            entryId: first._id,
          });
          const b = await query(guest, "publicViewer:entry", {
            entryId: second._id,
          });
          assert.match(a.creator, /^Campaign creator [a-f0-9]{16}$/);
          assert.equal(a.creator, b.creator);
          assert.doesNotMatch(a.creator, /public-creator|creators.example/);
          await assert.rejects(
            submit([photo._id], { publicCreatorName: "person@example.com" }),
            /PUBLIC_NAME/,
          );
          const stranger = backend.client("public-second");
          await preparePublicCreator(
            manager,
            stranger,
            "second-participant",
            "adoption",
            "public-second",
          );
          const bytes = await pngBytes();
          const reservation = await mutation(stranger, "photos:reserve", {
            ...scope,
            operationId: "second-upload",
            filename: "second.png",
            size: bytes.length,
            type: "image/png",
          });
          assert.equal(
            (
              await route(
                "photos",
                "local-upload",
                reservation._id,
                { method: "PUT", body: bytes },
                "public-second",
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await route(
                "photos",
                "verify",
                reservation._id,
                { method: "POST" },
                "public-second",
              )
            ).status,
            200,
          );
          const third = await mutation(stranger, "photos:submit", {
            ...scope,
            operationId: "second-submit",
            title: "Another participant",
            description: "A separate creator's original.",
            photos: [reservation._id],
          });
          await review(third);
          assert.notEqual(
            (await query(guest, "publicViewer:entry", { entryId: third._id }))
              .creator,
            a.creator,
          );
        },
      );
      await t.test(
        "Nonprofit boundary excludes approved foreign entries and private upload metadata",
        async () => {
          await backend.command(
            "run",
            "fixtures:terms",
            JSON.stringify({ campaignSlug: "other", synthetic: true }),
          );
          await preparePublicCreator(other, creator, "other-campaign", "other");
          const bytes = await pngBytes(),
            otherScope = { campaignId: "other" };
          const reservation = await mutation(creator, "photos:reserve", {
            ...otherScope,
            operationId: "other-upload",
            filename: "private-other.png",
            size: bytes.length,
            type: "image/png",
          });
          assert.equal(
            (
              await route(
                "photos",
                "local-upload",
                `${reservation._id}&campaignId=other`,
                { method: "PUT", body: bytes },
                true,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await route(
                "photos",
                "verify",
                `${reservation._id}&campaignId=other`,
                { method: "POST" },
                true,
              )
            ).status,
            200,
          );
          const foreign = await mutation(creator, "photos:submit", {
            ...otherScope,
            operationId: "other-submit",
            title: "PRIVATE OTHER NONPROFIT",
            description: "Must never appear in adoption.is",
            photos: [reservation._id],
          });
          await mutation(other, "photos:review", {
            ...otherScope,
            entryId: foreign._id,
            expectedVersion: 1,
            operationId: "other-approve",
            decision: "approved",
            reason: "",
          });
          assert.equal(
            await query(guest, "publicViewer:entry", { entryId: foreign._id }),
            null,
          );
          assert.equal(
            (await route("photos", "public", foreign._id)).status,
            403,
          );
          assert.doesNotMatch(
            JSON.stringify(await query(guest, "publicViewer:campaign")),
            /PRIVATE OTHER|private-other|nonprofit-b/,
          );
        },
      );
      await t.test(
        "AC01 durable restart retains public records links audits and private originals",
        async () => {
          const before = await query(guest, "publicViewer:campaign");
          await backend.restart();
          assert.deepEqual(await query(guest, "publicViewer:campaign"), before);
          assert.equal(
            (
              await query(guest, "publicViewer:fundraising", {
                entryId: entry._id,
              })
            ).originEntryId,
            entry._id,
          );
          const privateBytes = await route(
            "photos",
            "resource",
            photo._id,
            {},
            true,
          );
          assert.deepEqual(
            Buffer.from(await privateBytes.arrayBuffer()),
            await pngBytes(),
          );
        },
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await backend.stop();
    }
  },
);

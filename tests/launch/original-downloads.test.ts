import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { makeFunctionReference } from "convex/server";
import { servePhotoRequest } from "../../api/photos.ts";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { campaignRules } from "./fixtures.ts";
import { videoBytes } from "./video-fixtures.ts";

test(
  "T06 exact private originals, archive revisions, capability boundaries, current roles and durable audit",
  { timeout: 240_000 },
  async (t) => {
    const backend = await createLocalBackend();
    const server = createServer(
      (request, response) =>
        void servePhotoRequest(backend.videoService, request, response),
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
    const scope = { campaignId: "adoption" };
    const alice = backend.client("creator-a"),
      aliceSecondSession = backend.client("creator-a"),
      manager = backend.client("manager-a");
    let operation = 0;
    const mutation = (actor: typeof alice, name: string, args: any) =>
      actor.mutation(makeFunctionReference<"mutation">(name), args);
    const fixture = (args: any) =>
      backend.command("run", "fixtures:archiveBoundary", JSON.stringify(args));
    const query = (actor: typeof alice, name: string, args: any) =>
      actor.query(makeFunctionReference<"query">(name), args);
    const route = (
      action: string,
      uploadId: string,
      subject: string | null = "creator-a",
      body?: any,
      method = "POST",
    ) =>
      fetch(`${origin}/api/videos?action=${action}&uploadId=${uploadId}`, {
        method,
        headers: subject
          ? {
              Authorization: `Bearer ${backend.token(subject)}`,
              "Content-Type": "application/json",
            }
          : {},
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const ticket = (
      uploadId: string,
      subject: string | null = "creator-a",
      extra = {},
    ) =>
      route("original-ticket", uploadId, subject, {
        operationId: `download-${++operation}`,
        ...extra,
      });
    async function upload(bytes: Buffer, filename = "original.mp4") {
      const record = await mutation(alice, "videos:reserve", {
        ...scope,
        operationId: `upload-${++operation}`,
        filename,
        size: bytes.length,
      });
      const response = await fetch(
        `${origin}/api/videos?action=local-upload&uploadId=${record._id}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${backend.token("creator-a")}` },
          body: bytes,
        },
      );
      assert.equal(response.status, 200);
      const verified = await route("verify", record._id);
      assert.equal(verified.status, 200, await verified.clone().text());
      return verified.json();
    }
    const submit = (uploadId: string, extra = {}) =>
      mutation(alice, "photos:submit", {
        ...scope,
        operationId: `entry-${++operation}`,
        title: "Exact original",
        description: "A creator-owned archive",
        photos: [],
        video: uploadId,
        ...extra,
      });
    const history = (uploadId: string) =>
      query(manager, "originalDownloads:history", { ...scope, uploadId });
    async function exactDownload(grant: any, expected: Buffer) {
      assert.deepEqual(Object.keys(grant).sort(), ["expiresAt", "url"]);
      assert.doesNotMatch(
        JSON.stringify(grant),
        /blob|pathname|tokenSecret|private-video|\.mp4/i,
      );
      const response = await fetch(origin + grant.url);
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(
        response.headers.get("content-length"),
        String(expected.length),
      );
      assert.equal(response.headers.get("content-type"), "video/mp4");
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(
        response.headers.get("content-digest"),
        `sha-256=:${createHash("sha256").update(expected).digest("base64")}:`,
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.deepEqual(bytes, expected);
      return response.headers.get("content-disposition")!;
    }
    try {
      // Intended rules operation with already-ended dates, not a future completion
      // implementation. T06's archive read has no campaign-date predicate.
      await mutation(manager, "campaignSetup:create", {
        ...scope,
        operationId: "ended-rules",
        rules: {
          ...campaignRules,
          campaignStart: "2025-01-01T06:00:00.000Z",
          campaignEnd: "2025-02-01T06:00:00.000Z",
        },
      });
      for (const subject of ["creator-a", "creator-b"]) {
        const invitation = await mutation(manager, "creatorAccess:invite", {
          ...scope,
          email: `${subject}@creators.example`,
          operationId: subject,
        });
        await manager.action("clerkInvitations:dispatch", {
          ...scope,
          invitationId: invitation._id,
          kind: "create",
        });
      }
      await backend.command(
        "run",
        "fixtures:terms",
        JSON.stringify({ campaignSlug: "adoption", synthetic: true }),
      );
      for (const actor of [alice, backend.client("creator-b")]) {
        const workspace = await query(actor, "creatorAccess:workspace", scope);
        await mutation(actor, "creatorAccess:accept", {
          ...scope,
          invitationId: workspace.invitation._id,
          termsId: workspace.terms._id,
          version: workspace.terms.version,
          operationId: "accept",
          confirmed: true,
        });
      }
      const bytes = await videoBytes(),
        otherBytes = await videoBytes({ color: "blue" });
      const original = await upload(bytes, 'family "été";\r\n.mp4');
      let entry: any, second: any, ownerGrant: any;
      await t.test(
        "AC01 draft verification and uploader/manager/independent operator exact bytes and safe filename",
        async () => {
          for (const subject of ["creator-a", "manager-a", "administrator"]) {
            const response = await ticket(original._id, subject);
            assert.equal(response.status, 200, await response.clone().text());
            const grant = await response.json();
            const disposition = await exactDownload(grant, bytes);
            assert.equal(
              disposition,
              "attachment; filename=\"original.mp4\"; filename*=UTF-8''family%20%22%C3%A9t%C3%A9%22%3B%0D%0A.mp4",
            );
            assert.ok(
              grant.expiresAt > Date.now() &&
                grant.expiresAt <= Date.now() + 300_000,
            );
          }
          entry = await submit(original._id);
          ownerGrant = await (
            await ticket(original._id, "creator-a", {
              entryId: entry._id,
              version: 1,
            })
          ).json();
          const ownedPath = join(
            backend.directory,
            "private-video-fixture",
            `${original._id}.mp4`,
          );
          await rename(ownedPath, ownedPath + ".offline");
          try {
            const unavailable = await fetch(origin + ownerGrant.url);
            assert.equal(unavailable.status, 400);
            assert.match(await unavailable.text(), /VIDEO_UNAVAILABLE/);
          } finally {
            await rename(ownedPath + ".offline", ownedPath);
          }
          await exactDownload(ownerGrant, bytes);
        },
      );
      await t.test(
        "AC02 public/other creator/nonprofit/cross-campaign/unsigned storage denied; failed originals visible",
        async () => {
          for (const subject of [null, "creator-b", "manager-b"]) {
            const response = await ticket(original._id, subject);
            assert.equal(response.status, 403);
            assert.doesNotMatch(
              await response.text(),
              /videos\/|blob|pathname|family|été|private-video/i,
            );
          }
          await assert.rejects(
            mutation(alice, "originalDownloads:issue", {
              campaignId: "other",
              uploadId: original._id,
              operationId: "cross-campaign",
            }),
            /FORBIDDEN/,
          );
          await assert.rejects(
            query(alice, "originalDownloads:delivery", {
              grantId: JSON.parse(
                Buffer.from(
                  new URL(ownerGrant.url, origin).searchParams.get("grant")!,
                  "base64url",
                ).toString(),
              ).grantId,
              at: Date.now(),
              signature: "forged",
            }),
            /FORBIDDEN/,
          );
          await assert.rejects(
            query(backend.client("creator-b"), "originalDownloads:history", {
              ...scope,
              uploadId: original._id,
            }),
            /FORBIDDEN/,
          );
          const invalid = await mutation(alice, "videos:reserve", {
            ...scope,
            operationId: "invalid",
            filename: "invalid.mp4",
            size: 1,
          });
          assert.equal((await ticket(invalid._id)).status, 400);
          assert.match(
            await (await ticket(invalid._id)).text(),
            /VIDEO_UNVERIFIED/,
          );
          assert.ok(
            (await query(alice, "videos:workspace", scope)).some(
              (row: any) =>
                row._id === invalid._id && row.state === "uploading",
            ),
          );
        },
      );
      await t.test(
        "AC04 two sessions, concurrent exact retries, immutable entry/revision binding and purpose-separated capability tampering",
        async () => {
          second = await upload(otherBytes);
          entry = await submit(second._id, {
            entryId: entry._id,
            expectedVersion: 1,
          });
          const args = {
            ...scope,
            entryId: entry._id,
            version: 1,
            uploadId: original._id,
            operationId: "two-sessions",
          };
          const grants = await Promise.all([
            mutation(alice, "originalDownloads:issue", args),
            mutation(aliceSecondSession, "originalDownloads:issue", args),
          ]);
          assert.deepEqual(grants[0], grants[1]);
          assert.equal(
            (await history(original._id)).filter(
              (row: any) => row.operationId === args.operationId,
            ).length,
            1,
          );
          await assert.rejects(
            mutation(alice, "originalDownloads:issue", {
              ...args,
              entryId: undefined,
              version: undefined,
            }),
            /OPERATION_CONFLICT/,
          );
          for (const extra of [
            { version: 2, uploadId: original._id },
            { version: 1, uploadId: second._id },
            { version: 100, uploadId: original._id },
            { version: undefined, uploadId: original._id },
          ]) {
            await assert.rejects(
              mutation(alice, "originalDownloads:issue", {
                ...args,
                operationId: `mismatch-${++operation}`,
                ...extra,
              }),
              /FORBIDDEN/,
            );
          }
          await exactDownload(ownerGrant, bytes);
          await exactDownload(
            await (
              await ticket(second._id, "manager-a", {
                entryId: entry._id,
                version: 2,
              })
            ).json(),
            otherBytes,
          );
          const url = new URL(ownerGrant.url, origin),
            encoded = url.searchParams.get("grant")!;
          const decoded = JSON.parse(
            Buffer.from(encoded, "base64url").toString(),
          );
          for (const malformed of [
            "invalid",
            "bnVsbA",
            Buffer.from(
              JSON.stringify({ ...decoded, signature: "é".repeat(64) }),
            ).toString("base64url"),
          ]) {
            url.searchParams.set("grant", malformed);
            assert.equal((await fetch(url)).status, 403);
          }
          for (const patch of [
            { purpose: "source" },
            { expiresAt: decoded.expiresAt + 300_000 },
            { grantId: grants[0].grantId },
          ]) {
            url.searchParams.set(
              "grant",
              Buffer.from(JSON.stringify({ ...decoded, ...patch })).toString(
                "base64url",
              ),
            );
            assert.equal((await fetch(url)).status, 403);
          }
          url.searchParams.set("grant", encoded);
          url.searchParams.set("action", "source");
          assert.notEqual((await fetch(url)).status, 200);
          url.searchParams.set("action", "synthetic-playback");
          assert.notEqual((await fetch(url)).status, 200);
          // Unsigned query parameters cannot select another archive revision.
          url.searchParams.set("action", "original-download");
          url.searchParams.set("uploadId", second._id);
          assert.deepEqual(
            Buffer.from(await (await fetch(url)).arrayBuffer()),
            bytes,
          );
        },
      );
      await t.test(
        "AC03 archived revision survives playback deletion, intake expiry and missing current terms; audit survives restart",
        async () => {
          await backend.mux.mode("ready");
          const processing = await (
            await route("process", original._id)
          ).json();
          await backend.mux.update(processing.assetId, { status: "deleted" });
          const event = JSON.stringify({
            id: "t06-playback-deleted",
            type: "video.asset.deleted",
            data: {
              id: processing.assetId,
              passthrough: `${original._id}:${processing.attempt}`,
            },
          });
          const callback = await fetch(`${origin}/api/videos?action=webhook`, {
            method: "POST",
            headers: { "mux-signature": backend.mux.signature(event) },
            body: event,
          });
          assert.equal(callback.status, 200);
          assert.equal(
            (
              await route(
                "playback",
                original._id,
                "creator-a",
                undefined,
                "GET",
              )
            ).status,
            400,
          );
          await fixture({ uploadId: original._id });
          await backend.command(
            "run",
            "fixtures:removeTerms",
            JSON.stringify({ campaignSlug: "adoption" }),
          );
          const before = await history(original._id);
          await backend.restart();
          assert.deepEqual(await history(original._id), before);
          await exactDownload(ownerGrant, bytes);
          await exactDownload(
            await (
              await ticket(original._id, "creator-a", {
                entryId: entry._id,
                version: 1,
              })
            ).json(),
            bytes,
          );
          const audited = await history(original._id);
          assert.ok(audited.some((row: any) => row.actor === "administrator"));
          assert.ok(
            audited.some(
              (row: any) => row.entryId === entry._id && row.version === 1,
            ),
          );
          assert.ok(
            audited.every(
              (row: any) =>
                row.source === "originalDownloads:issue" &&
                row.archiveVersion === 1 &&
                row.sha256 === original.sha256 &&
                row.size === bytes.length &&
                row.expiresAt - row.at === 300_000 &&
                row.at > 0,
            ),
          );
          assert.doesNotMatch(
            JSON.stringify(audited),
            /pathname|blob|grantId|signature|private-video/,
          );
          console.log(
            `T06 durable run=${backend.directory}; original sha256=${original.sha256}; grants=${audited.length}; audit actor/source/time/archive-version/entry-version asserted`,
          );
        },
      );
      await t.test(
        "AC02 current creator/manager/operator revocation denies new grants and exact retries; issued URLs valid only until expiry",
        async () => {
          const roleArgs = {
            ...scope,
            uploadId: original._id,
            operationId: "role-stable",
          };
          await mutation(manager, "originalDownloads:issue", roleArgs);
          await mutation(
            backend.client("administrator"),
            "originalDownloads:issue",
            roleArgs,
          );
          await fixture({ managerRole: "creator" });
          assert.equal((await ticket(original._id, "manager-a")).status, 403);
          await assert.rejects(
            mutation(manager, "originalDownloads:issue", roleArgs),
            /FORBIDDEN/,
          );
          await fixture({ managerRole: "manager" });
          const current = await query(alice, "creatorAccess:workspace", scope);
          await mutation(manager, "creatorAccess:revoke", {
            ...scope,
            invitationId: current.invitation._id,
            operationId: "t06-revoke",
          });
          for (const actor of [alice, aliceSecondSession])
            await assert.rejects(
              mutation(actor, "originalDownloads:issue", {
                ...scope,
                uploadId: original._id,
                entryId: entry._id,
                version: 1,
                operationId: "two-sessions",
              }),
              /FORBIDDEN/,
            );
          assert.equal((await ticket(original._id)).status, 403);
          await exactDownload(ownerGrant, bytes);
          await backend.command(
            "run",
            "fixtures:revoke",
            JSON.stringify({
              subject: "manager-a",
              nonprofitId: "nonprofit-a",
            }),
          );
          assert.equal((await ticket(original._id, "manager-a")).status, 403);
          await fixture({ administratorActive: false });
          assert.equal(
            (await ticket(original._id, "administrator")).status,
            403,
          );
          await assert.rejects(
            mutation(
              backend.client("administrator"),
              "originalDownloads:issue",
              roleArgs,
            ),
            /FORBIDDEN/,
          );
          await exactDownload(ownerGrant, bytes);
          // Advance only the Node service clock; the isolated Convex process retains
          // its real clock. This exercises the exact URL-expiry boundary without a
          // five-minute test sleep or changing production lifetime configuration.
          const clock = Date.now;
          try {
            Date.now = () => ownerGrant.expiresAt;
            assert.equal((await fetch(origin + ownerGrant.url)).status, 403);
          } finally {
            Date.now = clock;
          }
          // Independently exercise Convex's stored-grant expiry guard with bounded
          // fixture time state. A forged newer URL cannot renew this durable grant.
          const grantId = JSON.parse(
            Buffer.from(
              new URL(ownerGrant.url, origin).searchParams.get("grant")!,
              "base64url",
            ).toString(),
          ).grantId;
          await fixture({ grantId });
          assert.equal((await fetch(origin + ownerGrant.url)).status, 403);
        },
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await backend.stop();
    }
  },
);

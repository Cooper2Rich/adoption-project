import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { makeFunctionReference } from "convex/server";
import { servePhotoRequest } from "../../api/photos.ts";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import {
  blobArchivePurger,
  blobCredentialOrigin,
  blobCredentialIdentity,
  blobVideoStore,
} from "../../server/launch/videos.ts";
import { videoBytes } from "./video-fixtures.ts";
import { campaignRules } from "./fixtures.ts";

const WINDOW = 30 * 24 * 60 * 60 * 1000;
test(
  "T07 administrator confirmation, recovery and durable serialized original purge",
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
    const admin = backend.client("administrator"),
      admin2 = backend.client("administrator"),
      manager = backend.client("manager-a"),
      creator = backend.client("creator-a");
    const scope = { campaignId: "adoption" };
    let sequence = 0;
    const mutate = (actor: any, name: string, args: any) =>
      actor.mutation(makeFunctionReference<"mutation">(name), args);
    const query = (actor: any, name: string, args: any) =>
      actor.query(makeFunctionReference<"query">(name), args);
    const fixture = (uploadId: string, extra: any) =>
      backend.runOwnedInternal("fixtures:originalRecovery", {
        uploadId,
        ...extra,
      });
    const status = (uploadId: string) =>
      query(admin, "originalArchives:status", { ...scope, uploadId });
    const change = (uploadId: string, extra: any = {}, actor: any = admin) =>
      mutate(actor, "originalArchives:change", {
        ...scope,
        uploadId,
        expectedGeneration: 0,
        operationId: `archive-${++sequence}`,
        action: "request",
        confirmation: "DELETE ORIGINAL",
        ...extra,
      });
    const job = (uploadId: string, generation: number) =>
      backend.runOwnedInternal("archiveJobs:purge", { uploadId, generation });
    const bytes = await videoBytes({ color: "yellow" });
    const path = (id: string) =>
      join(backend.directory, "private-video-fixture", `${id}.mp4`);
    async function upload() {
      const record = await mutate(creator, "videos:reserve", {
        ...scope,
        operationId: `upload-${++sequence}`,
        filename: "owned-original.mp4",
        size: bytes.length,
      });
      const request = (action: string, method: string, body?: Buffer) =>
        backend.videoService(
          new Request(
            `${origin}/api/videos?action=${action}&uploadId=${record._id}`,
            {
              method,
              headers: {
                Authorization: `Bearer ${backend.token("creator-a")}`,
              },
              ...(body ? { body } : {}),
            },
          ),
        );
      assert.equal((await request("local-upload", "PUT", bytes)).status, 200);
      assert.equal((await request("verify", "POST")).status, 200);
      return record._id as string;
    }
    const submit = (id: string) =>
      mutate(creator, "photos:submit", {
        ...scope,
        operationId: `submit-${++sequence}`,
        title: "Recovery creative",
        description: "Owned fixture original",
        photos: [],
        video: id,
      });
    try {
      await backend.command(
        "env",
        "set",
        "VIDEO_ARCHIVE_WORKER_URL",
        `${origin}/api/videos`,
      );
      await mutate(manager, "campaignSetup:create", {
        ...scope,
        operationId: "rules",
        rules: campaignRules,
      });
      const invitation = await mutate(manager, "creatorAccess:invite", {
        ...scope,
        email: "creator-a@creators.example",
        operationId: "invite",
      });
      await manager.action("clerkInvitations:dispatch", {
        ...scope,
        invitationId: invitation._id,
        kind: "create",
      });
      await backend.command(
        "run",
        "fixtures:terms",
        JSON.stringify({ campaignSlug: "adoption", synthetic: true }),
      );
      const workspace = await query(creator, "creatorAccess:workspace", scope);
      await mutate(creator, "creatorAccess:accept", {
        ...scope,
        invitationId: invitation._id,
        termsId: workspace.terms._id,
        version: workspace.terms.version,
        operationId: "accept",
        confirmed: true,
      });
      const first = await upload();
      await t.test(
        "AC01 current independent operator only; explicit confirmation and scoped denials",
        async () => {
          for (const actor of [
            manager,
            creator,
            backend.client("creator-b"),
            backend.client("manager-b"),
            backend.client(),
          ]) {
            await assert.rejects(change(first, {}, actor), /FORBIDDEN/);
          }
          await assert.rejects(
            change(first, { campaignId: "other" }),
            /FORBIDDEN/,
          );
          await assert.rejects(
            change(first, { confirmation: "yes" }),
            /VIDEO_CONFIRMATION_REQUIRED/,
          );
          await assert.rejects(
            query(backend.client("manager-b"), "originalArchives:status", {
              ...scope,
              uploadId: first,
            }),
            /FORBIDDEN/,
          );
          const data = await status(first);
          assert.equal(data.state, "retained");
          assert.equal(data.isAdministrator, true);
          assert.doesNotMatch(
            JSON.stringify(data),
            /pathname|signature|private-video|videos\//,
          );
        },
      );
      let initial: any;
      await t.test(
        "AC02 concurrent duplicate confirmation fixes exactly thirty elapsed days; audit and role retry",
        async () => {
          const args = {
            ...scope,
            uploadId: first,
            expectedGeneration: 0,
            operationId: "stable-confirm",
            action: "request",
            confirmation: "DELETE ORIGINAL",
          };
          await Promise.all([
            mutate(admin, "originalArchives:change", args),
            mutate(admin2, "originalArchives:change", args),
          ]);
          initial = await status(first);
          assert.equal(initial.purgeAt - initial.requestedAt, WINDOW);
          assert.equal(initial.history.length, 1);
          assert.equal(initial.history[0].actor, "administrator");
          assert.equal(initial.history[0].confirmation, "DELETE ORIGINAL");
          await assert.rejects(
            change(first, { expectedGeneration: 1 }),
            /VIDEO_ALREADY_REQUESTED/,
          );
          assert.equal((await status(first)).purgeAt, initial.purgeAt);
          await backend.runOwnedInternal("fixtures:archiveBoundary", {
            administratorActive: false,
          });
          await assert.rejects(
            mutate(admin, "originalArchives:change", args),
            /FORBIDDEN/,
          );
          await backend.runOwnedInternal("fixtures:archiveBoundary", {
            administratorActive: true,
          });
          assert.deepEqual(await readFile(path(first)), bytes);
          await backend.restart();
          assert.deepEqual(await status(first), initial);
        },
      );
      await t.test(
        "AC02 deadline minus one retains bytes; exact boundary denies restore and permits purge",
        async () => {
          await fixture(first, { relativeToDeadline: -1 });
          await job(first, 1);
          assert.equal((await status(first)).state, "pending");
          assert.equal(backend.videoStore.archiveCalls(), 0);
          const grant = await mutate(creator, "originalDownloads:issue", {
            ...scope,
            uploadId: first,
            operationId: "pending-download",
          });
          assert.ok(grant.grantId);
          await fixture(first, { relativeToDeadline: 0 });
          await assert.rejects(
            change(first, { action: "restore", expectedGeneration: 1 }),
            /VIDEO_RECOVERY_CLOSED/,
          );
          await job(first, 1);
          assert.equal((await status(first)).state, "deleted");
          await assert.rejects(access(path(first)));
          assert.equal(backend.videoStore.archiveCalls(), 1);
          await job(first, 1);
          assert.equal(backend.videoStore.archiveCalls(), 1);
          const audit = await status(first);
          assert.ok(audit.confirmedAt);
          assert.equal(audit.history.at(-1).action, "deleted");
          await assert.rejects(
            mutate(creator, "originalDownloads:issue", {
              ...scope,
              uploadId: first,
              operationId: "pending-download",
            }),
            /VIDEO_ARCHIVE_UNAVAILABLE/,
          );
          await assert.rejects(submit(first), /VIDEO_ARCHIVE_FENCED/);

          await fixture(first, { commitment: true, reservationFunding: 1000 });
          const unrelated = await mutate(manager, "reservations:reserve", {
            ...scope,
            entryId: "t07-unknown-use",
            operationId: "unrelated-after-purge",
            authorityRevision: "authority-1",
            financeRevision: "finance-1",
          });
          assert.equal(unrelated.entryId, "t07-unknown-use");
          await fixture(first, {
            clearTestReservation: true,
            commitment: false,
          });
          await fixture(first, { clearClock: true });
        },
      );
      await t.test(
        "AC02 restore before deadline defeats stale jobs across restart and permits current use",
        async () => {
          const id = await upload();
          await change(id);
          await fixture(id, { relativeToDeadline: -1 });
          await change(id, {
            action: "restore",
            expectedGeneration: 1,
            operationId: "stable-restore",
          });
          await fixture(id, { relativeToDeadline: 1 });
          await backend.restart();
          await job(id, 1);
          assert.equal((await status(id)).state, "restored");
          assert.deepEqual(await readFile(path(id)), bytes);
          await fixture(id, { clearClock: true });
          await submit(id);
          await change(id, { expectedGeneration: 1 });
          assert.equal((await status(id)).generation, 2);
          await assert.rejects(
            change(id, {
              action: "restore",
              expectedGeneration: 1,
              operationId: "stable-restore",
            }),
            /STALE_VERSION/,
          );
          await job(id, 1);
          assert.equal((await status(id)).state, "pending");
          await change(id, { action: "restore", expectedGeneration: 2 });
        },
      );
      await t.test(
        "AC01/03 active/publishing/unknown use, commitments, approval/processing/submission fences",
        async () => {
          const id = await upload();
          const entry = await submit(id);
          for (const state of [
            "processing",
            "unknown",
            "dispatched",
            "future-state",
          ]) {
            await fixture(id, { state });
            await assert.rejects(change(id), /VIDEO_IN_USE/);
          }
          await fixture(id, { state: "ready", entryStatus: "approved" });
          await assert.rejects(change(id), /VIDEO_IN_USE/);
          await fixture(id, {
            state: "verified",
            entryStatus: "pending",
            commitment: true,
          });
          await assert.rejects(change(id), /VIDEO_IN_USE/);
          await fixture(id, { commitment: false });
          await change(id);
          await assert.rejects(submit(id), /VIDEO_ARCHIVE_FENCED/);
          await assert.rejects(
            mutate(manager, "reservations:reserve", {
              ...scope,
              entryId: "unattributed-new-use",
              operationId: "unmapped-reservation",
              authorityRevision: "authority-1",
              financeRevision: "finance-1",
            }),
            /VIDEO_ARCHIVE_FENCED/,
          );
          await assert.rejects(
            mutate(manager, "photos:review", {
              ...scope,
              entryId: entry._id,
              expectedVersion: 1,
              operationId: "approve-fenced",
              decision: "approved",
              reason: "",
            }),
            /VIDEO_ARCHIVE_FENCED/,
          );
          const process = await backend.videoService(
            new Request(`${origin}/api/videos?action=process&uploadId=${id}`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${backend.token("creator-a")}`,
              },
            }),
          );
          assert.match(await process.text(), /VIDEO_ARCHIVE_FENCED/);
          await fixture(id, { relativeToDeadline: 0, entryStatus: "approved" });
          await job(id, 1);
          assert.equal((await status(id)).state, "blocked");
          assert.deepEqual(await readFile(path(id)), bytes);
          await fixture(id, { entryStatus: "pending", clearClock: true });
          await change(id, { action: "restore", expectedGeneration: 1 });
        },
      );
      await t.test(
        "AC01/03 an approved entry protects historical originals; activation and deletion serialize; deleted history permits a different current original",
        async () => {
          const historical = await upload();
          const entry = await submit(historical);
          const current = await upload();
          const correction = await mutate(creator, "photos:submit", {
            ...scope,
            operationId: "historical-correction",
            entryId: entry._id,
            expectedVersion: 1,
            title: "Corrected creative",
            description: "Same entry before first approval",
            photos: [],
            video: current,
          });
          assert.equal(correction._id, entry._id);
          assert.equal(correction.version, 2);
          await backend.mux.mode("ready");
          const processing = await backend.videoService(
            new Request(
              `${origin}/api/videos?action=process&uploadId=${current}`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${backend.token("creator-a")}`,
                },
              },
            ),
          );
          assert.equal(processing.status, 200);
          await assert.rejects(change(historical), /VIDEO_IN_USE/);
          await fixture(current, { endSourceLease: true });
          const review = (operationId: string) =>
            mutate(manager, "photos:review", {
              ...scope,
              entryId: entry._id,
              expectedVersion: 2,
              operationId,
              decision: "approved",
              reason: "",
            });
          await review("historical-first-approval");
          await assert.rejects(change(historical), /VIDEO_IN_USE/);
          await fixture(historical, { entryStatus: "pending" });
          const race = await Promise.allSettled([
            change(historical),
            review("historical-racing-approval"),
          ]);
          assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
          const rejected = race.find((r) => r.status === "rejected");
          if (rejected?.status === "rejected")
            assert.match(
              String(rejected.reason),
              /VIDEO_IN_USE|VIDEO_ARCHIVE_FENCED/,
            );
          if ((await status(historical)).state === "retained") {
            await fixture(historical, { entryStatus: "pending" });
            await change(historical);
          }
          await assert.rejects(
            review("historical-fenced-approval"),
            /VIDEO_ARCHIVE_FENCED/,
          );
          await fixture(historical, { relativeToDeadline: 0 });
          await job(historical, 1);
          assert.equal((await status(historical)).state, "deleted");
          await review("historical-approved-after-purge");
          assert.equal((await status(current)).state, "retained");
          await fixture(historical, { clearClock: true });
        },
      );
      await t.test(
        "AC03 administrator revocation before due dispatch holds recorded approval",
        async () => {
          const id = await upload();
          await change(id);
          await fixture(id, { relativeToDeadline: 0 });
          await backend.runOwnedInternal("fixtures:archiveBoundary", {
            administratorActive: false,
          });
          await job(id, 1);
          await backend.runOwnedInternal("fixtures:archiveBoundary", {
            administratorActive: true,
          });
          assert.equal((await status(id)).state, "blocked");
          assert.deepEqual(await readFile(path(id)), bytes);
          const before = await status(id);
          await fixture(id, { authorizeOperator: "replacement-administrator" });
          await backend.runOwnedInternal("fixtures:archiveBoundary", {
            administratorActive: false,
          });
          await change(
            id,
            { action: "reconfirm", expectedGeneration: 1 },
            backend.client("replacement-administrator"),
          );
          await backend.runOwnedInternal("fixtures:archiveBoundary", {
            administratorActive: true,
          });
          const handoff = await status(id);
          assert.equal(handoff.purgeAt, before.purgeAt);
          assert.equal(handoff.requestedAt, before.requestedAt);
          assert.equal(handoff.generation, 1);
          assert.ok(
            handoff.history.some(
              (e: any) =>
                e.action === "reconfirmed" &&
                e.actor === "replacement-administrator",
            ),
          );
          await job(id, 1);
          assert.equal((await status(id)).state, "deleted");
          await fixture(id, { clearClock: true });
        },
      );
      await t.test(
        "AC03 read-only preflight failures remain retryable; authority is rechecked after paused preflight",
        async () => {
          const id = await upload();
          await change(id);
          const before = await status(id);
          await fixture(id, { relativeToDeadline: 0 });
          const calls = backend.videoStore.archiveCalls();
          backend.videoStore.archiveMode("preflight-failed");
          await job(id, 1);
          const held = await status(id);
          assert.equal(held.state, "blocked");
          assert.equal(
            held.history.some((e: any) => e.action === "dispatched"),
            false,
          );
          assert.equal(backend.videoStore.archiveCalls(), calls);
          assert.equal(held.purgeAt, before.purgeAt);
          const preflights = backend.videoStore.archivePreflightCalls();
          backend.videoStore.archiveMode("preflight-pause");
          const running = job(id, 1);
          for (
            let tries = 0;
            tries < 100 &&
            backend.videoStore.archivePreflightCalls() === preflights;
            tries++
          )
            await new Promise((r) => setTimeout(r, 20));
          assert.equal(
            backend.videoStore.archivePreflightCalls(),
            preflights + 1,
          );
          await backend.runOwnedInternal("fixtures:archiveBoundary", {
            administratorActive: false,
          });
          backend.videoStore.archivePreflightRelease();
          await running;
          await backend.runOwnedInternal("fixtures:archiveBoundary", {
            administratorActive: true,
          });
          assert.equal((await status(id)).state, "blocked");
          assert.equal(backend.videoStore.archiveCalls(), calls);
          backend.videoStore.archiveMode("normal");
          await job(id, 1);
          assert.equal((await status(id)).state, "deleted");
          assert.equal((await status(id)).purgeAt, before.purgeAt);
          await fixture(id, { clearClock: true });
        },
      );
      await t.test(
        "AC03 delete intent persists before dispatch; duplicate jobs, restore and use cannot overtake an in-flight delete",
        async () => {
          const id = await upload();
          await change(id);
          await fixture(id, { relativeToDeadline: 0 });
          backend.videoStore.archiveMode("pause");
          const ticket = await backend.videoService(
            new Request(
              `${origin}/api/videos?action=original-ticket&uploadId=${id}`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${backend.token("creator-a")}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ operationId: "issued-before-dispatch" }),
              },
            ),
          );
          assert.equal(ticket.status, 200);
          const grant = await ticket.json();
          const pendingDownload = await backend.videoService(
            new Request(origin + grant.url),
          );
          assert.equal(pendingDownload.status, 200);
          assert.deepEqual(
            Buffer.from(await pendingDownload.arrayBuffer()),
            bytes,
          );
          const running = job(id, 1);
          for (
            let tries = 0;
            tries < 100 && (await status(id)).state !== "dispatched";
            tries++
          )
            await new Promise((r) => setTimeout(r, 20));
          assert.equal((await status(id)).state, "dispatched");
          const blockedStart = await backend.videoService(
            new Request(origin + grant.url),
          );
          assert.equal(blockedStart.status, 400);
          assert.match(await blockedStart.text(), /VIDEO_ARCHIVE_UNAVAILABLE/);
          await assert.rejects(
            change(id, { action: "restore", expectedGeneration: 1 }),
            /VIDEO_RECOVERY_CLOSED/,
          );
          await assert.rejects(submit(id), /VIDEO_ARCHIVE_FENCED/);
          await job(id, 1);
          assert.equal((await status(id)).state, "unknown");
          const blockedUnknown = await backend.videoService(
            new Request(origin + grant.url),
          );
          assert.equal(blockedUnknown.status, 400);
          assert.match(
            await blockedUnknown.text(),
            /VIDEO_ARCHIVE_UNAVAILABLE/,
          );
          backend.videoStore.archiveRelease();
          await running;
          assert.equal((await status(id)).state, "deleted");
          backend.videoStore.archiveMode("normal");
          await fixture(id, { clearClock: true });
        },
      );
      await t.test(
        "AC03 lost response after delete reconciles absence without duplicate dispatch after restart",
        async () => {
          const id = await upload();
          await change(id);
          await fixture(id, { relativeToDeadline: 0 });
          backend.videoStore.archiveMode("unknown-after");
          await job(id, 1);
          assert.equal((await status(id)).state, "unknown");
          await assert.rejects(access(path(id)));
          const calls = backend.videoStore.archiveCalls();
          await backend.restart();
          await job(id, 1);
          assert.equal((await status(id)).state, "deleted");
          assert.equal(backend.videoStore.archiveCalls(), calls);
          backend.videoStore.archiveMode("normal");
          await fixture(id, { clearClock: true });
        },
      );
      await t.test(
        "AC03 unknown request with bytes present stays fenced and never blindly retries; failed outcome visible",
        async () => {
          for (const mode of ["unknown-before", "failed"]) {
            const id = await upload();
            await change(id);
            await fixture(id, { relativeToDeadline: 0 });
            backend.videoStore.archiveMode(mode);
            await job(id, 1);
            assert.equal(
              (await status(id)).state,
              mode === "failed" ? "failed" : "unknown",
            );
            const calls = backend.videoStore.archiveCalls();
            await job(id, 1);
            assert.equal((await status(id)).state, "unknown");
            assert.equal(backend.videoStore.archiveCalls(), calls);
            assert.deepEqual(await readFile(path(id)), bytes);
            await assert.rejects(
              change(id, { action: "restore", expectedGeneration: 1 }),
              /VIDEO_RECOVERY_CLOSED/,
            );
            await fixture(id, { clearClock: true });
          }
          backend.videoStore.archiveMode("normal");
        },
      );
      await t.test(
        "AC03 disabled provider holds without a delete claim and untrusted worker cannot mutate",
        async () => {
          const id = await upload();
          await change(id);
          await fixture(id, { relativeToDeadline: 0 });
          const available = backend.videoStore.archiveAvailable;
          backend.videoStore.archiveAvailable = () => false;
          await job(id, 1);
          assert.equal((await status(id)).state, "blocked");
          assert.equal(
            (await status(id)).history.some(
              (e: any) => e.action === "dispatched",
            ),
            false,
          );
          backend.videoStore.archiveAvailable = available;
          await assert.rejects(
            mutate(admin, "originalArchives:worker", {
              receipt: {
                purpose: "archive-worker",
                uploadId: id,
                generation: 1,
                at: Date.now(),
                action: "finish",
                outcome: "absent",
                nonce: "forged",
              },
              signature: "forged",
            }),
            /FORBIDDEN/,
          );
          const response = await backend.videoService(
            new Request(`${origin}/api/videos?action=archive-purge`, {
              method: "POST",
              body: JSON.stringify({
                receipt: {
                  purpose: "archive-job",
                  uploadId: id,
                  generation: 1,
                  at: Date.now(),
                },
                signature: "é".repeat(64),
              }),
            }),
          );
          assert.equal(response.status, 403);
          await fixture(id, { clearClock: true });
          await change(id, { action: "restore", expectedGeneration: 1 });
        },
      );
      await t.test(
        "AC04 playback deletion and public read alone never request archive deletion; unexpired ingestion source lease blocks confirmation",
        async () => {
          const id = await upload();
          await backend.mux.mode("ready");
          const process = await backend.videoService(
            new Request(`${origin}/api/videos?action=process&uploadId=${id}`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${backend.token("creator-a")}`,
              },
            }),
          );
          assert.equal(process.status, 200);
          const record = await process.json();
          await backend.mux.update(record.assetId, { status: "deleted" });
          const body = JSON.stringify({
            id: "t07-playback-deleted",
            type: "video.asset.deleted",
            data: {
              id: record.assetId,
              passthrough: `${id}:${record.attempt}`,
            },
          });
          const callback = await backend.videoService(
            new Request(`${origin}/api/videos?action=webhook`, {
              method: "POST",
              headers: { "mux-signature": backend.mux.signature(body) },
              body,
            }),
          );
          assert.equal(callback.status, 200);
          await query(backend.client(), "publicViewer:campaign", {});
          assert.equal((await status(id)).state, "retained");
          await job(id, 0);
          assert.deepEqual(await readFile(path(id)), bytes);
          await assert.rejects(change(id), /VIDEO_IN_USE/);
          await fixture(id, { endSourceLease: true });
          await change(id);
          await change(id, { action: "restore", expectedGeneration: 1 });
        },
      );
      console.log(
        `T07 owned local persistent run=${backend.directory}; physical deletes only newly written files; calls=${backend.videoStore.archiveCalls()}`,
      );
    } finally {
      backend.videoStore.archiveRelease();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await backend.stop();
    }
  },
);

test("T07 controlled Blob SDK-shaped adapter: evidence gate, exact bytes/ETag, origin absence and ambiguous outcomes", async () => {
  const { createHash } = await import("node:crypto");
  const bytes = Buffer.from("owned controlled original");
  const record = {
    pathname: "videos/controlled.mp4",
    storageIdentity: blobCredentialIdentity(
      "vercel_blob_rw_controlled_synthetic",
    ),
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const origin = "https://controlled.private.blob.vercel-storage.com";
  let exists = true,
    removeCalls = 0;
  const reads: any[] = [];
  const read = async (_path: string, options: any) => {
    assert.equal(_path, origin + "/" + record.pathname);
    reads.push(options);
    return exists
      ? {
          statusCode: 200,
          blob: {
            etag: '"exact-etag"',
            pathname: record.pathname,
            url: origin + "/" + record.pathname,
          },
          stream: new Blob([bytes]).stream(),
        }
      : null;
  };
  const remove = async (path: string, options: any) => {
    assert.equal(path, origin + "/" + record.pathname);
    assert.equal(options.ifMatch, '"exact-etag"');
    removeCalls++;
    exists = false;
  };
  const adapter = blobArchivePurger({
    token: "vercel_blob_rw_controlled_synthetic",
    evidenceId: "controlled",
    deleteEvidenceId: "controlled",
    retrySetting: "0",
    read,
    remove,
  });
  assert.equal(
    blobArchivePurger({
      token: "controlled",
      evidenceId: "controlled",
      deleteEvidenceId: "",
    }).archiveAvailable(),
    false,
  );
  assert.equal(adapter.archiveAvailable(), true);
  const prepared = await adapter.preflightOriginal(record);
  assert.deepEqual(prepared, { etag: '"exact-etag"' });
  assert.equal(
    await adapter.purgeOriginal({ ...record, prepared }, false),
    "absent",
  );
  const readCount = reads.length;
  assert.equal(
    await adapter.purgeOriginal(
      { ...record, storageIdentity: undefined },
      true,
    ),
    "unknown",
  );
  assert.equal(reads.length, readCount);
  assert.equal(removeCalls, 1);
  assert.ok(reads.every((r) => r.useCache === false && r.access === "private"));
  assert.equal(await adapter.purgeOriginal(record, true), "absent");
  assert.equal(removeCalls, 1);
  exists = true;
  assert.deepEqual(await adapter.preflightOriginal(record), {
    etag: '"exact-etag"',
  });
  assert.equal(
    await adapter.preflightOriginal({ ...record, storageIdentity: undefined }),
    false,
  );
  assert.equal(await adapter.purgeOriginal(record, true), "unknown");
  assert.equal(removeCalls, 1);
  assert.equal(
    await adapter.preflightOriginal({ ...record, sha256: "0".repeat(64) }),
    false,
  );
  assert.equal(removeCalls, 1);
  assert.equal(
    blobCredentialIdentity("vercel_blob_rw_controlled_rotated"),
    record.storageIdentity,
  );
  const readsBeforeMismatch = reads.length;
  const wrongStore = blobArchivePurger({
    token: "vercel_blob_rw_other_synthetic",
    read,
    remove,
  });
  assert.equal(await wrongStore.preflightOriginal(record), false);
  assert.equal(reads.length, readsBeforeMismatch);
  await assert.rejects(
    blobVideoStore({ token: "vercel_blob_rw_other_synthetic" }).read(
      record.pathname,
      record.storageIdentity,
    ),
    /storage identity/,
  );
  const ambiguous = blobArchivePurger({
    token: "vercel_blob_rw_controlled_synthetic",
    read,
    remove: async () => {
      throw new Error("response lost");
    },
  });
  await assert.rejects(ambiguous.purgeOriginal({ ...record, prepared }, false));
  const denied = blobArchivePurger({
    token: "vercel_blob_rw_controlled_synthetic",
    read: async () => {
      throw new Error("forbidden");
    },
  });
  await assert.rejects(denied.purgeOriginal(record, true));
});

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { servePhotoRequest } from "../../api/photos.mjs";
import { createLocalBackend } from "../../scripts/launch/local-backend.mjs";
import { campaignRules as rules } from "./fixtures.ts";
import { pngBytes, jpegBytes } from "./photo-fixtures.ts";
import { blobPhotoStore } from "../../server/launch/photos.mjs";
import { getPayloadFromClientToken } from "@vercel/blob/client";

test("T03 Vercel parsed JSON/body helpers and native stream reach the same API service", async () => {
  const service = async (request) => Response.json(await request.json());
  const server = createServer(async (req, res) => {
    if (req.url !== "/native") {
      let bytes = "";
      for await (const chunk of req) bytes += chunk;
      req.body =
        req.url === "/parsed-object"
          ? JSON.parse(bytes)
          : req.url === "/parsed-buffer"
            ? Buffer.from(bytes)
            : bytes;
    }
    await servePhotoRequest(service, req, res);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    for (const path of [
      "native",
      "parsed-object",
      "parsed-buffer",
      "parsed-string",
    ]) {
      const result = await fetch(
        `http://127.0.0.1:${server.address().port}/${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "blob.generate-client-token",
            payload: { pathname: "photos/owned.png" },
          }),
        },
      );
      assert.equal(result.status, 200);
      assert.deepEqual(await result.json(), {
        type: "blob.generate-client-token",
        payload: { pathname: "photos/owned.png" },
      });
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("T03 official Blob SDK capability is exact-path, expiring, type/size bounded and immutable (synthetic key; no provider call)", async () => {
  const store = blobPhotoStore({
    token: "vercel_blob_rw_synthetic_not-a-provider-credential",
  });
  const expiresAt = Date.now() + 60_000;
  const record = {
    pathname: "photos/ownedphoto.png",
    type: "image/png",
    expiresAt,
  };
  const request = new Request(
    "https://photo-test.invalid/api/photos?action=token",
    { method: "POST" },
  );
  const body = {
    type: "blob.generate-client-token",
    payload: {
      pathname: record.pathname,
      clientPayload: JSON.stringify({ uploadId: "owned-id" }),
      multipart: true,
    },
  };
  const result = await store.token(request, body, async (id) => {
    assert.equal(id, "owned-id");
    return record;
  });
  const payload = getPayloadFromClientToken(result.clientToken);
  assert.equal(payload.pathname, record.pathname);
  assert.equal(payload.validUntil, expiresAt);
  assert.equal(payload.maximumSizeInBytes, 100_000_000);
  assert.deepEqual(payload.allowedContentTypes, ["image/png"]);
  assert.equal(payload.addRandomSuffix, false);
  assert.equal(payload.allowOverwrite, false);
  await assert.rejects(
    store.token(
      request,
      { ...body, payload: { ...body.payload, pathname: "photos/foreign.png" } },
      async () => record,
    ),
    /UPLOAD_PATH/,
  );
  await assert.rejects(
    store.token(request, body, async () => ({
      ...record,
      sha256: "alreadyverified",
    })),
    /UPLOAD_PATH/,
  );
  await assert.rejects(
    store.token(request, { type: "blob.upload-completed" }, async () => record),
    /UPLOAD_TOKEN/,
  );
});

test(
  "T03 real Convex photo submission and persistent private byte routes",
  { timeout: 480000 },
  async (t) => {
    const backend = await createLocalBackend();
    const server = createServer(
      (req, res) => void servePhotoRequest(backend.photoService, req, res),
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    const scope = { campaignId: "adoption" };
    const alice = backend.client("creator-a"),
      manager = backend.client("manager-a"),
      bob = backend.client("creator-b"),
      guest = backend.client();
    const command = async (name, args) =>
      JSON.parse(
        (await backend.command(
          "run",
          `fixtures:${name}`,
          JSON.stringify(args),
        )) || "null",
      );
    const route = (action, id, subject = "creator-a", options = {}) =>
      fetch(`${origin}/api/photos?action=${action}&uploadId=${id}`, {
        ...options,
        headers: {
          ...(subject
            ? { authorization: `Bearer ${backend.token(subject)}` }
            : {}),
        },
      });
    let operation = 0;
    const reserve = (bytes, type = "image/png", actor = alice) =>
      actor.mutation("photos:reserve", {
        ...scope,
        filename: type === "image/png" ? "photo.png" : "photo.jpg",
        size: bytes.length,
        type,
        operationId: `upload-${++operation}`,
      });
    async function upload(bytes, type = "image/png") {
      const record = await reserve(bytes, type);
      const written = await route("local-upload", record._id, "creator-a", {
        method: "PUT",
        body: bytes,
      });
      assert.equal(written.status, 200, await written.text());
      const checked = await route("verify", record._id, "creator-a", {
        method: "POST",
      });
      assert.equal(checked.status, 200, await checked.clone().text());
      return checked.json();
    }
    const request = (photos, extra = {}) => ({
      ...scope,
      operationId: `submission-${++operation}`,
      title: "A family together",
      description: "Original photo for adoption.is",
      photos: photos.map((p) => p._id),
      ...extra,
    });
    let png, jpeg, entry, originalRequest, revision, replacement;
    try {
      await manager.mutation("campaignSetup:create", {
        ...scope,
        operationId: "rules",
        rules,
      });
      for (const subject of ["creator-a", "creator-b"]) {
        const invite = await manager.mutation("creatorAccess:invite", {
          ...scope,
          email: `${subject}@creators.example`,
          operationId: subject,
        });
        await manager.action("clerkInvitations:dispatch", {
          ...scope,
          invitationId: invite._id,
          kind: "create",
        });
      }
      await t.test(
        "AC01 missing actual terms and unaccepted creator cannot reserve or submit",
        async () => {
          await assert.rejects(
            reserve(Buffer.from("fake")),
            /ACCEPTANCE_REQUIRED/,
          );
          await assert.rejects(
            alice.mutation("photos:submit", request([])),
            /ACCEPTANCE_REQUIRED/,
          );
        },
      );
      const terms = await command("terms", {
        campaignSlug: "adoption",
        synthetic: true,
      });
      for (const client of [alice, bob]) {
        const workspace = await client.query("creatorAccess:workspace", scope);
        await client.mutation("creatorAccess:accept", {
          ...scope,
          invitationId: workspace.invitation._id,
          termsId: terms,
          version: workspace.terms.version,
          confirmed: true,
          operationId: "accept",
        });
      }
      await t.test(
        "AC01 authoritative stored JPEG/PNG bytes, reserved owner/path and signed receipts",
        async () => {
          png = await upload(await pngBytes());
          jpeg = await upload(await jpegBytes(), "image/jpeg");
          const retriedVerification = await route(
            "verify",
            png._id,
            "creator-a",
            { method: "POST" },
          );
          assert.equal(retriedVerification.status, 200);
          assert.deepEqual(await retriedVerification.json(), png);
          const reservation = {
            ...scope,
            filename: "retry.png",
            size: (await pngBytes()).length,
            type: "image/png",
            operationId: "concurrent-upload-reservation",
          };
          const reserved = await Promise.all([
            alice.mutation("photos:reserve", reservation),
            alice.mutation("photos:reserve", reservation),
          ]);
          assert.equal(reserved[0]._id, reserved[1]._id);
          await assert.rejects(
            alice.mutation("photos:reserve", {
              ...reservation,
              filename: "changed.png",
            }),
            /OPERATION_CONFLICT/,
          );
          assert.equal(png.size, (await pngBytes()).length);
          assert.equal(
            png.sha256,
            createHash("sha256")
              .update(await pngBytes())
              .digest("hex"),
          );
          const response = await route("resource", png._id);
          assert.equal(response.status, 200);
          assert.equal(
            response.headers.get("cache-control"),
            "private, no-store",
          );
          assert.deepEqual(
            Buffer.from(await response.arrayBuffer()),
            await pngBytes(),
          );
          assert.equal(
            (
              await route("local-upload", png._id, "creator-a", {
                method: "PUT",
                body: await pngBytes(),
              })
            ).status,
            400,
          );
          await assert.rejects(
            alice.mutation("photos:verify", {
              ...scope,
              receipt: {
                uploadId: png._id,
                pathname: png.pathname,
                size: png.size,
                type: png.type,
                sha256: png.sha256,
                subject: png.subject,
                verifiedAt: Date.now(),
              },
              signature: "0".repeat(64),
            }),
            /FORBIDDEN/,
          );
          const unverified = await reserve(await pngBytes());
          await assert.rejects(
            alice.mutation("photos:submit", request([unverified])),
            /FORBIDDEN/,
          );
          assert.equal(
            (
              await route("verify", unverified._id, "creator-a", {
                method: "POST",
              })
            ).status,
            400,
          );
          for (const bytes of [
            Buffer.from("not an image"),
            (await pngBytes()).subarray(0, 40),
          ]) {
            const record = await reserve(bytes);
            await route("local-upload", record._id, "creator-a", {
              method: "PUT",
              body: bytes,
            });
            const failed = await route("verify", record._id, "creator-a", {
              method: "POST",
            });
            assert.equal(failed.status, 400);
            assert.match((await failed.json()).error, /PHOTO_FORMAT/);
          }
          const mismatch = await reserve(await pngBytes(), "image/jpeg");
          await route("local-upload", mismatch._id, "creator-a", {
            method: "PUT",
            body: await pngBytes(),
          });
          assert.match(
            (
              await (
                await route("verify", mismatch._id, "creator-a", {
                  method: "POST",
                })
              ).json()
            ).error,
            /PHOTO_FORMAT/,
          );
          const wrongSize = await reserve(Buffer.alloc(500));
          await route("local-upload", wrongSize._id, "creator-a", {
            method: "PUT",
            body: await pngBytes(),
          });
          assert.match(
            (
              await (
                await route("verify", wrongSize._id, "creator-a", {
                  method: "POST",
                })
              ).json()
            ).error,
            /PHOTO_SIZE/,
          );
          await assert.rejects(
            alice.mutation("photos:reserve", {
              ...scope,
              filename: "photo.gif",
              size: 12,
              type: "image/gif",
              operationId: "gif",
            }),
            /Validator|validator|image\/png/,
          );
        },
      );
      await t.test(
        "AC01 inclusive actual 100,000,000-byte files and ten-photo 1,000,000,000-byte entry",
        async () => {
          const exact = await pngBytes(100_000_000);
          const photos = [];
          for (let i = 0; i < 10; i++) photos.push(await upload(exact));
          assert.equal(
            photos.reduce((n, p) => n + p.size, 0),
            1_000_000_000,
          );
          const maxEntry = await alice.mutation(
            "photos:submit",
            request(photos, { title: "Exact inclusive limits" }),
          );
          assert.equal(
            (
              await alice.query("photos:entry", {
                ...scope,
                entryId: maxEntry._id,
              })
            ).versions[0].photos.length,
            10,
          );
          const response = await route("resource", photos[9]._id);
          assert.equal(response.status, 200);
          const returned = createHash("sha256");
          let actual = 0;
          for await (const chunk of response.body) {
            returned.update(chunk);
            actual += chunk.length;
          }
          assert.equal(actual, 100_000_000);
          assert.equal(returned.digest("hex"), photos[9].sha256);
          await assert.rejects(
            alice.mutation("photos:submit", request([...photos, png])),
            /PHOTO_COUNT/,
          );
          await assert.rejects(
            alice.mutation("photos:submit", request([])),
            /PHOTO_COUNT/,
          );
          await assert.rejects(
            alice.mutation("photos:submit", request([png, png])),
            /PHOTO_DUPLICATE/,
          );
          await assert.rejects(
            reserve(Buffer.alloc(100_000_001)),
            /PHOTO_SIZE/,
          );
          const malicious = await reserve(exact);
          const oversized = await route(
            "local-upload",
            malicious._id,
            "creator-a",
            { method: "PUT", body: Buffer.concat([exact, Buffer.from([0])]) },
          );
          assert.equal(oversized.status, 400);
          assert.match((await oversized.json()).error, /PHOTO_SIZE/);
          assert.equal(
            (
              await route("verify", malicious._id, "creator-a", {
                method: "POST",
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        "AC01 concurrent exact submission retry deduplicates and changed retry conflicts",
        async () => {
          originalRequest = request([png]);
          const results = await Promise.all([
            alice.mutation("photos:submit", originalRequest),
            alice.mutation("photos:submit", originalRequest),
          ]);
          entry = results[0];
          assert.equal(entry._id, results[1]._id);
          const saved = await alice.query("photos:entry", {
            ...scope,
            entryId: entry._id,
          });
          assert.equal(saved.versions.length, 1);
          assert.equal(saved.events.length, 1);
          assert.equal(saved.versions[0].acceptanceId, entry.acceptanceId);
          await assert.rejects(
            alice.mutation("photos:submit", {
              ...originalRequest,
              title: "Changed retry",
            }),
            /OPERATION_CONFLICT/,
          );
        },
      );
      await t.test(
        "AC02/04 direct guest, foreign creator, cross-nonprofit and manager-edit denial",
        async () => {
          for (const subject of [
            "",
            "creator-b",
            "manager-b",
            "wrong-person",
          ]) {
            const client = backend.client(subject || undefined);
            await assert.rejects(
              client.query("photos:entry", { ...scope, entryId: entry._id }),
              /FORBIDDEN/,
            );
            await assert.rejects(
              client.query("photos:resource", { ...scope, uploadId: png._id }),
              /FORBIDDEN/,
            );
            const response = await route("resource", png._id, subject);
            assert.equal(response.status, 403);
            assert.ok(!(await response.text()).includes(png.pathname));
          }
          assert.deepEqual(await bob.query("photos:workspace", scope), []);
          await assert.rejects(
            guest.query("photos:publicEntry", { entryId: entry._id }),
            /FORBIDDEN/,
          );
          await assert.rejects(
            manager.mutation(
              "photos:submit",
              request([png], { entryId: entry._id, expectedVersion: 1 }),
            ),
            /FORBIDDEN/,
          );
          await assert.rejects(
            reserve(await pngBytes(), "image/png", manager),
            /FORBIDDEN/,
          );
          assert.deepEqual(
            Buffer.from(
              await (
                await route("resource", png._id, "manager-a")
              ).arrayBuffer(),
            ),
            await pngBytes(),
          );
          await assert.rejects(
            alice.mutation("photos:review", {
              ...scope,
              entryId: entry._id,
              expectedVersion: 1,
              operationId: "creator-review",
              decision: "approved",
              reason: "",
            }),
            /FORBIDDEN/,
          );
        },
      );
      await t.test(
        "AC02/03 revision and rejection feedback, preapproval media correction retains entry/link/history",
        async () => {
          const review = {
            ...scope,
            entryId: entry._id,
            expectedVersion: 1,
            operationId: "revision-feedback",
            decision: "revisions",
            reason: "Use the landscape photo",
          };
          await assert.rejects(
            manager.mutation("photos:review", { ...review, reason: "" }),
            /REASON_REQUIRED/,
          );
          await manager.mutation("photos:review", review);
          const rejected = await manager.mutation("photos:review", {
            ...review,
            operationId: "reject",
            decision: "rejected",
            reason: "Please submit the original without text",
          });
          assert.equal(rejected.status, "rejected");
          const before = await alice.query("photos:entry", {
            ...scope,
            entryId: entry._id,
          });
          assert.ok(
            before.events.some(
              (e) => e.reason === "Please submit the original without text",
            ),
          );
          const correction = request([jpeg], {
            entryId: entry._id,
            expectedVersion: 1,
          });
          revision = await alice.mutation("photos:submit", correction);
          assert.equal(revision._id, entry._id);
          assert.equal(revision.version, 2);
          assert.equal(revision.status, "pending");
          const after = await alice.query("photos:entry", {
            ...scope,
            entryId: entry._id,
          });
          assert.equal(after.trackedPath, before.trackedPath);
          assert.equal(after.versions.length, 2);
          assert.equal(after.versions[0].photos[0], png._id);
          await assert.rejects(
            manager.mutation("photos:review", {
              ...review,
              operationId: "stale-review",
            }),
            /STALE_VERSION/,
          );
          const racing = await Promise.allSettled([
            alice.mutation(
              "photos:submit",
              request([jpeg], {
                entryId: entry._id,
                expectedVersion: 2,
                title: "One correction",
              }),
            ),
            alice.mutation(
              "photos:submit",
              request([jpeg], {
                entryId: entry._id,
                expectedVersion: 2,
                title: "Other correction",
              }),
            ),
          ]);
          assert.equal(
            racing.filter((r) => r.status === "fulfilled").length,
            1,
          );
          assert.match(
            String(racing.find((r) => r.status === "rejected").reason),
            /STALE_VERSION/,
          );
        },
      );
      await t.test(
        "AC02 approval is public metadata eligibility only, exact review retries do not dispatch ads",
        async () => {
          const current = await alice.query("photos:entry", {
            ...scope,
            entryId: entry._id,
          });
          const review = {
            ...scope,
            entryId: entry._id,
            expectedVersion: current.version,
            operationId: "approve",
            decision: "approved",
            reason: "Original reviewed",
          };
          const results = await Promise.all([
            manager.mutation("photos:review", review),
            manager.mutation("photos:review", review),
          ]);
          assert.equal(results[0].status, "approved");
          assert.equal(results[0].firstApprovedAt, results[1].firstApprovedAt);
          const publicEntry = await guest.query("photos:publicEntry", {
            entryId: entry._id,
          });
          assert.equal(publicEntry.id, entry._id);
          assert.ok(!("subject" in publicEntry));
          assert.ok(!("acceptanceId" in publicEntry));
          const saved = await alice.query("photos:entry", {
            ...scope,
            entryId: entry._id,
          });
          assert.equal(
            saved.events.filter((e) => e.action === "approved").length,
            1,
          );
          const state = await manager.query("reservations:state", scope);
          assert.equal(state.reservedSlots, 0);
          assert.equal(state.reservedCents, 0);
        },
      );
      await t.test(
        "AC03 same verified bytes and descriptive edits retain identity; changed approved media gets fresh entry",
        async () => {
          const same = await upload(await jpegBytes(), "image/jpeg");
          let current = await alice.query("photos:entry", {
            ...scope,
            entryId: entry._id,
          });
          const unchanged = await alice.mutation(
            "photos:submit",
            request([same], {
              entryId: entry._id,
              expectedVersion: current.version,
              title: "Changed description only",
            }),
          );
          assert.equal(unchanged._id, entry._id);
          assert.equal(unchanged.firstApprovedAt, current.firstApprovedAt);
          assert.equal(unchanged.status, "pending");
          await manager.mutation("photos:review", {
            ...scope,
            entryId: entry._id,
            expectedVersion: unchanged.version,
            operationId: "approve-description",
            decision: "approved",
            reason: "",
          });
          current = await alice.query("photos:entry", {
            ...scope,
            entryId: entry._id,
          });
          replacement = await alice.mutation(
            "photos:submit",
            request([png], {
              entryId: entry._id,
              expectedVersion: current.version,
              title: "Replacement creative",
            }),
          );
          assert.notEqual(replacement._id, entry._id);
          assert.equal(replacement.replacementOf, entry._id);
          assert.equal(replacement.version, 1);
          assert.equal(replacement.status, "pending");
          assert.equal(replacement.firstApprovedAt, undefined);
          const replacementDetail = await alice.query("photos:entry", {
            ...scope,
            entryId: replacement._id,
          });
          assert.notEqual(replacementDetail.trackedPath, current.trackedPath);
          assert.equal(replacementDetail.events.length, 1);
          assert.equal(
            (
              await alice.query("photos:entry", {
                ...scope,
                entryId: entry._id,
              })
            ).status,
            "approved",
          );
          await assert.rejects(
            guest.query("photos:publicEntry", { entryId: replacement._id }),
            /FORBIDDEN/,
          );
          assert.ok(!("metrics" in replacement));
          assert.ok(!("earnings" in replacement));
        },
      );
      await t.test(
        "AC03 concurrent approval and correction never approve unseen changed bytes",
        async () => {
          const original = await alice.mutation(
            "photos:submit",
            request([png], { title: "Approval race original" }),
          );
          const results = await Promise.allSettled([
            manager.mutation("photos:review", {
              ...scope,
              entryId: original._id,
              expectedVersion: 1,
              operationId: "race-approve",
              decision: "approved",
              reason: "",
            }),
            alice.mutation(
              "photos:submit",
              request([jpeg], {
                entryId: original._id,
                expectedVersion: 1,
                title: "Approval race correction",
              }),
            ),
          ]);
          assert.equal(results[1].status, "fulfilled");
          const correction = results[1].value;
          assert.equal(correction.status, "pending");
          const saved = await alice.query("photos:entry", {
            ...scope,
            entryId: original._id,
          });
          if (results[0].status === "fulfilled") {
            assert.notEqual(correction._id, original._id);
            assert.equal(saved.status, "approved");
            assert.equal(saved.versions[0].photos[0], png._id);
          } else {
            assert.match(String(results[0].reason), /STALE_VERSION/);
            assert.equal(correction._id, original._id);
            assert.equal(saved.status, "pending");
          }
        },
      );
      await t.test(
        "audit and exact bytes survive backend restart and second authorized session",
        async () => {
          const before = await alice.query("photos:entry", {
            ...scope,
            entryId: entry._id,
          });
          await backend.restart();
          const reopened = backend.client("creator-a");
          assert.deepEqual(
            await reopened.query("photos:entry", {
              ...scope,
              entryId: entry._id,
            }),
            before,
          );
          assert.deepEqual(
            Buffer.from(await (await route("resource", png._id)).arrayBuffer()),
            await pngBytes(),
          );
          for (const event of before.events) {
            assert.ok(event.actor);
            assert.ok(event.source);
            assert.ok(event.at > 0);
            assert.ok(event.version > 0);
          }
        },
      );
      await t.test(
        "current terms/synthetic scope and revocation deny upload, bytes and exact retries immediately",
        async () => {
          await command("removeFixtureScope", { campaignSlug: "adoption" });
          await assert.rejects(reserve(await pngBytes()), /TERMS_UNAVAILABLE/);
          assert.equal((await route("resource", png._id)).status, 403);
          // Even the authorized manager cannot use the local store for a production scope.
          assert.equal(
            (await route("resource", png._id, "manager-a")).status,
            403,
          );
          await command("restoreFixtureScope", {
            campaignSlug: "adoption",
            runId: backend.runId,
          });
          await command("removeTerms", { campaignSlug: "adoption" });
          await assert.rejects(reserve(await pngBytes()), /TERMS_UNAVAILABLE/);
          await assert.rejects(
            alice.mutation("photos:submit", originalRequest),
            /TERMS_UNAVAILABLE/,
          );
          assert.equal(
            (await route("verify", png._id, "creator-a", { method: "POST" }))
              .status,
            400,
          );
          assert.equal(
            (
              await alice.query("photos:entry", {
                ...scope,
                entryId: entry._id,
              })
            )._id,
            entry._id,
          );
          assert.deepEqual(
            Buffer.from(await (await route("resource", png._id)).arrayBuffer()),
            await pngBytes(),
          );
          await command("revoke", {
            subject: "creator-a",
            nonprofitId: "nonprofit-a",
          });
          await assert.rejects(
            alice.mutation("photos:submit", originalRequest),
            /FORBIDDEN/,
          );
          await assert.rejects(
            alice.query("photos:entry", { ...scope, entryId: entry._id }),
            /FORBIDDEN/,
          );
          assert.equal((await route("resource", png._id)).status, 403);
          assert.equal(
            (await route("verify", png._id, "creator-a", { method: "POST" }))
              .status,
            403,
          );
          await command("revoke", {
            subject: "manager-a",
            nonprofitId: "nonprofit-a",
          });
          assert.equal(
            (await route("resource", png._id, "manager-a")).status,
            403,
          );
        },
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await backend.stop();
    }
  },
);

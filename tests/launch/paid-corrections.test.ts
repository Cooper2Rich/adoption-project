import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { servePhotoRequest } from "../../api/photos.ts";
import { fundraisingEntry } from "./fundraising-fixtures.ts";
import { mutation, query } from "./public-fixtures.ts";

test(
  "T13 audited fallback and exact manager certification survive import/release/restart",
  { timeout: 360000 },
  async (t) => {
    const backend = await createLocalBackend(),
      server = createServer(
        (req, res) =>
          void servePhotoRequest(
            req.url?.startsWith("/api/paid-metrics")
              ? backend.paidService
              : backend.photoService,
            req,
            res,
          ),
      );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as any).port}`,
      manager = backend.client("manager-a"),
      scope = { campaignId: "adoption" },
      results: string[] = [];
    const day = {
      start: Date.parse("2026-02-01T06:00:00Z"),
      end: Date.parse("2026-02-02T06:00:00Z"),
    };
    let entry: any,
      now = Date.now() - 7200000,
      sourceRevision = 0;
    const read = () => query(manager, "paidMetrics:read", scope),
      control = () =>
        backend.runOwnedInternal("fixtures:paidControl", { ...scope, now });
    const inspect = (metric = "impressions", range = day) =>
      query(manager, "paidCorrections:inspect", {
        ...scope,
        entryId: entry._id,
        metric,
        ...range,
      });
    const save = async (extra: any = {}) =>
      mutation(manager, "paidCorrections:save", {
        ...scope,
        entryId: entry._id,
        metric: "impressions",
        ...day,
        value: 321,
        reason: "Documented report correction",
        source: "Manager source worksheet",
        certified: false,
        expectedInputFingerprint: (
          await inspect(extra.metric ?? "impressions", {
            start: extra.start ?? day.start,
            end: extra.end ?? day.end,
          })
        ).inputFingerprint,
        expectedRevision: (await read()).correctionState.revision,
        operationId: randomUUID(),
        ...extra,
      });
    const release = async (id: string) =>
      mutation(manager, "paidCorrections:release", {
        ...scope,
        correctionId: id,
        reason: "Reviewed and released to provider evidence",
        expectedRevision: (await read()).correctionState.revision,
        operationId: randomUUID(),
      });
    const run = async (mode = "normal", values: any = {}) => {
      const d = await read(),
        source = d.sources[0];
      now = Math.max(now + 31000, source.nextAt + 1);
      await control();
      backend.paidProvider.configure({
        mappings: d.mappings.map((m: any) => ({
          ...m,
          proof: d.enrollments.find((p: any) => p._id === m.enrollmentId),
        })),
        period: day,
        revision: ++sourceRevision,
        dataAsOf: now,
        values,
      });
      backend.paidProvider.mode(mode);
      const r = await fetch(base + "/api/paid-metrics?action=import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${backend.token("manager-a")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...scope,
          sourceId: source._id,
          periodId: d.inputs.find((i: any) => i.period.start === day.start)
            .period._id,
          operationId: randomUUID(),
        }),
      });
      assert.equal(r.status, 200, await r.clone().text());
      return r.json();
    };
    const check = async (name: string, fn: () => Promise<void>) => {
      await t.test(name, fn);
      results.push(name);
    };
    try {
      await check(
        "empty manager workspace explicitly holds corrections until campaign settings exist",
        async () => {
          const d = await read();
          assert.equal(d.correctionBounds, null);
          assert.equal(d.correctionState.corrections.length, 0);
        },
      );
      entry = await fundraisingEntry(backend, base, "paid-correction");
      await control();
      await check(
        "manager-only direct writes, cross-nonprofit reads, invalid exact boundaries and evidence denial",
        async () => {
          for (const identity of [
            undefined,
            "creator-a",
            "manager-b",
            "administrator",
          ]) {
            await assert.rejects(
              mutation(backend.client(identity), "paidCorrections:save", {
                ...scope,
                entryId: entry._id,
                metric: "impressions",
                ...day,
                value: 1,
                reason: "Forbidden correction",
                source: "Test",
                certified: false,
                expectedInputFingerprint: "denied",
                expectedRevision: 0,
                operationId: randomUUID(),
              }),
              /FORBIDDEN/,
            );
            await assert.rejects(
              query(backend.client(identity), "paidCorrections:inspect", {
                ...scope,
                entryId: entry._id,
                metric: "impressions",
                ...day,
              }),
              /FORBIDDEN/,
            );
          }
          await assert.rejects(
            save({ certified: true }),
            /PAID_CORRECTION_EVIDENCE/,
          );
          for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
            await assert.rejects(save({ value }), /PAID_CORRECTION_VALUE/);
          await assert.rejects(
            save({ end: day.start }),
            /PAID_CORRECTION_SCOPE/,
          );
          await assert.rejects(save({ start: 0 }), /PAID_CORRECTION_SCOPE/);
        },
      );
      let fallback: string;
      await check(
        "fallback before placements is a single shared metric input with actor/source/time/prior/new/reason and exact retries",
        async () => {
          const args = {
            operationId: "fallback-exact-retry",
            expectedInputFingerprint: (await inspect()).inputFingerprint,
            expectedRevision: 0,
          };
          fallback = await save(args);
          assert.equal(await save(args), fallback);
          await assert.rejects(
            save({ ...args, value: 322 }),
            /PAID_REPLAY_CONFLICT/,
          );
          const d = await read(),
            c = d.correctionState.corrections[0],
            e = d.inputs[0].entries[0];
          assert.equal(c.actor, "manager-a");
          assert.equal(c.source, "Manager source worksheet");
          assert.equal(c.priorValue, null);
          assert.equal(c.value, 321);
          assert.equal(c.reason, "Documented report correction");
          assert.ok(c.at > 0);
          assert.equal(c.version, 1);
          assert.equal(d.correctionState.events.length, 1);
          assert.equal(e.impressions, 321);
          assert.equal(e.complete, false);
          assert.equal((await inspect()).complete, false);
          await assert.rejects(save(), /PAID_CORRECTION_OVERLAP/);
          await backend.restart();
          assert.equal((await inspect()).value, 321);
        },
      );
      await check(
        "later covering imports replace fallback once and preserve raw observation/reconciliation provenance",
        async () => {
          for (const platform of ["facebook", "instagram"]) {
            const proof = await backend.runOwnedInternal(
              "fixtures:paidEnrollment",
              {
                ...scope,
                entryId: entry._id,
                provider: "meta",
                platform,
                account: "owned-correction-meta",
                adId: `owned-${platform}-correction`,
                requiredPeriods: [day],
              },
            );
            await mutation(manager, "paidMetrics:mapPlacement", {
              ...scope,
              enrollmentId: proof,
            });
          }
          await run();
          let d = await read();
          assert.equal(
            d.correctionState.corrections.find((c: any) => c._id === fallback)
              .active,
            false,
          );
          assert.equal((await inspect()).value, 300);
          assert.equal((await inspect()).complete, true);
          assert.equal(
            d.correctionState.events.filter(
              (e: any) => e.action === "fallback-reconciled",
            ).length,
            1,
          );
          await run();
          d = await read();
          assert.equal((await inspect()).value, 300);
          assert.equal(
            d.correctionState.events.filter(
              (e: any) => e.action === "fallback-reconciled",
            ).length,
            1,
          );
        },
      );
      await check(
        "inspected prior fingerprint rejects stale form after import and unchanged imports reconcile later fallback",
        async () => {
          const fingerprint = (await inspect()).inputFingerprint,
            revision = (await read()).correctionState.revision;
          await run("normal", {
            facebook: { impressions: 10, linkClicks: 1 },
            instagram: { impressions: 20, linkClicks: 2 },
          });
          await assert.rejects(
            save({
              expectedRevision: revision,
              expectedInputFingerprint: fingerprint,
            }),
            /PAID_CORRECTION_INPUT_CHANGED/,
          );
          const id = await save();
          const d = await read(),
            source = d.sources[0];
          now = Math.max(now + 31000, source.nextAt + 1);
          await control();
          // run with the same provider revision/data-as-of, creating no new observation.
          backend.paidProvider.mode("normal");
          const response = await fetch(
            base + "/api/paid-metrics?action=import",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${backend.token("manager-a")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                ...scope,
                sourceId: source._id,
                periodId: d.inputs[0].period._id,
                operationId: randomUUID(),
              }),
            },
          );
          assert.equal(response.status, 200, await response.clone().text());
          assert.equal((await response.json()).state, "success");
          assert.equal(
            (await read()).correctionState.corrections.find(
              (c: any) => c._id === id,
            ).active,
            false,
          );
          assert.equal((await inspect()).value, 30);
          await run();
        },
      );
      let certified: string;
      await check(
        "certification covers one exact entry metric, persists past source freshness and denies overlapping authority",
        async () => {
          certified = await save({
            certified: true,
            evidence: "Owned signed worksheet 2026-02-01",
            value: 700,
          });
          const d = await read(),
            c = d.correctionState.corrections.find(
              (c: any) => c._id === certified,
            );
          assert.equal(c.priorValue, 300);
          assert.equal((await inspect()).value, 700);
          assert.equal((await inspect()).complete, true);
          assert.equal((await inspect("linkClicks")).value, 30);
          now += 900001;
          await control();
          assert.equal((await inspect()).complete, true);
          assert.equal((await inspect("linkClicks")).complete, false);
          assert.equal((await read()).inputs[0].entries[0].complete, false);
          await assert.rejects(
            save({ start: day.start + 1000, end: day.end - 1000 }),
            /PAID_CORRECTION_OVERLAP/,
          );
        },
      );
      await check(
        "conflicting complete and partial imports held/notified manager-only, matching replay deduplicated, explicit release exposes latest retained source",
        async () => {
          await mutation(manager, "operatorIncidents:registerContact", scope);
          await mutation(
            backend.client("administrator"),
            "operatorIncidents:registerContact",
            scope,
          );
          await run();
          assert.equal((await inspect()).value, 700);
          let d = await read();
          assert.ok(
            d.correctionState.events.some(
              (e: any) => e.action === "import-held",
            ),
          );
          let notices = await query(manager, "operatorIncidents:list", scope);
          assert.ok(
            JSON.stringify(notices).includes("certified-metric-conflict"),
          );
          const conflict = notices.find(
            (n: any) => n.kind === "certified-metric-conflict",
          );
          assert.ok(conflict.notices.some((n: any) => n.emails.length > 0));
          assert.ok(
            conflict.notices.every((n: any) =>
              n.emails.every(
                (e: any) => e.recipientRole === "Campaign manager",
              ),
            ),
          );
          const heldBefore = (await read()).correctionState.events.filter(
            (e: any) => e.action === "import-held",
          ).length;
          await run("unknown-time");
          assert.equal((await inspect()).value, 700);
          assert.equal(
            (await read()).correctionState.events.filter(
              (e: any) => e.action === "import-held",
            ).length,
            heldBefore + 1,
          );
          await run("missing-field", {
            facebook: { impressions: 99, linkClicks: 9 },
            instagram: { impressions: 101, linkClicks: 10 },
          });
          assert.equal((await inspect()).value, 700);
          d = await read();
          assert.ok(
            d.correctionState.events.filter(
              (e: any) => e.action === "import-held",
            ).length >= 2,
          );
          await run("normal", {
            facebook: { impressions: 300, linkClicks: 30 },
            instagram: { impressions: 400, linkClicks: 40 },
          });
          d = await read();
          assert.equal((await inspect()).value, 700);
          assert.ok(
            d.correctionState.events.some(
              (e: any) => e.action === "import-matched",
            ),
          );
          assert.equal(
            d.inputs[0].entries[0].platforms.facebook.impressions,
            300,
          );
          assert.match(
            d.inputs[0].entries[0].platformBreakdown,
            /Imported provenance/,
          );
          await run("normal", {
            facebook: { impressions: 500, linkClicks: 50 },
            instagram: { impressions: 600, linkClicks: 60 },
          });
          await backend.restart();
          assert.equal((await inspect()).value, 700);
          const args = {
            ...scope,
            correctionId: certified,
            reason: "Explicit release to latest retained source",
            expectedRevision: (await read()).correctionState.revision,
            operationId: "release-exact-retry",
          };
          await mutation(manager, "paidCorrections:release", args);
          await mutation(manager, "paidCorrections:release", args);
          assert.equal((await inspect()).value, 1100);
          assert.equal(
            (await read()).correctionState.events.filter(
              (e: any) => e.action === "released",
            ).length,
            1,
          );
        },
      );
      await check(
        "arbitrary subday certification is exact; coarser totals and outside scope held without guessed residual",
        async () => {
          const range = { start: day.start + 1234, end: day.start + 3600567 },
            id = await save({
              ...range,
              certified: true,
              evidence: "Exact bounded interval worksheet",
              value: 23,
            });
          assert.equal((await inspect("impressions", range)).value, 23);
          assert.equal((await inspect("impressions", range)).complete, true);
          assert.equal((await inspect()).value, null);
          assert.equal((await inspect()).complete, false);
          assert.equal(
            (
              await inspect("impressions", {
                start: range.start + 1,
                end: range.end,
              })
            ).value,
            null,
          );
          await run();
          assert.equal((await inspect("impressions", range)).value, 23);
          assert.equal(
            (await read()).correctionState.events
              .filter((e: any) => e.correctionId === id)
              .at(-1).action,
            "import-held",
          );
          await release(id);
          assert.equal((await inspect()).value, 300);
        },
      );
      await check(
        "multi-day correction remains one exact total and leaves daily allocation held; neighbor metric/range completeness stays missing",
        async () => {
          const range = { start: day.start, end: day.end + 86400000 },
            id = await save({
              ...range,
              certified: true,
              evidence: "Two day certified worksheet",
              value: 456,
            });
          assert.equal((await inspect("impressions", range)).value, 456);
          assert.equal((await inspect("impressions", range)).complete, true);
          const w = await query(manager, "paidMetrics:window", {
            ...scope,
            ...range,
          });
          assert.equal(w.entries[0].impressions, 456);
          assert.equal(w.complete, false);
          assert.equal((await inspect()).value, null);
          await release(id);
        },
      );
      await check(
        "concurrent overlapping save/release/import and stale revision are serialized; revoked exact retries denied",
        async () => {
          const revision = (await read()).correctionState.revision,
            common = {
              expectedRevision: revision,
              certified: true,
              evidence: "Concurrency source",
            };
          const outcomes = await Promise.allSettled([
            save({ ...common, operationId: "concurrent-a" }),
            save({ ...common, operationId: "concurrent-b" }),
          ]);
          assert.equal(
            outcomes.filter((r) => r.status === "fulfilled").length,
            1,
          );
          const winner = outcomes.find(
            (r) => r.status === "fulfilled",
          ) as PromiseFulfilledResult<string>;
          assert.equal((await inspect()).value, 321);
          await assert.rejects(
            save({ expectedRevision: revision }),
            /PAID_CORRECTION_REVISION/,
          );
          const race = await Promise.allSettled([run(), release(winner.value)]);
          if (race[1].status === "rejected") await release(winner.value);
          assert.equal((await inspect()).value, 300);
          assert.equal(
            (await read()).correctionState.corrections.filter(
              (c: any) => c.active,
            ).length,
            0,
          );
          const retry = {
            operationId: "revoked-retry",
            expectedInputFingerprint: (await inspect()).inputFingerprint,
            expectedRevision: (await read()).correctionState.revision,
          };
          const id = await save(retry);
          await backend.runOwnedInternal("fixtures:paidControl", {
            ...scope,
            subject: "manager-a",
            active: false,
          });
          await assert.rejects(save(retry), /FORBIDDEN/);
          await assert.rejects(release(id), /FORBIDDEN/);
          await assert.rejects(read(), /FORBIDDEN/);
          await backend.runOwnedInternal("fixtures:paidControl", {
            ...scope,
            subject: "manager-a",
            active: true,
          });
          await release(id);
        },
      );
      await check(
        "certification for a second entry cannot change the first entry or expose foreign nonprofit correction history",
        async () => {
          const first = entry,
            second = await fundraisingEntry(
              backend,
              base,
              "second-correction",
              "adoption",
              "second-creator",
              "Second Studio",
            );
          entry = second;
          const id = await save({
            value: 0,
            certified: true,
            evidence: "Affirmative exact zero worksheet",
          });
          assert.equal((await inspect()).value, 0);
          assert.equal((await inspect()).complete, true);
          const d = await read();
          assert.equal(
            d.inputs[0].entries.find((e: any) => e.entryId === first._id)
              .impressions,
            300,
          );
          const foreign = await fundraisingEntry(
            backend,
            base,
            "foreign-correction",
            "other",
            "foreign-creator",
            "Other Studio",
          );
          await assert.rejects(save({ entryId: foreign._id }), /FORBIDDEN/);
          await assert.rejects(
            mutation(backend.client("manager-b"), "paidCorrections:release", {
              campaignId: "other",
              correctionId: id,
              reason: "Foreign access attempt",
              expectedRevision: 0,
              operationId: randomUUID(),
            }),
            /FORBIDDEN/,
          );
          assert.equal(
            JSON.stringify(
              await query(backend.client("manager-b"), "paidMetrics:read", {
                campaignId: "other",
              }),
            ).includes(id),
            false,
          );
          await release(id);
          entry = first;
        },
      );
      await mkdir(".codex/ralph/t13", { recursive: true });
      await writeFile(
        ".codex/ralph/t13/backend-evidence.json",
        JSON.stringify(
          {
            story: "T13",
            at: new Date().toISOString(),
            results,
            synthetic: true,
            productionEligible: false,
            final: await read(),
          },
          null,
          2,
        ),
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      await backend.stop();
    }
  },
);

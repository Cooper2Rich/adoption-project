import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { createPaidMetricService } from "../../server/launch/paid-metrics.ts";
import { servePhotoRequest } from "../../api/photos.ts";
import { fundraisingEntry } from "./fundraising-fixtures.ts";
import { mutation, query } from "./public-fixtures.ts";
import { canonicalPeriod, canonicalDays } from "../../convex/paidMetrics.ts";
import { chicagoDay } from "../../convex/allocation/chicago.ts";
import { reportRetryDelay } from "../../server/launch/paid-metrics.ts";

test("T12 canonical Chicago days preserve 23/25-hour DST and clipped campaign endpoints; HTTP retry deadlines never shorten", () => {
  const rules = {
    campaignStart: "2026-01-01T06:00:00Z",
    campaignEnd: "2026-12-01T06:00:00Z",
  };
  for (const [date, hours] of [
    ["2026-03-08", 23],
    ["2026-11-01", 25],
  ] as const) {
    const day = chicagoDay(Date.parse(date + "T12:00:00Z"));
    assert.equal((day.end - day.start) / 3600000, hours);
    canonicalPeriod(day.start, day.end, rules);
    assert.equal(canonicalDays(day.start, day.end, rules).length, 1);
  }
  const clipped = {
      campaignStart: "2026-03-08T18:00:00Z",
      campaignEnd: "2026-03-10T17:00:00Z",
    },
    start = Date.parse(clipped.campaignStart),
    end = Date.parse(clipped.campaignEnd),
    days = canonicalDays(start, end, clipped);
  assert.equal(days.length, 3);
  assert.equal(days[0].start, start);
  assert.equal(days[2].end, end);
  assert.throws(
    () =>
      canonicalPeriod(chicagoDay(start).start, chicagoDay(start).end, clipped),
    /PAID_PERIOD/,
  );
  const received = Date.parse("2026-11-12T12:00:00Z");
  assert.equal(reportRetryDelay("172800", received).retryMs, 172800000);
  assert.equal(
    reportRetryDelay(new Date(received + 120000).toUTCString(), received)
      .retryMs,
    120000,
  );
  assert.equal(
    reportRetryDelay(new Date(received - 1000).toUTCString(), received).retryMs,
    30000,
  );
  assert.match(
    reportRetryDelay("unsupported", received).retryHold!,
    /trusted contract/,
  );
  assert.match(
    reportRetryDelay("99999999999999999999", received).retryHold!,
    /trusted contract/,
  );
});

test(
  "T12 scoped paid HTTP reports, exact coverage and durable first-use source health",
  { timeout: 360000 },
  async (t) => {
    const backend = await createLocalBackend(),
      results: string[] = [],
      durabilityEvidence: any = {};
    const server = createServer(
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
      scope = { campaignId: "adoption" };
    let now = Date.now() - 12 * 3600000,
      revision = 0;
    const period = {
      start: Date.parse("2026-02-01T06:00:00Z"),
      end: Date.parse("2026-02-02T06:00:00Z"),
    };
    const nextPeriod = { start: period.end, end: period.end + 86400000 };
    const control = async (extra: any = {}) =>
      backend.runOwnedInternal("fixtures:paidControl", {
        ...scope,
        now,
        ...extra,
      });
    const read = () => query(manager, "paidMetrics:read", scope);
    const check = async (name: string, fn: () => Promise<void>) => {
      await t.test(name, async () => {
        await fn();
        results.push(name);
      });
    };
    let sourceId: string,
      periodId: string,
      entry: any,
      proofs: any[] = [],
      mappingIds: string[] = [];
    const configure = async (extra: any = {}) => {
      const d = await read();
      backend.paidProvider.configure({
        mappings: d.mappings.map((m: any) => ({
          ...m,
          proof: d.enrollments.find((p: any) => p._id === m.enrollmentId),
        })),
        period,
        revision: ++revision,
        dataAsOf: now,
        values: {},
        ...extra,
      });
    };
    const run = async (provider = "meta", mode = "normal", extra: any = {}) => {
      const d = await read(),
        source = d.sources.find((s: any) => s.provider === provider);
      now = Math.max(now + 31000, source.nextAt + 1);
      await control();
      await configure(extra);
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
          periodId,
          operationId: randomUUID(),
        }),
      });
      assert.equal(r.status, 200, await r.clone().text());
      return r.json();
    };
    try {
      entry = await fundraisingEntry(backend, base, "paid-metric");
      await control();
      await check(
        "current manager scope, immutable approved enrollment and exact Chicago periods",
        async () => {
          for (const actor of [
            backend.client(),
            backend.client("creator-a"),
            backend.client("manager-b"),
            backend.client("administrator"),
          ]) {
            await assert.rejects(
              query(actor, "paidMetrics:read", scope),
              /FORBIDDEN/,
            );
            await assert.rejects(
              mutation(actor, "paidMetrics:addPeriod", {
                ...scope,
                label: "day",
                ...period,
              }),
              /FORBIDDEN/,
            );
          }
          await assert.rejects(
            mutation(manager, "paidMetrics:addPeriod", {
              ...scope,
              label: "week",
              start: period.start,
              end: period.end + 7 * 86400000,
            }),
            /PAID_PERIOD/,
          );
          periodId = await mutation(manager, "paidMetrics:addPeriod", {
            ...scope,
            label: "February 1",
            ...period,
          });
          assert.equal(
            await mutation(manager, "paidMetrics:addPeriod", {
              ...scope,
              label: "same day",
              ...period,
            }),
            periodId,
          );
          const enrollment = {
            ...scope,
            entryId: entry._id,
            provider: "meta",
            platform: "facebook",
            account: "owned-meta-a",
            adId: "owned-ad-facebook",
            requiredPeriods: [period],
          };
          for (const overrides of [
            { creativeDigest: "f".repeat(64) },
            { destination: "/fundraise/foreign" },
            { creativeVersion: 2 },
            { campaignId: "other" },
            { platform: "tiktok" },
          ])
            await assert.rejects(
              backend.runOwnedInternal("fixtures:paidEnrollment", {
                ...enrollment,
                overrides,
              }),
              /PAID_ENROLLMENT_SCOPE|Owned version/,
            );
          for (const [provider, platform] of [
            ["meta", "facebook"],
            ["meta", "instagram"],
            ["tiktok", "tiktok"],
          ]) {
            const proof = await backend.runOwnedInternal(
              "fixtures:paidEnrollment",
              {
                ...scope,
                entryId: entry._id,
                provider,
                platform,
                account: `owned-${provider}-a`,
                adId: `owned-ad-${platform}`,
                requiredPeriods: [period],
              },
            );
            proofs.push(proof);
            const id = await mutation(manager, "paidMetrics:mapPlacement", {
              ...scope,
              enrollmentId: proof,
            });
            mappingIds.push(id);
            assert.equal(
              await mutation(manager, "paidMetrics:mapPlacement", {
                ...scope,
                enrollmentId: proof,
              }),
              id,
            );
          }
          sourceId = (await read()).sources.find(
            (s: any) => s.provider === "meta",
          )._id;
          const d = await read();
          assert.equal(d.mappings.length, 3);
          assert.equal(d.inputs[0].entries[0].impressions, null);
          assert.equal(d.inputs[0].entries[0].linkClicks, null);
          assert.equal(d.inputs[0].entries[0].coverage.length, 6);
          assert(
            d.inputs[0].entries[0].coverage.every(
              (c: any) => c.value === null && !c.complete,
            ),
          );
          const forged = await fetch(base + "/api/paid-metrics?action=import", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${backend.token("manager-b")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...scope,
              sourceId,
              periodId,
              operationId: "forged",
            }),
          });
          assert.equal(forged.status, 403);
          const held = createPaidMetricService({
            url: backend.url,
            providerOrigin: "https://graph.facebook.com",
          });
          await assert.rejects(
            held.perform(backend.token("manager-a"), {}),
            /PAID_HELD/,
          );
        },
      );
      await check(
        "first required use exact five-minute boundary, persisted restart and manager-only single outage notice",
        async () => {
          const initial = (await read()).sources.find(
            (s: any) => s._id === sourceId,
          );
          assert.equal(initial.lastSuccess, undefined);
          assert.equal(initial.activatedAt, now);
          now += 300000;
          await control();
          assert.deepEqual(
            await backend.runOwnedInternal("paidMetrics:watchdog", {
              sourceId,
              generation: initial.watchGeneration,
            }),
            { outage: false },
          );
          await backend.restart();
          now++;
          await control();
          await Promise.all(
            [1, 2].map(() =>
              backend.runOwnedInternal("paidMetrics:watchdog", {
                sourceId,
                generation: initial.watchGeneration,
              }),
            ),
          );
          const incidents = await query(
              manager,
              "operatorIncidents:list",
              scope,
            ),
            incident = incidents.find((i: any) => i.kind === "import-outage");
          assert.equal(incident.status, "open");
          assert.match(incident.reason, /No successful import yet/);
          assert.equal(incident.notices.length, 1);
          assert.equal(incident.notices[0].emails.length, 0); // no fabricated sent email
          await mutation(manager, "operatorIncidents:registerContact", scope);
          await mutation(manager, "operatorIncidents:resume", scope);
          const current = (
            await query(manager, "operatorIncidents:list", scope)
          ).find((i: any) => i.kind === "import-outage");
          assert.equal(current.notices[0].emails.length, 1);
          assert.equal(
            current.notices[0].emails[0].recipientRole,
            "Campaign manager",
          );
        },
      );
      await check(
        "FB, IG and TikTok snapshots aggregate once, unchanged imports recover once and unrelated metrics stay excluded",
        async () => {
          assert.equal((await run()).state, "success");
          assert.equal((await run("tiktok")).state, "success");
          let d = await read(),
            e = d.inputs[0].entries[0];
          assert.equal(e.impressions, 400);
          assert.equal(e.linkClicks, 40);
          assert.equal(e.platforms.facebook.impressions, 100);
          assert.equal(e.platforms.instagram.impressions, 200);
          assert.equal(e.platforms.tiktok.impressions, 100);
          assert.equal(e.complete, true);
          assert.equal(e.productionEligible, false);
          await run();
          d = await read();
          assert.equal(d.inputs[0].entries[0].impressions, 400);
          const incidents = await query(
            manager,
            "operatorIncidents:list",
            scope,
          );
          assert.equal(incidents.length, 1);
          assert.equal(incidents[0].status, "resolved");
          assert.equal(
            incidents[0].notices.filter((n: any) => n.kind === "recovery")
              .length,
            1,
          );
          const before = d.operations.length;
          const op = "exact-request",
            s = d.sources.find((s: any) => s.provider === "meta");
          now += 31000;
          await control();
          const id = await mutation(manager, "paidMetrics:requestImport", {
            ...scope,
            sourceId,
            periodId,
            operationId: op,
          });
          assert.equal(
            await mutation(manager, "paidMetrics:requestImport", {
              ...scope,
              sourceId,
              periodId,
              operationId: op,
            }),
            id,
          );
          assert.equal((await read()).operations.length, before + 1);
          await assert.rejects(
            mutation(backend.client(), "paidMetrics:claim", {
              value: {
                operationId: id,
                fixtureRunId: backend.runId,
                at: Date.now(),
              },
              signature: "forged",
            }),
            /FORBIDDEN/,
          );
          await assert.rejects(
            mutation(manager, "paidMetrics:requestImport", {
              ...scope,
              sourceId,
              periodId,
              operationId: "too-soon",
            }),
            /PAID_BACKOFF/,
          );
          assert(s.lastSuccess !== undefined);
        },
      );
      await check(
        "known zero, missing fields/placement, suppressed values, unknown source time and valid partial observations stay distinct",
        async () => {
          await run("meta", "normal", {
            values: {
              facebook: { impressions: 0, linkClicks: 0 },
              instagram: { impressions: 0, linkClicks: 0 },
            },
          });
          let e = (await read()).inputs[0].entries[0];
          assert.equal(e.platforms.facebook.impressions, 0);
          assert(
            e.coverage.find(
              (c: any) =>
                c.platform === "facebook" && c.metric === "impressions",
            ).complete,
          );
          await run("meta", "incomplete", {
            values: { facebook: { impressions: 123, linkClicks: 7 } },
          });
          e = (await read()).inputs[0].entries[0];
          assert.equal(e.platforms.facebook.impressions, 123);
          assert.equal(e.complete, false);
          assert.match(
            e.coverage.find((c: any) => c.platform === "facebook").reason,
            /completeness unproven/,
          );
          const successful = (await read()).sources.find(
            (s: any) => s._id === sourceId,
          ).lastSuccess;
          await run("meta", "missing-field");
          e = (await read()).inputs[0].entries[0];
          assert.equal(e.platforms.facebook.linkClicks, 7);
          assert(e.coverage.some((c: any) => c.reason.includes("missing")));
          for (const mode of [
            "missing-placement",
            "suppressed",
            "unknown-time",
            "organic",
          ]) {
            const before = (await read()).inputs[0].entries[0];
            await run("meta", mode);
            const after = (await read()).inputs[0].entries[0];
            assert.equal(after.complete, false);
            if (mode === "unknown-time" || mode === "organic")
              assert.equal(after.impressions, before.impressions);
          }
          assert(
            (await read()).sources.find((s: any) => s._id === sourceId)
              .lastSuccess > successful,
          );
        },
      );
      await check(
        "pagination failure, authorization, forged binding and malformed replay fail without resetting health or deleting values",
        async () => {
          for (const mode of [
            "page-failure",
            "authorization",
            "wrong-account",
            "wrong-grant",
            "wrong-creative",
            "wrong-campaign",
            "wrong-report",
            "duplicate",
            "malformed",
          ]) {
            const before = await read(),
              success = before.sources.find(
                (s: any) => s._id === sourceId,
              ).lastSuccess,
              total = before.inputs[0].entries[0].impressions;
            assert.equal((await run("meta", mode)).state, "failed", mode);
            const after = await read();
            assert.equal(
              after.sources.find((s: any) => s._id === sourceId).lastSuccess,
              success,
              mode,
            );
            assert.equal(after.inputs[0].entries[0].impressions, total, mode);
            assert.equal(after.inputs[0].entries[0].complete, false);
          }
          assert.equal((await run("meta", "paged")).state, "success");
          const prior = (await read()).inputs[0].entries[0];
          assert.equal(
            (
              await run("meta", "normal", {
                values: {
                  facebook: {
                    impressions: Number.MAX_SAFE_INTEGER,
                    linkClicks: 1,
                  },
                },
              })
            ).state,
            "failed",
          );
          assert.equal(
            (await read()).inputs[0].entries[0].impressions,
            prior.impressions,
          );
        },
      );
      await check(
        "429 backoff persists across restart and cannot be bypassed by repeated requests",
        async () => {
          assert.equal((await run("meta", "rate-limit")).state, "failed");
          const d = await read(),
            s = d.sources.find((s: any) => s._id === sourceId),
            count = backend.paidProvider.requests();
          await backend.restart();
          await assert.rejects(
            backend.paidService.perform(backend.token("manager-a"), {
              ...scope,
              sourceId,
              periodId,
              operationId: "backoff-after-restart",
            }),
            /PAID_BACKOFF/,
          );
          assert.equal(backend.paidProvider.requests(), count);
          assert.equal(
            (await read()).sources.find((s: any) => s._id === sourceId).nextAt,
            s.nextAt,
          );
          now = s.nextAt;
          await control();
        },
      );
      await check(
        "slower concurrent reads are fenced; source corrections replace snapshots with immutable history, not summed cumulative totals",
        async () => {
          now += 31000;
          await control();
          await configure();
          backend.paidProvider.mode("slow");
          const first = backend.paidService.perform(
            backend.token("manager-a"),
            { ...scope, sourceId, periodId, operationId: "slow-read" },
          );
          for (let i = 0; i < 100; i++) {
            if (
              (await read()).operations.some(
                (o: any) =>
                  o.operationId === "slow-read" && o.state === "reading",
              )
            )
              break;
            await new Promise((r) => setTimeout(r, 10));
          }
          assert.equal(
            (
              await run("meta", "normal", {
                values: {
                  facebook: { impressions: 55, linkClicks: 5 },
                  instagram: { impressions: 66, linkClicks: 6 },
                },
              })
            ).state,
            "success",
          );
          assert.equal((await first).state, "superseded");
          let e = (await read()).inputs[0].entries[0];
          assert.equal(e.platforms.facebook.impressions, 55);
          assert(
            e.coverage.find((c: any) => c.platform === "facebook")
              .observationHistory.length > 1,
          );
          assert.equal(
            (await run("meta", "normal", { revision: 1, dataAsOf: now - 1000 }))
              .state,
            "success",
          );
          e = (await read()).inputs[0].entries[0];
          assert.equal(e.platforms.facebook.impressions, 55);
          assert.equal(e.complete, false);
          const oldRevision = revision;
          await run("meta", "normal", { revision: oldRevision + 100 });
          assert.equal(
            (
              await run("meta", "normal", {
                revision: oldRevision + 100,
                values: { facebook: { impressions: 99, linkClicks: 99 } },
              })
            ).state,
            "failed",
          );
        },
      );
      await check(
        "append-only exact required days, retirement/reactivation and historic period registration preserve attribution without scope invention",
        async () => {
          for (const mappingId of mappingIds.slice(0, 2))
            await mutation(manager, "paidMetrics:revokePlacement", {
              ...scope,
              mappingId,
            });
          let d = await read(),
            s = d.sources.find((s: any) => s._id === sourceId);
          assert.equal(s.active, false);
          const success = s.lastSuccess,
            watch = s.watchGeneration;
          const nextId = await mutation(manager, "paidMetrics:addPeriod", {
            ...scope,
            label: "February 2",
            ...nextPeriod,
          });
          assert.equal(
            (await read()).inputs.find((i: any) => i.period._id === nextId)
              .entries.length,
            0,
          );
          await backend.runOwnedInternal("fixtures:paidRequirements", {
            mappingId: mappingIds[0],
            periods: [nextPeriod],
            evidence: "Owned ongoing unchanged paid placement requirement",
          });
          d = await read();
          assert.equal(
            d.inputs.find((i: any) => i.period._id === nextId).entries[0]
              .coverage.length,
            2,
          );
          assert.equal(d.inputs[0].entries[0].coverage.length, 6);
          assert.deepEqual(
            await backend.runOwnedInternal("fixtures:paidRequirements", {
              mappingId: mappingIds[0],
              periods: [nextPeriod],
              evidence: "Owned retry",
            }),
            { changed: false },
          );
          await mutation(manager, "paidMetrics:mapPlacement", {
            ...scope,
            enrollmentId: proofs[0],
          });
          d = await read();
          s = d.sources.find((s: any) => s._id === sourceId);
          assert.equal(s.active, true);
          assert.equal(s.lastSuccess, success);
          assert.deepEqual(
            await backend.runOwnedInternal("paidMetrics:watchdog", {
              sourceId,
              generation: watch,
            }),
            { stale: true },
          );
          const third = {
            start: nextPeriod.end,
            end: nextPeriod.end + 86400000,
          };
          await backend.runOwnedInternal("fixtures:paidRequirements", {
            mappingId: mappingIds[0],
            periods: [third],
            evidence: "Owned historic requirement before local registration",
          });
          await mutation(manager, "paidMetrics:revokePlacement", {
            ...scope,
            mappingId: mappingIds[0],
          });
          const thirdId = await mutation(manager, "paidMetrics:addPeriod", {
            ...scope,
            label: "February 3",
            ...third,
          });
          assert.equal(
            (await read()).inputs.find((i: any) => i.period._id === thirdId)
              .entries[0].coverage.length,
            2,
          );
          const conflicting = await backend.runOwnedInternal(
            "fixtures:paidEnrollment",
            {
              ...scope,
              entryId: entry._id,
              provider: "meta",
              platform: "facebook",
              account: "owned-meta-a",
              adId: "owned-ad-facebook",
              requiredPeriods: [period],
            },
          );
          await assert.rejects(
            mutation(manager, "paidMetrics:mapPlacement", {
              ...scope,
              enrollmentId: conflicting,
            }),
            /PAID_MAPPING_CONFLICT/,
          );
        },
      );
      await check(
        "proof-attested days materialize without manager registration; weekly consumer enumerates missing days and aggregates canonical snapshots once",
        async () => {
          const fourth = {
            start: nextPeriod.end + 86400000,
            end: nextPeriod.end + 2 * 86400000,
          };
          await backend.runOwnedInternal("fixtures:paidRequirements", {
            mappingId: mappingIds[0],
            periods: [fourth],
            evidence: "Owned fourth-day requirement; no manager registration",
          });
          const d = await read();
          assert(d.inputs.some((i: any) => i.period.start === fourth.start));
          const window = await query(manager, "paidMetrics:window", {
            ...scope,
            start: period.start,
            end: period.start + 7 * 86400000,
          });
          assert.equal(window.days.length, 7);
          assert.equal(window.entries[0].coverage.length, 7);
          assert.equal(
            window.entries[0].impressions,
            d.inputs[0].entries[0].impressions,
          );
          assert.equal(window.complete, false);
          assert.equal(window.productionEligible, false);
          assert.equal(window.entries[0].coverage[6].input, null);
          assert.match(
            window.entries[0].coverage[6].reason,
            /No trusted required-placement evidence/,
          );
        },
      );
      await check(
        "normalized completion replay deduplicates reordered rows and rejects changed facts using valid signed receipts",
        async () => {
          now += 120001;
          await control();
          const operationId = await mutation(
            manager,
            "paidMetrics:requestImport",
            { ...scope, sourceId, periodId, operationId: "signed-replay" },
          );
          const claim = await backend.ownedPaidOperation("claim", {
            operationId,
          });
          assert(claim);
          const rows = claim.mappings.flatMap((m: any) =>
            ["impressions", "linkClicks"].map((metric) => ({
              mappingId: m._id,
              metric,
              value: 3,
              start: period.start,
              end: period.end,
              dataAsOf: now,
              revision: 1000,
              complete: true,
              evidence: "owned signed complete scope",
            })),
          );
          const value = {
            operationId,
            outcome: "success",
            reason: "Owned independently signed completion",
            retryMs: 30000,
            rows,
            reportEvidence: "owned signed replay report",
          };
          assert.equal(
            (await backend.ownedPaidOperation("complete", value)).state,
            "success",
          );
          const total = (await read()).inputs[0].entries[0].impressions;
          assert.equal(
            (
              await backend.ownedPaidOperation("complete", {
                ...value,
                rows: [...rows].reverse(),
              })
            ).state,
            "success",
          );
          assert.equal((await read()).inputs[0].entries[0].impressions, total);
          await assert.rejects(
            backend.ownedPaidOperation("complete", {
              ...value,
              rows: rows.map((r: any, i: number) =>
                i ? r : { ...r, value: 4 },
              ),
            }),
            /PAID_REPLAY_CONFLICT/,
          );
        },
      );
      await check(
        "source notices retain failed and unknown email evidence; exact-key retry after restart and incomplete-coverage recovery stay separate",
        async () => {
          await mutation(manager, "paidMetrics:mapPlacement", {
            ...scope,
            enrollmentId: proofs[0],
          });
          const s = (await read()).sources.find((s: any) => s._id === sourceId);
          now = Math.max(s.activatedAt, s.lastSuccess ?? 0) + 300001;
          await control();
          backend.email.mode("fail");
          await backend.runOwnedInternal("paidMetrics:watchdog", {
            sourceId,
            generation: s.watchGeneration,
          });
          const find = async () =>
            (await query(manager, "operatorIncidents:list", scope)).find(
              (i: any) =>
                i.kind === "import-outage" &&
                i.status === "open" &&
                i.reason.includes("owned-meta-a"),
            );
          let incident: any;
          for (let i = 0; i < 100; i++) {
            incident = await find();
            if (incident?.notices[0].emails[0]?.failures === 1) break;
            await new Promise((r) => setTimeout(r, 50));
          }
          assert.equal(incident.status, "open");
          assert.equal(incident.notices[0].emails[0].failures, 1);
          assert.equal(incident.notices[0].emails.length, 1);
          const email = incident.notices[0].emails[0];
          backend.email.mode("unknown");
          await backend.runOwnedInternal("fixtures:incidentControl", {
            ...scope,
            now: email.nextAt,
          });
          await backend.runOwnedInternal("incidentEmailJobs:run", {
            emailId: email.id,
          });
          incident = await find();
          const uncertain = incident.notices[0].emails[0];
          assert.equal(uncertain.state, "unknown");
          const attempt = uncertain.attempts.at(-1),
            before = backend.email.requests.at(-1)!;
          await backend.restart();
          assert.equal((await find()).notices[0].emails[0].state, "unknown");
          backend.email.mode("delivered");
          await backend.runOwnedInternal("fixtures:incidentControl", {
            ...scope,
            now: uncertain.nextAt,
          });
          await Promise.all(
            [1, 2].map(() =>
              backend.runOwnedInternal("incidentEmailJobs:run", {
                emailId: email.id,
              }),
            ),
          );
          incident = await find();
          assert.equal(
            incident.notices[0].emails[0].attempts.at(-1).id,
            attempt.id,
          );
          assert.equal(backend.email.requests.at(-1)!.key, before.key);
          assert.equal(backend.email.requests.at(-1)!.payload, before.payload);
          await backend.runOwnedInternal("fixtures:incidentControl", {
            ...scope,
            now: null,
          });
          await run("meta", "missing-field");
          const episodes = (
            await query(manager, "operatorIncidents:list", scope)
          ).filter(
            (i: any) =>
              i.kind === "import-outage" && i.reason.includes("owned-meta-a"),
          );
          assert(episodes.every((i: any) => i.status === "resolved"));
          assert(
            episodes.every(
              (i: any) =>
                i.notices.filter((n: any) => n.kind === "recovery").length ===
                1,
            ),
          );
          assert.equal((await read()).inputs[0].entries[0].complete, false);
        },
      );
      await check(
        "durable reader lease expires after restart, coverage remains held and revoked manager cannot read or mutate",
        async () => {
          now += 120001;
          await control();
          const beforeReader = (
            await read()
          ).inputs[0].entries[0].coverage.find(
            (c: any) =>
              c.mappingId === mappingIds[0] && c.metric === "impressions",
          );
          assert.notEqual(beforeReader.latestDataAsOf, null);
          const opId = await mutation(manager, "paidMetrics:requestImport", {
              ...scope,
              sourceId,
              periodId,
              operationId: "crashed-reader",
            }),
            op = (await read()).operations.find((o: any) => o._id === opId);
          await backend.restart();
          now = op.leaseUntil;
          await control();
          assert.deepEqual(
            await backend.runOwnedInternal("paidMetrics:operationWatchdog", {
              operationId: opId,
              generation: op.generation,
            }),
            { due: false },
          );
          now++;
          await control();
          assert.deepEqual(
            await backend.runOwnedInternal("paidMetrics:operationWatchdog", {
              operationId: opId,
              generation: op.generation,
            }),
            { expired: true },
          );
          assert.equal(
            (await read()).operations.find((o: any) => o._id === opId).state,
            "failed",
          );
          const expiredReader = (
            await read()
          ).inputs[0].entries[0].coverage.find(
            (c: any) =>
              c.mappingId === mappingIds[0] && c.metric === "impressions",
          );
          assert.equal(expiredReader.latestDataAsOf, null);
          assert.equal(expiredReader.reportingDelayMs, null);
          assert.equal(expiredReader.dataAsOf, beforeReader.dataAsOf);
          assert.equal(expiredReader.value, beforeReader.value);
          durabilityEvidence.expiredReader = {
            before: beforeReader,
            after: expiredReader,
          };
          await control({ subject: "manager-a", active: false });
          await assert.rejects(read(), /FORBIDDEN/);
          await assert.rejects(
            mutation(manager, "paidMetrics:revokePlacement", {
              ...scope,
              mappingId: mappingIds[2],
            }),
            /FORBIDDEN/,
          );
          await control({ subject: "manager-a", active: true });
          await assert.rejects(
            query(backend.client("manager-b"), "paidMetrics:read", scope),
            /FORBIDDEN/,
          );
          const other = await query(
            backend.client("manager-b"),
            "paidMetrics:read",
            { campaignId: "other" },
          );
          assert.equal(other.mappings.length, 0);
          assert.equal(other.operations.length, 0);
        },
      );
      await check(
        "future HTTP-date and 48-hour Retry-After persist without early requests; unsupported policy is an explicit durable hold",
        async () => {
          for (const [name, header, minimum] of [
            ["date", new Date(Date.now() + 120000).toUTCString(), 110000],
            ["long", "172800", 172800000],
            ["unsupported", "invalid-owned-policy", 0],
          ] as const) {
            const account = `owned-meta-policy-${name}`,
              proof = await backend.runOwnedInternal(
                "fixtures:paidEnrollment",
                {
                  ...scope,
                  entryId: entry._id,
                  provider: "meta",
                  platform: "facebook",
                  account,
                  adId: `owned-policy-ad-${name}`,
                  requiredPeriods: [period],
                },
              );
            await mutation(manager, "paidMetrics:mapPlacement", {
              ...scope,
              enrollmentId: proof,
            });
            const s = (await read()).sources.find(
              (s: any) => s.account === account,
            );
            await configure({ retryAfter: header });
            backend.paidProvider.mode("rate-limit");
            const before = now;
            assert.equal(
              (
                await backend.paidService.perform(backend.token("manager-a"), {
                  ...scope,
                  sourceId: s._id,
                  periodId,
                  operationId: `policy-${name}`,
                })
              ).state,
              "failed",
            );
            const persisted = (await read()).sources.find(
              (row: any) => row._id === s._id,
            );
            assert(persisted.nextAt - before >= minimum);
            if (name === "unsupported")
              assert.match(persisted.retryHold, /Unsupported provider/);
            const requests = backend.paidProvider.requests();
            await backend.restart();
            await assert.rejects(
              backend.paidService.perform(backend.token("manager-a"), {
                ...scope,
                sourceId: s._id,
                periodId,
                operationId: `policy-${name}-early-retry`,
              }),
              name === "unsupported" ? /PAID_BACKOFF_HELD/ : /PAID_BACKOFF/,
            );
            assert.equal(backend.paidProvider.requests(), requests);
          }
        },
      );
      await check(
        "owned report scope bound holds before HTTP when more than 100 distinct ads are required",
        async () => {
          for (let index = 0; index < 101; index++) {
            const proof = await backend.runOwnedInternal(
              "fixtures:paidEnrollment",
              {
                ...scope,
                entryId: entry._id,
                provider: "meta",
                platform: "facebook",
                account: "owned-meta-bound",
                adId: `owned-bound-${index}`,
                requiredPeriods: [period],
              },
            );
            await mutation(manager, "paidMetrics:mapPlacement", {
              ...scope,
              enrollmentId: proof,
            });
          }
          const bound = (await read()).sources.find(
              (s: any) => s.account === "owned-meta-bound",
            ),
            requests = backend.paidProvider.requests();
          await configure();
          backend.paidProvider.mode("normal");
          assert.equal(
            (
              await backend.paidService.perform(backend.token("manager-a"), {
                ...scope,
                sourceId: bound._id,
                periodId,
                operationId: "bounded-no-request",
              })
            ).state,
            "failed",
          );
          assert.equal(backend.paidProvider.requests(), requests);
          const op = (await read()).operations.find(
            (o: any) => o.operationId === "bounded-no-request",
          );
          assert.match(op.reason, /scope-limit/);
        },
      );
      await check(
        "durable exact freshness expiry survives restart and old timers cannot expire fresh coverage; unknown latest reads retain separately dated facts",
        async () => {
          const proof = await backend.runOwnedInternal(
            "fixtures:paidEnrollment",
            {
              ...scope,
              entryId: entry._id,
              provider: "meta",
              platform: "facebook",
              account: "owned-meta-freshness",
              adId: "owned-freshness-ad",
              requiredPeriods: [period],
            },
          );
          const mappingId = await mutation(
              manager,
              "paidMetrics:mapPlacement",
              { ...scope, enrollmentId: proof },
            ),
            freshSource = (await read()).sources.find(
              (s: any) => s.account === "owned-meta-freshness",
            );
          const coverage = async () =>
            (await read()).inputs[0].entries[0].coverage.find(
              (c: any) =>
                c.mappingId === mappingId && c.metric === "impressions",
            );
          const perform = async (mode = "normal") => {
            await configure();
            backend.paidProvider.mode(mode);
            return backend.paidService.perform(backend.token("manager-a"), {
              ...scope,
              sourceId: freshSource._id,
              periodId,
              operationId: randomUUID(),
            });
          };
          assert.equal((await perform()).state, "success");
          let c = await coverage();
          assert.equal(c.complete, true);
          assert.equal(c.latestDataAsOf, now);
          assert.equal(c.reportingDelayMs, 0);
          const old = { coverageId: c.coverageId, operationId: c.operationId },
            asOf = now;
          const raw = () =>
            backend.runOwnedInternal("fixtures:paidControl", {
              ...scope,
              coverageId: old.coverageId,
            });
          const rawBefore = await raw();
          assert.equal(rawBefore.complete, true);
          now = asOf + 900000;
          await control();
          await backend.restart();
          assert.deepEqual(
            await backend.runOwnedInternal("paidMetrics:expireCoverage", old),
            { expired: false },
          );
          assert.equal((await coverage()).complete, true);
          now++;
          await control();
          assert.deepEqual(
            await backend.runOwnedInternal("paidMetrics:expireCoverage", old),
            { expired: true },
          );
          c = await coverage();
          assert.equal(c.complete, false);
          assert.equal(
            c.reason,
            "Source evidence stale; controlled freshness budget expired",
          );
          const rawExpired = await raw();
          assert.equal(rawExpired.complete, false);
          assert.equal(rawExpired.reason, c.reason);
          assert.equal(rawExpired.operationId, old.operationId);
          await backend.restart();
          const rawAfterRestart = await raw();
          assert.deepEqual(rawAfterRestart, rawExpired);
          assert.deepEqual(
            await backend.runOwnedInternal("paidMetrics:expireCoverage", old),
            { superseded: true },
          );
          const expiryAudits = (await read()).audit.filter(
            (a: any) =>
              a.action === "coverage-expired" && a.reference === old.coverageId,
          );
          assert.equal(expiryAudits.length, 1);
          assert.equal((await perform()).state, "success");
          c = await coverage();
          assert.equal(c.complete, true);
          assert.deepEqual(
            await backend.runOwnedInternal("paidMetrics:expireCoverage", old),
            { superseded: true },
          );
          assert.equal((await coverage()).complete, true);
          const rawFresh = await raw();
          assert.equal(rawFresh.complete, true);
          assert.notEqual(rawFresh.operationId, old.operationId);
          durabilityEvidence.expiry = {
            rawBefore,
            rawExpired,
            rawAfterRestart,
            rawFresh,
            expiryAudits,
          };
          const value = c.value,
            accepted = c.dataAsOf;
          now += 31000;
          await control();
          assert.equal((await perform("unknown-time")).state, "success");
          c = await coverage();
          assert.equal(c.value, value);
          assert.equal(c.dataAsOf, accepted);
          assert.equal(c.latestDataAsOf, null);
          assert.equal(c.reportingDelayMs, null);
          assert.equal(c.complete, false);
          assert.match(c.reason, /unknown/);
          now += 31000;
          await control();
          assert.equal((await perform("wrong-report")).state, "failed");
          c = await coverage();
          assert.equal(c.value, value);
          assert.equal(c.latestDataAsOf, null);
          assert.equal(c.reportingDelayMs, null);
          assert.match(
            (await read()).sources.find((s: any) => s._id === freshSource._id)
              .statusReason,
            /Latest import failed/,
          );
        },
      );
      await mkdir(".codex/ralph", { recursive: true });
      await writeFile(
        ".codex/ralph/t12-backend-evidence.json",
        JSON.stringify(
          {
            story: "T12",
            backendVersion: await backend.backendVersion(),
            results,
            durabilityEvidence,
            productionEligible: false,
            remainingGate:
              "#12 actual advertiser/app/grant/measurement/Chicago attribution/completeness evidence",
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

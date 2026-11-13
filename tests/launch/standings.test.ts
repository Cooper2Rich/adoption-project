import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import {
  competitionPeriod,
  competitionPeriods,
  competitionScore,
  rankCompetition,
} from "../../convex/competitionPolicy.ts";
import { attribution } from "../../convex/fundraisingPolicy.ts";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { servePhotoRequest } from "../../api/photos.ts";
import { donationRules, fundraisingEntry } from "./fundraising-fixtures.ts";
import { mutation, query } from "./public-fixtures.ts";
import {
  certify,
  donate,
  emptyFundraising,
  standingsDay as day,
} from "./standings-fixtures.ts";

test("T14 capped square root score, unrounded ranking, ordered tie breaks and exact stable prize cents", () => {
  const targets = {
    impressions: 100,
    totalClicks: 100,
    fundraisingCents: 10000,
  };
  assert.equal(
    competitionScore(
      { impressions: 25, linkClicks: 36, fundraisingCents: 6400 },
      targets,
    ),
    62,
  );
  assert.equal(
    competitionScore(
      { impressions: 1000, linkClicks: 1000, fundraisingCents: 100000 },
      targets,
    ),
    100,
  );
  for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() =>
      competitionScore(
        { impressions: value, linkClicks: 1, fundraisingCents: 1 },
        targets,
      ),
    );
  assert.throws(() =>
    competitionScore(
      { impressions: 0, linkClicks: 0, fundraisingCents: 0 },
      { ...targets, totalClicks: 0 },
    ),
  );
  const row = {
    entryId: "b",
    createdAt: 1,
    impressions: 100,
    linkClicks: 100,
    fundraisingCents: 10000,
  };
  const ties = rankCompetition(
    [row, { ...row, entryId: "c", createdAt: 2 }, { ...row, entryId: "a" }],
    targets,
    10001,
  );
  assert.deepEqual(
    ties.map((r) => [r.entryId, r.rank, r.proposedPrizeCents]),
    [
      ["a", 1, 3334],
      ["b", 1, 3334],
      ["c", 1, 3333],
    ],
  );
  assert.equal(
    ties.reduce((s, r) => s + r.proposedPrizeCents, 0),
    10001,
  );
  assert.deepEqual(
    rankCompetition([row, { ...row, entryId: "a" }], targets, 1).map(
      (r) => r.proposedPrizeCents,
    ),
    [1, 0],
  );
  const clicks = rankCompetition(
    [
      row,
      { ...row, entryId: "clicks", linkClicks: 101 },
      { ...row, entryId: "funds", fundraisingCents: 10001 },
      { ...row, entryId: "impressions", impressions: 101 },
    ],
    targets,
    100,
  );
  assert.deepEqual(
    clicks.map((r) => r.entryId),
    ["clicks", "funds", "impressions", "b"],
  );
  const huge = {
    impressions: 100000000,
    totalClicks: 100,
    fundraisingCents: 10000,
  };
  const near = rankCompetition(
    [
      { ...row, entryId: "first", impressions: 25000000 },
      { ...row, entryId: "second", impressions: 25000001 },
    ],
    huge,
    10,
  );
  assert.equal(near[0].score.toFixed(2), near[1].score.toFixed(2));
  assert.deepEqual(
    near.map((r) => [r.entryId, r.rank]),
    [
      ["second", 1],
      ["first", 2],
    ],
  );
});
test("T14 actual Chicago DST days, Monday weeks, half-open attribution and partial-period commission", () => {
  const spring = competitionPeriod("daily", Date.parse("2026-03-08T12:00:00Z")),
    fall = competitionPeriod("daily", Date.parse("2026-11-01T12:00:00Z"));
  assert.equal(spring.end - spring.start, 23 * 3600000);
  assert.equal(fall.end - fall.start, 25 * 3600000);
  assert.equal(
    competitionPeriod("weekly", spring.start).end -
      competitionPeriod("weekly", spring.start).start,
    167 * 3600000,
  );
  assert.equal(
    competitionPeriod("weekly", fall.start).end -
      competitionPeriod("weekly", fall.start).start,
    169 * 3600000,
  );
  assert.equal(competitionPeriod("daily", spring.end - 1).label, "2026-03-08");
  assert.equal(competitionPeriod("daily", spring.end).label, "2026-03-09");
  assert.equal(competitionPeriod("weekly", spring.end - 1).label, "2026-03-02");
  assert.equal(competitionPeriod("weekly", spring.end).label, "2026-03-09");
  const rules = {
    ...donationRules,
    campaignStart: "2026-03-08T12:00:00.000Z",
    campaignEnd: "2026-03-17T12:00:00.000Z",
  };
  assert.equal(competitionPeriods(rules, "daily")[0].prizeEligible, false);
  assert.equal(competitionPeriods(rules, "daily").at(-1)!.prizeEligible, false);
  assert.equal(
    competitionPeriods(rules, "weekly").filter((p) => p.prizeEligible).length,
    1,
  );
  const earning = attribution(
    rules,
    Date.parse(rules.campaignStart),
    Date.parse(rules.earningStart),
  );
  assert.equal(earning.eligible, true);
  assert.equal(earning.dailyPeriod, null);
  assert.equal(earning.weeklyPeriod, null);
});
test(
  "T14 actual Convex public stored standings use shared authority, retain delayed results, audit and survive restart",
  { timeout: 360000 },
  async (t) => {
    const backend = await createLocalBackend(),
      server = createServer(
        (req, res) =>
          void servePhotoRequest(
            req.url?.startsWith("/api/fundraising")
              ? backend.fundraisingService
              : req.url?.startsWith("/api/paid-metrics")
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
      guest = backend.client(),
      scope = { campaignId: "adoption" },
      selection = { kind: "daily", period: "2026-02-01" };
    const refresh = (extra: any = {}) =>
        mutation(manager, "standings:refresh", {
          ...scope,
          ...selection,
          operationId: randomUUID(),
          ...extra,
        }),
      read = () => query(guest, "standings:read", selection);
    const results: string[] = [];
    let first: any, second: any, sid: string;
    const check = async (name: string, fn: () => Promise<void>) => {
      await t.test(name, fn);
      results.push(name);
    };
    try {
      const partialRules = {
        ...donationRules,
        campaignStart: "2026-01-05T12:00:00.000Z",
        campaignEnd: "2026-11-08T12:00:00.000Z",
      };
      await mutation(manager, "campaignSetup:create", {
        ...scope,
        operationId: randomUUID(),
        rules: partialRules,
      });
      await backend.runOwnedInternal("fixtures:terms", {
        campaignSlug: "adoption",
        synthetic: true,
      });
      first = await fundraisingEntry(backend, base, "standings");
      await check(
        "account-free first result stays held; manager and public cannot supply metrics or completeness",
        async () => {
          const result = await read();
          assert.equal(result.updatedAt, null);
          assert.deepEqual(result.rows, []);
          assert.equal(result.delayed, true);
          assert.equal((await refresh()).outcome, "held");
          for (const identity of [
            undefined,
            "creator-a",
            "manager-b",
            "administrator",
          ])
            await assert.rejects(
              mutation(backend.client(identity), "standings:refresh", {
                ...scope,
                ...selection,
                operationId: randomUUID(),
              }),
              /FORBIDDEN/,
            );
          await assert.rejects(
            mutation(manager, "standings:refresh", {
              ...scope,
              ...selection,
              operationId: randomUUID(),
              complete: true,
              impressions: 100,
            }),
            /unexpected|extra|validator/i,
          );
          await assert.rejects(
            query(guest, "standings:read", {
              ...selection,
              period: "2026-02-30",
            }),
            /STANDINGS_PERIOD/,
          );
          await assert.rejects(
            query(guest, "standings:history", scope),
            /FORBIDDEN/,
          );
          await assert.rejects(
            emptyFundraising(backend, first._id, "daily", "2026-02-01", {
              start: day.start + 1,
              end: day.end,
            }),
            /Owned zero exact period scope/,
          );
          await assert.rejects(
            emptyFundraising(backend, first._id, "weekly", "2026-02-01", day),
            /Owned zero exact period scope/,
          );
        },
      );
      await check(
        "partial opening period has no proposed prize and confirmed partial-period fundraising still earns commission",
        async () => {
          const partial = {
            start: Date.parse(partialRules.campaignStart),
            end: Date.parse("2026-01-06T06:00:00Z"),
          };
          await certify(backend, first._id, "impressions", 25, partial);
          await certify(backend, first._id, "linkClicks", 36, partial);
          await emptyFundraising(
            backend,
            first._id,
            "daily",
            "2026-01-05",
            partial,
          );
          assert.equal(
            (await refresh({ period: "2026-01-05" })).outcome,
            "stored",
          );
          const result = await query(guest, "standings:read", {
            kind: "daily",
            period: "2026-01-05",
          });
          assert.equal(result.period.prizeEligible, false);
          assert.equal(result.fixedPrizeCents, 0);
          assert.equal(result.rows[0].proposedPrizeCents, 0);
          await donate(backend, base, first._id, 55, partial.start);
          const donation = (
            await query(manager, "fundraising:ledger", {
              ...scope,
              audience: "manager",
            })
          )[0];
          assert.equal(donation.eligible, true);
          assert.equal(donation.commissionCents, 6);
          assert.equal(donation.dailyPeriod, null);
          assert.equal(donation.weeklyPeriod, null);
          assert.equal(
            (await refresh({ period: "2026-01-05" })).outcome,
            "held",
          );
        },
      );
      await check(
        "paid HTTP import and confirmed donation feed the same provisional score with sanitized separate freshness",
        async () => {
          let now = Date.now() - 3600000;
          await backend.runOwnedInternal("fixtures:paidControl", {
            ...scope,
            now,
          });
          const proof = await backend.runOwnedInternal(
            "fixtures:paidEnrollment",
            {
              ...scope,
              entryId: first._id,
              provider: "meta",
              platform: "facebook",
              account: "owned-standings-account",
              adId: "owned-standings-ad",
              requiredPeriods: [day],
            },
          );
          await mutation(manager, "paidMetrics:mapPlacement", {
            ...scope,
            enrollmentId: proof,
          });
          const paid = await query(manager, "paidMetrics:read", scope),
            source = paid.sources[0];
          now = Math.max(now + 31000, source.nextAt + 1);
          await backend.runOwnedInternal("fixtures:paidControl", {
            ...scope,
            now,
          });
          backend.paidProvider.configure({
            mappings: paid.mappings.map((m: any) => ({
              ...m,
              proof: paid.enrollments.find(
                (p: any) => p._id === m.enrollmentId,
              ),
            })),
            period: day,
            revision: 1,
            dataAsOf: now - 1000,
            values: { facebook: { impressions: 25, linkClicks: 36 } },
          });
          const imported = await fetch(
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
                periodId: paid.inputs.find(
                  (p: any) => p.period.start === day.start,
                ).period._id,
                operationId: randomUUID(),
              }),
            },
          );
          assert.equal(imported.status, 200, await imported.clone().text());
          assert.equal((await refresh()).outcome, "held"); // Missing fundraising is not zero.
          await emptyFundraising(backend, first._id);
          assert.equal((await refresh()).outcome, "stored");
          assert.equal((await read()).rows[0].fundraisingCents, 0);
          sid = await donate(backend, base, first._id, 6400, day.start);
          assert.equal((await read()).delayed, true);
          assert.equal((await refresh()).outcome, "stored");
          const result = await read();
          assert.equal(result.delayed, false);
          assert.equal(result.status, "provisional");
          assert.equal(result.rows[0].fundraisingCents, 6400);
          assert.equal(
            result.rows[0].score,
            competitionScore(
              { impressions: 25, linkClicks: 36, fundraisingCents: 6400 },
              donationRules.dailyTargets,
            ),
          );
          assert.ok(result.freshness.lastSuccessfulImport);
          assert.equal(result.freshness.dataAsOf, now - 1000);
          assert.equal(result.freshness.reportingDelayMs, 1000);
          const text = JSON.stringify(result);
          for (const secret of [
            "owned-standings-account",
            "owned-standings-ad",
            "paymentId",
            "donationIds",
            "commissionCents",
            "acct_owned",
            "inputFingerprint",
            "manager-a",
          ])
            assert.equal(text.includes(secret), false, secret);
        },
      );
      await check(
        "one missing second ad holds the whole previous result, while two ads by one creator compete independently",
        async () => {
          const source = await query(
            backend.client("public-creator"),
            "photos:entry",
            { ...scope, entryId: first._id },
          );
          second = await mutation(
            backend.client("public-creator"),
            "photos:submit",
            {
              ...scope,
              operationId: randomUUID(),
              title: "Second independent ad",
              description: "Another approved ad",
              publicCreatorName: "River Studio",
              photos: source.versions[0].photos,
            },
          );
          await mutation(manager, "photos:review", {
            ...scope,
            entryId: second._id,
            expectedVersion: 1,
            operationId: randomUUID(),
            decision: "approved",
            reason: "",
          });
          await backend.runOwnedInternal("fixtures:fundraisingControl", {
            entryId: second._id,
            approvedAt: day.start,
          });
          const before = await read();
          assert.equal(before.rows.length, 1);
          assert.equal(before.delayed, true);
          assert.equal((await refresh()).outcome, "held");
          await certify(backend, second._id, "impressions", 25);
          await certify(backend, second._id, "linkClicks", 36);
          await donate(backend, base, second._id, 6400, day.start);
          const op = randomUUID(),
            [a, b] = await Promise.all([
              refresh({ operationId: op }),
              refresh({ operationId: op }),
            ]);
          assert.equal(a._id, b._id);
          assert.equal(a.outcome, "stored");
          await assert.rejects(
            refresh({ operationId: op, period: "2026-02-02" }),
            /STANDINGS_RETRY_CONFLICT/,
          );
          const result = await read();
          assert.deepEqual(
            result.rows.map((r: any) => r.rank),
            [1, 1],
          );
          assert.equal(
            result.rows.reduce(
              (s: number, r: any) => s + r.proposedPrizeCents,
              0,
            ),
            donationRules.dailyPrizeCents,
          );
          assert.equal(new Set(result.rows.map((r: any) => r.creator)).size, 1);
          const history = await query(manager, "standings:history", scope);
          assert.equal(
            history.filter((r: any) => r.operationId === op).length,
            1,
          );
          assert.equal(history.at(-1).actor, "manager-a");
          assert.equal(history.at(-1).version, 1);
          assert.match(history.at(-1).inputFingerprint, /^[a-f0-9]{64}$/);
          await backend.restart();
          assert.deepEqual((await read()).rows, result.rows);
          assert.equal((await refresh({ operationId: op }))._id, a._id);
        },
      );
      await check(
        "refund correction changes dollars once and uncertain refund read retains the last-known whole table",
        async () => {
          const event = backend.stripe.refund(sid, 100, "succeeded"),
            r = await backend.stripe.deliver(
              event,
              base + "/api/fundraising?action=webhook",
            );
          assert.equal(r.status, 200, await r.clone().text());
          assert.equal((await read()).delayed, true);
          await refresh();
          let result = await read();
          assert.equal(
            result.rows.find((r: any) => r.entryId === first._id)
              .fundraisingCents,
            6300,
          );
          assert.equal(result.rows[0].entryId, second._id);
          const retained = result.rows;
          backend.stripe.mutateRefund(event.data.object.id, {
            status: "failed",
          });
          const held = await backend.stripe.deliver(
            backend.stripe.refundEvent(sid, event.data.object.id),
            base + "/api/fundraising?action=webhook",
          );
          assert.equal(held.status, 200);
          assert.equal((await refresh()).outcome, "held");
          result = await read();
          assert.equal(result.delayed, true);
          assert.deepEqual(result.rows, retained);
          backend.stripe.mutateRefund(event.data.object.id, {
            status: "succeeded",
          });
          await backend.stripe.deliver(
            backend.stripe.refundEvent(sid, event.data.object.id),
            base + "/api/fundraising?action=webhook",
          );
          await refresh();
          assert.equal((await read()).delayed, false);
        },
      );
      await check(
        "stale imported evidence retains results; exact subday certification cannot falsely complete a full day",
        async () => {
          const before = await read(),
            paid = await query(manager, "paidMetrics:read", scope);
          await backend.runOwnedInternal("fixtures:paidControl", {
            ...scope,
            now: paid.sources[0].lastSuccess + 900001,
          });
          assert.equal((await refresh()).outcome, "held");
          assert.deepEqual((await read()).rows, before.rows);
          const correction = await certify(
            backend,
            first._id,
            "impressions",
            1,
            { start: day.start + 1, end: day.end - 1 },
          );
          assert.ok(correction);
          assert.equal((await refresh()).outcome, "held");
          assert.equal((await read()).delayed, true);
        },
      );
      await check(
        "weekly targets and another daily period allow the same entry to win repeatedly without deduplication",
        async () => {
          const releaseAll = async () => {
            const state = await query(manager, "paidMetrics:read", scope);
            for (const c of state.correctionState.corrections.filter(
              (c: any) => c.active,
            ))
              await mutation(manager, "paidCorrections:release", {
                ...scope,
                correctionId: c._id,
                reason: "Reviewed next exact period",
                expectedRevision: (
                  await query(manager, "paidMetrics:read", scope)
                ).correctionState.revision,
                operationId: randomUUID(),
              });
          };
          await releaseAll();
          const week = {
            start: Date.parse("2026-01-26T06:00:00Z"),
            end: day.end,
          };
          for (const entry of [first, second]) {
            await certify(backend, entry._id, "impressions", 250, week);
            await certify(
              backend,
              entry._id,
              "linkClicks",
              entry._id === second._id ? 360 : 200,
              week,
            );
          }
          assert.equal(
            (await refresh({ kind: "weekly", period: "2026-01-26" })).outcome,
            "stored",
          );
          const weekly = await query(guest, "standings:read", {
            kind: "weekly",
            period: "2026-01-26",
          });
          assert.equal(weekly.delayed, false);
          assert.equal(weekly.rows[0].entryId, second._id);
          assert.equal(
            weekly.rows[0].score,
            competitionScore(
              { impressions: 250, linkClicks: 360, fundraisingCents: 6400 },
              donationRules.weeklyTargets,
            ),
          );
          assert.equal(
            weekly.rows[0].proposedPrizeCents,
            donationRules.weeklyPrizeCents,
          );
          await releaseAll();
          const next = { start: day.end, end: day.end + 86400000 };
          for (const entry of [first, second]) {
            await certify(
              backend,
              entry._id,
              "impressions",
              entry._id === second._id ? 100 : 25,
              next,
            );
            await certify(
              backend,
              entry._id,
              "linkClicks",
              entry._id === second._id ? 50 : 36,
              next,
            );
            await emptyFundraising(
              backend,
              entry._id,
              "daily",
              "2026-02-02",
              next,
            );
          }
          await refresh({ period: "2026-02-02" });
          const nextDay = await query(guest, "standings:read", {
            kind: "daily",
            period: "2026-02-02",
          });
          assert.equal(nextDay.delayed, false);
          assert.equal(nextDay.rows[0].entryId, second._id);
          assert.equal(
            nextDay.rows[0].proposedPrizeCents,
            donationRules.dailyPrizeCents,
          );
          assert.equal((await read()).rows[0].entryId, second._id);
        },
      );
      await check(
        "current visibility hides historical withdrawn ad without exposing its title or reranking survivors; revoked manager is denied",
        async () => {
          await backend.runOwnedInternal("fixtures:fundraisingControl", {
            entryId: second._id,
            cutoff: Date.now() - 1,
          });
          const result = await read();
          assert.equal(result.delayed, true);
          assert.equal(
            JSON.stringify(result).includes("Second independent ad"),
            false,
          );
          assert.equal((await refresh()).outcome, "held");
          await backend.runOwnedInternal("fixtures:paidControl", {
            ...scope,
            subject: "manager-a",
            active: false,
          });
          await assert.rejects(refresh(), /FORBIDDEN/);
          await assert.rejects(
            query(manager, "standings:history", scope),
            /FORBIDDEN/,
          );
          assert.ok(await read());
        },
      );
      await mkdir(".codex/ralph/t14", { recursive: true });
      await writeFile(
        ".codex/ralph/t14/backend-evidence.json",
        JSON.stringify(
          {
            story: "T14",
            results,
            final: await read(),
            synthetic: true,
            productionEligible: false,
          },
          null,
          2,
        ) + "\n",
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      await backend.stop();
    }
  },
);

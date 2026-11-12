import test from "node:test";
import assert from "node:assert/strict";
import { createLocalBackend } from "../../scripts/launch/local-backend.mjs";
import { clerkProviders } from "../../convex/clerkIdentity.ts";
import { chicagoInstant } from "../../src/launch/campaign-dates.ts";

const rules = {
  currency: "USD",
  timezone: "America/Chicago",
  campaignStart: "2026-12-01T06:00:00.000Z",
  campaignEnd: "2027-03-01T06:00:00.000Z",
  earningStart: "2026-11-01T05:00:00.000Z",
  earningEnd: "2027-04-01T05:00:00.000Z",
  commissionBasisPoints: 1000,
  dailyTargets: { impressions: 100, totalClicks: 50, fundraisingCents: 10000 },
  weeklyTargets: {
    impressions: 1000,
    totalClicks: 500,
    fundraisingCents: 100000,
  },
  dailyPrizeCents: 10000,
  weeklyPrizeCents: 50000,
  dailyPrizeTime: "23:59",
  weeklyPrizeSchedule: { weekday: 0, time: "23:59" },
  weeklyReplenishmentCents: 100000,
  weeklyReplenishmentSchedule: { weekday: 1, time: "09:00" },
  creatorPaymentSchedule: { weekday: 5, time: "14:00" },
};

test("T01 production identity configuration fails closed for fixture and malformed issuers", () => {
  for (const issuer of [
    undefined,
    "",
    "http://clerk.company.com",
    "https://allocation-preview.invalid/run",
    "https://allocation-preview.invalid",
    "https://127.0.0.1",
    "https://localhost",
    "https://clerk.company.com/path",
    "https://user@clerk.company.com",
    "https://clerk.company.com?test=1",
  ])
    assert.deepEqual(clerkProviders(issuer), []);
  assert.deepEqual(clerkProviders("https://clerk.adoption.is"), [
    { domain: "https://clerk.adoption.is", applicationID: "convex" },
  ]);
});

test("T01 Chicago campaign instants preserve DST and reject ambiguous or nonexistent boundaries", () => {
  assert.equal(chicagoInstant("2026-12-01T00:00"), "2026-12-01T06:00:00.000Z");
  assert.equal(chicagoInstant("2026-07-01T00:00"), "2026-07-01T05:00:00.000Z");
  assert.throws(() => chicagoInstant("2026-03-08T02:30"), /unambiguous/);
  assert.throws(() => chicagoInstant("2026-11-01T01:30"), /unambiguous/);
  assert.throws(() => chicagoInstant("2026-02-30T12:00"), /unambiguous/);
});

test(
  "T01 actual Convex locked campaign setup",
  { timeout: 240000 },
  async (t) => {
    const backend = await createLocalBackend();
    const request = {
      campaignId: "adoption",
      operationId: "campaign-creation",
      rules,
    };
    try {
      const manager = backend.client("manager-a");
      const otherManager = backend.client("manager-b");
      await t.test(
        "AC02/03 invalid or incomplete creation leaves no settings or audit",
        async () => {
          const invalid = [
            { currency: "EUR" },
            { timezone: "UTC" },
            { campaignStart: "2026-02-30T06:00:00.000Z" },
            { campaignEnd: rules.campaignStart },
            { earningEnd: rules.earningStart },
            {
              earningStart: "2027-02-28T06:00:00.000Z",
              earningEnd: "2026-12-01T06:00:00.000Z",
            },
            { commissionBasisPoints: -1 },
            { commissionBasisPoints: 10001 },
            { commissionBasisPoints: 0.1 },
            { dailyTargets: { ...rules.dailyTargets, impressions: 0 } },
            { weeklyTargets: { ...rules.weeklyTargets, totalClicks: -1 } },
            {
              dailyTargets: {
                ...rules.dailyTargets,
                fundraisingCents: Infinity,
              },
            },
            ...["dailyTargets", "weeklyTargets"].flatMap((period) =>
              ["impressions", "totalClicks", "fundraisingCents"].flatMap(
                (metric) =>
                  [0, -1, 0.1, Number.MAX_SAFE_INTEGER + 1].map((value) => ({
                    [period]: { ...rules[period], [metric]: value },
                  })),
              ),
            ),
            { dailyPrizeCents: -1 },
            { weeklyPrizeCents: 0.5 },
            { weeklyReplenishmentCents: Number.MAX_SAFE_INTEGER + 1 },
            { dailyPrizeTime: "24:00" },
            { weeklyPrizeSchedule: { weekday: 7, time: "12:00" } },
            { weeklyReplenishmentSchedule: { weekday: 1, time: "25:01" } },
            { creatorPaymentSchedule: { weekday: -1, time: "12:00" } },
          ];
          for (const change of invalid)
            await assert.rejects(
              manager.mutation("campaignSetup:create", {
                ...request,
                rules: { ...rules, ...change },
              }),
            );
          const { weeklyPrizeCents: omitted, ...incomplete } = rules;
          void omitted;
          await assert.rejects(
            manager.mutation("campaignSetup:create", {
              ...request,
              rules: incomplete,
            }),
          );
          assert.equal(
            (
              await manager.query("campaignSetup:workspace", {
                campaignId: "adoption",
              })
            ).settings,
            null,
          );
          assert.deepEqual(
            await manager.query("campaignSetup:audit", {
              campaignId: "adoption",
            }),
            [],
          );
        },
      );
      let saved;
      await t.test(
        "AC02/03 concurrent exact retries create one complete locked rules record",
        async () => {
          const [first, second] = await Promise.all([
            manager.mutation("campaignSetup:create", request),
            backend
              .client("manager-a")
              .mutation("campaignSetup:create", request),
          ]);
          saved = first;
          assert.equal(first._id, second._id);
          assert.deepEqual(first.rules, rules);
          assert.deepEqual(first.batchPreparation, {
            weekday: 3,
            time: "12:00",
            timezone: "America/Chicago",
          });
          assert.equal(first.nonprofitId, "nonprofit-a");
          assert.equal(first.version, 1);
          assert.equal(first.acceptedTermsVersion, "campaign-rules-v1");
          const workspace = await manager.query("campaignSetup:workspace", {
            campaignId: "adoption",
          });
          assert.equal(workspace.name, "adoption.is");
          assert.equal(workspace.isAdministrator, false);
          assert.equal(workspace.settings._id, first._id);
        },
      );
      await t.test(
        "AC02 every rule remains immutable immediately, including changed operation retries",
        async () => {
          const changes = Object.entries(rules).flatMap(([key, value]) =>
            typeof value === "object"
              ? Object.entries(value).map(([field, leaf]) => ({
                  [key]: {
                    ...value,
                    [field]: typeof leaf === "number" ? leaf + 1 : "13:00",
                  },
                }))
              : [
                  {
                    [key]:
                      typeof value === "number"
                        ? value + 1
                        : key === "currency"
                          ? "EUR"
                          : key === "timezone"
                            ? "UTC"
                            : key === "dailyPrizeTime"
                              ? "22:00"
                              : new Date(
                                  Date.parse(value) + 60000,
                                ).toISOString(),
                  },
                ],
          );
          for (const change of changes) {
            const changed = { ...rules, ...change };
            await assert.rejects(
              manager.mutation("campaignSetup:update", {
                campaignId: "adoption",
                rules: changed,
              }),
            );
            await assert.rejects(
              manager.mutation("campaignSetup:create", {
                ...request,
                rules: changed,
              }),
            );
            assert.deepEqual(
              (
                await manager.query("campaignSetup:workspace", {
                  campaignId: "adoption",
                })
              ).settings.rules,
              rules,
            );
          }
          await assert.rejects(
            manager.mutation("campaignSetup:create", {
              ...request,
              rules: {
                ...rules,
                dailyTargets: { ...rules.dailyTargets, impressions: 101 },
              },
            }),
            /OPERATION_CONFLICT/,
          );
          await assert.rejects(
            manager.mutation("campaignSetup:create", {
              ...request,
              operationId: "another-creation",
            }),
            /RULES_LOCKED/,
          );
          await assert.rejects(
            manager.mutation("campaignSetup:update", {
              campaignId: "adoption",
              rules,
            }),
            /RULES_LOCKED/,
          );
        },
      );
      await t.test(
        "AC02 exact numeric boundaries allow zero commission/prizes and complete positive targets",
        async () => {
          for (const [campaignId, commissionBasisPoints] of [
            ["slot-control", 0],
            ["fund-control", 10000],
          ]) {
            const boundary = {
              ...rules,
              commissionBasisPoints,
              dailyPrizeCents: 0,
              weeklyPrizeCents: 0,
              weeklyReplenishmentCents: Number.MAX_SAFE_INTEGER,
              dailyTargets: {
                impressions: 1,
                totalClicks: 1,
                fundraisingCents: 1,
              },
            };
            const record = await manager.mutation("campaignSetup:create", {
              campaignId,
              operationId: "boundary",
              rules: boundary,
            });
            assert.deepEqual(record.rules, boundary);
          }
        },
      );
      await t.test(
        "AC04 guest creator wrong-nonprofit and role claims cannot read write or retry",
        async () => {
          for (const client of [
            backend.client(),
            backend.client("creator-adoption"),
            otherManager,
            backend.client("creator-adoption", {
              role: "manager",
              nonprofitId: "nonprofit-a",
              isAdministrator: true,
            }),
          ]) {
            for (const operation of [
              "campaignSetup:workspace",
              "campaignSetup:audit",
              "campaignSetup:administratorAuthority",
            ])
              await assert.rejects(
                client.query(operation, { campaignId: "adoption" }),
                /FORBIDDEN/,
              );
            await assert.rejects(
              client.mutation("campaignSetup:create", request),
              /FORBIDDEN/,
            );
            await assert.rejects(
              client.mutation("campaignSetup:create", {
                ...request,
                operationId: "denied-new",
              }),
              /FORBIDDEN/,
            );
            await assert.rejects(
              client.mutation("campaignSetup:update", {
                campaignId: "adoption",
                rules,
              }),
              /FORBIDDEN/,
            );
          }
          await assert.rejects(
            manager.query("campaignSetup:administratorAuthority", {
              campaignId: "adoption",
            }),
            /FORBIDDEN/,
          );
          assert.deepEqual(
            await backend
              .client("administrator")
              .query("campaignSetup:administratorAuthority", {
                campaignId: "adoption",
              }),
            { authorized: true },
          );
        },
      );
      await t.test(
        "AC03/04 different concurrent operations cannot conflict and a second nonprofit stays isolated",
        async () => {
          const contenders = await Promise.allSettled([
            otherManager.mutation("campaignSetup:create", {
              ...request,
              campaignId: "other",
              operationId: "other-a",
            }),
            otherManager.mutation("campaignSetup:create", {
              ...request,
              campaignId: "other",
              operationId: "other-b",
              rules: { ...rules, commissionBasisPoints: 0, dailyPrizeCents: 0 },
            }),
          ]);
          assert.equal(
            contenders.filter((row) => row.status === "fulfilled").length,
            1,
          );
          assert.match(
            String(contenders.find((row) => row.status === "rejected")?.reason),
            /RULES_LOCKED/,
          );
          await assert.rejects(
            manager.query("campaignSetup:workspace", { campaignId: "other" }),
            /FORBIDDEN/,
          );
          assert.equal(
            (
              await otherManager.query("campaignSetup:workspace", {
                campaignId: "other",
              })
            ).nonprofitId,
            "nonprofit-b",
          );
          const resourcesA = JSON.parse(
            await backend.command(
              "run",
              "fixtures:resourceIds",
              JSON.stringify({ campaignSlug: "adoption" }),
            ),
          );
          const resourcesB = JSON.parse(
            await backend.command(
              "run",
              "fixtures:resourceIds",
              JSON.stringify({ campaignSlug: "other" }),
            ),
          );
          for (const [owner, campaignId, owned, foreign] of [
            [manager, "adoption", resourcesA, resourcesB],
            [otherManager, "other", resourcesB, resourcesA],
          ]) {
            for (const resourceId of owned)
              assert.match(
                (
                  await owner.query("campaignSetup:resource", {
                    campaignId,
                    resourceId,
                  })
                ).reference,
                /unvalidated-fixture/,
              );
            for (const resourceId of foreign)
              await assert.rejects(
                owner.query("campaignSetup:resource", {
                  campaignId,
                  resourceId,
                }),
                /FORBIDDEN/,
              );
          }
        },
      );
      await t.test(
        "AC03 audit and exact response-loss retry survive separate sessions and process restart",
        async () => {
          const audit = await manager.query("campaignSetup:audit", {
            campaignId: "adoption",
          });
          assert.equal(audit.length, 1);
          assert.equal(audit[0].settingsId, saved._id);
          assert.equal(audit[0].actor, "manager-a");
          assert.equal(audit[0].source, "campaignSetup:create");
          assert.equal(audit[0].version, 1);
          assert.equal(audit[0].at, saved.createdAt);
          assert.ok(audit[0].at > 0);
          assert.doesNotMatch(
            JSON.stringify(audit),
            /token|secret|credential|nonprofit-b|manager-b/i,
          );
          assert.equal(
            (
              await backend
                .client("manager-a")
                .query("campaignSetup:workspace", { campaignId: "adoption" })
            ).settings._id,
            saved._id,
          );
          await backend.restart();
          assert.equal(
            (
              await backend
                .client("manager-a")
                .mutation("campaignSetup:create", request)
            )._id,
            saved._id,
          );
          assert.deepEqual(
            await backend
              .client("manager-a")
              .query("campaignSetup:audit", { campaignId: "adoption" }),
            audit,
          );
        },
      );
      await t.test(
        "AC01 current revocation denies reads writes and cached exact retries",
        async () => {
          await backend.command(
            "run",
            "fixtures:revoke",
            JSON.stringify({
              subject: "manager-a",
              nonprofitId: "nonprofit-a",
            }),
          );
          for (const operation of [
            "campaignSetup:workspace",
            "campaignSetup:audit",
            "campaignSetup:administratorAuthority",
          ])
            await assert.rejects(
              manager.query(operation, { campaignId: "adoption" }),
              /FORBIDDEN/,
            );
          await assert.rejects(
            manager.mutation("campaignSetup:create", request),
            /FORBIDDEN/,
          );
          await assert.rejects(
            manager.mutation("campaignSetup:create", {
              ...request,
              operationId: "revoked-new",
            }),
            /FORBIDDEN/,
          );
          await assert.rejects(
            manager.mutation("campaignSetup:update", {
              campaignId: "adoption",
              rules,
            }),
            /FORBIDDEN/,
          );
        },
      );
    } catch (err) {
      console.error(backend.diagnostics());
      throw err;
    } finally {
      await backend.stop();
    }
  },
);

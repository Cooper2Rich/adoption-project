import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { readinessComponents } from "../../convex/readinessPolicy.ts";
import { mutation, query, preparePublicCreator } from "./public-fixtures.ts";
import { pngBytes } from "./photo-fixtures.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { campaignRules } from "./fixtures.ts";

const scope = { campaignId: "adoption" };
const accounts = Object.fromEntries(
  ["stripe", "meta", "tiktok", "clerk", "blob", "mux", "email"].map((k, i) => [
    k,
    String(i + 1).repeat(64),
  ]),
);
test(
  "T09 persistent scoped launch readiness and blocked paid activation",
  { timeout: 360_000 },
  async (t) => {
    const backend = await createLocalBackend();
    const manager = backend.client("manager-a"),
      manager2 = backend.client("manager-a"),
      admin = backend.client("administrator");
    const read = (client = manager) => query(client, "readiness:read", scope);
    const evaluate = (client = manager) =>
      mutation(client, "readiness:evaluate", scope);
    const check = (extra: any = {}, client = manager) =>
      mutation(client, "readiness:checkPaidActivation", { ...scope, ...extra });
    const configure = (extra: any = {}, client = admin) =>
      mutation(client, "readiness:configureScope", {
        ...scope,
        expectedVersion: 0,
        accounts,
        selectedProviders: ["meta", "tiktok"],
        ...extra,
      });
    const incidents = () => query(manager, "operatorIncidents:list", scope);
    const incident = async (id: string) =>
      (await incidents()).find((i: any) => i.key === `readiness-${id}`);
    const emails = (value: any) => value.notices.flatMap((n: any) => n.emails);
    async function until(
      readValue: () => Promise<any>,
      predicate: (x: any) => boolean,
    ) {
      for (let n = 0; n < 100; n++) {
        const value = await readValue();
        if (predicate(value)) return value;
        await delay(50);
      }
      assert.fail("Timed out waiting for owned readiness outcome");
    }
    let revision: string,
      lastProof: any,
      firstDispatchDelayMs = -1;
    const proof = async (id: string, extra: any = {}) => {
      const current = await read(admin),
        component = current.components.find((c: any) => c.id === id);
      const value = {
        ...scope,
        nonprofitId: "nonprofit-a",
        component: id,
        revision: current.revision,
        account: component.scope.accountBinding,
        ...(component.scope.releaseTarget
          ? { releaseTarget: component.scope.releaseTarget }
          : {}),
        sequence: (component.evidence?.sequence ?? 0) + 1,
        observedAt: Date.now(),
        expiresAt: Date.now() + 120_000,
        reviewer: "administrator",
        digest: "a".repeat(64),
        outcome: "verified",
        ...extra,
      };
      lastProof = value;
      return {
        value,
        result: await backend.runOwnedInternal(
          "fixtures:readinessProof",
          value,
        ),
      };
    };
    try {
      await t.test(
        "AC01 read-only PG01–06/component projection and signed current scope denials",
        async () => {
          const initial = await read();
          assert.equal(initial.components.length, 23);
          assert.deepEqual(
            [...new Set(initial.components.map((c: any) => c.gate))],
            ["PG-01", "PG-02", "PG-03", "PG-04", "PG-05", "PG-06"],
          );
          assert.equal(initial.blockers.length, 0);
          assert.equal(initial.audit.length, 0);
          for (const c of initial.components) {
            assert.equal(c.status, "unmet");
            assert.equal(c.scope.nonprofitId, "nonprofit-a");
            assert.ok(c.reason);
            assert.ok(c.resolutionRole);
            assert.equal(c.evidence, null);
          }
          assert.equal((await read()).blockers.length, 0);
          for (const actor of [
            backend.client(),
            backend.client("creator-a"),
            backend.client("manager-b"),
          ]) {
            await assert.rejects(read(actor), /FORBIDDEN/);
            await assert.rejects(evaluate(actor), /FORBIDDEN/);
            await assert.rejects(check({}, actor), /FORBIDDEN/);
            await assert.rejects(configure({}, actor), /FORBIDDEN/);
          }
          await assert.rejects(configure({}, manager), /FORBIDDEN/);
          await assert.rejects(
            configure({
              accounts: {
                ...accounts,
                stripe: "https://arbitrary.example/approval",
              },
            }),
            /OPAQUE/,
          );
          await assert.rejects(
            mutation(admin, "readiness:recordValidatedReadiness", {
              ...scope,
              approved: true,
            }),
            /not found|Could not find|public function/i,
          );
          await assert.rejects(
            check({
              approved: true,
              balanceCents: 999999,
              researchClosed: true,
              userAssent: true,
            }),
            /extra field|validator|ArgumentValidation/i,
          );
        },
      );
      await t.test(
        "AC02 immediate persisted blockers and available recipients dispatch with missing designated contact; concurrency deduplicates",
        async () => {
          await mutation(manager, "operatorIncidents:registerContact", scope);
          const start = Date.now();
          const denied = await check();
          assert.equal(denied.paidAllowed, false);
          const detected = await read();
          assert.equal(detected.blockers.length, 23);
          assert.equal(
            detected.blockers.filter((b: any) => b.active).length,
            23,
          );
          const rows = await incidents();
          assert.equal(rows.length, 23);
          for (const row of rows) {
            assert.equal(row.status, "open");
            assert.equal(row.notices.length, 1);
            assert.equal(row.notices[0].kind, "detection");
            assert.match(
              row.notices[0].hold,
              /Designated operator|Verified operator contact/,
            );
            assert.equal(emails(row).length, 1);
          }
          await until(
            () => incident("stripe-eligibility"),
            (i) => emails(i).some((e: any) => e.attempts.length),
          );
          assert.ok(backend.email.requests.length > 0);
          firstDispatchDelayMs = backend.email.requests[0].at - start;
          assert.ok(firstDispatchDelayMs >= 0 && firstDispatchDelayMs < 5000);
          const results = await Promise.all([
            evaluate(),
            evaluate(manager2),
            check(),
            check({}, manager2),
          ]);
          assert.equal(results.length, 4);
          for (const result of results) assert.equal(result.paidAllowed, false);
          assert.equal((await incidents()).length, 23);
          for (const row of await incidents())
            assert.equal(row.notices.length, 1);
          await mutation(admin, "operatorIncidents:registerContact", scope);
          await mutation(manager, "operatorIncidents:configure", {
            ...scope,
            designatedOperator: "administrator",
          });
          await mutation(manager, "operatorIncidents:resume", scope);
          await until(
            () => incident("stripe-eligibility"),
            (i) => emails(i).length === 2,
          );
          assert.equal(
            (await incident("stripe-eligibility")).notices[0].hold,
            null,
          );
        },
      );
      await t.test(
        "AC03 configuration alone, balances and synthetic terms cannot certify approval or create spending",
        async () => {
          await configure();
          revision = (await read()).revision;
          await assert.rejects(configure(), /STALE_READINESS/);
          const first = await read();
          assert.equal(
            first.components.filter((c: any) => c.satisfied).length,
            0,
          );
          await backend.runOwnedInternal("fixtures:readinessControl", {
            ...scope,
            balanceCents: 99999999,
          });
          const funded = await read();
          assert.equal(funded.revision, revision);
          assert.equal(funded.collection.eligibility, "held");
          const result = await check({ expectedRevision: revision });
          assert.equal(result.paidAllowed, false);
          assert.equal(result.capability, "unavailable");
          assert.equal(result.collection.available, false);
          assert.match(result.denial, /Controlled/);
          const campaign = await query(manager, "reservations:state", scope);
          assert.equal(campaign.reservedSlots, 0);
          assert.equal(campaign.reservedCents, 0);
        },
      );
      await t.test(
        "AC04 unrelated paid gates preserve current creator intake, acceptance, media review and account-free waiting creative",
        async () => {
          await backend.command(
            "run",
            "fixtures:terms",
            JSON.stringify({ campaignSlug: "adoption", synthetic: true }),
          );
          const creator = backend.client("public-creator");
          await preparePublicCreator(manager, creator, "t09");
          const bytes = await pngBytes();
          const upload = await mutation(creator, "photos:reserve", {
            ...scope,
            operationId: "t09-photo",
            filename: "owned.png",
            size: bytes.length,
            type: "image/png",
          });
          for (const [action, method, body] of [
            ["local-upload", "PUT", bytes],
            ["verify", "POST", undefined],
          ] as const) {
            const response = await backend.photoService(
              new Request(
                `http://owned.invalid/api/photos?action=${action}&uploadId=${upload._id}`,
                {
                  method,
                  body,
                  headers: {
                    Authorization: `Bearer ${backend.token("public-creator")}`,
                  },
                },
              ),
            );
            assert.equal(response.status, 200, await response.clone().text());
          }
          const entry = await mutation(creator, "photos:submit", {
            ...scope,
            operationId: "t09-submit",
            title: "Waiting launch creative",
            description: "Owned prelaunch verification",
            publicCreatorName: "Owned studio",
            photos: [upload._id],
          });
          await mutation(manager, "photos:review", {
            ...scope,
            entryId: entry._id,
            expectedVersion: entry.version,
            operationId: "t09-review",
            decision: "approved",
            reason: "",
          });
          const publicEntry = await query(
            backend.client(),
            "publicViewer:entry",
            { entryId: entry._id },
          );
          assert.equal(publicEntry.title, "Waiting launch creative");
          const waiting = await query(
            backend.client(),
            "publicViewer:fundraising",
            { entryId: entry._id },
          );
          assert.ok(waiting);
          assert.equal((await check()).paidAllowed, false);
          revision = (await read()).revision;
        },
      );
      await t.test(
        "scoped reviewed evidence rejects stale/reordered/expired/wrong account/nonprofit/validator and preserves immutable history",
        async () => {
          const { value } = await proof("stripe-eligibility");
          assert.equal(
            (await read()).components.find(
              (c: any) => c.id === "stripe-eligibility",
            ).status,
            "unvalidated",
          );
          assert.deepEqual(
            await backend.runOwnedInternal("fixtures:readinessProof", value),
            { accepted: false, duplicate: true },
          );
          for (const [change, pattern] of [
            [{ nonprofitId: "nonprofit-b" }, /SCOPE/],
            [{ account: "b".repeat(64) }, /MISMATCH/],
            [{ revision: "old" }, /MISMATCH/],
            [{ sequence: 0 }, /INVALID/],
            [{ sequence: 1, digest: "b".repeat(64) }, /STALE_OR_REORDERED/],
            [
              { sequence: 2, observedAt: value.observedAt - 1 },
              /STALE_OR_REORDERED/,
            ],
            [{ expiresAt: Date.now() - 1 }, /INVALID/],
            [{ reviewer: "manager-b" }, /AUTHORITY/],
            [{ reviewer: "manager-a" }, /AUTHORITY/],
            [{ sourceOverride: "research-closed" }, /VALIDATOR/],
            [{ syntheticOverride: false }, /SCOPE/],
            [{ digest: "https://not-evidence.example/" }, /INVALID/],
          ] as const)
            await assert.rejects(
              backend.runOwnedInternal("fixtures:readinessProof", {
                ...value,
                ...change,
              }),
              pattern,
            );
          const before = await read();
          assert.equal(
            before.components.find((c: any) => c.id === "stripe-eligibility")
              .evidence.sequence,
            1,
          );
          const i = await incident("stripe-eligibility");
          assert.equal(i.status, "resolved");
          assert.equal(
            i.notices.filter((n: any) => n.kind === "recovery").length,
            1,
          );
          await evaluate();
          assert.equal(
            (await incident("stripe-eligibility")).notices.length,
            2,
          );
          assert.ok(
            before.audit.some(
              (e: any) =>
                e.source === "owned-readiness-validator" &&
                e.actor === "controlled-readiness-observer" &&
                e.version === 1 &&
                e.at,
            ),
          );
        },
      );
      await t.test(
        "explicit locked zero prize obligations require trusted proof; unknown, positive mismatch and zero full-run stay held",
        async () => {
          await backend.runOwnedInternal(
            "fixtures:readinessZeroPrizeCampaign",
            {},
          );
          const zeroScope = { campaignId: "zero-prize-readiness" };
          const zeroRead = () => query(admin, "readiness:read", zeroScope);
          await configure({ ...zeroScope });
          async function zeroProof(extra: any = {}) {
            const current = await zeroRead();
            const component = current.components.find(
              (c: any) => c.id === "prize-funding",
            );
            return backend.runOwnedInternal("fixtures:readinessProof", {
              ...zeroScope,
              nonprofitId: "nonprofit-a",
              component: "prize-funding",
              revision: current.revision,
              account: component.scope.accountBinding,
              sequence: (component.evidence?.sequence ?? 0) + 1,
              observedAt: Date.now(),
              expiresAt: Date.now() + 120_000,
              reviewer: "administrator",
              digest: "b".repeat(64),
              outcome: "verified",
              values: { availableCents: 0, requiredCents: 0 },
              ...extra,
            });
          }
          await assert.rejects(zeroProof(), /FACTS/);
          await mutation(manager, "campaignSetup:create", {
            ...zeroScope,
            operationId: "t09-zero-prize-rules",
            rules: {
              ...campaignRules,
              dailyPrizeCents: 0,
              weeklyPrizeCents: 0,
              weeklyReplenishmentCents: 0,
            },
          });
          assert.equal(
            (await zeroRead()).components.find(
              (c: any) => c.id === "prize-funding",
            ).status,
            "unmet",
          );
          await assert.rejects(zeroProof({ values: undefined }), /FACTS/);
          await assert.rejects(
            proof("prize-funding", {
              values: { availableCents: 0, requiredCents: 0 },
            }),
            /FACTS/,
          );
          await assert.rejects(
            zeroProof({ component: "full-run-funding" }),
            /FACTS/,
          );
          await zeroProof();
          const proven = await zeroRead();
          const prize = proven.components.find(
            (c: any) => c.id === "prize-funding",
          );
          assert.equal(prize.status, "unvalidated");
          assert.deepEqual(prize.evidence.values, {
            availableCents: 0,
            requiredCents: 0,
          });
          await zeroProof({ values: { availableCents: -1, requiredCents: 0 } });
          const deficit = (await zeroRead()).components.find(
            (c: any) => c.id === "prize-funding",
          );
          assert.equal(deficit.status, "unmet");
          assert.equal(deficit.evidence.values.availableCents, -1);
          assert.match(deficit.reason, /does not cover/);
          for (const values of [
            undefined,
            { availableCents: Infinity, requiredCents: 0 },
            { availableCents: Number.MAX_SAFE_INTEGER + 1, requiredCents: 0 },
            { availableCents: 0, requiredCents: -1 },
          ])
            await assert.rejects(zeroProof({ values }), /FACTS/);
          assert.equal(
            (await zeroRead()).components.find(
              (c: any) => c.id === "prize-funding",
            ).evidence.values.availableCents,
            -1,
          );
          await zeroProof();
          assert.equal(
            (await zeroRead()).blockers.find(
              (b: any) => b.component === "prize-funding",
            ).active,
            false,
          );
          assert.equal(
            (
              await mutation(
                manager,
                "readiness:checkPaidActivation",
                zeroScope,
              )
            ).paidAllowed,
            false,
          );
          assert.equal(
            proven.components.find((c: any) => c.id === "full-run-funding")
              .status,
            "unmet",
          );
        },
      );
      await t.test(
        "partial Stripe-only prelaunch scope permits independent reviewed collection eligibility without an empty-provider ad waiver",
        async () => {
          const partialScope = { campaignId: "zero-prize-readiness" };
          const partialRead = () =>
            query(admin, "readiness:read", partialScope);
          async function partialConfigure(accounts: any) {
            const current = await partialRead();
            return configure({
              ...partialScope,
              expectedVersion: current.configurationVersion,
              accounts,
              selectedProviders: [],
            });
          }
          async function partialProof(id: string, extra: any = {}) {
            const current = await partialRead(),
              component = current.components.find((c: any) => c.id === id);
            return backend.runOwnedInternal("fixtures:readinessProof", {
              ...partialScope,
              nonprofitId: "nonprofit-a",
              component: id,
              revision: current.revision,
              account: component.scope.accountBinding ?? "",
              sequence: (component.evidence?.sequence ?? 0) + 1,
              observedAt: Date.now(),
              expiresAt: Date.now() + 120_000,
              reviewer: "administrator",
              digest: "c".repeat(64),
              outcome: "verified",
              ...extra,
            });
          }
          await partialConfigure({ stripe: "", meta: "" });
          let current = await partialRead();
          assert.equal(
            current.components.filter(
              (c: any) => c.required && c.status === "unmet",
            ).length,
            23,
          );
          assert.equal(current.collection.eligibility, "held");
          await assert.rejects(partialProof("stripe-eligibility"), /MISMATCH/);
          await partialConfigure({ stripe: accounts.stripe });
          for (const id of [
            "stripe-eligibility",
            "collection-eligibility",
            "funding-contract",
            "financial-read",
            "collection-funding",
          ])
            await partialProof(id);
          assert.equal((await partialRead()).collection.eligibility, "held");
          await partialProof("return-contract");
          current = await partialRead();
          assert.equal(current.collection.eligibility, "unvalidated");
          assert.equal(current.collection.available, false);
          const adComponents = current.components.filter(
            (c: any) => c.gate === "PG-03",
          );
          assert.equal(adComponents.length, 6);
          for (const component of adComponents) {
            assert.equal(component.required, true);
            assert.equal(component.status, "unmet");
            assert.match(component.reason, /selection is unconfigured/);
          }
          await assert.rejects(partialProof("meta-grant"), /MISMATCH/);
          await partialConfigure({
            stripe: accounts.stripe,
            meta: accounts.meta,
          });
          await partialProof("meta-grant");
          const withUnselectedProof = (await partialRead()).components.find(
            (c: any) => c.id === "meta-grant",
          );
          assert.ok(withUnselectedProof.evidence);
          assert.equal(withUnselectedProof.required, true);
          assert.equal(withUnselectedProof.satisfied, false);
          assert.match(withUnselectedProof.reason, /selection is unconfigured/);
          assert.equal(
            (
              await mutation(
                manager,
                "readiness:checkPaidActivation",
                partialScope,
              )
            ).paidAllowed,
            false,
          );
        },
      );
      await t.test(
        "all PG/component controlled transitions, separate collection eligibility/funding, required numeric safety and hard production denial",
        async () => {
          assert.match(
            (await read()).components.find(
              (c: any) => c.id === "production-behavior",
            ).reason,
            /current build/,
          );
          await assert.rejects(proof("production-behavior"), /RELEASE_TARGET/);
          await backend.runOwnedInternal("fixtures:readinessReleaseTarget", {
            ...scope,
            nonprofitId: "nonprofit-a",
            sequence: 1,
            observedAt: Date.now(),
            environmentDigest: "d".repeat(64),
            buildDigest: "e".repeat(64),
          });
          await assert.rejects(proof("safety-policy"), /FACTS/);
          await assert.rejects(proof("prize-funding"), /FACTS/);
          await proof("collection-eligibility");
          assert.equal((await read()).collection.eligibility, "held");
          for (const id of [
            "funding-contract",
            "return-contract",
            "financial-read",
            "collection-funding",
          ])
            await proof(id);
          const independentCollection = await read();
          assert.equal(
            independentCollection.collection.eligibility,
            "unvalidated",
          );
          assert.equal(
            independentCollection.components.filter(
              (c: any) => c.gate === "PG-03" && c.satisfied,
            ).length,
            0,
          );
          assert.equal(independentCollection.collection.available, false);
          for (const component of readinessComponents.filter(
            (c) => c.id !== "paid-workflow",
          )) {
            if (
              (await read()).components.find((c: any) => c.id === component.id)
                .satisfied
            )
              continue;
            await proof(
              component.id,
              component.id === "safety-policy"
                ? {
                    safety: {
                      reserveCents: 317,
                      freshnessMs: 48000,
                      releaseRuleDigest: "c".repeat(64),
                    },
                  }
                : ["prize-funding", "full-run-funding"].includes(component.id)
                  ? { values: { availableCents: 50000, requiredCents: 50000 } }
                  : {},
            );
          }
          const transitioned = await read();
          assert.equal(
            transitioned.components.filter(
              (c: any) => c.status === "unvalidated",
            ).length,
            22,
          );
          assert.equal(transitioned.collection.eligibility, "unvalidated");
          assert.equal(transitioned.collection.available, false);
          assert.equal(
            transitioned.blockers.filter((b: any) => b.active).length,
            1,
          );
          assert.equal(
            transitioned.components.find((c: any) => c.id === "paid-workflow")
              .satisfied,
            false,
          );
          await proof("paid-workflow");
          assert.equal((await check()).paidAllowed, false);
          await proof("full-run-funding", {
            values: { availableCents: 49999, requiredCents: 50000 },
          });
          assert.match(
            (await read()).components.find(
              (c: any) => c.id === "full-run-funding",
            ).reason,
            /does not cover/,
          );
          await proof("full-run-funding", {
            values: { availableCents: 50000, requiredCents: 50000 },
          });
        },
      );
      await t.test(
        "current trusted release target invalidates old production acceptance without reapproving provider contracts",
        async () => {
          const before = await read();
          const acceptance = before.components.find(
            (c: any) => c.id === "production-behavior",
          );
          assert.equal(acceptance.status, "unvalidated");
          const release = {
            ...scope,
            nonprofitId: "nonprofit-a",
            sequence: 2,
            observedAt: Date.now(),
            environmentDigest: "d".repeat(64),
            buildDigest: "f".repeat(64),
          };
          await assert.rejects(
            backend.runOwnedInternal("fixtures:readinessReleaseTarget", {
              ...release,
              sourceOverride: "browser-approval",
            }),
            /TRUSTED_RELEASE/,
          );
          await assert.rejects(
            backend.runOwnedInternal("fixtures:readinessReleaseTarget", {
              ...release,
              nonprofitId: "nonprofit-b",
            }),
            /TRUSTED_RELEASE/,
          );
          await backend.runOwnedInternal(
            "fixtures:readinessReleaseTarget",
            release,
          );
          await assert.rejects(
            backend.runOwnedInternal(
              "fixtures:readinessReleaseTarget",
              release,
            ),
            /STALE_RELEASE/,
          );
          const after = await read();
          assert.equal(after.revision, before.revision);
          assert.notEqual(
            after.releaseTarget.binding,
            before.releaseTarget.binding,
          );
          assert.equal(
            after.components.find((c: any) => c.id === "stripe-eligibility")
              .status,
            "unvalidated",
          );
          assert.match(
            after.components.find((c: any) => c.id === "production-behavior")
              .reason,
            /older build/,
          );
          assert.ok(
            after.blockers.find(
              (b: any) => b.component === "production-behavior",
            ).active,
          );
          assert.ok(
            after.evidenceHistory.some(
              (p: any) =>
                p.component === "production-behavior" &&
                p.releaseTarget === before.releaseTarget.binding,
            ),
          );
          const denied = await check({ expectedRevision: before.revision });
          assert.equal(denied.paidAllowed, false);
          assert.equal((await incident("production-behavior")).status, "open");
        },
      );
      await t.test(
        "expiry, current authority revocation and stale readiness deny direct calls with persisted detection",
        async () => {
          const expiry = Date.now() + 60_000;
          await proof("mux-playback", { expiresAt: expiry });
          await backend.runOwnedInternal("fixtures:readinessControl", {
            ...scope,
            now: expiry - 1,
          });
          assert.equal(
            (await read()).components.find((c: any) => c.id === "mux-playback")
              .status,
            "unvalidated",
          );
          await backend.runOwnedInternal("fixtures:readinessControl", {
            ...scope,
            now: expiry,
          });
          const expired = await check({
            expectedRevision: (await read()).revision,
          });
          assert.equal(expired.paidAllowed, false);
          assert.match(
            expired.components.find((c: any) => c.id === "mux-playback").reason,
            /expired/,
          );
          assert.ok(
            (await read()).blockers.find(
              (b: any) => b.component === "mux-playback",
            ).active,
          );
          await backend.runOwnedInternal("fixtures:readinessControl", {
            ...scope,
            now: null,
          });
          const repeat = lastProof;
          await backend.runOwnedInternal("fixtures:incidentControl", {
            ...scope,
            operatorActive: false,
          });
          await assert.rejects(read(admin), /FORBIDDEN/);
          const revoked = await check();
          assert.match(
            revoked.components.find((c: any) => c.id === "stripe-eligibility")
              .reason,
            /revoked/,
          );
          await assert.rejects(proof("stripe-eligibility"), /FORBIDDEN/);
          await assert.rejects(
            backend.runOwnedInternal("fixtures:readinessProof", repeat),
            /AUTHORITY/,
          );
          await backend.runOwnedInternal("fixtures:incidentControl", {
            ...scope,
            operatorActive: true,
          });
          await proof("prize-funding", {
            reviewer: "manager-a",
            values: { availableCents: 50000, requiredCents: 50000 },
          });
          await backend.runOwnedInternal("fixtures:readinessControl", {
            ...scope,
            managerActive: false,
          });
          await assert.rejects(evaluate(), /FORBIDDEN/);
          await assert.rejects(check(), /FORBIDDEN/);
          const revokedOwner = await check({}, admin);
          assert.match(
            revokedOwner.components.find((c: any) => c.id === "prize-funding")
              .reason,
            /revoked/,
          );
          await backend.runOwnedInternal("fixtures:readinessControl", {
            ...scope,
            managerActive: true,
          });
          await backend.runOwnedInternal("fixtures:readinessControl", {
            ...scope,
            financeRevision: "finance-t09-new",
          });
          const stale = await check({ expectedRevision: revision });
          assert.equal(stale.revisionMatches, false);
          assert.match(stale.denial, /revision changed/);
          assert.equal(
            stale.components.filter((c: any) =>
              c.reason?.includes("older revision"),
            ).length,
            22,
          );
          assert.equal(
            (await read()).blockers.filter((b: any) => b.active).length,
            23,
          );
        },
      );
      await t.test(
        "selected provider configuration has no all-empty waiver and stale concurrent edits cannot overwrite scope",
        async () => {
          const current = await read();
          const outputs = await Promise.allSettled([
            configure({
              expectedVersion: current.configurationVersion,
              selectedProviders: ["meta"],
              accounts: { ...accounts, tiktok: "" },
            }),
            configure({
              expectedVersion: current.configurationVersion,
              selectedProviders: ["meta"],
            }),
          ]);
          assert.equal(
            outputs.filter((o) => o.status === "fulfilled").length,
            1,
          );
          assert.equal(
            outputs.filter((o) => o.status === "rejected").length,
            1,
          );
          const selected = await read();
          assert.equal(
            selected.components.filter(
              (c: any) => c.status === "not-applicable",
            ).length,
            3,
          );
          assert.equal(
            selected.components.filter(
              (c: any) => c.required && c.status === "unmet",
            ).length,
            20,
          );
        },
      );
      await t.test(
        "failure and unknown sends never clear readiness; recovery is single and uncertainty retains original key",
        async () => {
          backend.email.mode("unknown");
          await proof("stripe-eligibility");
          let i = await until(
            () => incident("stripe-eligibility"),
            (i) =>
              i.status === "resolved" &&
              emails(i).some((e: any) => e.state === "unknown"),
          );
          const uncertain = emails(i).find((e: any) => e.state === "unknown");
          assert.equal(uncertain.attempts.length, 1);
          const beforeKeys = new Set(
            backend.email.requests
              .filter((r) => r.key.includes(uncertain.id))
              .map((r) => r.key),
          );
          await backend.runOwnedInternal("fixtures:incidentControl", {
            ...scope,
            now: uncertain.nextAt,
          });
          await backend.runOwnedInternal("incidentEmailJobs:run", {
            emailId: uncertain.id,
          });
          i = await incident("stripe-eligibility");
          const same = emails(i).find((e: any) => e.id === uncertain.id);
          assert.equal(same.attempts.length, 1);
          assert.equal(same.failures, 0);
          assert.equal(
            new Set(
              backend.email.requests
                .filter((r) => r.key.includes(uncertain.id))
                .map((r) => r.key),
            ).size,
            beforeKeys.size,
          );
          backend.email.mode("fail");
          await proof("stripe-eligibility", { outcome: "failed" });
          let failed = await until(
            () => incident("stripe-eligibility"),
            (i) =>
              i.status === "open" &&
              emails(i).some((e: any) => e.failures >= 1),
          );
          const email = emails(failed).find((e: any) => e.failures >= 1);
          for (let n = 0; n < 4; n++) {
            const current = emails(await incident("stripe-eligibility")).find(
              (e: any) => e.id === email.id,
            );
            await backend.runOwnedInternal("fixtures:incidentControl", {
              ...scope,
              now: current.nextAt,
            });
            await backend.runOwnedInternal("incidentEmailJobs:run", {
              emailId: current.id,
            });
          }
          failed = await incident("stripe-eligibility");
          assert.equal(
            emails(failed).find((e: any) => e.id === email.id).state,
            "failed",
          );
          assert.equal(
            (await read()).components.find(
              (c: any) => c.id === "stripe-eligibility",
            ).status,
            "unmet",
          );
          backend.email.mode("delivered");
          await backend.runOwnedInternal("fixtures:incidentControl", {
            ...scope,
            now: null,
          });
          await proof("stripe-eligibility");
          await evaluate();
          const recovered = await incident("stripe-eligibility");
          assert.equal(recovered.status, "resolved");
          assert.equal(
            recovered.notices.filter((n: any) => n.kind === "recovery").length,
            1,
          );
        },
      );
      await t.test(
        "two signed sessions and actual process restart retain blockers, incident/audit history and private scope isolation",
        async () => {
          const before = await read();
          const incidentsBefore = await incidents();
          assert.equal((await read(manager2)).revision, before.revision);
          await backend.restart();
          const after = await read(manager2);
          assert.equal(after.revision, before.revision);
          assert.deepEqual(after.blockers, before.blockers);
          assert.deepEqual(after.audit, before.audit);
          assert.equal((await incidents()).length, incidentsBefore.length);
          assert.equal((await check()).paidAllowed, false);
          assert.doesNotMatch(
            JSON.stringify(after),
            /@|Bearer|RESEND_API_KEY|providerBinding|"payload"|private-original|nonprofit-b/,
          );
        },
      );
      const after = await read();
      const incidentsBefore = await incidents();
      await mkdir(".codex/ralph", { recursive: true });
      await writeFile(
        ".codex/ralph/t09-observed-operations.json",
        JSON.stringify(
          {
            story: "T09",
            actualProviderApproval: false,
            synthetic: true,
            recordedAt: new Date().toISOString(),
            componentCount: after.components.length,
            firstDispatchDelayMs,
            transport: "owned loopback HTTP; unvalidated",
            auditEventsAfterRestart: after.audit.length,
            evidenceHistoryAfterRestart: after.evidenceHistory.length,
            durableBlockersAfterRestart: after.blockers.length,
            incidentEpisodesAfterRestart: incidentsBefore.length,
            paidAllowed: false,
            collectionAvailable: false,
            sessions: 2,
            actualProcessRestart: true,
            expiryBoundary:
              "expiry-1 valid controlled proof; expiry unmet and persisted by public activation check",
            noReservationSideEffects:
              (await query(manager, "reservations:state", scope))
                .reservedSlots === 0,
          },
          null,
          2,
        ) + "\n",
      );
    } finally {
      await backend.stop();
    }
  },
);

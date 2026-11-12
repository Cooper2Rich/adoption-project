import assert from "node:assert/strict";
import test from "node:test";
import { makeFunctionReference } from "convex/server";
import { setTimeout as delay } from "node:timers/promises";
import { createEmailFixture } from "../../scripts/launch/email-fixture.ts";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { incidentKinds } from "../../convex/incidentSchema.ts";
import { transportConfiguration } from "../../convex/incidentEmail.ts";

const scope = { campaignId: "adoption" };
test(
  "T08 persistent scoped operator incidents and controlled email delivery",
  { timeout: 240_000 },
  async (t) => {
    const backend = await createLocalBackend();
    const manager = backend.client("manager-a"),
      manager2 = backend.client("manager-a"),
      admin = backend.client("administrator");
    const mutate = (actor: any, name: string, args: any = scope) =>
      actor.mutation(
        makeFunctionReference<"mutation">(`operatorIncidents:${name}`),
        args,
      );
    const list = (actor: any = manager, args = scope) =>
      actor.query(
        makeFunctionReference<"query">("operatorIncidents:list"),
        args,
      ) as Promise<any[]>;
    const find = async (key: string) =>
      (await list()).find((i) => i.key === key);
    const control = (args: any) =>
      backend.runOwnedInternal("fixtures:incidentControl", {
        ...scope,
        ...args,
      });
    const observe = (key: string, extra: any = {}) =>
      backend.runOwnedInternal("fixtures:incident", {
        ...scope,
        key,
        kind: "launch-blocker",
        sequence: 1,
        observedAt: Date.now(),
        active: true,
        reason: "Required approval is missing",
        evidence: `owned-evidence-${key}`,
        resolutionRole: "administrator",
        ...extra,
      });
    const job = (emailId: string) =>
      backend.runOwnedInternal("incidentEmailJobs:run", { emailId });
    const emails = (incident: any) =>
      incident.notices.flatMap((n: any) => n.emails);
    const dispatch = async (key: string) => {
      for (const email of emails(await find(key))) await job(email.id);
    };
    async function until(key: string, predicate: (i: any) => boolean) {
      for (let n = 0; n < 100; n++) {
        const value = await find(key);
        if (value && predicate(value)) return value;
        await delay(50);
      }
      assert.fail(
        `Timed out waiting for ${key}: ${JSON.stringify(await find(key))}`,
      );
    }
    try {
      await t.test(
        "public signed permission denials and verified self-contact configuration",
        async () => {
          for (const actor of [
            backend.client(),
            backend.client("creator-a"),
            backend.client("manager-b"),
          ]) {
            for (const name of ["registerContact", "resume"])
              await assert.rejects(mutate(actor, name), /FORBIDDEN/);
            await assert.rejects(
              mutate(actor, "configure", {
                ...scope,
                designatedOperator: "administrator",
              }),
              /FORBIDDEN/,
            );
            await assert.rejects(list(actor), /FORBIDDEN/);
          }
          await assert.rejects(
            mutate(
              backend.client("manager-a", { email_verified: false }),
              "registerContact",
            ),
            /VERIFIED_CLERK_EMAIL_REQUIRED/,
          );
          await assert.rejects(
            mutate(manager, "configure", {
              ...scope,
              designatedOperator: "manager-b",
            }),
            /DESIGNATED_ACTIVE_OPERATOR_REQUIRED/,
          );
          await mutate(manager, "registerContact");
          await mutate(admin, "registerContact");
        },
      );
      await t.test(
        "missing designated configuration stays visible while known recipients dispatch; repair deduplicates",
        async () => {
          await observe("missing-config");
          const initial = await until(
            "missing-config",
            (i) =>
              emails(i).length === 2 &&
              emails(i).every((e: any) => e.state === "accepted"),
          );
          assert.match(initial.notices[0].hold, /Designated operator/);
          const count = backend.email.messages.size;
          await mutate(manager, "configure", {
            ...scope,
            designatedOperator: "administrator",
          });
          await mutate(manager, "resume");
          assert.equal((await find("missing-config")).notices[0].hold, null);
          assert.equal(backend.email.messages.size, count);
          assert.equal(emails(await find("missing-config")).length, 2);
        },
      );
      await t.test(
        "all fourteen policy categories route manager-only or manager/admin without a grace threshold",
        async () => {
          await control({ dualRole: true });
          for (let index = 0; index < incidentKinds.length; index++) {
            const kind = incidentKinds[index]!;
            const before = Date.now();
            await observe(`route-${kind}`, { kind });
            const incident = await until(
              `route-${kind}`,
              (i) =>
                emails(i).length === (index < 5 ? 1 : 2) &&
                emails(i).every(
                  (e: any) => e.attempts.length === 1 && e.state === "accepted",
                ),
            );
            assert.equal(emails(incident).length, index < 5 ? 1 : 2, kind);
            assert.equal(incident.notices.length, 1);
            assert(incident.detectedAt >= before);
            for (const email of emails(incident)) {
              assert(email.createdAt === incident.detectedAt);
              assert(email.attempts[0].sendStartedAt >= incident.detectedAt);
              assert(
                email.attempts[0].sendStartedAt - incident.detectedAt < 10_000,
              );
            }
          }
          const payloads = backend.email.requests.map((r) =>
            JSON.parse(r.payload),
          );
          assert(payloads.every((p) => p.to.length === 1 && !p.cc && !p.bcc));
          console.log(
            "T08 measured fourteen detection→journaled first-send intervals (ms):",
            (await list())
              .filter((i) => i.key.startsWith("route-"))
              .map((i) => ({
                kind: i.kind,
                intervals: emails(i).map(
                  (e: any) => e.attempts[0].sendStartedAt - i.detectedAt,
                ),
              })),
          );
          await control({ dualRole: false });
        },
      );
      await t.test(
        "duplicates, concurrent checks, stale/reordered recovery and new episodes preserve original evidence",
        async () => {
          const observationTime = Date.now();
          const results = await Promise.all([
            observe("episode", { observedAt: observationTime }),
            observe("episode", { observedAt: observationTime }),
          ]);
          assert.equal(results.filter((r: any) => r.accepted).length, 1);
          const original = await find("episode");
          await observe("episode", {
            sequence: 2,
            observedAt: observationTime + 1,
            reason: "Newer blocking reason",
            evidence: "newer-evidence",
          });
          assert.equal(
            (
              await observe("episode", {
                sequence: 3,
                observedAt: observationTime,
                active: false,
              })
            ).accepted,
            false,
          );
          assert.equal(
            (await observe("episode", { sequence: 1, active: false })).accepted,
            false,
          );
          let updated = await find("episode");
          assert.equal(updated.status, "open");
          assert.equal(updated.notices.length, 1);
          assert.equal(updated.detectedAt, original.detectedAt);
          assert.equal(updated.originalEvidence, original.originalEvidence);
          await Promise.all([
            observe("episode", {
              sequence: 3,
              observedAt: observationTime + 2,
              active: false,
              reason: "Approval verified",
            }),
            observe("episode", {
              sequence: 3,
              observedAt: observationTime + 2,
              active: false,
            }),
          ]);
          updated = await find("episode");
          assert.equal(updated.status, "resolved");
          assert.equal(
            updated.notices.filter((n: any) => n.kind === "recovery").length,
            1,
          );
          assert.equal(updated.evidence.length, 3);
          await observe("episode", {
            sequence: 4,
            observedAt: observationTime + 3,
            active: true,
          });
          const episodes = (await list()).filter((i) => i.key === "episode");
          assert.equal(episodes.length, 2);
          assert.equal(episodes.filter((i) => i.status === "open").length, 1);
        },
      );
      await t.test(
        "exact successive 1/5/15/60 minute boundaries and exhaustion retain dashboard incident",
        async () => {
          backend.email.mode("fail");
          await observe("retry");
          let incident = await until("retry", (i) =>
            emails(i).every((e: any) => e.failures === 1),
          );
          for (const [index, interval] of [
            60_000, 300_000, 900_000, 3_600_000,
          ].entries()) {
            const current = emails(incident);
            assert.equal(current.length, 2);
            const due = Math.max(...current.map((e: any) => e.nextAt));
            for (const email of current)
              assert.equal(
                email.nextAt - email.attempts.at(-1).finishedAt,
                interval,
              );
            // Each recipient has its own actual first failure instant. Test each
            // individual boundary rather than pretending simultaneous transport.
            for (const email of current) {
              await control({ now: email.nextAt - 1 });
              const count = backend.email.requests.length;
              await job(email.id);
              assert.equal(backend.email.requests.length, count);
              await control({ now: email.nextAt });
              await job(email.id);
              assert.equal(backend.email.requests.length, count + 1);
            }
            incident = await until("retry", (i) =>
              emails(i).every((e: any) => e.failures === index + 2),
            );
            assert.equal(incident.status, "open");
            await control({ now: due });
          }
          for (const email of emails(incident)) {
            assert.equal(email.state, "failed");
            assert.equal(email.attempts.length, 5);
          }
          const before = backend.email.requests.length;
          await dispatch("retry");
          assert.equal(backend.email.requests.length, before);
          assert.equal((await find("retry")).status, "open");
          backend.email.mode("delivered");
          await control({ now: null });
        },
      );
      await t.test(
        "accepted differs from delivered, duplicate retrieval and asynchronous failure retry use a new immutable key",
        async () => {
          backend.email.mode("async-fail");
          await observe("async-failure", { kind: "import-outage" });
          let incident = await until(
            "async-failure",
            (i) => emails(i).length === 1 && emails(i)[0].state === "accepted",
          );
          assert.equal(incident.status, "open");
          const first = emails(incident)[0];
          await control({ now: first.nextAt });
          await job(first.id);
          incident = await find("async-failure");
          assert.equal(emails(incident)[0].failures, 1);
          backend.email.mode("delivered");
          await control({ now: emails(incident)[0].nextAt });
          await job(first.id);
          incident = await find("async-failure");
          assert.equal(emails(incident)[0].state, "accepted");
          assert.equal(emails(incident)[0].attempts.length, 2);
          const matching = backend.email.requests.filter((r) =>
            JSON.parse(r.payload).subject.includes("import-outage"),
          );
          assert.notEqual(matching.at(-1)!.key, matching.at(-2)!.key);
          assert.equal(matching.at(-1)!.payload, matching.at(-2)!.payload);
          await control({ now: emails(incident)[0].nextAt });
          await Promise.all([job(first.id), job(first.id)]);
          incident = await find("async-failure");
          assert.equal(emails(incident)[0].state, "delivered");
          assert.equal(incident.status, "open");
          await control({ now: null });
        },
      );
      await t.test(
        "unknown send restart and concurrent duplicate jobs reuse one key/payload; 24-hour exact expiry fences",
        async () => {
          backend.email.mode("unknown");
          await observe("unknown", { kind: "batch-ready" });
          let incident = await until(
            "unknown",
            (i) => emails(i)[0].state === "unknown",
          );
          const email = emails(incident)[0],
            firstAttempt = email.attempts[0];
          const snapshot = await find("unknown");
          assert.deepEqual(
            (await list(manager2)).find((i) => i.key === "unknown"),
            snapshot,
          );
          await backend.restart();
          assert.deepEqual(
            (await list(manager2)).find((i) => i.key === "unknown"),
            snapshot,
          );
          await control({ now: email.nextAt });
          await Promise.all([job(email.id), job(email.id)]);
          incident = await find("unknown");
          assert.equal(emails(incident)[0].attempts.length, 1);
          const requests = backend.email.requests.filter((r) =>
            JSON.parse(r.payload).subject.includes("batch-ready"),
          );
          assert.equal(requests.at(-1)!.key, requests.at(-2)!.key);
          assert.equal(requests.at(-1)!.payload, requests.at(-2)!.payload);
          const beforeCutoff = backend.email.requests.length;
          await control({
            now: firstAttempt.sendStartedAt + 86_400_000 - 60_000 - 1,
          });
          await job(email.id);
          assert.equal(backend.email.requests.length, beforeCutoff + 1);
          const count = backend.email.requests.length;
          await control({
            now: firstAttempt.sendStartedAt + 86_400_000 - 60_000,
          });
          await job(email.id);
          assert.equal(backend.email.requests.length, count);
          assert.equal(emails(await find("unknown"))[0].state, "held");
          await control({ now: firstAttempt.sendStartedAt + 86_400_000 });
          await job(email.id);
          incident = await find("unknown");
          assert.equal(emails(incident)[0].state, "held");
          assert.match(emails(incident)[0].hold, /idempotency window/);
          assert.equal(backend.email.requests.length, count);
          backend.email.mode("delivered");
          await control({ now: null });
        },
      );
      await t.test(
        "journal-before-send crash, exact lease, stale completion and provider binding survive restart",
        async () => {
          await control({ now: Date.now() - 60_000 });
          await observe("crash", { kind: "prize-loss" });
          let incident = await find("crash");
          assert.equal(emails(incident).length, 1);
          const email = emails(incident)[0];
          assert.equal(email.attempts.length, 0);
          await control({ now: email.createdAt });
          const claimed = await backend.runOwnedInternal(
            "incidentEmail:claim",
            { emailId: email.id },
          );
          assert.equal(claimed.work, "send");
          const count = backend.email.requests.length;
          await backend.restart();
          assert.equal(
            (await find("crash")).notices[0].emails[0].attempts[0].state,
            "sending",
          );
          await control({ now: email.createdAt + 29_999 });
          await job(email.id);
          assert.equal(backend.email.requests.length, count);
          await control({ now: email.createdAt + 30_000 });
          await Promise.all([job(email.id), job(email.id)]);
          assert.equal(backend.email.requests.length, count + 1);
          incident = await find("crash");
          assert.equal(emails(incident)[0].state, "accepted");
          assert.equal(emails(incident)[0].attempts.length, 1);
          const stale = await backend.runOwnedInternal("incidentEmail:settle", {
            emailId: email.id,
            attemptId: claimed.attemptId,
            transportCall: claimed.transportCall,
            work: "send",
            outcome: "failed",
          });
          assert.equal(stale.ignored, true);
          assert.equal(emails(await find("crash"))[0].state, "accepted");
          await control({ now: null });
          backend.email.mode("unknown");
          await observe("provider-change", { kind: "prize-loss" });
          incident = await until(
            "provider-change",
            (i) => emails(i).length === 1 && emails(i)[0].state === "unknown",
          );
          const replacement = await createEmailFixture();
          try {
            await backend.command(
              "env",
              "set",
              "OPERATOR_EMAIL_FIXTURE_URL",
              replacement.url,
            );
            await control({ now: emails(incident)[0].nextAt });
            await dispatch("provider-change");
            incident = await find("provider-change");
            assert.equal(emails(incident)[0].state, "held");
            assert.match(
              emails(incident)[0].hold,
              /provider configuration changed/,
            );
            assert.equal(replacement.requests.length, 0);
          } finally {
            await backend.command(
              "env",
              "set",
              "OPERATOR_EMAIL_FIXTURE_URL",
              backend.email.url,
            );
            await replacement.stop();
          }
          backend.email.mode("delivered");
          await control({ now: null });
        },
      );
      await t.test(
        "missing verified contacts, resolution before repair and current operator revocation remain safe",
        async () => {
          const other = { campaignId: "other" },
            otherManager = backend.client("manager-b");
          await observe("missing-contact", { ...other });
          let records = await list(otherManager, other),
            incident = records[0];
          assert.equal(emails(incident).length, 0);
          assert.match(incident.notices[0].hold, /Verified operator contact/);
          await observe("missing-contact", {
            ...other,
            sequence: 2,
            active: false,
            reason: "Other approval verified",
          });
          await mutate(otherManager, "registerContact", other);
          await mutate(admin, "registerContact", other);
          await mutate(otherManager, "configure", {
            ...other,
            designatedOperator: "administrator",
          });
          await mutate(otherManager, "resume", other);
          records = await list(otherManager, other);
          incident = records[0];
          assert.equal(incident.status, "resolved");
          assert.equal(incident.notices[0].emails.length, 0);
          assert.equal(incident.notices[1].emails.length, 2);
          assert.match(incident.notices[0].hold, /superseded/);
          const configuration = await manager.query(
            makeFunctionReference<"query">("operatorIncidents:configuration"),
            scope,
          );
          assert(configuration.audit.length >= 4);
          assert(
            configuration.audit.every(
              (a: any) => a.actor && a.source && a.at && a.version === 1,
            ),
          );
          backend.email.mode("fail");
          await observe("operator-revoke");
          incident = await until(
            "operator-revoke",
            (i) =>
              emails(i).length === 2 &&
              emails(i).every((e: any) => e.failures === 1),
          );
          await control({
            operatorActive: false,
            now: Math.max(...emails(incident).map((e: any) => e.nextAt)),
          });
          await dispatch("operator-revoke");
          incident = await find("operator-revoke");
          assert.equal(
            emails(incident).filter((e: any) => e.state === "held").length,
            1,
          );
          await assert.rejects(list(admin), /FORBIDDEN/);
          await control({ operatorActive: true, now: null });
          backend.email.mode("delivered");
        },
      );
      await t.test(
        "retrieval skips delivered event: opened/clicked/complaint confirm receipt; delay never resends",
        async () => {
          for (const event of ["opened", "clicked", "complained", "delayed"]) {
            backend.email.mode(event);
            await observe(`last-event-${event}`, { kind: "batch-ready" });
            let incident = await until(
              `last-event-${event}`,
              (i) =>
                emails(i).length === 1 && emails(i)[0].state === "accepted",
            );
            const email = emails(incident)[0],
              count = backend.email.requests.length;
            await control({ now: email.nextAt });
            await job(email.id);
            incident = await find(`last-event-${event}`);
            assert.equal(
              emails(incident)[0].state,
              event === "delayed" ? "accepted" : "delivered",
            );
            assert.equal(
              emails(incident)[0].attempts[0].providerEvent,
              event === "delayed" ? "delivery_delayed" : event,
            );
            assert.equal(backend.email.requests.length, count);
            assert.equal(incident.status, "open");
            await control({ now: null });
          }
          backend.email.mode("delivered");
        },
      );
      await t.test(
        "actual backend provider gate visibly holds and explicit repair resumes only unsent requests",
        async () => {
          await backend.command("env", "remove", "OPERATOR_EMAIL_FIXTURE_URL");
          await observe("provider-gate", { kind: "prize-loss" });
          let incident = await until(
            "provider-gate",
            (i) => emails(i).length === 1 && emails(i)[0].state === "held",
          );
          assert.equal(emails(incident)[0].attempts.length, 0);
          assert.match(emails(incident)[0].hold, /approval.configuration/);
          await backend.command(
            "env",
            "set",
            "OPERATOR_EMAIL_FIXTURE_URL",
            backend.email.url,
          );
          await mutate(manager, "resume");
          incident = await until(
            "provider-gate",
            (i) => emails(i).length === 1 && emails(i)[0].state === "accepted",
          );
          assert.equal(emails(incident)[0].attempts.length, 1);
          await assert.rejects(
            manager.mutation(
              makeFunctionReference<"mutation">("fixtures:incident"),
              {
                ...scope,
                key: "forged",
                kind: "launch-blocker",
                sequence: 1,
                observedAt: Date.now(),
                active: true,
                reason: "forged",
                evidence: "forged",
                resolutionRole: "administrator",
              },
            ),
            /internal|not found|Could not find|not allowed/i,
          );
        },
      );
      await t.test(
        "rejected uncertain replays never prove original failure or create a replacement key",
        async () => {
          backend.email.mode("unknown");
          await observe("replay-rejection", { kind: "prize-loss" });
          let incident = await until(
            "replay-rejection",
            (i) => emails(i).length === 1 && emails(i)[0].state === "unknown",
          );
          const emailId = emails(incident)[0].id;
          const firstRequest = backend.email.requests.at(-1)!;
          const originalMessageCount = backend.email.messages.size;
          for (const mode of ["fail", "reject429", "reject401"]) {
            backend.email.mode(mode);
            await control({ now: emails(incident)[0].nextAt });
            await job(emailId);
            incident = await find("replay-rejection");
            const email = emails(incident)[0];
            assert.equal(email.state, "unknown");
            assert.equal(email.failures, 0);
            assert.equal(email.attempts.length, 1);
            assert.equal(backend.email.requests.at(-1)!.key, firstRequest.key);
            assert.equal(
              backend.email.requests.at(-1)!.payload,
              firstRequest.payload,
            );
            assert.equal(backend.email.messages.size, originalMessageCount);
          }
          backend.email.mode("delivered");
          await control({ now: emails(incident)[0].nextAt });
          await job(emailId);
          incident = await find("replay-rejection");
          assert.equal(emails(incident)[0].state, "accepted");
          assert.equal(emails(incident)[0].attempts.length, 1);
          assert.equal(backend.email.requests.at(-1)!.key, firstRequest.key);
          assert.equal(backend.email.messages.size, originalMessageCount);
          await control({ now: null });
        },
      );
      await t.test(
        "durable mutation watchdog recovers bypassed initial action after restart without duplicate send",
        async () => {
          await control({ now: Date.now() - 60_000 });
          await observe("lost-action", { kind: "prize-loss" });
          let incident = await until(
            "lost-action",
            (i) => emails(i).length === 1,
          );
          const email = emails(incident)[0];
          await control({ now: email.createdAt });
          // Owned fixture bypasses the at-most-once action but commits exactly
          // the production watchdog successor, modelling failure before claim.
          const lost = await backend.runOwnedInternal(
            "fixtures:incidentWatchdog",
            { emailId: email.id, skipAction: true },
          );
          incident = await find("lost-action");
          assert.equal(emails(incident)[0].state, "pending");
          assert.equal(emails(incident)[0].attempts.length, 0);
          const count = backend.email.requests.length;
          await backend.restart();
          await control({ now: email.createdAt + 30_000 });
          const recovered = await backend.runOwnedInternal(
            "incidentEmail:watchdog",
            { emailId: email.id, generation: lost.generation },
          );
          assert.equal(recovered.ignored, false);
          await backend.runOwnedInternal("incidentEmail:watchdog", {
            emailId: email.id,
            generation: lost.generation,
          });
          incident = await until(
            "lost-action",
            (i) => emails(i).length === 1 && emails(i)[0].state === "accepted",
          );
          assert.equal(emails(incident)[0].attempts.length, 1);
          assert.equal(backend.email.requests.length, count + 1);
          assert.equal(incident.status, "open");
          await control({ now: null });
        },
      );
      await t.test(
        "recipient revocation/contact changes hold retries and prevent cross-scope/private leakage",
        async () => {
          backend.email.mode("fail");
          await observe("contact-change", { kind: "prize-loss" });
          let incident = await until(
            "contact-change",
            (i) => emails(i).length === 1 && emails(i)[0].failures === 1,
          );
          await mutate(
            backend.client("manager-a", {
              email: "changed@controlled.example",
            }),
            "registerContact",
          );
          await control({ now: emails(incident)[0].nextAt });
          const count = backend.email.requests.length;
          await dispatch("contact-change");
          incident = await find("contact-change");
          assert.equal(emails(incident)[0].state, "held");
          assert.equal(backend.email.requests.length, count);
          await backend.command(
            "run",
            "fixtures:revoke",
            JSON.stringify({
              subject: "manager-a",
              nonprofitId: "nonprofit-a",
            }),
          );
          for (const operation of [
            () => list(manager),
            () => mutate(manager, "resume"),
            () =>
              mutate(manager, "configure", {
                ...scope,
                designatedOperator: "administrator",
              }),
          ])
            await assert.rejects(operation(), /FORBIDDEN/);
          const redacted = JSON.stringify(await list(admin));
          assert.doesNotMatch(
            redacted,
            /@|Bearer|providerBinding|\bpayload\b|RESEND_API_KEY|idempotency-key/i,
          );
          assert(
            (
              await list(backend.client("manager-b"), { campaignId: "other" })
            ).every((i) => i.campaignSlug === "other"),
          );
          backend.email.mode("delivered");
        },
      );
    } finally {
      await backend.stop();
    }
  },
);

test("T08 production provider gate rejects absent, malformed, fixture and incomplete approval", () => {
  const names = [
    "RESEND_API_KEY",
    "OPERATOR_EMAIL_REVIEWED_EVIDENCE",
    "OPERATOR_EMAIL_FROM",
    "OPERATOR_EMAIL_FIXTURE_URL",
    "ALLOCATION_PREVIEW_FIXTURE_RUN_ID",
  ];
  const saved = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  try {
    for (const name of names) delete process.env[name];
    assert.equal(transportConfiguration(false), null);
    process.env.OPERATOR_EMAIL_FIXTURE_URL = "http://127.0.0.1:12345";
    process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID = "owned";
    assert.equal(transportConfiguration(false, "owned"), null);
    process.env.OPERATOR_EMAIL_REVIEWED_EVIDENCE = "{";
    assert.equal(transportConfiguration(false), null);
    process.env.OPERATOR_EMAIL_REVIEWED_EVIDENCE = JSON.stringify({
      provider: "resend",
      sha256: "a".repeat(64),
      reviewUrl: "https://evidence.example/review",
      reviewedBy: "reviewer",
      verifiedSender: true,
    });
    assert.equal(transportConfiguration(false), null);
    process.env.OPERATOR_EMAIL_FIXTURE_URL = "malformed";
    assert.equal(transportConfiguration(true, "owned"), null);
    process.env.OPERATOR_EMAIL_FIXTURE_URL = "https://external.example";
    assert.equal(transportConfiguration(true, "owned"), null);
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

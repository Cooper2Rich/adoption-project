import { makeFunctionReference } from "convex/server";
import assert from "node:assert/strict";
import test from "node:test";
import { createLocalBackend } from "../../scripts/launch/local-backend.ts";
import { campaignRules as rules } from "./fixtures.ts";

test(
  "T02 actual Convex creator invitations and participation",
  { timeout: 360000 },
  async (t) => {
    const backend = await createLocalBackend();
    const scope = { campaignId: "adoption" };
    const manager = backend.client("manager-a");
    const alice = backend.client("creator-a");
    const bob = backend.client("creator-b");
    let invitation: { _id: any },
      second: { _id: any },
      acceptance: {
        subject: unknown;
        version: unknown;
        acceptedAt: number;
        source: unknown;
        termsId: unknown;
        termsBody: string;
      },
      request: any,
      terms: any,
      privateIds;
    const command = async (name: string, args: any) => {
      const output = await backend.command(
        "run",
        `fixtures:${name}`,
        JSON.stringify(args),
      );
      return output.trim() ? JSON.parse(output) : null;
    };
    const invite = async (subject: string, operationId = subject) =>
      manager.mutation(
        makeFunctionReference<"mutation">("creatorAccess:invite"),
        {
          ...scope,
          email: `${subject}@creators.example`,
          operationId,
        },
      );
    const dispatch = (record: any, kind = "create") =>
      manager.action("clerkInvitations:dispatch", {
        ...scope,
        invitationId: record._id,
        kind,
      });
    try {
      await t.test(
        "AC01 manager locks rules then invitation retries deduplicate and Clerk confirms before creator access",
        async () => {
          await assert.rejects(invite("creator-a"), /RULES_REQUIRED/);
          await manager.mutation(
            makeFunctionReference<"mutation">("campaignSetup:create"),
            {
              ...scope,
              operationId: "rules",
              rules,
            },
          );
          const pair = await Promise.all([
            invite("creator-a"),
            invite("creator-a"),
          ]);
          invitation = pair[0];
          assert.equal(pair[0]._id, pair[1]._id);
          await assert.rejects(
            alice.query(
              makeFunctionReference<"query">("creatorAccess:workspace"),
              scope,
            ),
            /FORBIDDEN/,
          );
          const results = await Promise.all([
            dispatch(invitation),
            dispatch(invitation),
          ]);
          assert.ok(results.some((r) => r.state === "confirmed"));
          assert.deepEqual(await dispatch(invitation), { state: "confirmed" });
          assert.equal(backend.clerk.counts().writes, 1);
          await assert.rejects(
            invite("changed", "creator-a"),
            /OPERATION_CONFLICT/,
          );
          await assert.rejects(
            invite("creator-a", "duplicate-new-id"),
            /ALREADY_INVITED/,
          );
          assert.equal(
            (
              await alice.query(
                makeFunctionReference<"query">("creatorAccess:workspace"),
                {
                  ...scope,
                  invitationId: invitation._id,
                },
              )
            ).invitation.email,
            "creator-a@creators.example",
          );
          second = await invite("creator-b");
          await dispatch(second);
        },
      );
      await t.test(
        "AC01/04 verified identity and current scope reject forwarded unverified guest and other-nonprofit requests",
        async () => {
          for (const denied of [
            backend.client(),
            bob,
            backend.client("creator-a", { email_verified: false }),
            backend.client("creator-a", { email_verified: "true" }),
            backend.client("creator-a", { email: "wrong@creators.example" }),
            backend.client("manager-b"),
            backend.client("creator-adoption", { role: "manager" }),
          ]) {
            await assert.rejects(
              denied.query(
                makeFunctionReference<"query">("creatorAccess:workspace"),
                {
                  ...scope,
                  invitationId: invitation._id,
                },
              ),
              /FORBIDDEN/,
            );
          }
          for (const denied of [
            backend.client(),
            alice,
            backend.client("manager-b"),
          ]) {
            await assert.rejects(
              denied.query(
                makeFunctionReference<"query">(
                  "creatorAccess:managerWorkspace",
                ),
                scope,
              ),
              /FORBIDDEN/,
            );
            await assert.rejects(
              denied.mutation(
                makeFunctionReference<"mutation">("creatorAccess:invite"),
                {
                  ...scope,
                  email: "attack@creators.example",
                  operationId: "denied",
                },
              ),
              /FORBIDDEN/,
            );
            await assert.rejects(
              denied.mutation(
                makeFunctionReference<"mutation">("creatorAccess:revoke"),
                {
                  ...scope,
                  invitationId: invitation._id,
                  operationId: "denied",
                },
              ),
              /FORBIDDEN/,
            );
            await assert.rejects(
              denied.action("clerkInvitations:dispatch", {
                ...scope,
                invitationId: invitation._id,
                kind: "create",
              }),
              /FORBIDDEN/,
            );
          }
          await assert.rejects(
            manager.query(
              makeFunctionReference<"query">("creatorAccess:workspace"),
              scope,
            ),
            /FORBIDDEN/,
          );
        },
      );
      await t.test(
        "AC02 missing actual terms visibly projects blocked signup and server denies submission",
        async () => {
          const view = await alice.query(
            makeFunctionReference<"query">("creatorAccess:workspace"),
            scope,
          );
          assert.equal(view.terms, null);
          assert.equal(view.acceptance, null);
          await assert.rejects(
            alice.query(
              makeFunctionReference<"query">("creatorAccess:submissionAccess"),
              scope,
            ),
            /ACCEPTANCE_REQUIRED/,
          );
          terms = await command("terms", {
            campaignSlug: "adoption",
            synthetic: true,
          });
          const configured = await alice.query(
            makeFunctionReference<"query">("creatorAccess:workspace"),
            scope,
          );
          assert.equal(configured.terms.synthetic, true);
          assert.match(configured.terms.title, /SYNTHETIC/);
          assert.match(
            configured.terms.body,
            /commission, prizes, score, cutoffs, refunds and creative use/,
          );
          for (const phrase of [
            "retain ownership",
            "permission to authorize",
            "without additional approval per submission or placement",
            "withdrawal or campaign completion",
            "Private records remain available",
          ])
            assert.ok(configured.terms.body.includes(phrase));
          request = {
            ...scope,
            invitationId: invitation._id,
            termsId: terms,
            version: "synthetic-test-v1",
            operationId: "accept-a",
            confirmed: true,
          };
          await assert.rejects(
            alice.mutation(
              makeFunctionReference<"mutation">("creatorAccess:accept"),
              {
                ...request,
                confirmed: false,
              },
            ),
            /CONFIRMATION_REQUIRED/,
          );
          await assert.rejects(
            alice.mutation(
              makeFunctionReference<"mutation">("creatorAccess:accept"),
              {
                ...request,
                version: "stale-version",
              },
            ),
            /TERMS_UNAVAILABLE/,
          );
          await assert.rejects(
            bob.mutation(
              makeFunctionReference<"mutation">("creatorAccess:accept"),
              request,
            ),
            /FORBIDDEN/,
          );
        },
      );
      await t.test(
        "AC02/03 concurrent signup atomically binds subject and preserves one complete immutable agreement snapshot",
        async () => {
          const contenders = await Promise.all([
            alice.mutation(
              makeFunctionReference<"mutation">("creatorAccess:accept"),
              request,
            ),
            backend
              .client("creator-a")
              .mutation(
                makeFunctionReference<"mutation">("creatorAccess:accept"),
                request,
              ),
          ]);
          acceptance = contenders[0];
          assert.equal(contenders[0]._id, contenders[1]._id);
          const duplicate = await alice.mutation(
            makeFunctionReference<"mutation">("creatorAccess:accept"),
            {
              ...request,
              operationId: "other-retry",
            },
          );
          assert.deepEqual(duplicate, acceptance);
          assert.equal(acceptance.subject, "creator-a");
          assert.equal(acceptance.version, "synthetic-test-v1");
          assert.ok(acceptance.acceptedAt > 0);
          assert.equal(acceptance.source, "creatorAccess:accept");
          assert.equal(acceptance.termsId, terms);
          assert.match(acceptance.termsBody, /SYNTHETIC/);
          assert.equal(
            (
              await alice.query(
                makeFunctionReference<"query">(
                  "creatorAccess:submissionAccess",
                ),
                scope,
              )
            ).permitted,
            true,
          );
          await assert.rejects(
            backend
              .client("reassigned-subject", {
                email: "creator-a@creators.example",
              })
              .query(
                makeFunctionReference<"query">("creatorAccess:workspace"),
                scope,
              ),
            /FORBIDDEN/,
          );
          await bob.mutation(
            makeFunctionReference<"mutation">("creatorAccess:accept"),
            {
              ...request,
              invitationId: second._id,
              operationId: "accept-b",
            },
          );
          const audit = await manager.query(
            makeFunctionReference<"query">("creatorAccess:audit"),
            scope,
          );
          assert.equal(
            audit.filter(
              (row: any) =>
                row.action === "accepted" &&
                row.invitationId === invitation._id,
            ).length,
            1,
          );
          const row = audit.find(
            (row: any) =>
              row.action === "accepted" && row.invitationId === invitation._id,
          );
          assert.equal(row.actor, acceptance.subject);
          assert.equal(row.at, acceptance.acceptedAt);
          assert.equal(row.version, acceptance.version);
          assert.equal(row.source, acceptance.source);
          assert.doesNotMatch(
            JSON.stringify(audit),
            /Bearer|sk_test|token|secret|credential/i,
          );
        },
      );
      await t.test(
        "AC04 direct earnings payment and invitation requests cannot expose another creator or nonprofit",
        async () => {
          privateIds = await command("privateRecords", {
            campaignSlug: "adoption",
            subject: "creator-a",
          });
          const foreign = await command("foreignPrivateRecord", {
            subject: "creator-a",
          });
          await command("privateRecords", {
            campaignSlug: "adoption",
            subject: "creator-b",
          });
          const records = await alice.query(
            makeFunctionReference<"query">("creatorAccess:privateRecords"),
            scope,
          );
          assert.equal(records.length, 2);
          assert.doesNotMatch(
            JSON.stringify(records),
            /FOREIGN_PRIVATE|creator-b|nonprofit-b/,
          );
          for (const recordId of [...privateIds, foreign]) {
            await assert.rejects(
              bob.query(
                makeFunctionReference<"query">("creatorAccess:privateRecord"),
                { ...scope, recordId },
              ),
              /FORBIDDEN/,
            );
            await assert.rejects(
              backend
                .client()
                .query(
                  makeFunctionReference<"query">("creatorAccess:privateRecord"),
                  { ...scope, recordId },
                ),
              /FORBIDDEN/,
            );
          }
          await assert.rejects(
            alice.query(
              makeFunctionReference<"query">("creatorAccess:privateRecord"),
              {
                ...scope,
                recordId: foreign,
              },
            ),
            /FORBIDDEN/,
          );
          for (const recordId of privateIds)
            assert.match(
              (
                await alice.query(
                  makeFunctionReference<"query">("creatorAccess:privateRecord"),
                  {
                    ...scope,
                    recordId,
                  },
                )
              ).summary,
              /creator-a/,
            );
          assert.deepEqual(
            await backend
              .client()
              .query(
                makeFunctionReference<"query">("creatorAccess:publicCampaign"),
                {},
              ),
            { name: "adoption.is", slug: "adoption" },
          );
        },
      );
      await t.test(
        "AC01/02 audit acceptance and exact retries survive a backend restart and second session",
        async () => {
          const audit = await manager.query(
            makeFunctionReference<"query">("creatorAccess:audit"),
            scope,
          );
          await backend.restart();
          assert.deepEqual(
            await backend
              .client("creator-a")
              .mutation(
                makeFunctionReference<"mutation">("creatorAccess:accept"),
                request,
              ),
            acceptance,
          );
          assert.deepEqual(
            await manager.query(
              makeFunctionReference<"query">("creatorAccess:audit"),
              scope,
            ),
            audit,
          );
          assert.equal(
            (
              await alice.query(
                makeFunctionReference<"query">("creatorAccess:privateRecords"),
                scope,
              )
            ).length,
            2,
          );
          assert.equal((await dispatch(invitation)).state, "confirmed");
          const journal = (
            await manager.query(
              makeFunctionReference<"query">("creatorAccess:providerHistory"),
              scope,
            )
          ).filter((row: any) => row.invitationId === invitation._id);
          assert.equal(journal.length, 1);
          assert.equal(journal[0].actor, "manager-a");
          assert.equal(journal[0].source, "clerkInvitations:dispatch");
          assert.equal(journal[0].version, 1);
          assert.equal(journal[0].history[0].state, "dispatched");
          assert.equal(journal[0].state, "confirmed");
        },
      );
      await t.test(
        "AC01 current manager revocation denies cached acceptance and private requests before Clerk reconciliation",
        async () => {
          await manager.mutation(
            makeFunctionReference<"mutation">("creatorAccess:revoke"),
            {
              ...scope,
              invitationId: invitation._id,
              operationId: "revoke-a",
            },
          );
          for (const op of ["workspace", "submissionAccess", "privateRecords"])
            await assert.rejects(
              alice.query(
                makeFunctionReference<"query">(`creatorAccess:${op}`),
                scope,
              ),
              /FORBIDDEN/,
            );
          await assert.rejects(
            alice.mutation(
              makeFunctionReference<"mutation">("creatorAccess:accept"),
              request,
            ),
            /FORBIDDEN/,
          );
          await assert.rejects(dispatch(invitation), /INVITATION_REVOKED/);
          backend.clerk.mode("unknown");
          assert.equal((await dispatch(invitation, "revoke")).state, "unknown");
          const before = backend.clerk.counts().writes;
          backend.clerk.mode("confirmed");
          assert.equal(
            (await dispatch(invitation, "revoke")).state,
            "confirmed",
          );
          assert.equal(backend.clerk.counts().writes, before);
          assert.deepEqual(
            await manager.mutation(
              makeFunctionReference<"mutation">("creatorAccess:revoke"),
              {
                ...scope,
                invitationId: invitation._id,
                operationId: "revoke-a",
              },
            ),
            { revoked: true },
          );
        },
      );
      await t.test(
        "provider failures stay visible and unknown create outcomes reconcile without replacement writes",
        async () => {
          const failed = await invite("failed");
          backend.clerk.mode("failed");
          assert.equal((await dispatch(failed)).state, "failed");
          await assert.rejects(
            backend
              .client("failed")
              .query(
                makeFunctionReference<"query">("creatorAccess:workspace"),
                scope,
              ),
            /FORBIDDEN/,
          );
          backend.clerk.mode("confirmed");
          assert.equal((await dispatch(failed)).state, "confirmed");
          const uncertain = await invite("uncertain");
          backend.clerk.mode("unknown");
          assert.equal((await dispatch(uncertain)).state, "unknown");
          const before = backend.clerk.counts().writes;
          await assert.rejects(
            backend
              .client("uncertain")
              .query(
                makeFunctionReference<"query">("creatorAccess:workspace"),
                scope,
              ),
            /FORBIDDEN/,
          );
          backend.clerk.mode("confirmed");
          assert.equal((await dispatch(uncertain)).state, "confirmed");
          assert.equal(backend.clerk.counts().writes, before);
          const absent = await invite("unknown-absent");
          backend.clerk.mode("unknown-absent");
          assert.equal((await dispatch(absent)).state, "unknown");
          const writes = backend.clerk.counts().writes;
          backend.clerk.mode("confirmed");
          assert.equal((await dispatch(absent)).state, "unknown");
          assert.equal(backend.clerk.counts().writes, writes);
        },
      );
      await t.test(
        "AC02 synthetic terms and fixture provider cannot enable a production-scoped campaign",
        async () => {
          await command("removeFixtureScope", { campaignSlug: "adoption" });
          assert.equal(
            (
              await bob.query(
                makeFunctionReference<"query">("creatorAccess:workspace"),
                scope,
              )
            ).terms,
            null,
          );
          await assert.rejects(
            bob.query(
              makeFunctionReference<"query">("creatorAccess:submissionAccess"),
              scope,
            ),
            /TERMS_UNAVAILABLE/,
          );
          await assert.rejects(
            bob.mutation(
              makeFunctionReference<"mutation">("creatorAccess:accept"),
              {
                ...request,
                invitationId: second._id,
              },
            ),
            /TERMS_UNAVAILABLE/,
          );
          await assert.rejects(dispatch(second), /FIXTURE_ADAPTER_FORBIDDEN/);
          await backend.command(
            "env",
            "remove",
            "CLERK_INVITATION_FIXTURE_URL",
          );
          assert.equal(
            (await dispatch(second)).state,
            "configuration-required",
          );
        },
      );
      await t.test(
        "manager permission is rechecked after provider dispatch and unresolved intent is reconciled by current authority",
        async () => {
          // The campaign was made production-scoped above; restore only the owned run's scope.
          await backend.command(
            "run",
            "fixtures:restoreFixtureScope",
            JSON.stringify({ campaignSlug: "adoption", runId: backend.runId }),
          );
          await backend.command(
            "env",
            "set",
            "CLERK_INVITATION_FIXTURE_URL",
            backend.clerk.url,
          );
          const slow = await invite("in-flight");
          const hold = backend.clerk.pauseNext();
          const running = dispatch(slow);
          try {
            await hold.arrived;
            await backend.command(
              "run",
              "fixtures:revoke",
              JSON.stringify({
                subject: "manager-a",
                nonprofitId: "nonprofit-a",
              }),
            );
          } finally {
            hold.release();
          }
          await assert.rejects(running, /FORBIDDEN/);
          const before = backend.clerk.counts().writes;
          for (const operation of [
            "creatorAccess:managerWorkspace",
            "creatorAccess:providerHistory",
            "creatorAccess:audit",
          ])
            await assert.rejects(manager.query(operation, scope), /FORBIDDEN/);
          await assert.rejects(invite("creator-a"), /FORBIDDEN/);
          await assert.rejects(
            manager.mutation(
              makeFunctionReference<"mutation">("creatorAccess:revoke"),
              {
                ...scope,
                invitationId: invitation._id,
                operationId: "revoke-a",
              },
            ),
            /FORBIDDEN/,
          );
          await assert.rejects(dispatch(slow), /FORBIDDEN/);
          const administrator = backend.client("administrator");
          assert.equal(
            (
              await administrator.action("clerkInvitations:dispatch", {
                ...scope,
                invitationId: slow._id,
                kind: "create",
              })
            ).state,
            "confirmed",
          );
          assert.equal(backend.clerk.counts().writes, before);
          const history = (
            await administrator.query(
              makeFunctionReference<"query">("creatorAccess:providerHistory"),
              scope,
            )
          ).find((row: any) => row.invitationId === slow._id);
          assert.equal(history.history[0].actor, "manager-a");
          assert.equal(history.history.at(-1).actor, "administrator");
        },
      );
    } catch (error) {
      console.error(backend.diagnostics());
      throw error;
    } finally {
      await backend.stop();
    }
  },
);

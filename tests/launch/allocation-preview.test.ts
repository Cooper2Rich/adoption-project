import test from "node:test";
import assert from "node:assert/strict";
import { createLocalBackend } from "../../scripts/launch/local-backend.mjs";
import { allocationInput } from "./fixtures.ts";

test(
  "Actual Convex allocation-preview acceptance",
  { timeout: 240000 },
  async (t) => {
    const backend = await createLocalBackend();
    try {
      const manager = backend.client("manager-a");
      const input = allocationInput();
      const winningReservations: {
        request: {
          campaignId: string;
          operationId: string;
          entryId: string;
          authorityRevision: string;
          financeRevision: string;
        };
        id: string;
      }[] = [];
      const saved = await manager.mutation("preview:save", {
        campaignId: "adoption",
        operationId: "preview-1",
        input,
      });
      assert.equal(saved.result.status, "ready");
      assert.equal(saved.result.boostCents, 2000);
      assert.equal(saved.actor, "manager-a");
      const secondSession = backend.client("manager-a");
      assert.equal(
        (
          await secondSession.query("preview:list", { campaignId: "adoption" })
        )[0]._id,
        saved._id,
      );
      const state = await secondSession.query("reservations:state", {
        campaignId: "adoption",
      });
      assert.equal(state.reservedSlots, 0);
      assert.equal(state.reservedCents, 0);

      await t.test(
        "S1-01 direct requests deny guests, creators and the other nonprofit",
        async () => {
          for (const identity of [undefined, "creator-adoption", "manager-b"]) {
            const client = backend.client(identity);
            await assert.rejects(
              client.query("preview:list", { campaignId: "adoption" }),
              /FORBIDDEN/,
            );
            await assert.rejects(
              client.mutation("preview:save", {
                campaignId: "adoption",
                operationId: "denied",
                input,
              }),
              /FORBIDDEN/,
            );
          }
          assert.equal(
            (await manager.query("preview:list", { campaignId: "adoption" }))
              .length,
            1,
          );
          assert.equal(
            (
              await backend
                .client("manager-b")
                .query("preview:list", { campaignId: "other" })
            ).length,
            0,
          );
        },
      );

      await t.test(
        "S1-02 duplicate requests return the same immutable result and changed content is rejected",
        async () => {
          const retry = await secondSession.mutation("preview:save", {
            campaignId: "adoption",
            operationId: "preview-1",
            input,
          });
          assert.equal(retry._id, saved._id);
          const changed = structuredClone(input);
          changed.settings.boostPercent = 25;
          await assert.rejects(
            manager.mutation("preview:save", {
              campaignId: "adoption",
              operationId: "preview-1",
              input: changed,
            }),
            /OPERATION_CONFLICT/,
          );
          const revised = await manager.mutation("preview:save", {
            campaignId: "adoption",
            operationId: "preview-2",
            input: changed,
          });
          assert.equal(revised.result.boostCents, 1000);
          assert.equal(saved.result.boostCents, 2000);
          assert.notEqual(revised._id, saved._id);
        },
      );

      await t.test(
        "S1-02 changed nonfinite inputs cannot reuse the same operation identity",
        async () => {
          const client = backend.client("manager-b");
          const invalid = structuredClone(input);
          invalid.finance.availableCents = NaN;
          const blocked = await client.mutation("preview:save", {
            campaignId: "other",
            operationId: "invalid-source",
            input: invalid,
          });
          assert.equal(blocked.result.status, "blocked");
          invalid.finance.availableCents = Infinity;
          await assert.rejects(
            client.mutation("preview:save", {
              campaignId: "other",
              operationId: "invalid-source",
              input: invalid,
            }),
            /OPERATION_CONFLICT/,
          );
        },
      );

      for (const campaignId of ["slot-control", "fund-control"])
        await t.test(
          `S1-09 concurrent reservations independently respect ${campaignId}`,
          async () => {
            const requests = ["a", "b"].map((key) => ({
              campaignId,
              operationId: `reserve-${key}`,
              entryId: `candidate-${key}`,
              authorityRevision: "authority-1",
              financeRevision: "finance-1",
            }));
            const contenders = await Promise.allSettled([
              backend
                .client("manager-a")
                .mutation("reservations:reserve", requests[0]),
              backend
                .client("manager-a")
                .mutation("reservations:reserve", requests[1]),
            ]);
            assert.equal(
              contenders.filter((value) => value.status === "fulfilled").length,
              1,
            );
            const rejected = contenders.find(
              (value) => value.status === "rejected",
            );
            assert.equal(rejected?.status, "rejected");
            if (rejected?.status === "rejected")
              assert.match(
                String(rejected.reason),
                /CAPACITY_OR_FUNDING_UNAVAILABLE/,
              );
            const finalState = await manager.query("reservations:state", {
              campaignId,
            });
            assert.equal(finalState.reservedSlots, 1);
            assert.equal(finalState.reservedCents, 1000);
            contenders.forEach((result, i) => {
              if (result.status === "fulfilled")
                winningReservations.push({
                  request: requests[i],
                  id: result.value._id,
                });
            });
          },
        );

      await t.test(
        "S1-01 expired, wrong-issuer, wrong-audience and invalid-signature tokens are rejected",
        async () => {
          for (const claims of [
            { exp: 1 },
            { iss: "https://wrong-issuer.invalid" },
            { aud: "another-application" },
          ]) {
            await assert.rejects(
              backend
                .client("manager-a", claims)
                .query("preview:list", { campaignId: "adoption" }),
              /auth|token|FORBIDDEN/i,
            );
          }
          const client = backend.client();
          const parts = backend.token("manager-a").split(".");
          parts[2] = (parts[2][0] === "a" ? "b" : "a") + parts[2].slice(1);
          client.setAuth(parts.join("."));
          await assert.rejects(
            client.query("preview:list", { campaignId: "adoption" }),
            /auth|token|FORBIDDEN/i,
          );
        },
      );

      await t.test(
        "S1-02/09 concurrent preview retries persist once and never reserve capacity",
        async () => {
          const request = {
            campaignId: "adoption",
            operationId: "concurrent-preview",
            input,
          };
          const [first, second] = await Promise.all([
            backend.client("manager-a").mutation("preview:save", request),
            backend.client("manager-a").mutation("preview:save", request),
          ]);
          assert.equal(first._id, second._id);
          assert.equal(
            (
              await manager.query("preview:list", { campaignId: "adoption" })
            ).filter(
              (row: { operationId: string }) =>
                row.operationId === request.operationId,
            ).length,
            1,
          );
          assert.equal(
            (
              await manager.query("reservations:state", {
                campaignId: "adoption",
              })
            ).reservedSlots,
            0,
          );
        },
      );

      await t.test(
        "S1-07 stale authority is rejected; a new revision preserves earlier plans",
        async () => {
          await backend.command(
            "run",
            "fixtures:changeAuthority",
            JSON.stringify({
              campaignSlug: "adoption",
              revision: "authority-2",
            }),
          );
          await assert.rejects(
            manager.mutation("preview:save", {
              campaignId: "adoption",
              operationId: "stale-authority",
              input,
            }),
            /AUTHORITY_CHANGED/,
          );
          const refreshed = structuredClone(input);
          refreshed.authority.revision = "authority-2";
          const record = await manager.mutation("preview:save", {
            campaignId: "adoption",
            operationId: "new-authority",
            input: refreshed,
          });
          assert.equal(record.input.authority.revision, "authority-2");
          assert.equal(
            (
              await manager.query("preview:list", { campaignId: "adoption" })
            ).find((row: { _id: string }) => row._id === saved._id).input
              .authority.revision,
            "authority-1",
          );
          // Model a committed operation whose successful response is discarded.
          await manager.mutation("preview:save", {
            campaignId: "adoption",
            operationId: "response-lost",
            input: refreshed,
          });
          await backend.restart();
          const restarted = backend.client("manager-a");
          const retry = await restarted.mutation("preview:save", {
            campaignId: "adoption",
            operationId: "response-lost",
            input: refreshed,
          });
          assert.equal(
            (
              await restarted.query("preview:list", { campaignId: "adoption" })
            ).filter(
              (row: { operationId: string }) =>
                row.operationId === "response-lost",
            ).length,
            1,
          );
          assert.equal(retry.input.authority.revision, "authority-2");
          for (const winner of winningReservations) {
            assert.equal(
              (await restarted.mutation("reservations:reserve", winner.request))
                ._id,
              winner.id,
            );
            assert.equal(
              (
                await restarted.query("reservations:state", {
                  campaignId: winner.request.campaignId,
                })
              ).reservedCents,
              1000,
            );
          }
          assert.equal(
            (
              await restarted.query("reservations:state", {
                campaignId: "adoption",
              })
            ).reservedCents,
            0,
          );
        },
      );

      await t.test(
        "S1-10 simulated score incidents update once, preserve recipients and resolve on complete evidence",
        async () => {
          const currentInput = structuredClone(input);
          currentInput.authority = (
            await manager.query("preview:campaign", { campaignId: "adoption" })
          ).authority;
          const incomplete = structuredClone(currentInput);
          incomplete.entries[3].metrics = {
            impressions: null,
            clicks: null,
            raisedCents: null,
          };
          const held = await manager.mutation("preview:save", {
            campaignId: "adoption",
            operationId: "incomplete-1",
            input: incomplete,
          });
          assert.equal(held.result.status, "boosts-held");
          await manager.mutation("preview:save", {
            campaignId: "adoption",
            operationId: "incomplete-2",
            input: incomplete,
          });
          const incidents = await manager.query("preview:notifications", {
            campaignId: "adoption",
          });
          assert.equal(incidents.length, 1);
          assert.deepEqual(incidents[0].recipients, [
            "administrator",
            "manager-a",
          ]);
          assert.deepEqual(incidents[0].incompleteEntryIds, ["d"]);
          assert.equal(incidents[0].simulated, true);
          assert.equal(incidents[0].status, "open");
          await manager.mutation("preview:save", {
            campaignId: "adoption",
            operationId: "complete-after-hold",
            input: currentInput,
          });
          const resolved = (
            await manager.query("preview:notifications", {
              campaignId: "adoption",
            })
          )[0];
          assert.equal(resolved.status, "resolved");
          assert.deepEqual(
            resolved.history.map((event: { state: string }) => event.state),
            ["opened", "updated", "resolved"],
          );
          assert.equal(
            (
              await manager.query("preview:list", { campaignId: "adoption" })
            ).find((row: { _id: string }) => row._id === held._id).result
              .status,
            "boosts-held",
          );
        },
      );
      await t.test(
        "S1-01 revoked membership cannot read cached operation results",
        async () => {
          await backend.command(
            "run",
            "fixtures:revoke",
            JSON.stringify({
              subject: "manager-a",
              nonprofitId: "nonprofit-a",
            }),
          );
          await assert.rejects(
            manager.query("preview:list", { campaignId: "adoption" }),
            /FORBIDDEN/,
          );
          await assert.rejects(
            manager.mutation("preview:save", {
              campaignId: "adoption",
              operationId: "preview-1",
              input,
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

test(
  "S1-01 application authentication configuration rejects the harness fixture issuer",
  { timeout: 240000 },
  async () => {
    const backend = await createLocalBackend({ fixtureAuth: false });
    try {
      await assert.rejects(
        backend
          .client("manager-a")
          .query("preview:list", { campaignId: "adoption" }),
        /auth|token|FORBIDDEN/i,
      );
    } finally {
      await backend.stop();
    }
  },
);

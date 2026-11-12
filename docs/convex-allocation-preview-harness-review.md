# Convex allocation-preview harness review

Review completed 2026-11-11 under grill-with-docs. Planning only; no implementation, account setup or issue publication. Q104 and CT-01–CT-04 remain accepted. Q105 settles advisory preview semantics; Q106 confirms the complete harness design below. This review supplements the [first-slice contract](adoption-launch-advertising-contract.md#first-complete-build-slice--candidate-for-separate-authorization). The bounded slice is specification-ready for separately requested ticket drafting; implementation feasibility and behavioral verification remain unproven.

## Established technical facts

- Convex supports an actual local development backend without a Convex account, with persisted on-disk state. Local deployments are beta. Restart clears logs; durability must be checked by querying application records. [Local deployments](https://docs.convex.dev/cli/local-deployments)
- `convex-test` is a JavaScript mock backend. Explicit identities and fake timers support fast function tests, but cannot alone prove actual-backend persistence or the browser journey. [convex-test](https://docs.convex.dev/testing/convex-test)
- Actual local-backend tests exercise clients and backend code together, with backend limits. Backend time, fetch and randomness cannot be mocked there. [Testing the local backend](https://docs.convex.dev/testing/convex-backend)
- Custom JWT authentication supports inline JWKS, signed tokens, issuer checks and audience checks through `applicationID`. The React client accepts an auth adapter. [Custom JWT](https://docs.convex.dev/auth/advanced/custom-jwt), [custom auth integration](https://docs.convex.dev/auth/advanced/custom-auth)
- Mutations provide atomic transactions and optimistic concurrency control. Application reads, revision checks and reservation writes must share the relevant transaction. [OCC and atomicity](https://docs.convex.dev/database/advanced/occ)

These are documentation findings, not successful runs in this repository. No Convex dependency/configuration is currently established by package.json.

## Accepted verification structure

1. Fast tests cover arithmetic, persisted calculation inputs for Chicago/DST boundaries, authorization and application behavior through convex-test where appropriate.
2. A dedicated actual local backend exercises the intended schema/functions, actual React client and Playwright journey. It covers S1-01–S1-10, direct denied requests, two nonprofit scopes, concurrent clients, operation deduplication and revision conflicts.
3. Restart the same isolated backend with the same state, then query old plans/settings/explanations from new authorized sessions. Cleanup happens after durability assertions, never between shutdown and restart.
4. Fixture authentication generates per-run signing material and short-lived tokens trusted only by the isolated local configuration. The browser receives tokens, never signing/admin keys. Production uses Clerk and never trusts fixture issuers. Application membership/resource authorization remains the intended Convex implementation. Real Clerk integration and invitation/recovery behavior retain PG-04.
5. Use explicit historical calculation inputs instead of assuming the actual backend clock can be faked. Record notification intent in a durable test sink/outbox; inspect manager/admin recipients and deduplication without external dispatch. Provider ads, payments, transfers, refunds and invitations have no dispatch path in this slice.

The fixture-token arrangement is a design inference from documented primitives. Exact CLI/backend versions, Windows support, isolated ports/state directory, reset/restart lifecycle, auth-configuration separation and runnable commands require engineering validation after separate implementation authorization. Existing proposed test filenames are placeholders.

## Accepted decisions

**Q105 — Saved preview versus reservation:** The user answered "Follow that recommendation." Saving an allocation preview persists its inputs, settings, calculation and explanation without reserving campaign money or slots. Separate tests exercise the intended compare-and-reserve behavior against isolated campaign records, including concurrency and restart, without dispatching anything. CT-03's live admission guarantees remain required; ordinary preview saves do not perform admission.

**Q106 — Shared understanding:** The user answered "I like this design." The complete harness design is confirmed: advisory previews and draft settings, separate intended reservation tests, actual local Convex/browser/persistence/concurrency coverage, isolated signed fixture identities, intercepted notifications and immutable historical previews. The design review is complete; no further confirmation question is pending.

## Transaction and record boundaries confirmed in Q106

- **Preview:** Save draft settings, the complete evidence snapshot/provenance, actor, calculation time/day, source/authority revisions, result and explanation atomically. Draft settings do not activate operational spending edits. Saving a successful or blocked calculation cannot change active reservations, available funds, slot occupancy, admission state or provider state. Repeated previews do not accumulate obligations.
- **Identity and retries:** Authorize every read/write before looking up an operation result. Scope operation identity to the campaign and operation type. Same identity with the same request returns the persisted result; reuse with changed contents is rejected. A deliberate new calculation uses a new operation identity and preserves earlier immutable results. Concurrent duplicate requests cannot create duplicate results or simulated notification intents.
- **Changing inputs:** Read the relevant authority/settings/evidence revisions inside the mutation. A stale requested revision is explicitly rejected or recalculated from a newly identified snapshot; never silently relabel old results as current. Historical previews remain unchanged and visibly identify their input versions. Revalidate all current approvals/evidence at eventual admission; a preview never authorizes it.
- **Reservation verification:** The test harness calls the intended reservation operation, not a test-only imitation. In an isolated campaign with one remaining slot or insufficient funds for both contenders, concurrent distinct requests cannot both consume the same capacity. Check committed records, remaining coverage, revision handling and duplicate results after restart. Synthetic reservations never appear in production records and are not created by the preview UI.
- **Authorization:** Test guests, creators, a manager for each of two nonprofits and permitted operators through intended function boundaries. Denied requests cannot persist plans/reservations or read another nonprofit's private data. Test missing/expired/invalid fixture tokens and revoked membership. Roles/resource membership are checked server-side, rather than trusted as browser assertions.
- **Notifications:** Preview incidents and their manager/admin notification intent live in an explicitly simulated scope. Verify durable recording, recipient scope and duplicate suppression. No live incident/email is created by viewing/saving a preview. This proves notification intent handling, not real email delivery/retry behavior. Blocked allocation results remain inspectable by their authorized operators.
- **Clock and sources:** Calculation time, Chicago day boundaries, snapshot timestamps and safety settings are explicit test inputs. Exercise fresh/stale/unknown data without changing the backend clock. Fixture safety values carry test provenance and are not approved production defaults. Test unconfigured and unreliable evidence as blocked states.

## Isolation, lifecycle and failure criteria

Use a new local backend/state directory and generated fixture keys for each run; serialize scenarios unless they explicitly test concurrency. Test two nonprofit scopes inside that same isolated backend. Verify the selected endpoint is the owned local test backend before seeding/resetting anything. Do not fall back to a cloud deployment or existing developer data. Cleanup is limited to the run's owned resources; a failed run preserves sufficient redacted evidence for diagnosis.

For durability, await an acknowledged commit, shut down the backend, restart with the same data/configuration and reread records from new clients/browser sessions. Only then clean up. Also test a request whose response is lost after commit: retry the same identity and observe one persisted result/reservation, not a replacement. Reproducible startup/download/network prerequisites must be reported as setup failures, never passing acceptance tests.

The harness must select fixture auth only for its dedicated local target; production configuration rejects the fixture issuer. Seeding/admin helpers remain outside application/public functions and browser bundles. The local fixture key never becomes a production authentication fallback. Validation must inspect configuration separation as well as token denial behavior. Clerk remains the production choice.

## Required evidence before implementation can claim success

Map every S1-01–S1-10 assertion to an actual executed test, with full scenario coverage across fast tests and the real backend. The browser must submit settings/inputs, receive a persisted result, display its explanation and retrieve it in another authorized session; direct client assertions cover denial and concurrent operations as well. Browser request mocking cannot replace the Convex path being asserted.

Record exact pinned runner/backend versions, startup/reset/restart instructions, test counts without silent skips, meaningful red/green behavioral evidence, redacted persisted records and browser traces. Demonstrate both advisory non-consumption and real isolated reservation contention. Run applicable build/regression checks and distinguish existing failures from slice failures. Missing files, successful imports, screenshots alone and mock-only tests do not satisfy the real-backend gate.

No application tests or local-backend setup were executed during this review. Confirmation settles the design, not its technical feasibility or implementation results. Exact commands and lifecycle/auth wiring remain implementation validation tasks. A concrete unsupported result must return for review rather than silently weakening S1 acceptance or changing the selected stack. Paid-launch, provider, actual safety-value and Clerk gates remain blocked.

## Review outcome

The design frontier is empty after Q106. The next planning step is to reconcile the tracker with accepted decisions and prepare the bounded slice's spec/ticket breakdown when requested. Implementation must establish working pinned commands, local lifecycle/auth separation and meaningful behavioral evidence. Confirmation does not authorize implementation, ticket publication, account setup or deployment. Whole-launch/Ralph readiness remains Blocked by provider/account evidence, actual approved safety values and production verification.

**Subsequent item 2 completed, 2026-11-11:** The user requested existing tracker reconciliation. [The reconciliation record](planning-tracker-reconciliation.md) records published/verified design resolutions, narrowed evidence gates and native dependencies. This later request authorized existing planning-issue updates, not application implementation or new implementation tickets. Spec/ticket preparation is the next planning phase.

**Subsequent bounded implementation, 2026-11-11:** The user then explicitly chose "Start implementation, preparing the spec and plan as needed." The [build spec](allocation-preview-build-spec.md), [run guide](ALLOCATION-PREVIEW.md) and [implementation evidence](allocation-preview-verification.md) record the resulting actual local Convex/browser path, restart/concurrency tests, isolated auth configuration and synthetic notification lifecycle. Earlier statements about absent code/tests describe the design-review checkpoint, not the subsequent implementation. Live/provider/Clerk/safety/whole-launch gates remain open; no implementation tickets or live operations were published/performed.

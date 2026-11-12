# Durable manager allocation preview — build specification

Scope: the credential-free first slice confirmed through Q106, using the [advertising acceptance contract](adoption-launch-advertising-contract.md) and [Convex harness design](convex-allocation-preview-harness-review.md). The user explicitly selected "Start implementation, preparing the spec and plan as needed." This authorizes local implementation of this bounded feature. Provider setup, live integrations, spending and deployment remain outside this build.

## Problem statement

A campaign manager needs to understand possible baseline/boost allocations, protected funding and blocking reasons before any advertising is admitted or money committed. The current demo uses browser-local state and cannot prove shared durable records, server authorization or safe concurrent reservations.

## Solution

Provide a manager workspace that saves advisory allocation previews through the actual Convex client/backend, preserves immutable input/result history and explains whole-cent baseline/boost/provider allocations. Use visibly synthetic inputs and explicit isolated fixture identities during local development. Saving drafts/previews activates no operational settings and consumes no campaign funds or slots.

## User stories

1. As a campaign manager, I want an authorized workspace for my campaign so that another nonprofit's private records remain inaccessible.
2. As a campaign manager, I want to enter draft baseline, budget, boost and provider settings so that I can inspect a proposed allocation before approving spending.
3. As a campaign manager, I want to see the evidence timestamp, source and settings/authority revisions so that I know which inputs explain the result.
4. As a campaign manager, I want my baseline protected across the funded run before boosts so that a preview cannot conceal underfunded obligations.
5. As a campaign manager, I want residual boosts calculated from complete daily scores with full cutoff ties so that the selected policy is applied consistently.
6. As a campaign manager, I want healthy startup separated from missing/stale reports so that unknown performance never becomes an invented zero or private bonus.
7. As a campaign manager, I want unavailable provider shares held visibly so that they are not silently moved to another platform.
8. As a campaign manager, I want Chicago first-day/DST proration and deterministic remainder cents so that a plan conserves whole cents.
9. As a campaign manager, I want explicit blocked results for invalid, missing, stale or underfunded evidence so that I can correct the named cause.
10. As a campaign manager, I want saved previews and history available in a second session and after restart so that explanations survive my browser and service lifecycle.
11. As a campaign manager, I want safe repeated submissions so that response loss or double-clicks do not duplicate plans or notification intent.
12. As a campaign manager, I want previous results unchanged when I generate a new version so that I can review what changed.
13. As a campaign operator, I want immediate simulated notification intent when incomplete reports hold boosts so that the affected scope and recipients are verifiable without email dispatch.
14. As a platform operator, I want isolated concurrent reservation checks so that the intended admission operation cannot overbook a final slot or the same funding.
15. As a public visitor or creator, I want private campaign finance and other creators' records protected by server authorization.
16. As an engineer, I want a reproducible credential-free actual-backend runner so that these checks do not depend on production accounts, demo-role headers or existing developer data.

## Implementation decisions

- Keep the preview in its own launch entry point using shared React/Convex conventions; the existing public demo remains regression coverage rather than the preview's persistence/authentication mechanism.
- Use a pure intended allocation planner behind authorized Convex operations. Fast tests use that public calculation boundary; actual-backend/client tests use intended application mutations/queries; browser tests drive the manager interface. These seams were confirmed in Q106.
- Persist campaign membership, authority revisions, draft/input snapshots, immutable plans, simulated notification intents and separate intended reservation records. Use strict validators for boundary inputs. Server membership checks precede cached-result lookup; resource scope never comes from browser role assertions.
- Fixture signing keys/configuration belong only to owned isolated local runs. Production auth uses Clerk and rejects fixture issuers. Fixture support must not be enabled by a public demo-role header or production fallback.
- Keep operation identity scoped to campaign and operation kind; exact retries return the same result. Changed request contents under the same identity are rejected. New calculations preserve old versions.
- Apply CT-01–CT-04. Input data must explicitly identify whole-run protection, today's embedded baseline, already-reflected versus additional obligations, daily/total headroom and approved safety-config provenance. Fixtures are synthetic, not production defaults.
- Unknown finance blocks the plan. Reliable finance plus incomplete required eligible-entry scores permits safe baseline previews with boosts held and simulated immediate manager/admin notification. Only explicitly healthy startup divides the defined boost pool equally.
- Preserve fixed baselines, exact cutoff ties after existing score/click/fundraising/impression tie-breakers, stable remainder assignment and provider shares without redistribution.
- Use Chicago actual calendar-day bounds for first-day proration. Historical calculation times are data inputs, not changes to the actual backend clock.
- A saved preview never invokes admission/reservation. Verify the intended reservation operation separately against isolated campaigns, with one transaction for authority/evidence checks and capacity/fund consumption.
- External-provider dispatch is absent from this feature. Notification tests inspect durable simulated intent rather than real delivery.

## Acceptance and verification

| Contract | Required observable result                                                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-01    | Authorized manager can save/read; guest/creator/wrong-nonprofit/direct requests are denied; fixture auth is explicit and isolated.                                                                        |
| S1-02    | Snapshot/settings/actor/explanation survive restart and two sessions; exact retries deduplicate; new inputs preserve immutable history.                                                                   |
| S1-03    | Four 1,500-cent baselines, 10,000-cent daily authority, 4,000-cent residual headroom and 50% boosts give two tied leaders 2,500 each and others 1,500 each, leaving 2,000 uncommitted.                    |
| S1-04    | Healthy startup gives four 2,000-cent targets under the same funding; incomplete scores hold boosts; unknown finance blocks.                                                                              |
| S1-05    | Count one entry across placements once; a 2,500-cent target splits 1,500/1,000 at 60/40; unavailable shares are held; paused/stopping slots remain occupied.                                              |
| S1-06    | A 1,000-cent baseline at ordinary-day Chicago noon prorates to 500; actual spring/fall boundaries, empty-entry and one-cent cases conserve funds.                                                         |
| S1-07    | Missing safety config, bad/unknown finance, underfunded whole-run coverage, invalid settings and changed authority revisions block/reject safely without double reserve deduction.                        |
| S1-08    | UI uses the persisted plan's provenance, versions, baseline/boost/provider cents, tie expansion, capacity and reasons; private data stays private.                                                        |
| S1-09    | Concurrent preview saves reserve nothing; separate intended reservation contention/restart tests cannot overbook; no external dispatch path; real behavioral/browser assertions execute.                  |
| S1-10    | Mixed complete/incomplete entrants retain safe baselines with zero new boosts and simulated scoped notifications; later complete evidence creates a new ordinary ranked result without rewriting history. |

Require meaningful failing assertions before green behavior, no silent skips, redacted saved results and applicable build/regression checks. The actual local backend must establish restart durability, concurrent behavior and the real client/browser path; a JS mock or module import cannot establish them. Record pinned runtime/backend versions and runnable startup/reset/restart commands after validation. Report setup failures distinctly from acceptance failures.

## Build sequence

1. Establish an owned isolated actual Convex backend and verify authenticated persisted blocked previews through the manager interface. This validates the new client/backend/auth/data path before financial calculations are enabled.
2. Add safe fixed-baseline previews, whole-run/obligation protections, Chicago proration and provider shares with persisted explanations.
3. Add residual ranked/startup boosts, full cutoff ties, mixed-score holds and simulated operator notification intent.
4. Complete immutable history, exact retry/revision behavior and restart/response-loss verification across sessions.
5. Verify separate intended reservation contention, complete browser journeys and regression/build checks across all S1 cases.

This sequence is an implementation plan, not an approved/published GitHub ticket breakdown. No implementation issues are published without review of their concrete deliverables and blockers.

## Out of scope

Live Clerk invitations/recovery, Stripe/Meta/TikTok accounts or calls, approved production safety values, real ads/payments/notification delivery, original-video upload processing, live launch, deployment and wider marketplace behavior. Those remain the evidence/production gates in the reconciled planning map. This preview does not certify them.

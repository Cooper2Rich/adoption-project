# Allocation-preview implementation evidence

2026-11-11, America/Chicago. The user explicitly selected implementation of the Q106 preview with the spec/plan prepared as needed. This is evidence for that bounded local feature; whole-launch/Ralph readiness remains Blocked.

## Implemented path

Manager UI -> actual React Convex client -> authenticated Convex mutation/query -> intended planner -> isolated durable records -> rendered persisted explanation. The draft form restores saved settings in a new authorized session. History is immutable; identical operation retries return the saved result, while changed contents require a new identity. Canonical request comparison preserves Convex's nonfinite-number encoding, so distinct invalid financial payloads cannot collide as JSON null.

The preview does not activate spending settings or reserve money/slots. Separate intended reservation operations use independent slot-limited and funding-limited campaigns, server-authorized candidates and atomic revision/capacity/funding checks. No provider dispatch exists in this slice.

## Acceptance coverage

| Contract | Evidence                                                                                                                                                                                                                                                                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-01    | Actual signed manager calls succeed; guest/creator/wrong-nonprofit, expired/wrong-issuer/wrong-audience/bad-signature and revoked membership calls are denied. Exact application auth configuration rejects fixture identities after controlled local bootstrap. Browser checks reject cross-origin sessions and HEAD requests for private backend configuration. |
| S1-02    | Saved settings/results retrieve in a fresh browser session, exact/concurrent retries deduplicate, changed contents conflict, earlier revisions persist and acknowledged commits survive an actual backend process restart. A discarded-response retry creates no duplicate.                                                                                       |
| S1-03    | Independent $15/$100/$40 residual/50% boost example yields $25/$25/$15/$15 and $20 uncommitted, including full cutoff ties.                                                                                                                                                                                                                                       |
| S1-04    | Healthy startup yields $20 per entry; incomplete reports preserve $60 baseline with zero new boosts; unknown finance blocks.                                                                                                                                                                                                                                      |
| S1-05    | 60/40 shares produce $15/$10 for a $25 target; unavailable shares remain held; stopping entries retain occupied capacity while excluded from new targets.                                                                                                                                                                                                         |
| S1-06    | Ordinary Chicago noon and actual 23-/25-hour DST days, one-cent boost/provider remainder ordering, empty entries and zero authority conserve cents.                                                                                                                                                                                                               |
| S1-07    | Missing/invalid safety settings, unknown/stale/negative/underfunded finance, bad settings/identity/timestamps, duplicate obligations and stale authority reject/block safely. Future reserves and provider-reflected obligations are not deducted twice.                                                                                                          |
| S1-08    | Desktop/mobile display persisted money, authority/safety versions, financial provenance, capacity/tie counts and reasons. Browser asserts no runtime page errors or horizontal page overflow in the saved journey.                                                                                                                                                |
| S1-09    | Concurrent preview retries reserve nothing. Separate slot-only and funding-only contention tests each allow one winner and preserve its operation/state after restart. No provider/email/invitation path is dispatched.                                                                                                                                           |
| S1-10    | Mixed-score and inconsistent startup inputs cannot award invented boosts; simulated incidents preserve manager/admin recipients, update one incident and resolve after complete evidence while old plans remain held.                                                                                                                                             |

## Verification commands

- `npm run test:launch:planner`: 10 passed, no skips.
- `npm run test:launch:backend`: 12 passed, no skips, including actual process restart, independent reservation contention and isolated application-auth rejection.
- `npm run test:launch:browser`: 8 passed across desktop and mobile, no skips. Includes draft-setting recovery and HTTP 403 checks for private state and cross-origin fixture-session access.
- `npm test`: all 130 existing regression tests passed, no skips.
- `npm run build:launch`: typecheck and dedicated frontend bundle passed.
- `npm run build`: existing application typecheck and bundle passed.

Meaningful failing assertions preceded the core fixed-baseline/tie, mixed-score hold, Chicago proration, reservation contention, incident deduplication and invalid-input fixes. Test setup failures were reported as setup failures, including unreadable OneDrive dependency placeholders and a native Windows watcher abort; locked dependency reinstall, isolated public cache and owned polling watchers resolved them.

## Practical limits

Actual Convex CLI/SDK `1.49.0`, pinned backend `precompiled-2026-10-22-1447815` and Node `24.19.0` were exercised on this Windows machine. Generated fixture signing keys and backend state are separate from browser-serving paths. Test artifacts use synthetic data; no provider account, grant, live balance, real Clerk invite/recovery flow or actual numeric safety policy is certified.

All 79 broad launch requirements do not become implemented because S1 passes. Per-requirement production/provider verification remains future work. No account setup, provider messages, financial action, ad publication, deployment, PR or implementation-ticket publication occurred. Existing unrelated user files and the original demo were preserved. Use the [run guide](ALLOCATION-PREVIEW.md) for exact commands and workspace lifecycle.

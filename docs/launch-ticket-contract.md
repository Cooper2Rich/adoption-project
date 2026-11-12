# Launch ticket contract

Shared terms for every launch ticket under [launch build #64](https://github.com/Cooper2Rich/adoption-project/issues/64). Each ticket used to repeat these sections word for word; tickets now link here instead. A ticket's own acceptance criteria and source criteria still define its slice, and where a ticket is more specific than this file, the ticket wins.

Changing this file changes the contract for every open launch ticket, so treat edits like a ticket change: review them and say which tickets they affect.

## Accepted architecture and baseline

Accepted architecture: Convex backend/data/authorization, Vercel frontend, Clerk sign-in/invitations/sessions/supported recovery, Stripe conditional finance baseline, private Blob original videos and Mux processed playback. Convex validates Clerk identity and enforces current role/nonprofit/campaign/resource scope. Public viewing/donating remain account-free. First public rollout is adoption.is only with reusable nonprofit isolation. Do not build replacement authentication or use browser demo roles/localStorage as production authority.

Reuse the implemented local S1 actual-Convex/browser harness, planner, durable advisory preview, exact-retry history and separately tested reservation primitive. S1 is on `main` (landed by T00, #65) as bounded local evidence; it is not deployed production or real provider approval. Cosmetic preview redesign is deferred and the unique competition-entry total is already added.

## Shared engineering contract

- CT-01: USD whole cents with finite safe arithmetic; half-up first-day dailyCents * remaining actual Chicago-day seconds / actual day seconds. Equal-pool remainders use ascending entry creation time/stable ID; provider splits use largest fractional remainder and Meta-before-TikTok exact ties. Positive active baseline/top count/active targets/trial duration, weights total 100%, thresholds 0-100 and valid percentages; zero authority grants no spend and negative availability remains a blocking deficit.
- CT-02: Begin with verified scoped available Issuing funds and subtract only obligations not already provider-reflected. Protect whole remaining baseline/safety/other obligations once; today consumes its embedded baseline, overlapping trial protection is not added twice. Residual boost headroom is bounded by free verified cash, remaining daily authority and remaining total authority. Uncertain coverage stays held; released authorization alone is not canceled debt.
- CT-03: Persist nonprofit/campaign/Chicago day/authority/settings/input revisions and stable operation identity. Revalidate and reserve slot plus funds atomically; reject/recompute changed revision, exact retries deduplicate and queue ties use stable ID. Advisory preview saves never reserve. Revalidate evidence/authority before dispatch.
- CT-04: Journal intended action/object identity before dispatch and distinguish proposed/reserved/dispatched/uncertain/provider-confirmed/reconciled. Retain supported provider-specific keys/lookups, not assumed endpoint idempotency. Unknown outcomes do not permit replacement writes or reservation release. Money approval binds beneficiary/amount/USD/source/permitted destination/route/revision; changed contents need review and cumulative refunds/disputes/recovery reconcile once.

## Accepted original-video lifecycle

Applies to tickets that handle original videos (T04, T06, T07, T37, T39a, T39b, T40a).

- Original videos use private Vercel Blob exact bytes, separate Mux processed playback and Convex records/permissions; no automatic original expiry on withdrawal/completion/playback removal.
- Original download grants require current uploader/scoped-manager/authorized-administrator permission. Explicit confirmed audited administrator deletion is blocked while active/publishing; retain bytes for 30-day recovery, restore cancels purge, reconcile races and unknown deletion, and retain audit after confirmed physical purge.

## Verification and external evidence

Decision precedence: later accepted Q89-Q106 mechanics and the approved slice acceptance criteria supersede historical open-question/readiness wording inside reproduced source criteria. CT-01 through CT-04 and the chosen Convex/Clerk/media architecture are settled; actual provider facts and numeric safety values remain evidence gates. Engineering acceptance uses authenticated public Convex operations, real isolated persistence/restart/concurrency where relevant, browser journeys for visible outcomes and provider adapters for controlled callbacks/failure/unknown outcomes. Candidate adapters/fixtures must be visibly unvalidated and cannot enable production dispatch. Real account evidence is separate: #12 advertising, #20 Stripe eligibility, #21 funding/refund/return/read routes, #22 actual safety settings, T38 real Clerk and T39 real media/email; T40 aggregates release proof. If a selected actual capability is unsupported, return that limitation for decision instead of silently choosing pooled/manual-only behavior.

- Extend the existing actual-backend suite (npm run test:launch:backend) and visible desktop/mobile journeys (npm run test:launch:browser) for this slice. Use public operations/results rather than private implementation assertions; reuse focused planner tests where cents/time calculations change.
- Name the runnable command and observable test for each owned acceptance assertion in completion evidence. Use owned isolated records/identities; include relevant denial, exact-boundary, duplicate/reordered event, uncertain outcome, restart and concurrency assertions.
- Run the applicable launch build/regressions, retaining redacted actor/source/time/version/provider references. No skipped/zero-test/import-only or document-only pass establishes behavior; a candidate provider response does not establish real account capability.

## Human-owned evidence tickets

Applies in addition to the section above for tickets labelled `ready-for-human` that gather real-environment evidence (T38, T39a, T39b).

This is a human-owned real-environment evidence ticket. Automated preparation/checks are useful, but fixture success cannot close it. Obtain only the applicable authorized account/environment access, keep secrets out of issue evidence and report any remaining human/provider prerequisite.

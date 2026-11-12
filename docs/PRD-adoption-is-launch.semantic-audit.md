# adoption.is launch readiness review — 2026-11-11

**Verdict: Revised bounded-slice specification confirmed through Q106; whole launch/Ralph remains Blocked.** Q95–Q104 supersede the historical Express/SQLite harness with the selected Convex architecture and media policies. Q105 confirms advisory preview saves; Q106 confirms the replacement [Convex harness design](convex-allocation-preview-harness-review.md). Unaffected product decisions and CT-01–CT-04 remain accepted. The credential-free preview is specification-ready for separately requested ticket drafting. The later explicit bounded implementation request produced working local Convex lifecycle/auth and browser checks; see [bounded evidence](allocation-preview-verification.md). This does not establish production/provider/real-Clerk behavior. Actual provider/program/route/access evidence, safety values and production verification remain launch gates. No implementation or publication is authorized.

## Current authority and artifacts

- [Base PRD](PRD-adoption-is-launch.md): REQ-101–REQ-143, preserving unaffected public/creator/fundraising/competition behavior and full chronological interview history.
- [Advertising supplement](adoption-launch-advertising-contract.md): REQ-144–REQ-179, current expanded advertising rules, accepted RD/Q89–Q93 rules, CT engineering contract confirmed in Q94, provider gates and first-slice S1-01–S1-10 acceptance.
- [Complete verification map](adoption-launch-verification-plan.md): all 79 current requirements and 191 acceptance criteria. Planned checks remain absent; no missing-file output is claimed behavioral red evidence.
- [Base structural audit](PRD-adoption-is-launch.audit.json): 43 requirements, zero errors, 11 warnings.
- [Supplement structural audit](adoption-launch-advertising-contract.audit.json): 36 requirements, zero errors, 13 warnings.

The supplemental accepted advertising rules govern over superseded advertising summaries. Its explicitly labeled review proposals are not user decisions. Passing these audits means structural validity only. Original docs/PRD.md and earlier rebuild artifacts remain historical.

## Reconciliation result

C1–C5 and intended U1–U4 choices are recorded through Q88. C6 now explicitly separates collection, Issuing availability, liabilities, reserves and live financial gates. Full-run baseline protection precedes residual boosts; queue, admission, continuation, stopping, financial pauses/recovery, fees/refunds/returns/disputes and immediate blocker notification have separately testable supplemental requirements.

The full-run reserve/trial/current-day overlap, whole-cent conservation, atomic slots/headroom, exact refund/return approval contents and unknown-write recovery are explicit CT mechanics confirmed in Q94. They are not invented provider capabilities. The earlier unimplemented per-requirement command paths were regenerated against the current checkboxes; stale REQ-122/REQ-132 criterion counts no longer certify coverage.

## Boundary decisions accepted on 2026-11-11

| Accepted decision | Implementation consequence | Recorded location |
| --- | --- | --- |
| RD-01 / Q89 | When elapsed unused/paused-slot baseline may become available without exposing future baseline or unknown liabilities | Supplement Open questions |
| RD-02 / Q90 | A delayed/paused trial can outlive the locked funded end; no silent date or spending extension | Supplement Open questions |
| RD-03 / Q91 | A new entrant or partial report can lack usable scores while other entries have them; never invent per-entry startup or zero | Supplement Open questions |
| RD-04 / Q92 | Queued retrial authorization and actual admission may see different policy versions | Supplement Open questions |
| RD-05 / Q93 | Older failed and newer passed delayed evaluation windows need a stable order and nonretroactive cutoff | Supplement Open questions |

These five cases were immediately surfaced in chat and are now resolved by explicit user acceptance. Q91 additionally requires immediate notification when missing-score coverage holds new boosts; S1-10 verifies the baseline-safe/boost-held preview state. None of these accepted rules establishes provider access or production evidence.

## Remaining launch blockers and owners

| ID | Blocking evidence | Resolution responsibility |
| --- | --- | --- |
| LB-01 / PG-01 | Stripe nonprofit/crowdfunding/Issuing program and account eligibility not approved; GitHub #20 OPEN on 2026-11-11 | Human program/account owner obtains authoritative evidence; no inquiry sent |
| LB-02 / PG-02 | Approved collection-to-spending and refund/return routes, actual reads, payer/instrument acceptance and matching/release evidence not validated; #21 OPEN | Authorized provider investigator after program evidence; return limitations for human decision |
| LB-03 / PG-03 | Meta/TikTok grants, objective/media/identity/pacing/minimums, controlled writes, delivery/pause timestamps, comparable metrics and coverage contracts unverified | Authorized provider/account validation; no credentials/account operations performed |
| LB-04 / PG-04 | Clerk forwarding/replay/revocation/recovery and actual access adapter evidence absent | Authorized isolated Clerk validation; no internal recovery replacement |
| LB-05 / PG-05 | Actual reserve/freshness/release settings unset and unapproved | Administrator approval after relevant evidence; no zero/unlimited defaults |
| LB-06 — RESOLVED | RD-01–05 accepted in Q89–Q93 | Incorporated into requirements and verification; no longer a current blocker |
| LB-07 — RESOLVED | Q94 confirms CT-01–CT-04; Q95 superseded the old harness, Q105 clarifies advisory previews and Q106 confirms the replacement Convex harness design | Separate publication/build authorization remains required; actual lifecycle/auth wiring and behavior remain unproven |
| LB-08 / PG-06 | Production implementation and complete behavioral/browser/provider evidence absent | Future separately authorized implementation/verification; not a reason to prohibit writing a bounded specification |

Every detected launch blocker immediately notifies the designated operators/user and remains visible with reason and resolution status under the selected future behavior. No live monitor, external email or runtime service is currently running. This review notified the user in chat; it did not configure a notification system.

## Structural warning review

The base's 11 lexical compound warnings remain visible: REQ-113/116/118/119/122/124/125/127/129/130/132. REQ-122 and REQ-132 now retain two parent-scope criteria each, with expanded independent behaviors moved into supplemental requirements. The base's existing refresh/import, correction/reconciliation, privacy/content and payment/reversal pairs still require separate mapped assertions; no warning is suppressed or claimed to prove atomic implementation stories.

The supplement's 13 lexical warnings are reviewed as follows:

- REQ-144: one nonprofit scope invariant covers assets and grants.
- REQ-145: one request/review authority policy applies to enumerated action types; each action needs its own negative authorization assertions.
- REQ-149: capacity activation has joint authorization/funding preconditions.
- REQ-156: one share-conservation rule applies to baseline and boost components.
- REQ-158: one paid-eligibility guard denies both allocation types.
- REQ-165: one unsafe-finance transition denies new allocations and requests pauses; both outputs are required.
- REQ-166: one nonduplicated funds/obligation conservation invariant spans several observed coverage states, which require distinct examples.
- REQ-167: now contains shortfall entry only; independent automatic recovery was split to REQ-179. The remaining word 'and' joins commitments/obligations, not recovery.
- REQ-168: one actual provider-fee cost classification covers contribution-processing and ad-payment fees.
- REQ-171: one return gate requires closure plus reconciled surplus.
- REQ-174: one incident lifecycle requires immediate dispatch and durable visibility; delivery retry/recovery assertions remain distinct.
- REQ-175: one paid-launch gate conjuncts required evidence, not a claim the evidence exists.
- REQ-176: one persisted plan record includes its reproducibility/explanation evidence.

These are specification objects, not published ticket shapes. Independent integration/end-to-end assertions remain necessary. Final specification review is complete; actual whole-launch semantic/behavioral acceptance remains blocked by PG evidence and future implementation; a zero-error structural report cannot override them.

## Checks performed and limits — historical consolidation before Q95

- Ran the existing PRD audit script on both current documents and saved the two JSON reports: zero structural errors; warnings above retained.
- Checked unique IDs, known acyclic dependency references, all 191 criteria represented in the regenerated map and local document links resolving.
- Confirmed zero of the 79 designated tests/launch/REQ-NNN.test.js files exists. Candidate slice/harness files are also future work.
- Inspected existing Playwright configuration: its testDir is tests/browser and it starts the demo server on port 3100. The proposed slice instead names a dedicated future config/fixture server on port 3200; the old config is not falsely claimed to discover the new directory or enforce real authentication.
- No npm test/build, application/browser/provider suite, dependency install, new application test, account validation or financial operation was run. Older Zod and demo test results below remain dated evidence, not current assertions.
- No tickets, labels, PRs, commits, branches, external messages or implementation changed. Existing unrelated/untracked workspace files were preserved.

**Q106 documentation reconciliation:** Updated the PRD, advertising contract, verification map, final review and dedicated harness review to record design confirmation. The historical fixture-server/port assumptions above are superseded by the dedicated local Convex design; exact pinned commands and lifecycle/auth wiring require implementation validation. Structural audit reports were not rerun for this confirmation-only update. No application/backend/browser/provider tests, setup or implementation were performed.

## First complete slice recommendation

Use the supplement's durable manager allocation preview, S1-01–S1-10: UI → server authorization boundary → actual planner → isolated durable store → reproducible explanation. Complete-input tie/startup/provider/proration and protected-reserve examples are explicit, along with blocked input, denied identities, restart/concurrent request and no-provider-write cases. Its confirmed specification can be built without provider credentials after separate implementation authorization; actual Clerk/provider certification remains later.

A whole-launch ready verdict remains inappropriate. Do not publish tickets or start implementation from this draft. The RD and CT decisions plus bounded slice/harness are confirmed. The preview is specification-ready for later separately authorized ticket drafting; retain provider-blocked labels/status as later authorized work, not current mutations.

---


## Final confirmation record — Q94

On 2026-11-11 the user answered "Looks good" to the explicit final review brief covering the consolidated product rules, CT-01–CT-04 and isolated preview/harness. No final specification question remains open. This clears LB-06/LB-07 as product/specification review blockers. It does not clear PG-01–06, invent actual safety settings, run tests or authorize ticket publication, implementation or live actions.

# Historical semantic audit — preserved November 7–9 evidence

# adoption.is launch PRD semantic audit

- **Date:** 2026-11-07 (America/Chicago)
- **Verdict:** Blocked; not Ralph-ready.
- **Target:** docs/PRD-adoption-is-launch.md, REQ-101 through REQ-143.
- **Scope:** Documentation reconciliation and readiness review only. No application implementation, issue publication, deployment or live financial operation.

**O-01 addendum, 2026-11-09:** [Reporting validation](o-01-reporting-validation.md) consolidates candidate contracts, accessible source evidence, unresolved provider questions and a 20-case validation matrix. It explicitly separates account-dependent checks from application-only verification. No account checks were run; O-01 and the Blocked verdict remain unchanged. The deterministic audit and broader semantic review below retain their recorded dates; this addendum does not claim a rerun.

## Authority and evidence

The accepted original interview and follow-up Q1-Q35, including later corrections, are the product authority. Later answers supersede older recommendations and open descriptions. The PRD decision history preserves that chronology; historical unresolved wording does not reopen settled decisions. Q35 records an already-paid mistaken prize as a loss, requires payment to the correct creator and notifies admin, meaning the existing sole campaign manager.

Reviewed the current PRD, root glossary, repository domain instructions, package scripts, existing audit tooling, browser-local persistence in src/public-demo/api.ts and UTC period logic in src/public-demo/leaderboard-periods.ts. These source facts still do not certify production behavior. No external provider capability, legal conclusion or production integration was newly verified.

## Deterministic audit

Re-ran the installed PRD skill script using the installed Python interpreter:


The exact command is recorded in the validation section below. Result: 43 requirements, zero errors, 10 possible-compound-requirement warnings. The structure check passes. Its acceptance of prose verification placeholders must not be confused with production agent-runnability.

All ten warnings remain visible: REQ-116, REQ-118, REQ-119, REQ-122, REQ-124, REQ-125, REQ-127, REQ-129, REQ-130 and REQ-132. Period boundaries, tie allocations, readiness conditions and funding invariants can reasonably stay attached to their policy. Refresh versus polling, manual entry versus import reconciliation, payment idempotency versus commission reversals, private workspace content versus authorization, and external-launch prohibition versus placement mapping need separate test assertions and potentially requirement refinement. Stable IDs are preserved; downstream decomposition alone does not prove atomicity.

## Reconciliation of prior findings

| Prior finding | Current disposition | Evidence |
| --- | --- | --- |
| A-01: completion is not executable | Still blocking. Forty-two requirements have no production command; REQ-115 has a demo-only baseline. | All Verification sections; V-01; completion contract. |
| A-02: missing-data gate | Finalization hold, missing-versus-zero and public last-known-data behavior are explicit. Required source/completeness contracts still need investigation. | REQ-104/117/119; O-01. |
| A-03: finalization liveness | Product policy reconciled: finalize within five minutes after ready; recover overdue ready periods without duplicate awards. Production verification absent. | REQ-119. |
| A-04: batch-ready notice | Reconciled: notify the sole manager when Wednesday-noon batches are ready; fresh approval after content changes. | REQ-128/142. |
| A-05: outage retention | Last-known standings and delayed labeling are explicit. Import monitoring initialization before the first successful import remains a technical acceptance gap. Public-media failure has its own accepted one-minute rule. | REQ-104/125/126/140/141. |
| A-06: time boundaries | Reconciled: inclusive start/exclusive end, business-effective donation time, full Chicago days/weeks only, partial-period commissions and 48 elapsed-hour finalization. Provider timestamp mapping remains investigation. | REQ-112/116/119; O-02. |
| A-07: manual/import authority | Reconciled: scoped certified correction overrides imports until manager release; evidence can satisfy only the covered completeness scope. Preserve matching/conflicting imports without double counting. | REQ-127. |
| A-08: revision identity | Reconciled: before-first-approval correction retains entry/link; after-approval media replacement creates a separate entry/link and preserves the original. | REQ-108/139; glossary. |
| A-09: financial edges | Currency, rounding, cumulative refunds, commission-only negative balances, exact-batch approval, blocked recipients, full-or-nothing replenishment and paid-prize losses are explicit. Provider financial mechanics still unvalidated. | REQ-118/120-124/128/129/136/137/143; O-02. |
| A-10: payout setup | Product handling is settled: reserve held earnings, show private guidance, pay others and require fresh approval on resolution. Provider onboarding/state mapping remains unvalidated. | REQ-143; O-02. |
| A-11: lock/funding | Reconciled: lock at campaign creation; accept submissions before funding; require full promised prizes and initial advertising allocation before competition starts. Comprehensive executable invalid-input coverage remains absent. | REQ-113/122; V-01. |
| A-12: public behavior | Homepage minimum actions, empty/media failure states, old-link checkout continuity and delayed public standings now have observable criteria. | REQ-102/103/104/112/140/141. |
| A-13: access lifecycle | Clerk is explicitly responsible for authentication/recovery. Do not build an internal recovery system. Provider expiry/replay/revocation and sole-manager recovery need investigation and isolated tests; private submission authorization also needs direct-request verification. | REQ-105/106/130/131; O-07. |
| A-14: entrypoint/atomicity | Historical docs/PRD.md remains explicitly superseded rather than silently rewritten. Ten compound warnings need review before executable readiness; historical entrypoint routing remains a handoff risk. | Current-state evidence, constraints and warning review. |

## Accepted safeguards now explicit

- Prospective removal can be for any manager-stated reason without evidence or a second approver. It preserves valid past activity. Disqualification identifies ineligible entries/date ranges separately. Do not ask this distinction again (REQ-133/134).
- Suspected fraud supports reversible holds, not automatic confiscation or rewriting finalized results (REQ-135).
- Finalized-prize corrections require manager preview and confirmation, preserve the original result and add a visible correction record (REQ-136).
- An erroneous prize already paid is a paid prize loss, not recoverable creator debt or a commission reversal. The correct prize remains independently payable through normal approval and funding safeguards; notify the same sole manager/admin. Retries cannot duplicate losses or payments (REQ-137).
- Accepted decimal upload limits, formats/codecs, duration and photo count are requirements, not promises of platform placement. Creators fix their own media; campaign staff and diagnostics do not edit it (REQ-138/139).
- Creative-use permission is in the pre-signup campaign agreement. No further creator approvals per submission or placement; manager creative review remains a separate requirement. Other creator legal matters stay in that agreement (REQ-107/109).
- Confirmed continuous site unavailability exceeding 60 seconds triggers temporary public removal and diagnostics. Two successful checks 30 seconds apart permit restoration, without overriding separate manager restrictions or changing valid earnings/external placements (REQ-140/141).

## Remaining blockers and routing

1. **O-01 - paid-provider contracts:** Research official metric definitions, reporting windows, completeness, credential scopes, deduplication, backfills and rate limits for Instagram/Facebook/TikTok; validate with isolated accounts. If a provider cannot meet the agreed contract, report the concrete limitation before proposing a changed product policy.
2. **O-02 - Stripe and financial contracts:** Validate successful-payment/refund event mapping, custody/beneficiary setup, payout onboarding/restrictions, available balance and ledger-versus-transfer semantics. Checkout capability alone proves none of these.
3. **O-07 - Clerk:** Investigate and verify supported invitation identity and recovery, expiry/replay and revocation behavior; do not ask the user to design Clerk internals or invent a replacement system.
4. **V-01 - executable coverage:** Provide an unattended production-oriented command, exact pass/failure signal and redacted evidence for every criterion; exercise it against the intended behavior. No invented test paths or demo-only certification.
5. **Acceptance precision and dependency review:** Define import-outage clock initialization and test successful-but-incomplete imports separately from failed imports. Confirm required per-entry sources under O-01. Preserve settled liveness, financial and consent rules while making technical contracts testable. Refine the five separable concern pairs identified in the warning review before treating requirements as atomic implementation work.
6. **Final consolidated user review:** Accepted interview answers are not an implementation authorization. The reconciled document still needs final review after investigation findings and readiness evidence are incorporated.

O-03 through O-06 are resolved product records, not outstanding user questions. Provider research and production verification are agent investigation work. No additional decision was inferred from silence.

## Validation record

- Current document-structure command: the installed Python interpreter, running the PRD skill's `prd_tools.py audit docs/PRD-adoption-is-launch.md --json-out docs/PRD-adoption-is-launch.audit.json`. Exit 0; 43 requirements, zero errors, 10 warnings.
- Historical 2026-11-06 evidence: score baseline had six passing tests; npm test had 130 passing tests. Those suites were not rerun for this documentation-only reconciliation and do not verify the new requirements.
- No build, browser suite, isolated provider validation, live checkout, transfer or payout was run. No claim of production readiness follows from this review.

## Readiness disposition

The product-level launch remains coherent and bounded. Interview decisions through Q35 are reconciled; the evidence requirement rejected for manager removal was not reintroduced, and no additional administrator role was created. Structural validity passes, but agent-runnability, full production traceability and provider verification fail readiness. Preserve **Blocked** until the named conditions are met.

## Investigation update - 2026-11-07

This update supersedes older statements above that provider documentation had not been researched, that the initial outage clock was undefined, or that the regression baseline was not rerun. It does not change the verdict.

- **O-01:** docs/provider-research-adoption-is-launch.md documents TikTok reporting constraints and remaining metric, timezone and completeness unknowns. Meta Insights documentation returned a rate-limit error. Account-specific source coverage, comparability and provider tests remain unresolved.
- **O-02:** Stripe documentation distinguishes delayed payment success, refund states, Connect transfers, payouts and idempotency retention. Payment-time mapping, account eligibility, fund custody, available balances and settlement require isolated account validation and, where applicable, financial/legal review.
- **O-07:** Clerk documents that invitation links preverify invited email. Forwarded-link denial, replay, revocation and sole-manager recovery require isolated testing and mitigation; email matching alone is not established to satisfy REQ-105.
- **A-02/A-05:** REQ-117 now requires completeness per entry, source, metric and period; REQ-126 starts the outage clock when a source becomes required, defines the strict five-minute boundary and distinguishes successful transport from complete coverage. These are testable acceptance details, not proof that providers can supply completeness evidence.
- **V-01:** docs/adoption-launch-verification-plan.md maps each acceptance checkbox to a designated future per-requirement command and supplies discriminating boundary/failure scenarios. All 43 designated test files are absent. The sampled command for REQ-117 fails at file discovery, so it does not reach application behavior. Actual test creation, behavioral red/green execution and provider contract validation are still required.
- **Current checks:** `node --test tests/public-ranking.test.js` passed six demo tests. `npm test` exited 1: 17 passed and 12 test files failed to load because the installed `zod` package is incomplete. The deterministic PRD audit remains zero errors and ten warnings. The local dependency failure must be resolved or explicitly dispositioned before the regression gate can pass.
- **Remaining review:** The five separable warning pairs remain candidates for refinement, and final consolidated user review remains pending after investigation and readiness evidence. No new question is justified until investigation demonstrates a limitation that requires a product choice; if needed resume at Q36 with facts and a recommendation.

## User clarification checkpoint - 2026-11-09

The user confirmed that product clarification is complete for now and that new questions are warranted only when validation reveals a concrete trade-off. Settled answers through Q35 remain authoritative; resume at Q36 only if needed. Provider evidence, production verification, semantic acceptance refinement and final consolidated review remain outstanding. This confirmation does not resolve those blockers, approve implementation or change the Blocked verdict. No audit or application tests were rerun for this checkpoint-only documentation update.

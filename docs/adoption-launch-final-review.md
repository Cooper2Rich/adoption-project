# adoption.is final specification review

> **Revised architecture confirmed in Q104, 2026-11-11:** The intended architecture is Convex backend, Vercel-hosted frontend and Stripe payments; see [ADR-0001](adr/0001-convex-vercel-launch-stack.md). This replaces the Express/SQLite harness choice recorded below. Q98 adopts private Vercel Blob originals and Mux streaming with Convex permissions/records under [ADR-0002](adr/0002-preserve-originals-in-private-blob-with-mux-playback.md). Q99 retains Clerk for applicable application authentication and Convex for access enforcement. Q100 permits original downloads by the uploading creator, that campaign's manager and authorized platform administrators; Q101 retains originals without automatic expiry after completion/withdrawal and requires explicit administrator action for deletion. Q102 blocks deletion while active/publishing and requires confirmation plus an audit record; Q103 provides a 30-day recovery window before permanent removal. Q96 defers product-feedback tools and usage analytics beyond initial release while retaining payment confirmation, video-processing updates and advertising controls. Q104 confirms the revised architecture and policies; Q94's old harness is superseded and a replacement still needs engineering validation. No implementation is authorized.

**Date:** 2026-11-11. **Specification confirmed in Q94:** the user answered "Looks good" to the consolidated product/CT/harness review. **Product decisions:** Q36–Q93 accepted. **Current scope:** documentation only. No tickets, implementation, account setup, messages, money movement or deployment are authorized.

This brief is the final review surface for [the advertising contract](adoption-launch-advertising-contract.md), supplementing [the base PRD](PRD-adoption-is-launch.md). The [semantic review](PRD-adoption-is-launch.semantic-audit.md) and [verification map](adoption-launch-verification-plan.md) record the remaining evidence gates.

## Revised architecture — Q95–Q104

| Responsibility | Selected service |
| --- | --- |
| Frontend hosting | Vercel |
| Backend, application data, workflows and access enforcement | Convex |
| Applicable application authentication and supported recovery | Clerk |
| Payments and selected financial integrations | Stripe, subject to the existing provider/account gates |
| Private exact-original video storage | Vercel Blob |
| Video processing and streaming | Mux |

Creators upload once to private Blob storage; Convex tracks the source and its associated Mux processing/playback records. Original downloads are limited to the uploading creator, the campaign's manager and authorized platform administrators. Public visitors can view approved videos and donate without an account.

Originals remain after withdrawal or campaign completion with no automatic expiry. Explicit administrator deletion is blocked while an ad is active or publishing, requires confirmation and retains an audit record. A confirmed request starts a 30-day recovery window with the bytes still retained; permanent removal follows only after that window. Removing public playback is separate from deleting the original.

Product-feedback tools and usage analytics are deferred beyond initial release; operational payment confirmation, video-processing updates and advertising controls remain in scope. This corrects the earlier Express/SQLite direction. Q104 confirms shared understanding; the Convex harness, provider configuration and implementation verification remain engineering work rather than completed evidence.

## Accepted product contract

**Q104 confirmation, 2026-11-11:** The user answered "Yes that sounds good" to the consolidated Convex/Vercel/Clerk/Stripe/private-Blob/Mux architecture and accepted video access, indefinite retention, active-use deletion safeguards and 30-day recovery policies. Shared understanding for this architecture correction is complete; no further architecture-confirmation question is pending. This does not approve implementation or validate the future Convex harness/provider accounts. Existing product requirements and provider evidence gates remain unless explicitly superseded above.

- Launch adoption.is first, with reusable isolated nonprofit records and one advertising campaign per nonprofit initially. Nonprofits own intended advertising assets; Slander owns developer applications with delegated access. Use guided provider setup. Actual eligibility and grants still need validation.
- Campaign managers operate their campaign. Administrator approval is required for capacity expansion, discretionary contributor refunds and closure-only nonprofit balance returns. One person may hold both roles with separate recorded actions. Creator payments retain the original manager approval.
- Before paid launch, protect baseline funding for the full advertised funded run and open slots, promised prizes, actual fees and approved safety reserves. Prelaunch crowdfunding, creator review and public waiting creatives are allowed.
- Each eligible funded ad receives the configured daily baseline, prorated on first partial Chicago day. Baseline is not diluted as more entries join. Protect future baseline and existing obligations before calculating residual boost headroom.
- The manager chooses boost count, residual boost percentage and Meta/TikTok split. Use current daily competition ordering and full cutoff ties among eligible funded entries. Healthy no-performance startup divides only the defined boost pool equally. Other money remains uncommitted.
- Missing required score coverage holds new boosts, not financially safe baselines; immediately notify manager and administrator, including the designated user. Never invent zero, rank or private startup bonuses. Provider inability holds its share without automatic redistribution.
- Each admission binds the published continuation policy then current: nonprofit-selected weights totaling 100%, targets, passing score and trial duration. Public competition remains 40/30/30. A queued retrial's authorization sets queue position, not an earlier policy lock.
- Trial timing starts at first confirmed managed delivery and excludes confirmed pauses. Initial evaluation uses its own complete window; later windows end Chicago midnight and remain fixed while awaiting data. After provider interruption, require the full normal-delivery window. Delayed evaluations run oldest first; the first complete failure cuts at decision time, never retroactively.
- Performance cuts remain public; withdrawal retains its public-hide and earning-cutoff behavior. Pause/interruption/stopping slots stay reserved. Cuts/endings release only after all relevant paid placements are confirmed stopped. Retrials require manager authorization and rejoin the common queue by that new authorization time.
- Stop at the locked funded end if a trial cannot complete; label it incomplete, notify operators and preserve valid history. Never automatically extend dates or funding. Release an elapsed day's unused allocation only after reconciliation proves it free; retain future baseline and uncertain obligations.
- Financial uncertainty or uncovered commitments stops new admissions/boosts and requests needed pauses, with immediate notifications. Verified recovery resumes automatically within existing approvals and other holds. Spending edits activate on the next validated cycle after safe reserve resizing; incurred/uncertain commitments are not canceled.
- Advertising contributions support the selected campaign's allocation policy, without individual-ad earmarking, creator commissions, prize replenishment or fundraising-score credit. Actual provider fees reduce that campaign fund. Tracked fundraising donations retain their original separate attribution/commission rules.
- Refunds to original contributors and returns to the same nonprofit are separate manager-request/admin-review flows. Voluntary refunds are individually approved full/partial amounts with verified refund funding, otherwise visibly pending. Nonprofit returns are closure-only with reconciled surplus and retained reserves. Disputed funds immediately cease being spendable, without double deduction or erasing delivered-ad costs.
- Every detected selected financial/delivery/capacity/evaluation/launch block immediately notifies the designated operators/user, remains visible and sends a resolution notice. Duplicate checks update one incident; failed email follows the selected retry schedule. No live monitor or external notification system is running.
- Public viewing, creator rights/media rules, fixed competition prizes, Chicago competition periods, complete-data finalization, commissions, weekly creator payments and ordinary/finalized corrections retain their accepted base-PRD behavior.

## Technical contract confirmed in Q94

The user explicitly confirmed these four CT details in Q94. They are specification choices; actual provider capability and successful implementation remain unverified.

1. **CT-01 — Exact cents:** use whole USD cents and half-up first-day proration. Equal-pool remainder cents use oldest entry creation time then stable ID. Weighted provider splits use largest fractional remainders; an exact tie uses Meta before TikTok. Conserve the source pool exactly, require a positive active daily baseline, and reject invalid inputs. Preserve actual negative provider balances as deficits, never as spend permission.
2. **CT-02 — Count coverage once:** collection balance is distinct from Issuing spend availability. Match each underlying cost to its provider-reflected or additional local coverage; do not subtract the same hold/charge/reserve twice. Protect the remaining funded-run baseline; today's portion consumes its embedded reserve rather than adding another trial/day reserve. Boost headroom cannot exceed verified extra funds, remaining daily authority or remaining campaign-total authority. Actual matching/release semantics remain provider-gated.
3. **CT-03 — Atomic records:** reserve slots/funds against one validated settings/input revision. A concurrent change rejects/recomputes rather than overbooking. Repeat operation identity returns the same persisted result; new input creates a distinct immutable plan. Queue timestamp ties use stable entry ID.
4. **CT-04 — Unknown outcomes and exact approvals:** journal intended external actions before dispatch and preserve uncertain outcomes for reconciliation. A timeout cannot create replacement ads/payments or release capacity. Refund/return approvals bind the exact beneficiary, amount, currency, source, permitted route/destination and revision; changed contents require renewed administrator review. Reconcile cumulative refunds/disputes/recoveries once. Actual provider idempotency/status lookup must be validated, not assumed.

## First complete credential-free slice

**Durable manager allocation preview:** UI → authorized server boundary → intended planner → isolated durable store → persisted explanation.

Its ten acceptance cases S1-01–S1-10 in the contract cover:
- Wrong-role/nonprofit denial and explicit test identity, without a production demo-role fallback.
- Persistence across sessions/restart, immutable versions and duplicate request handling.
- Fixed baseline, residual boost, exact cutoff tie and healthy startup examples.
- Provider splits and held unavailable shares without redistribution.
- Chicago/DST first-day proration, whole-cent conservation and no-entry boundaries.
- Protected full-run reserves, invalid/unknown-finance blocked plans and concurrency.
- Missing-score baseline-only preview with held boosts and immediate intercepted operator notification.
- No provider writes, real payments, invitations or live accounts.

**Replacement harness design confirmed in Q106:** The previous Express/SQLite fixture server is superseded. The accepted replacement exercises the actual Convex backend with isolated records, explicit test identities, denied direct requests, durable results, concurrency and a browser journey. Exact runner/isolation/browser wiring requires engineering verification; fixture identities and demo finances cannot become production fallbacks. Clerk remains selected, with actual access/recovery verification still a provider gate.

No slice test or harness code has been created. Proposed future checks are the contract's node service suite, dedicated Playwright journey, then applicable build/regression. These are reviewable test designs, not passing behavior.

## Remaining gates after specification confirmation

- Actual Stripe program eligibility and approved collection-to-Issuing/refund/return rails.
- Actual Meta/TikTok account/grant/identity/objective/media/pacing/payment/reporting and confirmed delivery/pause contracts.
- Actual Clerk invitation, access and recovery verification.
- Actual administrator-approved reserve/freshness/release values from evidence.
- Future implementation and meaningful behavioral/browser/provider verification.

Those gates keep the whole launch/Ralph verdict **Blocked**. They do not require credentials for the isolated first preview. Confirmation of this document establishes shared specification and permits no ticket publication or implementation by itself.

## Historical final review confirmation — Q94

The user confirmed the then-current consolidated specification, CT-01–CT-04 and isolated first-slice harness with "Looks good". Q95–Q104 subsequently corrected the architecture and video policies, so Q104 confirms revised shared understanding; neither confirmation validates a replacement harness.

Q104 confirms the revised architecture and policies; Q105–Q106 settle advisory previews and the replacement Convex harness design. Bounded specification readiness is restored for separately requested ticket drafting, while actual harness operation and passing behavioral evidence remain unproven. Live/provider work retains its named gates. Corrections must be reflected in the documents before any relevant ticket is published.

## Harness review completed in Q106

Q105 accepts advisory allocation previews: saving settings, inputs, calculation and explanation does not reserve campaign money or slots. Separate tests exercise intended reservation behavior against isolated campaign records, including concurrency and restart. The [Convex harness review](convex-allocation-preview-harness-review.md) records supporting official documentation and the complete transaction/authentication/isolation/evidence design. In Q106 the user answered "I like this design," confirming shared understanding and completing the design review. Local Convex lifecycle/auth wiring has not been implemented or executed; design agreement does not certify passing tests or provider readiness. No implementation, issue publication or account setup is authorized by this review.

## Subsequent tracker reconciliation — item 2

The user's later request to move to item 2 authorized reconciliation of existing GitHub planning records. [The completed reconciliation](planning-tracker-reconciliation.md) records #11/#14 design closure, #12/#22 narrowed evidence scopes, corrected #23 boost policy, #9's updated map and verified native dependencies. #20/#21 remain open and unchanged. Real Clerk and production verification gates remain explicit in #9. No implementation tickets, provider setup/messages, application implementation or financial operation were authorized or performed.

## Subsequent bounded implementation

The user subsequently selected "Start implementation, preparing the spec and plan as needed." This separately authorizes the local credential-free preview implementation. The [run guide](ALLOCATION-PREVIEW.md) and [verification evidence](allocation-preview-verification.md) record the actual Convex manager journey, durable snapshots, authorization, restart/retry, separate reservation contention and desktop/mobile checks. The earlier no-implementation statements record the prior planning checkpoints. No live-provider operation, real Clerk validation, actual safety-value approval, implementation-ticket publication or deployment is established. Whole launch remains Blocked.


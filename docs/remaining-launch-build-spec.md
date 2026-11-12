# adoption.is — consolidated remaining launch build

**Checkpoint: 2026-11-12, America/Chicago.** This is the review entry point for the remaining build scope. Product decisions through Q106 and the subsequent preview implementation remain accepted. This document consolidates scope for ticket decomposition; it is not an implementation queue or a claim of paid-launch readiness. Whole-launch readiness remains **Blocked** by implementation and the provider/production gates below.

**Ticket checkpoint:** The user approved the breakdown and all 40 issues are [published with verified dependencies](remaining-launch-ticket-publication.md). Verification boundaries are approved; Clerk remains the sign-in provider. This is planning/implementation readiness, not provider approval or paid-launch readiness.

## Problem Statement

The campaign manager has a working local allocation preview, but cannot yet operate the full adoption.is launch through production workflows. Requirements are spread across the original launch PRD, expanded advertising contract, architecture decisions and provider-validation issues. Some historical checkpoints predate the implemented preview. Turning those documents directly into tickets would risk rebuilding completed behavior, dropping public/creator/payment requirements or treating unverified provider capabilities as available.

## Solution

Build the remaining adoption.is-first application on the accepted Convex/Vercel architecture, reusing the verified allocation planner and durable preview behavior. Deliver complete workflows for invited creators, public campaign discovery, fundraising, competition, advertising, finance and operators. Keep live actions blocked until their actual account, provider, funding and safety evidence is present.

The [base launch requirements](PRD-adoption-is-launch.md) and [advertising contract](adoption-launch-advertising-contract.md) retain all **79 requirement IDs and 191 acceptance criteria**. Their atomic behavioral criteria are incorporated into this scope; the traceability inventory below assigns each requirement a primary build area without replacing or weakening any criterion. The accepted original-video lifecycle adds obligations beyond that numbered checklist. Ticket bodies must carry the applicable criteria and media decisions, not just a work-area heading.

Current decision precedence is: later explicit user decisions and implemented checkpoint; accepted architecture/media ADRs; the expanded advertising contract for its revised advertising rules; then unchanged base requirements. Old authorization/readiness statements describe their dated checkpoints. In particular, Q89–Q94 mechanics are settled, the Express/SQLite launch-harness choice is superseded, and the local Convex preview is now implemented. Actual provider facts and safety values remain unverified.

### Completed baseline to reuse

The [allocation-preview evidence](allocation-preview-verification.md) records S1-01 through S1-10 against an actual isolated Convex backend and browser client. It covers authenticated scoped access, saved draft/settings recovery, immutable plan history, exact-retry handling, actual backend restart, fixed baseline/residual boosts, exact cutoff ties, Chicago/DST proration, whole-cent provider splits, held shares, explicit evidence failures and simulated incident lifecycle. Separate intended reservation operations passed independent slot-contention and funding-contention checks.

Saving a preview remains advisory: it reserves no money or slot and activates no operational settings. The separate reservation checks do not establish production queue/orchestrator behavior. The displayed total counts competition entries once across provider placements. The user deferred preview UI redesign.

The implementation is local working-tree evidence, not a merged/deployed release. Existing verification recorded 10 planner tests, 12 backend tests, 8 desktop/mobile browser tests, 130 existing regressions and passing launch/existing builds. These results are bounded evidence from the implementation checkpoint, not tests rerun for this document. Real Clerk invitations/recovery, provider accounts, actual balances, approved safety values, email delivery, media processing and production advertising/payment execution are not certified. Historical demo behavior is regression coverage, not proof of these launch flows.

### Remaining build areas

These are scope groupings, **not ticket order**. Each future ticket should produce an observable end-to-end outcome with explicit blockers.

| Area | Remaining outcome | Existing foundation / external dependency |
| --- | --- | --- |
| A — Access and campaign governance | Clerk creator invitation/recovery, current server permissions, versioned participation acceptance, immutable competition setup, distinct manager/admin review actions and nonprofit-scoped assets. | Reuse preview authorization boundaries; real Clerk evidence is PG-04. |
| B — Creator submissions and media | Private creator workspace, uploads/validation, creator corrections, manager review, Blob originals, Mux processing/playback and controlled archive lifecycle. | Media architecture is decided; upload/processing/storage behavior still needs implementation and provider verification. |
| C — Public campaign and tracked links | Shared persistent homepage/viewer, approved creative discovery/detail, empty/error states and durable account-free fundraising links. | Reuse campaign identity; replace fictional/browser-local launch data. |
| D — Fundraising and commissions | Verified Stripe confirmations/refunds, original-period attribution, earning cutoffs and separate gross/fee/commission accounting. | Provider approval and supported payment contracts remain gated. |
| E — Reporting and competition | Paid-platform imports, coverage/corrections, public daily/weekly standings, fixed finalization, disqualification and explicit finalized-prize correction. | Reporting capability/completeness is PG-03; preview score inputs are not an importer. |
| F — Prize funding and creator payments | Protected prize/earnings funds, replenishment checks, weekly exact-content approvals, recipient statuses, reversals and paid-prize losses. | Reuse integer-money conventions; actual payment/financial routes need applicable evidence. |
| G — Provider setup and write reconciliation | Guided scoped connections, goal/media validation, explicit external-ad enrollment and durable create/change/pause/payment write outcomes. | #12/#20/#21 validate actual contracts. Unknown outcomes stay held. |
| H — Advertising lifecycle | Shared admission/retrial queue, funded slots, publication/delivery, assigned trials, chronological continuation windows, stopping, withdrawals and fraud holds. | Reuse reservation primitive; full production lifecycle and provider confirmation remain. |
| I — Allocation and financial safety | Trusted input assembly, settings activation, production reservations/plans, one-cost coverage, shortfall pauses and verified recovery. | Reuse planner/preview; actual availability, matching and numeric safety policy remain PG-02/03/05. |
| J — Advertising contributions and closure | Separate contribution intake/fees/disputes, reviewed original-contributor refunds and reconciled closure-only nonprofit returns. | No route is selected merely by writing interfaces; #20/#21 must validate it. |
| K — Operations and release | Persistent incidents/email, source/media monitoring, recovery, audit, production integration and complete launch-gate review. | Reuse simulated incident behavior; dispatch, monitoring and release evidence remain. |

## User Stories

1. As a public visitor, I want adoption.is available without a campaign selector, so that the first release has a clear campaign destination.
2. As a campaign manager, I want my records, provider assets and finances isolated from another nonprofit, so that reusable infrastructure cannot mix clients.
3. As an invited creator, I want Clerk sign-in and supported recovery tied to my invited identity, so that I can regain my own access safely.
4. As a campaign manager, I want forwarded invitations, replayed links and revoked memberships checked against current permissions, so that possession of a link cannot grant another identity access.
5. As a creator, I want the applicable versioned participation terms before signup/submission, so that my recorded acceptance identifies the permitted public and advertising uses while retaining my ownership.
6. As a campaign manager, I want competition dates, rates, targets, prizes and payment/replenishment schedules locked at campaign creation, so that participation rules do not change after invitations.
7. As a platform administrator, I want separately recorded requests and approvals for capacity expansion and discretionary advertising refunds/returns, so that authority is reviewable even when one person holds both roles.
8. As a creator, I want private submission and earnings views, so that other creators and visitors cannot see my financial or account-setup details.
9. As a creator, I want supported photo/video uploads with exact boundary validation and actionable errors, so that I can submit acceptable creative without staff editing it for me.
10. As a creator, I want preapproval corrections to retain my entry/link and postapproval replacement creative to create a new entry/link, so that activity is attributed to the correct creative.
11. As a campaign manager, I want to approve, reject or request creator revisions, so that only approved creative becomes public and approval alone cannot publish paid placements.
12. As an authorized original-video user, I want access to the exact uploaded original independently of playback, so that processing does not replace the archive.
13. As a creator, I want original videos retained after withdrawal or completion, so that ending participation does not automatically erase them.
14. As a platform administrator, I want confirmed, audited original deletion with active/publishing safeguards and a 30-day recovery window, so that an accidental deletion can be restored before confirmed permanent purge.
15. As a public visitor, I want the homepage and viewer to use the same approved records, so that discovery, detail and standings agree.
16. As a public visitor, I want clear empty, delayed and unavailable-media states, so that missing data or media is not replaced with fictional results.
17. As a donor, I want an account-free tracked fundraising link for the entry I support, so that sharing across platforms preserves its attribution.
18. As a campaign manager, I want only verified successful Stripe payments recorded once, so that browser returns, retries and failed payments cannot create fundraising.
19. As a creator, I want provider-authoritative payment time applied to the original earning period, so that delayed events do not move earnings into a different period.
20. As a donor, I want old tracked links to continue supporting adoption.is after an entry's earning cutoff, so that fundraising can continue without creating later commission or competition credit.
21. As a creator, I want commissions, refunds and fees itemized separately, so that the locked gross-based commission and cumulative refund adjustment are understandable.
22. As a public visitor, I want paid Meta/TikTok metrics combined once per competition entry with source freshness, so that placements do not inflate rank through duplicate counting.
23. As a campaign manager, I want missing, stale, incomplete and affirmative-zero reports distinguished, so that unknown data cannot finalize a competition or become a performance failure.
24. As a public visitor, I want daily/weekly standings, shared ranks and past winners, so that competition results are visible without private donor or payment details.
25. As a creator, I want unrounded public scores, Chicago periods and exact-cent shared prizes, so that display rounding and daylight saving time cannot change awards.
26. As a campaign manager, I want complete eligible periods finalized once after the 48-hour delay, so that retries or downtime cannot create duplicate or premature prizes.
27. As a campaign manager, I want scoped manual fallback and certified metric corrections with reconciliation history, so that provider gaps can be corrected without double counting.
28. As a campaign manager, I want explicit dated disqualification and confirmed finalized-prize corrections, so that retrospective eligibility changes remain separate from ordinary refunds and removal.
29. As a creator, I want an already-paid erroneous prize treated separately from future commissions and a corrected winner's entitlement, so that a correction cannot silently debit me or erase money owed.
30. As a campaign manager, I want the full prize schedule and funded advertising run protected separately from fundraising and earnings, so that one purpose cannot borrow another purpose's funds.
31. As a campaign manager, I want fixed weekly replenishment with advance checks, due-time rechecks and safe retries, so that shortages are visible without duplicate transfers.
32. As a campaign manager, I want Wednesday-noon Chicago payment batches containing the specified commissions, finalized prizes and carryover, so that creator payments have a predictable review cycle.
33. As a campaign manager, I want approval bound to the exact batch contents and recipient statuses, so that later changes require fresh approval and uncertain payouts are reconciled before retry.
34. As a restricted payment recipient, I want my earnings reserved with private setup guidance, so that other recipients can be paid while my entitlement remains intact.
35. As a campaign manager, I want guided connections to the nonprofit's provider assets through Slander's applications, so that discovery or a report mapping cannot authorize spending.
36. As a campaign manager, I want the selected awareness or tracked-page-visit goal validated against the actual media/objective/identity contract, so that accepted uploads do not imply supported advertising placement.
37. As a campaign manager, I want explicit enrollment of externally created ads with historical costs retained, so that taking control cannot reset trials or erase obligations.
38. As a creator, I want approved waiting creative visible before paid admission, so that limited capacity does not hide my work or start an unfunded trial.
39. As a campaign manager, I want a shared eligibility-aware queue for new entries and authorized retrials, so that blocked entries retain their place while eligible funded work can proceed.
40. As a platform administrator, I want capacity expansion reviewed separately from budget limits, so that approving more ad slots does not grant unlimited spending.
41. As a campaign manager, I want one funded slot per competition entry across placements, so that creator count and provider count cannot distort capacity.
42. As a campaign manager, I want paused, interrupted and stopping entries to retain slots until the required confirmed stop, so that uncertainty cannot cause overbooking.
43. As a creator, I want my performance policy bound at actual paid admission, so that queue time and later edits cannot silently change an active trial's rules.
44. As a creator, I want trial time to start at first confirmed paid delivery and exclude confirmed pauses, so that waiting time does not count as useful advertising.
45. As a campaign manager, I want fixed complete continuation windows processed chronologically, so that retries do not slide evaluation and a later passing window cannot undo an earlier cut.
46. As a creator, I want a performance cut to end paid delivery while preserving public visibility, so that it is not misrepresented as removal or fraud.
47. As a campaign manager, I want explicit retrial authorization subject to capacity and funding, so that improved activity alone cannot restart paid spend.
48. As a creator, I want withdrawal to hide my entry and stop future earnings/spending while preserving valid prior history, so that ending participation has a clear cutoff.
49. As a campaign manager, I want a reasoned fraud suspension with reversible holds and explicit resolution, so that investigation does not automatically confiscate earnings or rewrite finalized awards.
50. As a campaign manager, I want the funded-run baseline protected before residual boosts, so that today's allocation cannot consume future commitments.
51. As a campaign manager, I want complete daily ranks with exact cutoff ties and healthy-startup treatment, so that missing reports never create a private startup bonus or invented rank.
52. As a campaign manager, I want whole-cent Meta/TikTok shares with unavailable shares held, so that an interruption cannot silently redirect authority to another provider.
53. As a campaign manager, I want spending edits validated and versioned atomically, so that reserve resizing preserves incurred/uncertain obligations and assigned performance policies.
54. As a campaign manager, I want durable production plans assembled from trusted current records, so that a saved advisory preview or browser-supplied balance cannot authorize spending.
55. As a campaign manager, I want one atomic slot/funding reservation and stable write identity, so that concurrency, response loss and restarts cannot duplicate commitments.
56. As a platform administrator, I want each cost matched to one coverage state with provider evidence, so that holds, posted charges and local obligations are not deducted twice or prematurely released.
57. As an operator, I want unreliable finances or uncovered commitments to block allocations and pause affected delivery, so that stale last-known balances cannot authorize spending.
58. As an operator, I want automatic recovery only inside verified existing authority with reconciled placement state and no separate holds, so that recovery cannot approve expansion or reset trials.
59. As an advertising contributor, I want campaign-specific funding and actual-fee disclosure, so that my contribution is allocated by baseline/boost policy without per-ad earmarking or fundraising-score credit.
60. As a campaign manager, I want individually reviewed full/partial refunds to original contributors through an approved route, so that obligations and remaining refundable amounts remain protected.
61. As a platform administrator, I want balance returns only after campaign closure, confirmed stops and reconciliation, so that active funds or unresolved liabilities cannot be returned prematurely.
62. As an operator, I want disputed contributions excluded from spending and reconciled once, so that dispute recoveries and forced reversals cannot manufacture available funds.
63. As an operator, I want uncertain external creates, changes, pauses, payouts, refunds and returns visibly pending reconciliation, so that a timeout cannot authorize a replacement or release a reservation.
64. As an operator, I want persistent incidents with the correct manager/admin recipients, retry history and recovery, so that email failure cannot hide an unresolved problem.
65. As a campaign manager, I want source monitoring from first required use and confirmed media-outage diagnostics/recovery, so that successful imports, complete data and playable media remain distinct signals.
66. As an operator, I want durable actor/source/time/version audit across sessions and restarts, so that every financial, participation and provider decision can be explained without exposing secrets.
67. As an operator, I want every unmet paid-launch gate visible with its owner and evidence, so that research closure or passing fixtures cannot be mistaken for permission to launch.
68. As an engineer, I want isolated reproducible backend/browser verification and separate real-provider checks, so that implementation evidence stays useful without claiming unsupported account capability.

## Implementation Decisions

### Architecture and authority

- Use Convex for persistent application records, authorization and backend operations; Vercel hosts the frontend. Retain Clerk for supported authentication, invitations, sessions and recovery. Convex enforces current role, nonprofit/campaign and resource permissions, including on direct calls and exact retries. Public browsing/donating remain account-free. See [ADR-0001](adr/0001-convex-vercel-launch-stack.md).
- The first public/creator rollout exposes adoption.is only. Keep reusable isolated nonprofit records and one advertising campaign per nonprofit initially. Slander owns developer applications; intended advertiser assets belong to the nonprofit with validated delegated grants. Guided setup requires actual provider evidence.
- Distinguish campaign manager and platform administrator permissions. One human may hold both, but request and approval are distinct audited actions. Expansion and discretionary contribution refunds/campaign returns require administrator approval; creator batches retain manager approval. Actual approved numeric safety policy cannot be weakened by a manager.
- Lock USD, competition/earning dates, commission rate, daily/weekly targets/prizes, replenishment and payment schedule at campaign creation. Mutable advertising authority/baseline/boost/provider-share settings activate only through validated version changes. Continuation policy is published/versioned separately and assigned permanently at actual paid admission, including retrials.
- Keep explicit records for membership/roles, agreement acceptance, campaign configuration versions, entries/revisions/media, provider grants/mappings, reporting coverage/corrections, attribution/ledgers, competition snapshots/prize corrections, batches/approvals, contribution reversals, obligations, slots/trials/windows, plans/write journal, incidents and launch evidence. Persistent source/time/actor/revision links connect decisions; browser-local state and demo role headers cannot establish production authority, money or metrics.

### Creative, original media and public access

- Require versioned creator participation acceptance before signup/submission, recording identity/version/time. Terms cover permitted public/advertising use without per-placement opt-in; creator ownership remains. Withdrawal/completion ends new advertising use under the accepted lifecycle. Actual participation terms must exist before creator signup; this spec does not draft them.
- Accept JPEG/PNG photos up to 100,000,000 bytes each, at most 10 and 1,000,000,000 total bytes per entry. Accept MP4/H.264 video with AAC or no audio, at most 5,000,000,000 bytes and 60 seconds. Decimal limits are inclusive. Server/provider evidence must validate format/size/duration; unsupported content gets actionable correction guidance. Staff do not edit creator media. Upload acceptance does not certify provider placement.
- Keep preapproval creative corrections on the same entry/link; replacing approved creative creates a new entry/link without inherited metrics/earnings. Descriptive-only edits and unchanged creative on multiple platforms retain one entry. Re-review changed creative. Approval controls public eligibility, not automatic paid publication.
- Under [ADR-0002](adr/0002-preserve-originals-in-private-blob-with-mux-playback.md), upload original videos once through scoped direct multipart private Blob upload; preserve exact bytes/integrity and revision identity. Mux ingests through temporary source access and verified processing events update Convex state. Processing callbacks/retries cannot publish unready or duplicate media. Public playback and original downloads are separate permissions.
- Permit original-video downloads only for the uploader, scoped campaign manager and authorized platform administrators after current permission checks. Retain originals indefinitely through withdrawal, completion and playback removal. An explicit confirmed administrator deletion request requires an audit record and is blocked while active/publishing. Keep bytes for a 30-day recovery window; restore cancels pending purge. Recheck active use and reconcile duplicate jobs, restore/purge races, failures and uncertain external deletion. Never claim physical deletion before confirmation; the audit survives purge. Do not invent immediate revocation of an already-issued provider URL or a separate backup guarantee.
- Build homepage, viewer, approved detail and standings from shared persistent campaign records. Enforce private submission denial on direct routes. Include approved waiting creatives, creator attribution and tracked fundraising. Empty approved state says “No approved ads yet”; unavailable media retains applicable retry/fundraising access. Standings preserve labeled last-known results during delays instead of inventing zero/final status. Functional interfaces for remaining workflows are launch scope; cosmetic preview redesign remains deferred.

### Fundraising, competition and creator earnings

- Create a unique tracked fundraising link at entry creation, distinct from sign-in links. Stripe-authoritative successful payment identity/amount/time establishes fundraising once; browser return, pending/failure and replay cannot. Use half-open earning windows and original provider time for delayed/reordered events. Later donations through valid old links support the nonprofit without later creator commission or competition credit after cutoff.
- Fundraising commission uses the locked gross-based rate, whole cents and per-donation half-up rounding; separately record gross, confirmed cumulative refunds, provider fees and earned commission. Recompute cumulative refund adjustment rather than rounding repeated deltas inconsistently. Paid commission reversals offset future commissions only, never prizes or bank debits. Advertising contributions are a separate purpose and produce none of these earnings/score/replenishment effects.
- Public competition uses paid eligible Meta/Facebook/Instagram and TikTok impressions, total link clicks and attributable fundraising, aggregated once per entry with provider breakdown. Exclude organic/unrelated activity, CTR/votes and estimated conversions. Use the capped square-root score with public 40/30/30 weights, positive configured targets and unrounded comparisons; 25/36/64 against 100 targets yields 62. Tie-break by clicks, fundraising then impressions, descending. An exact remaining tie shares rank and one fixed prize; allocate remainder cents by ascending creation time/stable entry ID. Repeated wins and multiple entries per creator remain allowed.
- Use Chicago calendar days and Monday–Sunday weeks, actual DST boundaries and half-open periods. Only full periods inside competition dates award prizes; a partial period may still earn eligible commissions. Complete all-zero periods award no prize and retain its funds. Track completeness explicitly per entry/source/metric/period, separate from successful transport and affirmative zero. Missing/stale data holds finalization and applicable boosts/evaluations.
- Finalize complete periods once after 48 elapsed hours and within the specified five-minute processing/recovery bound. Preserve the winner snapshot and queue unpaid finalized prizes into the next applicable batch. Ordinary refunds/imports/manual updates do not reopen finalized prizes; record/notify discrepancies. A confirmed finalized-prize correction appends the before/after result and obligations without overwriting history. Already-paid errors remain campaign loss; the correct creator is still owed and blocked funding/recipient status cannot become “paid.”
- Manual fallback records actor/time/source/period/prior/new values/reason and reconciles later imports without duplication. Evidence-backed certified corrections override only their selected entry/metric/time range until released; conflicting imports stay held and notify the manager. Disqualification targets specified entries/dates; withdrawal/removal/fraud are distinct operations, not implicit findings or finalized-prize edits.
- Prepare each preceding Monday–Sunday commission batch plus finalized unpaid prizes and carryover at Wednesday noon Chicago, once with catch-up after downtime. Manager approval binds exact recipient/amount contents; changes require new approval. Track settled/pending/failed/restricted recipients independently, reserve blocked entitlements, allow others to pay and require fresh approval when released. Reconcile unknown payments before retry; retain provider references and at-most-one settlement.
- Protect the entire promised prize schedule, reserved creator earnings and funded-run advertising separately. Weekly prize replenishment is the fixed configured amount/day/time, not a donation percentage. Check 24 elapsed hours before and again at execution; insufficient funds transfer nothing, notify immediately and retry hourly until fulfilled or uncertain outcome reconciled. Do not borrow protected earnings or another nonprofit's funds.

### Advertising orchestration and allocation

- Limit initial paid goals to awareness or visits to the tracked fundraising page; goals do not alter public score or assigned continuation policy. Report mapping/discovery grants no control. Explicit external-ad enrollment verifies scope, approved unchanged creative, destination, permissions and obligations; keep prior costs/history, start only future managed trial delivery and prevent reenrollment resetting it.
- New queue time is first approval; retrial queue time is new manager authorization, with stable entry-ID ties. A blocked entry retains position but may be skipped by a later eligible funded entry with visible/notified reason. Actual admission atomically validates current revision, reserves a slot/funding and assigns the then-published performance policy. Approval, enrollment and waiting alone do not start a trial. Administrator-approved extra slots do not raise spending limits automatically.
- Capacity counts competition entries once across placements, not creators. Initial trials, temporary pauses, provider interruptions and stopping reserve slots. Cuts/withdrawals release a slot only after every relevant paid placement is confirmed stopped. Performance-cut creative remains public; withdrawal/removal hides it, applies its earning cutoff, preserves valid prior history and requests stops. Fraud suspension blocks new placements, hides/holds the specified participation/earnings and requires explicit resolution without automatic confiscation or finalized-result rewrite.
- Start trial time at first confirmed managed paid delivery. A trial day is 24 elapsed hours with confirmed pauses excluded. Use assigned capped-square-root continuation targets, configurable nonnegative weights totaling 100%, passing score and duration; zero weight ignores its metric and equality passes. Public 40/30/30 remains separate. Trial evaluation uses its own fixed complete activity window; subsequent Chicago-midnight daily windows cover the assigned duration excluding pauses. Persist window identity/end and process overdue windows chronologically: incomplete earlier windows hold the sequence, first complete failure cuts at actual decision time and later passing data cannot undo it. A provider interruption requires its full normal-delivery recovery window. If completion would overrun the locked funded end, stop then and mark incomplete, preserve history and alert both operators; do not autoextend dates/funding.
- Manager-authorized retrial preserves prior trials/cutoffs, rejoins the shared queue and requires capacity/funding. It uses the published policy at actual new admission. An in-capacity retrial does not add an administrator gate; expansion still does. Unknown/failed stops identify placements, hold slots/liabilities, alert operators and support native-tool fallback only with reconciliation.
- Reuse accepted CT-01–CT-04 and the existing planner. Full funded-run baseline coverage for open slots includes enough funded time for initial trials; do not add an overlapping trial reserve twice. First-day baseline prorates by remaining actual Chicago-day seconds with half-up whole-cent rounding. Released elapsed-unused allocation requires proven delivery/liability reconciliation, remains in the same campaign and cannot release future/uncertain coverage or silently change an old provider split.
- Calculate the manager's boost percentage from residual headroom after whole-run baseline/safety/other obligations, bounded by remaining daily and total authority. Today's baseline consumes its embedded reserve once. Preserve nonboosted residual as uncommitted. Complete usable daily ranks select the top funded eligible group including exact cutoff ties. Only healthy campaign startup splits the defined boost pool equally. Missing/stale required eligible-entry scores permit safe baselines but hold all new boosts, retain committed obligations and immediately notify both operators; never invent per-entry startup/zero/rank. Withdrawn, cut, paused, suspended and currently disqualified entries receive no new allocation; past-only disqualification does not ban valid future participation by itself.
- Provider shares total 100%, allowing either at zero; split cents by largest fractional remainder with Meta-before-TikTok ties. Meta covers Facebook/Instagram under the validated contract, without a promised independent network cap. Unavailable share stays held while healthy placements may use their own authorized share. Explicit manager edits may change future shares. Unsupported pacing/minimums block execution; do not invent a workaround or hard-spend guarantee.
- Persist production plan scope, actor/authority, Chicago day, settings/policy versions, ordered entries, score coverage/as-of evidence, finance snapshot/obligation references, cent allocations and blocked reasons. Assemble these from trusted records and revalidate before writes. Saving an advisory preview cannot activate settings or consume reservations. Production orchestration must connect the existing separate reservation primitive to current queue/evidence/authority with conflict rejection/recomputation, not treat its isolated tests as completed integration.
- Validate settings edits atomically, including positive whole-cent baseline, positive integer top count, finite safe amounts, percentages and performance bounds. Unfunded increases cannot activate. Below-obligation limits stop new spend/request pauses/notify while preserving incurred/uncertain obligations, history and active assigned policies. Zero authority creates no spending; negative source availability is a blocking deficit rather than invented zero funds.

### Financial evidence, external writes and contributions

- Use approved nonprofit USD funding/Issuing availability with identity/matching provenance. Distinguish collection, available funding, authorizations, posted charges, unbilled delivery, fees, refunds, transfers and disputes. Count each cost once: subtract additional coverage only if it is not already reflected by the provider. Released authorization is not proof of canceled debt; unmatched/provisional credits do not establish spendable funding. Actual matching/release semantics remain gated.
- Require actual administrator-approved reserves for unbilled delivery/refunds/disputes/fees, maximum financial-data age and release evidence, scoped to provider/account. Missing values cannot become zero reserves or unlimited age. Financial uncertainty stops new allocations and requests affected pauses while retaining slots. Shortfall first blocks new admissions/discretionary boosts; uncovered remaining baseline/obligations also pause affected placements. Never silently dilute baseline or borrow other protected purposes.
- Resume only when required evidence is reliable/current under approved policy, funding is restored, placement outcomes reconciled, existing authority suffices and no separate hold applies. Preserve incidents, costs, slots and trial history. Recovery cannot approve expansion, undo withdrawal/fraud, reset trials or cancel charges.
- Journal intended action/object identity before dispatch. Retain proposed/reserved/dispatched/uncertain/provider-confirmed/reconciled outcomes and references. Implement provider-specific supported idempotency/status lookup rather than assuming every endpoint supports keys. Unknown create/change/pause/payment/refund/return outcomes remain pending; do not replace objects/payments or release reservations on timeout alone.
- Advertising contributions fund the chosen campaign without per-ad earmarks, cross-nonprofit routing, creator commission, public/continuation fundraising score or prize replenishment. Show gross, actual provider fees and net available separately; no Slander application fee is added. Protect baseline coverage after fees/reserves.
- Discretionary full/partial contribution refunds require manager request/admin approval, original contributor and supported route, bounded by remaining refundable amount and protected obligations. Bind approval to beneficiary, amount, USD, source, permitted destination/route and request revision; changed contents need fresh review. Blocked execution remains pending/unpaid and immediately alerts both operators. Forced provider reversals do not acquire a discretionary approval gate.
- Campaign balance returns are only to the same nonprofit after closure, confirmed placement stops, obligation/reserve reconciliation, provider/purpose permission and manager request/admin approval. No active-campaign returns, cross-campaign transfers or automatic whole-balance release. Preserve uncertain/outstanding return evidence through verified settlement.
- Exclude disputed amounts from spendable funds immediately, alert both operators and recompute safety; preserve delivered costs. Cumulative refunds, mandatory reversals, recoveries and retained fees reconcile once against the contribution. Actual provider loss responsibility and funding/return routes remain evidence gaps rather than selected behavior by assumption.

### Operations and launch

- Refresh public stored results every 30 seconds without promising provider refresh frequency. Start each required source's outage clock at activation, even before its first success. Exactly five minutes is not an import-outage incident; strictly more than five is. Persist through restart, deduplicate and notify one recovery. Successful import is a completed operation, not proof of complete period coverage; incomplete reporting can leave a separate completeness hold after transport recovery.
- Confirm public-media outage before hiding an entry: continuous failure strictly beyond 60 seconds; one visitor failure is insufficient. Keep diagnostics and donation access without editing creative, changing earnings/approval or stopping independently healthy external placements. Restore after two successful checks 30 seconds apart, without overriding withdrawal/fraud/rejection or other visibility restrictions. Notify manager and preserve incident history.
- Preserve manager-only recipients for original prize/import/batch/media/prize-loss notices. Selected financial/delivery/slot/capacity/evaluation/launch blocks immediately persist and attempt email to both manager and administrator, including the user's designated operator, with recipient deduplication for one person holding both roles. Repeated checks update one incident. Retry failed email after 1/5/15/60 minutes, then expose delivery failure; email failure never resolves the incident. Notify recovery once. “Immediate” means no intentional grace after detection; actual detector/dispatch bounds require reviewed evidence rather than invented latency values.
- A paid-launch gate records owner, scope, unmet reason, evidence and status. Prelaunch setup, creator intake/review, approved waiting public creatives and permissible crowdfunding may progress before paid launch, subject to their own required provider approvals. Paid launch requires funded prizes/full-run baselines, validated providers, approved safety values and production behavior review. No fixture or closed research/design ticket is an approval substitute.

## Testing Decisions

### Approved verification boundaries

The Q106 preview seams remain accepted and implemented. On 2026-11-12, the user approved these boundaries for the broader remaining build and reaffirmed Clerk for sign-in. Clerk handles sign-in, invitations, sessions and supported recovery; Convex validates the Clerk identity and enforces current application permissions. Isolated test identities do not replace Clerk in the application.

1. **Application behavior through existing public Convex operations, with browser journeys for visible outcomes.** Exercise authentication, direct-access denial, persisted state, authorized actions, callbacks/job entry points and query results. Extend the owned isolated actual-backend harness rather than building a second test-only implementation. Use actual backend restart, discarded-response retry and concurrency where they can change correctness. Keep focused public planner/math checks for cents/time/score boundaries; do not test private helpers to mirror implementation.
2. **Provider-facing contracts at the adapter boundary used by those operations.** Controlled responses/events exercise signatures, pagination, event ordering, duplicate callbacks, missing coverage, partial delivery, declines, rate limits, unknown writes, lookups and reconciliation. Mark candidate fixtures explicitly; a simulated contract cannot establish that an endpoint/account supports it. Media lifecycle tests also prove exact original-byte preservation, current download authorization and recovery/purge races.
3. **Separate authorized real-account/provider verification and final end-to-end release review.** Validate real Clerk invitation/replay/revocation/recovery, Stripe program/routes/available balances, advertising grants/objectives/media/pacing/reporting/stops, actual Blob/Mux behavior and approved safety values. Use redacted account/object references and environment-specific evidence. A passing adapter fixture or local issuer rejection is not real-account acceptance.

These boundaries are approved; real-provider evidence remains outstanding. No accepted product choice is reopened. Exact runnable commands and criterion-to-test links belong in each implementation ticket when its slice is defined; old designated per-requirement filenames in the [verification plan](adoption-launch-verification-plan.md) are a coverage inventory, not passing tests or a mandate to create one file per requirement.

### Required evidence

- Every source acceptance criterion must point to an observable assertion and result at completion. A document audit, missing-file failure, import-only run, skip or zero-test run is not behavioral proof.
- Isolate identities/data per run; production rejects fixture issuers and never accepts synthetic money/metrics as live authority. Do not migrate demo finances as real records. Recheck scoped permissions on current calls, retries, callbacks and link issuance where applicable.
- Prioritize meaningful boundaries: exact limits, Chicago DST, inclusive/exclusive timestamps, unknown versus zero, original-period delayed events, fixed evaluation windows, complete versus successful imports, one-cost matching, conflict/retry/response-loss behavior and uncertain writes. Verify conservation and visible blocked states, not just happy-path totals.
- Validate full journeys: creator acceptance → upload → review → public detail/tracked link; confirmed donation → attribution → score/commission → finalization → approved payment; trusted funding/authority → admission → confirmed delivery → evaluation → stop/retrial; contribution → refund/dispute/closure; original deletion → restore or confirmed purge; incident → failed delivery/retry → recovery. Provider-gated portions remain explicitly incomplete until proven.
- Run the build/regressions appropriate to each implementation change. Existing S1 results remain reusable regression evidence, but do not certify new flows. This documentation consolidation runs structural coverage/link checks only and starts no application service.

### Provider and production gates

| Gate | Still required / tracked owner | Work possible before it passes | What remains blocked |
| --- | --- | --- | --- |
| PG-01 | [#20 — actual Stripe program/account eligibility](https://github.com/Cooper2Rich/adoption-project/issues/20), human-obtained authoritative evidence. | Precise inquiry preparation, interface/blocked-state design and isolated candidate contracts. | Actual collection/Issuing/payer eligibility and any execution requiring that approval. |
| PG-02 | [#21 — approved funding/refund/return route](https://github.com/Cooper2Rich/adoption-project/issues/21), blocked by #20; account/source/destination/consent/read/matching evidence. | Ledger/reconciliation interfaces, test events and unknown-outcome handling. | Real funding, refunds/returns and financial-availability certification. No direct or bank-mediated route is chosen here. |
| PG-03 | [#12 — Meta/TikTok access and delivery contracts](https://github.com/Cooper2Rich/adoption-project/issues/12); authorized account/grant/objective/media/identity/pacing/reporting/stop/payer/instrument evidence. | Queue/lifecycle/adapter design and faithful candidate fixtures. Independent access/reporting checks need not wait for Stripe; payment-dependent checks coordinate with #20/#21. | Live control and certification of comparable complete metrics, precise pause windows and payable delivery. |
| PG-04 | Real Clerk invitation forwarding/replay/revocation/recovery evidence, retained in [#9](https://github.com/Cooper2Rich/adoption-project/issues/9). | Scoped application permission tests using explicit isolated identities. | Real invitation/sign-in/recovery acceptance. |
| PG-05 | [#22 — actual administrator-approved safety values](https://github.com/Cooper2Rich/adoption-project/issues/22), blocked by #12/#20/#21. | Required-policy validation, safe blocked states and test-only values. | Paid launch with unset/unvalidated reserves, freshness or release rules. |
| PG-06 | Remaining production implementation, criterion-mapped backend/browser/provider results and consolidated launch review, retained in #9. | Bounded implementation tickets with honest dependencies and verification. | Whole-launch completion and deployment/paid activation claims. Media/upload and alert-delivery proof are included in this release evidence. |

If provider evidence contradicts a candidate contract, present the concrete limitation and available decisions. Do not silently substitute a pooled, manual-only or otherwise different business model. Engineering can proceed on demonstrable independent slices while the specific gated execution remains blocked.

## Out of Scope

- Cosmetic allocation-preview redesign; the total competition-entry count is already added. Functional screens needed for the remaining launch workflows stay required.
- Product-feedback tools, usage analytics and related improvement tooling before initial release. Operational payment, video-processing, delivery/reporting callbacks and diagnostics stay in scope.
- Public multi-nonprofit marketplace/campaign selection, generic marketplace onboarding, demo-fixture migration into live finance and additional advertising goals such as advanced donation-conversion optimization.
- Per-ad contribution earmarks, advertising-contribution creator commissions/prize replenishment/score credit, application markup, cross-nonprofit funding, active-campaign balance returns and automatic prize rewrites on ordinary refunds.
- New unapproved numeric safety defaults, presumed provider approval, hard-spend guarantees, automatic campaign/trial extensions and replacement external writes on timeout.
- Provider account setup/contact, credential provisioning, live payments/ads, deployment or ticket publication performed by this consolidation itself. The user's prior preview-build authorization and accepted decisions remain intact; future actions take their scope from the relevant authorized task.

## Further Notes

### Requirement traceability

Each row below incorporates **all** acceptance criteria for its original requirement. Area is a primary ownership grouping, not a restriction on dependencies. “S1 foundation” denotes related bounded local evidence to reuse; it does **not** mark the full launch requirement complete. Rows without it still require production implementation/verification even where historical demo code exists.

| Requirement | Criteria | Primary area | Local evidence / remaining boundary |
| --- | --- | --- | --- |
| REQ-101 — Single-campaign launch | 3 | A | S1 scoped campaign access; full launch routing/governance remains. |
| REQ-102 — Public homepage | 2 | C | Launch behavior not established by S1. |
| REQ-103 — Public viewer experience | 3 | C | Launch behavior not established by S1. |
| REQ-104 — Public competition standings | 3 | E | Launch behavior not established by S1. |
| REQ-105 — Email-invited creator access | 3 | A | Launch behavior not established by S1. |
| REQ-106 — Campaign manager and platform-administrator permissions | 4 | A | S1 manager/operator denials; full workflow authority remains. |
| REQ-107 — Versioned participation acceptance | 3 | A | Launch behavior not established by S1. |
| REQ-108 — Creative submissions | 3 | B | Launch behavior not established by S1. |
| REQ-109 — Manager creative review | 2 | B | Launch behavior not established by S1. |
| REQ-110 — Ad-specific fundraising link | 2 | C | Launch behavior not established by S1. |
| REQ-111 — Confirmed Stripe fundraising | 2 | D | Launch behavior not established by S1. |
| REQ-112 — Attribution earning window | 4 | D | Launch behavior not established by S1. |
| REQ-113 — Locked competition rules and versioned advertising controls | 5 | A | S1 advisory draft versions; locked campaign setup and activation remain. |
| REQ-114 — Paid platform performance | 2 | E | Launch behavior not established by S1. |
| REQ-115 — Weighted competition score | 2 | E | Launch behavior not established by S1. |
| REQ-116 — Chicago competition periods | 3 | E | S1 Chicago proration; competition-period eligibility remains. |
| REQ-117 — Complete data and empty periods | 3 | E | Launch behavior not established by S1. |
| REQ-118 — Ranks and shared prizes | 3 | E | Launch behavior not established by S1. |
| REQ-119 — Delayed winner finalization | 3 | E | Launch behavior not established by S1. |
| REQ-120 — Refunds and corrections | 2 | D | Launch behavior not established by S1. |
| REQ-121 — Fundraising commissions | 2 | D | Launch behavior not established by S1. |
| REQ-122 — Separate campaign funds | 2 | F | Launch behavior not established by S1. |
| REQ-123 — Fixed weekly prize replenishment | 2 | F | Launch behavior not established by S1. |
| REQ-124 — Replenishment shortfall warning | 3 | F | Launch behavior not established by S1. |
| REQ-125 — Thirty-second refresh | 2 | E | Launch behavior not established by S1. |
| REQ-126 — Import outage notification | 4 | K | Launch behavior not established by S1. |
| REQ-127 — Audited manual fallback | 3 | E | Launch behavior not established by S1. |
| REQ-128 — Approved weekly payments | 4 | F | Launch behavior not established by S1. |
| REQ-129 — Payment retries and reversals | 2 | F | Launch behavior not established by S1. |
| REQ-130 — Private creator status | 2 | B | Launch behavior not established by S1. |
| REQ-131 — Persistent records and traceability | 2 | K | S1 durable preview/audit/restart; all other workflows remain. |
| REQ-132 — Automated advertising boundary | 2 | G | Launch behavior not established by S1. |
| REQ-133 — Withdrawal and discretionary removal | 3 | H | Launch behavior not established by S1. |
| REQ-134 — Disqualification | 2 | E | Launch behavior not established by S1. |
| REQ-135 — Temporary fraud suspension | 3 | H | Launch behavior not established by S1. |
| REQ-136 — Finalized prize correction | 3 | E | Launch behavior not established by S1. |
| REQ-137 — Already-paid prize loss | 3 | F | Launch behavior not established by S1. |
| REQ-138 — Creative upload validation | 3 | B | Launch behavior not established by S1. |
| REQ-139 — Creator-owned submission fixes | 2 | B | Launch behavior not established by S1. |
| REQ-140 — Public ad outage diagnostics | 2 | K | Launch behavior not established by S1. |
| REQ-141 — Public ad outage recovery | 2 | K | Launch behavior not established by S1. |
| REQ-142 — Operational alert delivery | 3 | K | Launch behavior not established by S1. |
| REQ-143 — Blocked payment recipients | 2 | F | Launch behavior not established by S1. |
| REQ-144 — Nonprofit-scoped provider assets | 2 | A | S1 application scope denial; actual provider asset/grant scope remains. |
| REQ-145 — Expansion and financial review authority | 2 | A | Launch behavior not established by S1. |
| REQ-146 — Initial advertising goals | 2 | G | Launch behavior not established by S1. |
| REQ-147 — Explicit external-ad enrollment | 2 | G | Launch behavior not established by S1. |
| REQ-148 — Shared admission queue | 2 | H | Launch behavior not established by S1. |
| REQ-149 — Expandable funded capacity | 2 | H | Launch behavior not established by S1. |
| REQ-150 — Reserved slot lifecycle | 2 | H | S1 occupied-slot inputs; confirmed live lifecycle remains. |
| REQ-151 — Funded-run baseline coverage | 3 | I | S1 reserve calculation; actual funds/run/elapsed-release integration remains. |
| REQ-152 — Partial first-day baseline | 2 | I | S1 proration/DST; provider pacing validation remains. |
| REQ-153 — Baseline-first boost pool | 2 | I | S1 baseline/residual planner; trusted production input/dispatch remains. |
| REQ-154 — Ranked boost selection | 3 | I | S1 ties and missing-score hold; actual reports/boost commitments remain. |
| REQ-155 — Startup boost allocation | 2 | I | S1 explicit healthy startup; actual source-state integration remains. |
| REQ-156 — Meta/TikTok spending shares | 2 | I | S1 conserving share math; validated provider execution remains. |
| REQ-157 — Unavailable provider share | 2 | H | S1 held-share explanation; live interruption/recovery remains. |
| REQ-158 — Spending exclusions | 2 | H | S1 allocation exclusions; live participation/hold transitions remain. |
| REQ-159 — Admission-bound performance policy | 2 | H | Launch behavior not established by S1. |
| REQ-160 — Initial trial clock | 3 | H | Launch behavior not established by S1. |
| REQ-161 — Fixed daily continuation windows | 3 | H | Launch behavior not established by S1. |
| REQ-162 — Confirmed placement stopping | 2 | H | Launch behavior not established by S1. |
| REQ-163 — Explicit advertising retrial | 2 | H | Launch behavior not established by S1. |
| REQ-164 — Validated spending edits | 2 | I | S1 draft validation; atomic operational activation/reserve resizing remains. |
| REQ-165 — Unreliable financial evidence | 2 | I | S1 blocked synthetic evidence; actual financial pause/stop remains. |
| REQ-166 — Distinct funds and obligations | 2 | I | S1 one-coverage planner inputs; provider matching/reconciliation remains. |
| REQ-167 — Financial shortfall and recovery | 2 | I | Launch behavior not established by S1. |
| REQ-168 — Actual advertising provider fees | 2 | J | Launch behavior not established by S1. |
| REQ-169 — Advertising contribution classification | 2 | J | Launch behavior not established by S1. |
| REQ-170 — Reviewed contributor refunds | 2 | J | Launch behavior not established by S1. |
| REQ-171 — Closure-only campaign returns | 2 | J | Launch behavior not established by S1. |
| REQ-172 — Disputed-fund exclusion | 2 | J | Launch behavior not established by S1. |
| REQ-173 — Approved numeric safety policy | 2 | I | S1 required synthetic policy checks; actual administrator-approved values remain. |
| REQ-174 — Immediate operator incidents | 2 | K | S1 simulated durable intent/incident lifecycle; actual delivery/retries remain. |
| REQ-175 — Provider and production launch gates | 2 | K | S1 bounded evidence only; actual full gate registry/release proof remains. |
| REQ-176 — Durable reproducible allocation plans | 2 | I | S1 immutable advisory plans; trusted production plans remain. |
| REQ-177 — Atomic admissions and reservations | 2 | I | S1 separate contention/restart primitive; production admission integration remains. |
| REQ-178 — Reconciled external write outcomes | 2 | G | Launch behavior not established by S1. |
| REQ-179 — Verified financial recovery | 2 | I | Launch behavior not established by S1. |

Additional accepted obligations not assigned new requirement IDs:

| Decision | Required remaining behavior / verification |
| --- | --- |
| Q95/Q98/Q99, ADR-0001/0002 | Convex/Vercel/Stripe/Clerk architecture; private exact original videos in Blob and separate Mux playback, scoped permissions and verified processing. Apply across A/B/G/K rather than reviving the old Express/SQLite launch design. |
| Q100 | Original downloads restricted to uploader, scoped manager and authorized administrator; verify unauthorized/revoked/expired access and distinguish issued-URL behavior from future grants. |
| Q101 | No automatic original-video expiry after withdrawal/completion/playback removal. |
| Q102 | Confirmed audited administrator deletion, blocked while active/publishing. |
| Q103 | Original bytes retained for 30-day recovery; restore cancels purge; reconcile deadline/race/retry/unknown-delete outcomes and preserve audit. |
| Q96 | Defer feedback/usage analytics while preserving operational callbacks/control/diagnostics. |
| Q105/Q106 and later build request | Advisory preview saves, separate reservation verification and the implemented actual local Convex/browser baseline; do not rebuild or overclaim it. |
| Later total-ad-count/UI direction | Preserve the competition-entry total; defer preview cosmetic redesign. |

### From consolidated scope to tickets

The [approved ticket order and dependencies](remaining-launch-ticket-plan.md) is published as 40 GitHub issues; see the [verified publication record](remaining-launch-ticket-publication.md). The user approved both verification boundaries and ticket granularity/dependencies, reaffirming Clerk for sign-in.

The published vertical slices identify concrete outcomes, source criteria, reused S1 behavior, verification and native dependencies. Separate agent implementation from human/provider evidence; do not duplicate #12/#20/#21/#22 or reopen settled design merely because live validation remains outstanding. Open native blockers still govern when each issue can start.

The user approved the titles, deliverables and blockers before publication. New issues carry the current S1 checkpoint and full source contracts; #9 retains its historical body, and its approved new child relationships point to the remaining work. The [tracker reconciliation](planning-tracker-reconciliation.md) remains historical; no existing parent/provider title, body, state, label or comment was changed by this publication.

### Consolidation checks

Structural checks on 2026-11-12 confirmed exactly 79 unique requirement rows covering REQ-101 through REQ-179, 191 source acceptance criteria, one primary area per requirement and 68 sequential user stories. All 120 relative local-file links checked across this spec and the three source documents updated with review pointers resolved. These checks establish document integrity only; application/provider tests were not rerun and no service was started.

### Source set

- [Launch PRD](PRD-adoption-is-launch.md): original REQ-101–REQ-143 and accepted follow-up decisions.
- [Advertising contract](adoption-launch-advertising-contract.md): REQ-144–REQ-179, CT-01–CT-04 and resolved Q89–Q93.
- [Verification inventory](adoption-launch-verification-plan.md): existing criterion IDs and planned coverage; historical command/readiness claims are qualified above.
- [Architecture ADR](adr/0001-convex-vercel-launch-stack.md) and [original-video ADR](adr/0002-preserve-originals-in-private-blob-with-mux-playback.md).
- [Implemented preview specification](allocation-preview-build-spec.md), [bounded executed evidence](allocation-preview-verification.md) and [run guide](ALLOCATION-PREVIEW.md).
- [Planning tracker reconciliation](planning-tracker-reconciliation.md) and live issue links in the gate table.

# Remaining launch tickets — approved and published

> **Corrected 2026-11-12 after publication:** added T00 (land S1 on `main`) and a donation/creator-payout evidence ticket; split T26, T29, T39 and T40 into a/b halves; made T28 wait on #12. See [Corrections applied](remaining-launch-ticket-publication.md#corrections-applied-2026-11-12). The breakdown below is the original approved text.

**Approved and published, 2026-11-12.** See the [published issue queue and verified relationships](remaining-launch-ticket-publication.md). Based on the [consolidated remaining build spec](remaining-launch-build-spec.md), the completed local S1 preview and the user's approved verification boundaries. Clerk handles sign-in, invitations, sessions and recovery; Convex validates the Clerk identity and enforces current permissions. There is no replacement sign-in system in this plan.

The numbered list records the approved build order, not one long serial chain: **Blocked by** identifies actual engineering prerequisites. Existing provider-validation issues continue alongside code work. Every slice includes its persisted backend behavior, relevant authorized/public interface, visible status and meaningful tests. Reuse the actual Convex/backend/browser harness and existing planner; no separate database/auth/planner foundation ticket is needed.

**Acceptance boundary:** These are engineering tickets, not assertions that all source acceptance criteria can pass without provider evidence. Application operations/browser journeys and adapter contracts prove the bounded implementation. Actual Clerk, payment, advertising, Blob/Mux and email evidence is recorded separately and feeds the final release ticket. A candidate contract stays visibly unvalidated, its production dispatch stays blocked, and unsupported capabilities return for decision. Specific live-contract prerequisites are listed after the breakdown; they are not falsely represented as blockers of independent isolated code work. An adapter needing an unanswered provider contract remains blocked at that boundary; independent candidate-contract tests cannot establish actual support. Return concrete capability limitations for decision before implementing a different live contract.

## Approved breakdown

1. **T01 — Clerk manager sign-in and locked campaign setup.**
   **Blocked by:** None; reuse S1.
   **Delivers:** A manager signs in through Clerk, opens the scoped adoption.is workspace and creates immutable competition/earnings/prize/schedule settings. Convex denies guest, creator, revoked and cross-nonprofit direct access; administrator authority is independently recorded. Verify persistence/retry, immediate rule locking and a second isolated nonprofit. **Coverage:** REQ-101, REQ-106, REQ-113, REQ-131, REQ-144.

2. **T02 — Invited creator access and participation acceptance.**
   **Blocked by:** T01.
   **Delivers:** A creator uses the invited Clerk identity, accepts the versioned participation terms and reaches a private workspace with supported session/recovery entry points. Forwarded/wrong/revoked identities are denied by current application permissions. Acceptance records version/identity/time; actual terms must be supplied before signup is enabled. Real Clerk edge-case proof is T38. **Coverage:** REQ-105, REQ-107, REQ-130.

3. **T03 — Photo submission, creator corrections and manager review.**
   **Blocked by:** T02.
   **Delivers:** A creator uploads supported photos, submits creative, sees rejection/revision feedback and resubmits; the manager approves unchanged creative. Enforce inclusive size/count/type limits and private direct-route denial. Preapproval corrections retain identity; approved replacements create a new entry; descriptive edits retain it. Staff cannot edit creative for the creator. **Coverage:** REQ-108, REQ-109, REQ-130, REQ-138, REQ-139.

4. **T04 — Original-video upload and processed playback.**
   **Blocked by:** T03.
   **Delivers:** A creator uploads one exact original to private Blob; verified validation and Mux processing produce reviewable playback/status. Test byte integrity, inclusive 5,000,000,000-byte/60-second/codec boundaries, resumable failure and duplicate/reordered callbacks without exposing originals or showing unfinished playback as ready. Controlled provider integration remains distinct from candidate adapter tests. **Coverage:** REQ-108, REQ-138; Q98/ADR-0002.

5. **T05 — Public campaign, approved viewer and tracked links.**
   **Blocked by:** T03.
   **Delivers:** Guests browse the shared persistent homepage and approved-entry details with attribution and an entry-specific tracked fundraising link. Pending/rejected direct routes stay private; empty and failed-media states are explicit. Cross-platform sharing keeps one entry/link, including approved waiting creative. Integrate video playback when T04 is available without making photos wait for it. **Coverage:** REQ-102, REQ-103, REQ-110.

6. **T06 — Authorized original downloads and indefinite retention.**
   **Blocked by:** T04.
   **Delivers:** Only the uploader, scoped manager and authorized administrator can obtain temporary original-video access after current permission checks. Withdrawal, completion and playback removal retain original bytes. Test other creators/nonprofits, revoked permissions and URL expiry; do not claim an already-issued URL is immediately invalidated by a record flag. **Coverage:** Q100, Q101; ADR-0002.

7. **T07 — Confirmed original deletion with recovery.**
   **Blocked by:** T06.
   **Delivers:** An administrator confirms an audited deletion only when the entry is not active/publishing. Original bytes survive the 30-day recovery window; restore cancels purge. Verify duplicate requests/jobs, reactivation, boundary timing, restore/purge races and unknown external-delete results. Show permanent deletion only after confirmation and retain the audit. **Coverage:** Q102, Q103; ADR-0002.

8. **T08 — Persistent operator incidents and email delivery.**
   **Blocked by:** T01.
   **Delivers:** Operators see a durable scoped incident, delivery attempts and recovery. Reuse S1 incident deduplication; add actual notification dispatch, selected manager-only versus manager/admin routing, designated user recipient and 1/5/15/60-minute failed-email retries. Email failure never clears an incident. Verify duplicate events, restart and one-person/two-role recipient deduplication. **Coverage:** REQ-131, REQ-142, REQ-174.

9. **T09 — Visible launch readiness and unresolved gates.**
   **Blocked by:** T08.
   **Delivers:** Managers/admins see each provider, identity, media, funding, safety and production gate with owner, scope, evidence and unmet reason. Unknown/unmet gates keep paid activation blocked and create the required incident; closed research and S1 fixtures cannot mark them approved. Preserve permissible prelaunch intake/public waiting states. **Coverage:** REQ-175.

10. **T10 — Confirmed fundraising and creator commission ledger.**
    **Blocked by:** T05.
    **Delivers:** Account-free fundraising through the entry link produces exactly one Stripe-confirmed donation with authoritative amount/time/identity and the locked gross-based commission. Pending/browser-return/replayed events do not count; delayed/reordered confirmations use original periods and cutoffs. Show separate gross/fee/commission records and account-free post-cutoff nonprofit-only donations. **Coverage:** REQ-111, REQ-112, REQ-121.

11. **T11 — Fundraising refunds and commission reversals.**
    **Blocked by:** T10, T08.
    **Delivers:** Confirmed cumulative refunds correct original attribution/provisional results and cumulative rounded commission once. Paid commission overpayment offsets future commissions only, never prizes or bank debits. Finalized prizes remain unchanged and discrepancies are notified. Test partial/repeated/reordered refunds, retained fees and already-paid earnings. **Coverage:** REQ-120, REQ-129.

12. **T12 — Paid metric imports, coverage and source health.**
    **Blocked by:** T01, T08.
    **Delivers:** The manager can inspect scoped paid Meta/TikTok entry mappings, imported values, source operation outcomes and metric/period coverage. Exclude unrelated/organic/duplicate activity; distinguish affirmative zero, incomplete coverage and successful transport. Source monitoring starts at first required use, persists through restart and opens one outage only after five minutes. Provider-specific import acceptance still needs #12 evidence. **Coverage:** REQ-114, REQ-117, REQ-125, REQ-126.

13. **T13 — Audited fallback and certified metric corrections.**
    **Blocked by:** T12.
    **Delivers:** A manager enters reasoned fallback values or evidence-backed corrections for exact entry/metric/time scopes, sees prior/new values and can explicitly release certification. Later imports reconcile without duplication; conflicts remain held/notified instead of overwriting certified values. **Coverage:** REQ-127.

14. **T14 — Public daily/weekly standings and exact shared ranks.**
    **Blocked by:** T05, T10, T12.
    **Delivers:** Public standings use paid metrics and eligible fundraising, capped square-root 40/30/30 scoring, Chicago days/weeks, unrounded tie-breaks and exact-cent shared-prize proposals. Show source freshness, partial-period eligibility and labeled last-known results when delayed; never invent zero/final results. Refresh stored results every 30 seconds without promising provider frequency. **Coverage:** REQ-104, REQ-115, REQ-116, REQ-118, REQ-125.

15. **T15 — Protected prize funds and scheduled replenishment.**
    **Blocked by:** T01, T08, T10.
    **Delivers:** The manager sees separate prize/earnings/advertising-purpose balances and the full promised-prize coverage. Fixed replenishment checks 24 elapsed hours ahead and at execution, transfers nothing on shortage and retries hourly safely. Unknown transfer outcomes stay held/reconciled; no donation-percentage rule or protected-fund borrowing is introduced. Actual transfer authority follows the validated financial contract. **Coverage:** REQ-122, REQ-123, REQ-124.

16. **T16 — Complete-period prize finalization and history.**
    **Blocked by:** T14, T15.
    **Delivers:** Complete full competition periods finalize once after 48 elapsed hours within the accepted processing/recovery bound. All-zero periods award nothing; incomplete periods remain provisional. Public past winners and immutable award snapshots survive concurrent jobs/restarts and create unpaid prize obligations for the next batch. **Coverage:** REQ-117, REQ-119, REQ-104.

17. **T17 — Weekly creator batch preparation and exact approval.**
    **Blocked by:** T10, T11, T15, T16, T08.
    **Delivers:** At Wednesday noon Chicago, the manager reviews preceding-week commissions, finalized unpaid prizes and carryover exactly once. Approval binds recipients/amounts; changes invalidate it. Creators see their own itemized earning/payment states; restricted recipients stay reserved with private guidance while others can proceed. This ticket prepares/approves, without claiming provider settlement. **Coverage:** REQ-128, REQ-130, REQ-143.

18. **T18 — Creator payout settlement and uncertain-outcome recovery.**
    **Blocked by:** T17.
    **Delivers:** An approved batch dispatches only its authorized recipient amounts through the validated payment adapter; settled/pending/failed results retain provider references. Journal before dispatch, reconcile unknown outcomes before retry and prove at-most-one settlement across duplicates/restart. Releasing a restricted recipient requires fresh approval and cannot change destination silently. **Coverage:** REQ-129, REQ-143, REQ-178.

19. **T19 — Dated disqualification without implicit final-result edits.**
    **Blocked by:** T14, T08.
    **Delivers:** A manager records reason/actor and selected entries/dates, excluding only selected unfinalized activity with visible recomputation. Historical-only disqualification does not ban valid future participation; no evidence upload, second approver or automatic finalized-award rewrite is added. The paid-stop bridge is T33. **Coverage:** REQ-134.

20. **T20 — Confirmed finalized-prize corrections and paid losses.**
    **Blocked by:** T16, T18.
    **Delivers:** The manager previews and confirms original/corrected winners and amounts, appending audited public results and private obligations. Already-paid error becomes campaign loss; the correct creator is still owed through fresh batch approval. Funding/recipient blocks stay visibly owed/unpaid; no duplicate settlement, creator debit or commission offset. Notify the manager once. **Coverage:** REQ-136, REQ-137.

21. **T21 — Withdrawal, manager removal and fraud holds.**
    **Blocked by:** T03, T05, T10, T08.
    **Delivers:** Creator withdrawal or reasoned manager removal hides the entry and applies a durable future earning cutoff while retaining valid past activity and nonprofit-only donations on old links. Fraud suspension separately hides/holds the applicable participation/earnings and requires explicit resolution without confiscating paid/final awards. Persist stop intent for paid placements; T33 connects it to confirmed provider stopping. **Coverage:** REQ-133, REQ-135.

22. **T22 — Scoped advertising connections and validated goals.**
    **Blocked by:** T01, T09.
    **Delivers:** The manager follows provider-supported guided setup for nonprofit-owned advertiser assets through Slander's applications, sees grants/account scope and selects awareness or tracked-page visits. Objective/media/brand identity validation controls readiness; discovery/report mapping cannot authorize writes. Adapter tests are isolated; actual account/grant/pacing acceptance remains #12. **Coverage:** REQ-144, REQ-146.

23. **T23 — Campaign advertising contributions and actual-fee accounting.**
    **Blocked by:** T05, T08.
    **Delivers:** A guest contributes to the selected campaign's advertising purpose with fee disclosure; verified events record gross, actual fees and net availability separately. Contributions cannot earmark an entry, cross nonprofits or create commissions, score input or prize replenishment. Duplicate/pending/failed confirmations cannot create available funds. Actual intake requires #20/#21 as applicable. **Coverage:** REQ-168, REQ-169.

24. **T24 — Trusted advertising financial evidence and safety policy.**
    **Blocked by:** T01, T08, T23.
    **Delivers:** Admins record applicable approved reserves/freshness/release evidence; managers see current scoped financial availability and one-cost matching among authorizations, posted charges, unbilled delivery and local commitments. Unknown/stale/negative/unmatched evidence blocks authority rather than becoming permissive zero/defaults. Preserve deficit and provenance across retry/restart; actual matching and numeric values remain #21/#12/#22. **Coverage:** REQ-122, REQ-165, REQ-166, REQ-173.

25. **T25 — Explicit enrollment of externally created ads.**
    **Blocked by:** T22, T12, T03, T05, T24.
    **Delivers:** The manager explicitly enrolls a scoped external ad after verifying approved unchanged creative, destination, permissions and existing obligations. Keep earlier costs and competition history; reporting discovery cannot enroll it and repeated enrollment cannot reset trials. It waits for funded admission and future confirmed managed delivery in T27/T28. **Coverage:** REQ-147.

26. **T26 — Validated operational settings and trusted allocation plans.**
    **Blocked by:** T24, T14, T09.
    **Delivers:** Reuse S1 to preview trusted campaign/score/finance records, then separately validate and activate versioned spending controls and published continuation policies. Protect full-run baseline, resize reserves safely, apply Chicago first-day proration/residual boosts/exact cutoff ties/provider-share cents and show missing-score holds. Draft saves remain advisory; authority changes never rewrite history or assigned policies. **Coverage:** REQ-113, REQ-151, REQ-152, REQ-153, REQ-154, REQ-155, REQ-156, REQ-159, REQ-164, REQ-176.

27. **T27 — Funded admission queue and capacity expansion.**
    **Blocked by:** T26, T03, T19, T21, T08.
    **Delivers:** New entries and manager-authorized retrial candidates share stable eligibility-aware ordering; blocked entries retain position while later eligible entries may pass. Reuse/extend the reservation primitive for one atomic revision/slot/funding admission, assigning the then-current policy. Manager requests/admin approves extra funded slots without raising spending limits. Trials do not start while waiting. **Coverage:** REQ-145, REQ-148, REQ-149, REQ-150, REQ-151, REQ-159, REQ-177.

28. **T28 — Managed publication, delivery confirmation and safe stopping.**
    **Blocked by:** T27, T22, T25.
    **Delivers:** Admitted approved creative or an explicitly enrolled placement uses validated provider controls with journaled intended identity and lookup/reconciliation. Track confirmed delivery, failed/unknown create/change/pause outcomes and occupied stopping slots. Native-tool fallback requires reconciliation; timeout cannot create replacement placements or free capacity. No production dispatch passes unmet gates. **Coverage:** REQ-132, REQ-150, REQ-162, REQ-178.

29. **T29 — Daily allocation commitment and provider-share execution.**
    **Blocked by:** T28, T26, T12.
    **Delivers:** Scheduled cycles assemble current trusted evidence, commit each safe baseline/residual boost once and dispatch only validated provider shares. Preserve future/uncertain coverage, complete-score holds, unavailable shares and no-new-allocation exclusions. Reconcile elapsed-unused allocations before release; keep old plans immutable and released funds in the campaign. **Coverage:** REQ-151, REQ-153, REQ-154, REQ-155, REQ-156, REQ-157, REQ-158, REQ-176, REQ-177, REQ-178.

30. **T30 — Admission-bound initial trial evaluation.**
    **Blocked by:** T29.
    **Delivers:** First confirmed managed paid delivery starts the assigned trial; confirmed pauses do not consume its 24-elapsed-hour trial days. Evaluate its own complete fixed window with assigned weights/targets/threshold and equality passing; missing data is not failure. Stop at the locked funded end as incomplete if completion overruns; preserve history/alerts without automatic extensions. **Coverage:** REQ-159, REQ-160.

31. **T31 — Chronological continuation windows and explicit retrials.**
    **Blocked by:** T30.
    **Delivers:** Daily Chicago-midnight evaluation windows remain fixed across delayed retries; an incomplete earlier window holds the sequence. First complete failure cuts at actual decision time while remaining public; a later pass cannot undo it. Explicit manager retrial rejoins the queue by new authorization time and binds policy at actual readmission, preserving history. **Coverage:** REQ-159, REQ-161, REQ-163.

32. **T32 — Provider interruption, financial pause and verified recovery.**
    **Blocked by:** T30.
    **Delivers:** Provider interruption holds its share/slot and requires a fresh normal-delivery evaluation window after recovery. Unreliable funding or uncovered obligations stops admissions/boosts and pauses affected delivery without diluting baseline or borrowing protected funds. Resume only with reliable evidence, sufficient current authority, reconciled placements and no separate holds; retain costs/trials/incidents. **Coverage:** REQ-157, REQ-165, REQ-167, REQ-179.

33. **T33 — Participation holds connected to confirmed paid stops.**
    **Blocked by:** T28.
    **Delivers:** Withdrawal/removal/fraud/current disqualification immediately prohibit new paid allocations and reach the actual placement stop/reconciliation path. Keep slots/liabilities until all required placements confirm stopped and report failed/unknown pauses. Preserve public/earning distinctions and past-only eligibility. This completes the paid half of T19/T21 rather than asserting their earlier local state tests prove provider stops. **Coverage:** REQ-133, REQ-134, REQ-135, REQ-158, REQ-162.

34. **T34 — Reviewed advertising-contribution refunds.**
    **Blocked by:** T24.
    **Delivers:** Manager requests/admin approves full or partial original-contributor refunds bounded by remaining refundable amount and protected obligations. Approval binds exact beneficiary/amount/currency/source/destination/route/revision. Changed contents need review; blocked/unknown dispatch stays visibly pending and reconciles once without replacement payments or silent fee changes. **Coverage:** REQ-145, REQ-170, REQ-178.

35. **T35 — Disputes, forced reversals and funding-shortfall response.**
    **Blocked by:** T32, T34.
    **Delivers:** Provider disputes immediately exclude affected funds and trigger the funding-safety transition, preserving delivered-ad costs. Voluntary refunds, forced reversals, recoveries and fees reconcile cumulatively once; forced reversals do not gain a discretionary approval gate. Show pending/settled outcomes and verified recovery without manufacturing available funds. **Coverage:** REQ-165, REQ-167, REQ-172, REQ-179.

36. **T36 — Reconciled campaign closure and nonprofit returns.**
    **Blocked by:** T35.
    **Delivers:** A closed campaign can request/admin-approve returnable surplus only after all placement stops, liabilities/reserves and refund/dispute obligations are reconciled. Use the permitted route to the same nonprofit with exact-content approval and uncertain-outcome handling. Active-campaign/cross-campaign returns and whole-balance release are denied. **Coverage:** REQ-145, REQ-171, REQ-178.

37. **T37 — Confirmed public-media outage and recovery.**
    **Blocked by:** T04, T21.
    **Delivers:** Confirmed continuous public-media failure strictly beyond 60 seconds hides the affected entry with diagnostics, without changing approvals, earnings or independently healthy paid placements. Preserve fundraising access; restore after two successful checks 30 seconds apart without overriding withdrawal/fraud/other visibility holds. One visitor failure cannot trigger global hiding. **Coverage:** REQ-140, REQ-141.

38. **T38 — Real Clerk invitation, access and recovery evidence.**
    **Blocked by:** T01, T02.
    **Delivers:** Authorized isolated Clerk checks verify invited identity, forwarded/wrong identity, expiry/replay/revocation, current Convex access enforcement and supported recovery. Store redacted evidence for PG-04 and report concrete limitations. Fixture rejection alone cannot pass this ticket. Human-only account/credential steps are identified explicitly; the application continues to use Clerk. **Coverage:** REQ-105, REQ-106, REQ-175; PG-04.

39. **T39 — Real media lifecycle and notification delivery evidence.**
    **Blocked by:** T07, T37.
    **Delivers:** Authorized isolated Blob/Mux checks prove upload integrity, processing/playback, scoped originals and restore/purge behavior; notification checks prove actual recipient delivery/failure reporting. Retain redacted references and measured operational evidence rather than inventing provider URL, monitoring or dispatch guarantees. Adapter tests alone cannot pass this ticket. **Coverage:** REQ-138, REQ-140, REQ-141, REQ-142, REQ-174, REQ-175; Q98–Q103.

40. **T40 — Whole-launch verification and paid-activation readiness.**
    **Blocked by:** T13, T20, T31, T33, T36, T38, T39; existing #12, #20, #21, #22. These converge all earlier build tickets transitively.
    **Delivers:** Requirement-mapped application/browser/provider evidence covers all 191 source criteria and accepted media decisions, including full money/competition/payment/ad-lifecycle journeys and failure/recovery. PG-01–PG-06 pass with funded prizes/full-run baselines, actual approved safety values and the consolidated review. Keep production fixture rejection and regression/build evidence. No unresolved gate becomes an approval by user assent or a passing fixture. Release deployment/paid activation requires its applicable authorization and is not performed by this planning task. **Coverage:** REQ-175; all requirements/CT-01–CT-04 as release acceptance.

## External evidence and execution gates

- Existing [#20](https://github.com/Cooper2Rich/adoption-project/issues/20) establishes actual Stripe program/account eligibility; [#21](https://github.com/Cooper2Rich/adoption-project/issues/21), blocked by #20, establishes the approved collection/funding/refund/return routes and read/matching evidence. T10/T15/T18/T23/T24/T34–T36 cannot certify their relevant real financial execution without applicable evidence. #21's advertising funding route is not automatically a blocker of unrelated creator-payout preparation; that payout's own actual contract must be proven.
- Existing [#12](https://github.com/Cooper2Rich/adoption-project/issues/12) establishes actual Meta/TikTok access, objectives/media/identity, payer/instrument, pacing/minimums, reporting/completeness and confirmed delivery/stopping. T12/T22/T25/T28–T33 cannot certify the corresponding provider operation without that evidence. Independent access/reporting validation may proceed before Stripe-dependent payer tests.
- Existing [#22](https://github.com/Cooper2Rich/adoption-project/issues/22), blocked by #12/#20/#21, approves actual numeric financial safety settings. T24 can prove missing/invalid-policy denial with explicit synthetic test values, but no paid activation or actual financial recovery uses those values as defaults.
- T38 supplies PG-04's real Clerk evidence; T39 supplies real media/notification evidence to PG-06. They require access to the corresponding authorized environments. Any human-only setup belongs in the future ticket as such; this plan performs no account setup or contact.
- T09 keeps the runtime gates explicit from the first operational screen. T40 is the final convergence point, not the first time denied access, unsafe finance, provider failure or a missing gate is tested. Each earlier slice must pass its own relevant failure tests.

Published native relationships preserve existing #12/#20/#21/#22 prerequisites and the approved build graph. Unvalidated actual provider execution remains gated separately from bounded code acceptance. Do not mark real-provider behavior complete because isolated code works. T38/T39 carry ready-for-human; engineering tickets carry ready-for-agent without waiving their native blockers.

## Coverage and review notes

Every requirement ID appears in the breakdown's per-ticket **Coverage** references. Repeated IDs deliberately cover different halves of a flow; a requirement becomes complete only when all its criteria and applicable provider proof pass. The published issues reproduce the full referenced source criteria, with all 191 criterion IDs assigned to owning ticket(s) in the publication map. The source criterion list remains authoritative; a short deliverable paragraph does not replace it.

All accepted Q98–Q103 original-video access/retention/deletion decisions have explicit engineering and real-provider owners. Q105/Q106 remain the reused S1 baseline. Cosmetic preview redesign remains deferred; the total competition-entry count is already implemented. No ticket reimplements the isolated Convex harness, planner or advisory-save semantics as a new foundation.

**Recommended first ticket: T01.** After T01, T02 and T08 can progress independently. The public creator path proceeds through T03/T05; fundraising through T10/T11. Provider evidence #12/#20 can advance independently, #21 follows #20 and #22 follows #12/#20/#21. Later ticket numbers express a useful review order; ready work is determined by blockers, including T38/T39 when their environments are available.

The user approved this breakdown on 2026-11-12. All 40 issues were published with native parent/blocker relationships; the [publication record](remaining-launch-ticket-publication.md) contains actual issue URLs and readback evidence. Existing parent/provider issue content remains unchanged.

Draft checks confirmed 40 sequential ticket IDs, coverage references to all 79 requirement IDs, no missing/forward/cyclic engineering dependencies and convergence of all 39 earlier tickets into T40. All 19 local-file links across this plan and the updated consolidated spec resolved. Criterion-by-criterion assignment remains part of writing the full issue bodies after breakdown review; these structural checks do not prove implementation behavior. No application/provider tests or services ran for this planning update.

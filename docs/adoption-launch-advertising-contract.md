# adoption.is advertising ticket-readiness contract

> **Remaining-build review, 2026-11-12:** The [consolidated remaining launch scope](remaining-launch-build-spec.md) is the current review entry point. All acceptance criteria and CT-01–CT-04 below remain required. It incorporates the completed bounded preview evidence and distinguishes historical readiness statements from current production/provider gates.

> **Q95–Q104 correction, 2026-11-11:** [ADR-0001](adr/0001-convex-vercel-launch-stack.md) selects Convex for the backend, Vercel for frontend hosting and Stripe for payments. It supersedes this document's Q94 Express/SQLite harness choice. Q98 adopts private Vercel Blob originals and Mux streaming with Convex permissions/records under [ADR-0002](adr/0002-preserve-originals-in-private-blob-with-mux-playback.md). Q99 retains Clerk for applicable application authentication and Convex for access enforcement. Q100 permits original downloads by the uploading creator, that campaign's manager and authorized platform administrators; Q101 retains originals without automatic expiry after completion/withdrawal and requires explicit administrator action for deletion. Q102 blocks deletion while active/publishing and requires confirmation plus an audit record; Q103 provides a 30-day recovery window before permanent removal. Q104 confirms the revised architecture and media policies; slice readiness still requires a Convex-compatible harness. Q96 defers product-feedback tools and usage analytics beyond initial release while retaining payment confirmation, video-processing updates and advertising controls. Existing operational requirements remain. No implementation is authorized.

**Current checkpoint — bounded implementation:** After Q106 the user explicitly requested implementation of the approved preview. The actual local Convex/browser path and bounded S1 checks are implemented; see [verification evidence](allocation-preview-verification.md) and the [run guide](ALLOCATION-PREVIEW.md). Provider/real-Clerk/actual-safety/whole-launch gates remain Blocked. No live integration or deployment is certified.

- **Status:** Blocked
- **Date:** 2026-11-11 (America/Chicago)
- **Authority:** Accepted interview Q36–Q93, immediate-launch-blocker instruction, and selected GitHub decisions. Supplements [the launch PRD](PRD-adoption-is-launch.md); preserves REQ-101–REQ-143 and adds REQ-144–REQ-179.
- **Review state:** Q104 confirms the revised architecture and video policies after superseding the historical Q94 stack/harness choice. CT-01–CT-04 and unaffected product decisions remain accepted; the Express/SQLite harness is superseded. Provider facts and actual safety settings remain evidence gates; no implementation is authorized.
- **Slice readiness:** Specification-ready after Q105–Q106 for separately requested bounded ticket drafting. The Convex harness design is confirmed, but no runner or behavioral evidence exists. Whole-launch/Ralph readiness remains Blocked.
- **Authorization:** Documentation only. No tickets, implementation, provider setup, messages, charges, transfers, ad publication or deployment.

## Objective

Make the expanded advertising scope reviewable without relying on the chat: automate an adoption.is-first campaign under fixed baseline funding, residual boosts, nonprofit-defined continuation, campaign-manager controls and administrator financial review. Specify a first complete credential-free allocation-preview slice while retaining actual provider and launch gates.

This supplement governs expanded advertising details where the older PRD summaries disagree. Original public/creator/fundraising/competition requirements remain required. Their agreed public 40/30/30 score, Chicago periods, prize finalization, creator commissions and approved weekly payments are not replaced by continuation or advertising budgets.

## Current state and evidence

The repository remains a demo baseline. Public persistence uses localStorage and the server accepts demo role headers; neither is production authentication or a source of live money/score evidence. Existing SQLite storage does not by itself prove the new shared authorization and finance behavior.

A read-only semantic review found overloaded REQ-122/REQ-132 and outdated checkbox mapping. The supplement separates those behaviors and [the verification plan](adoption-launch-verification-plan.md) maps the full current checklist. No application tests, new test files or providers were run in this consolidation. All commands below are designated future checks, not runnable evidence.

GitHub [#20](https://github.com/Cooper2Rich/adoption-project/issues/20) and [#21](https://github.com/Cooper2Rich/adoption-project/issues/21) were OPEN without approval comments on the 2026-11-11 read. [#19 evidence](https://github.com/Cooper2Rich/adoption-project/blob/14a3f26d2df44bdc28e691c4980da8ea510c3ffa/docs/campaign-finance-read-api-research.md) distinguishes documented provider facts from proposed accounting. Closed research is not operational approval.

## Scope

Current authorized work is documentation reconciliation and review. Future first rollout exposes adoption.is only, with isolated reusable nonprofit boundaries and one advertising campaign per nonprofit initially.

The following accepted requirements describe future behavior, not authorization to build it. Requirement-local commands are planned behavioral checks against real services/adapters with controlled clocks, isolated durable stores and faithful error contracts. Actual provider capability must be verified separately.

## Non-goals

No demo-to-production fixture migration, guessed numeric safety values, automatic per-ad donor earmarking, application markup, creator commissions on advertising contributions, advanced donation-conversion optimization, first-release active-campaign balance returns, public multi-client marketplace, or mandatory second human for roles one person may hold.

No provider write, money movement, account setup, production deployment or issue publication in this session. No invented provider pacing, hard-spend guarantee, completeness watermark or credential mechanism.

## Requirements

### REQ-144 - Nonprofit-scoped provider assets

- **Statement:** The system shall keep nonprofit assets and delegated operating grants scoped to their owning nonprofit.
- **Rationale:** Q54–Q55, Q60–Q61.
- **Depends on:** None

#### Acceptance criteria

- [ ] Two nonprofit fixtures cannot access each other's provider, campaign or finance mappings through a campaign-manager identity.
- [ ] First public rollout exposes adoption.is only; provider-supported guided setup is required before live automation. Slander owns its developer applications; nonprofit ownership and grants still require actual provider evidence.

#### Verification

- **Command:** `node --test tests/launch/REQ-144.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-145 - Expansion and financial review authority

- **Statement:** The system shall require a campaign-manager request and platform-administrator approval for capacity expansion and discretionary refunds/returns.
- **Rationale:** Q44, Q55, Q79–Q82.
- **Depends on:** REQ-144

#### Acceptance criteria

- [ ] A manager-only identity cannot approve these actions; guest/creator identities cannot request or approve them.
- [ ] A person with both roles may perform separately recorded request and approval actions. Creator payments retain their existing manager-only approval.

#### Verification

- **Command:** `node --test tests/launch/REQ-145.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-146 - Initial advertising goals

- **Statement:** The system shall restrict the first automated workflow to the selected awareness or tracked-fundraising-page-visit goal.
- **Rationale:** Q62.
- **Depends on:** REQ-144

#### Acceptance criteria

- [ ] Goal selection leaves public scoring and assigned continuation policy unchanged.
- [ ] Live execution requires a validated objective/media/brand-identity contract; advanced donation-conversion optimization is deferred. Accepted upload formats alone do not certify provider placement.

#### Verification

- **Command:** `node --test tests/launch/REQ-146.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-147 - Explicit external-ad enrollment

- **Statement:** The system shall require explicit manager enrollment before controlling an externally created provider ad.
- **Rationale:** Q65, Q67.
- **Depends on:** REQ-144

#### Acceptance criteria

- [ ] Enrollment verifies nonprofit/account, approved unchanged creative, tracked destination, control permissions and existing obligations; mere account discovery or reporting mapping cannot authorize writes.
- [ ] First managed trial uses future delivery after enrollment and its next confirmed paid delivery. Repeated enrollment cannot erase costs, reset an existing trial or rewrite eligible competition history.

#### Verification

- **Command:** `node --test tests/launch/REQ-147.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-148 - Shared admission queue

- **Statement:** The system shall admit eligible queued entries in their selected waiting order.
- **Rationale:** Q47, Q86.
- **Depends on:** REQ-144

#### Acceptance criteria

- [ ] New-entry queue time is approval time; retrial queue time is retrial authorization time, never original creative age.
- [ ] A blocked entry retains position but may be skipped for a later eligible funded entry. Its reason is visible and immediately notified; simultaneous admission cannot exceed verified slots/funding.

#### Verification

- **Command:** `node --test tests/launch/REQ-148.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-149 - Expandable funded capacity

- **Statement:** The system shall activate additional ad slots only after approved expansion and verified added funding.
- **Rationale:** Q42, Q44, Q73–Q75.
- **Depends on:** REQ-145

#### Acceptance criteria

- [ ] Capacity counts ads, not creators; multiple entries by one creator consume multiple slots.
- [ ] Approval alone does not increase spending limits. Initial and added open slots require baseline coverage for their funded run before use.

#### Verification

- **Command:** `node --test tests/launch/REQ-149.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-150 - Reserved slot lifecycle

- **Statement:** The system shall preserve an occupied slot until its selected hold or stopping condition permits release.
- **Rationale:** Q45, Q58, Q68.
- **Depends on:** REQ-149

#### Acceptance criteria

- [ ] Trial, temporary pause, provider interruption and stopping states occupy/reserve slots; immediately notify pause-reserved slots.
- [ ] Cuts, withdrawals and explicit paid-participation endings release slots only after all relevant paid placements are confirmed stopped. Public display alone consumes no funded slot.

#### Verification

- **Command:** `node --test tests/launch/REQ-150.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-151 - Funded-run baseline coverage

- **Statement:** The system shall require protected baseline coverage for open slots across the advertised funded run before paid launch.
- **Rationale:** Q72–Q75.
- **Depends on:** REQ-149

#### Acceptance criteria

- [ ] Coverage uses daily baseline, open slots and funded days, with enough funded time for each admitted initial trial; added slots receive corresponding coverage.
- [ ] Existing prize schedule, fees, liabilities and safety reserves remain separately covered. Trial protection overlaps funded-run coverage and must not be added a second time. Prelaunch crowdfunding, creator review and public waiting ads are permitted.
- [ ] Release an elapsed day's unused allocation only after delivery/liability reconciliation proves it free. Preserve future baseline coverage and uncertain obligations. Released money remains in the same campaign for future authorized allocations; it does not automatically refund/return money or redistribute a provider share within an old plan (Q89).

#### Verification

- **Command:** `node --test tests/launch/REQ-151.test.ts` (planned; file absent).
- **Pass condition:** All 3 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-152 - Partial first-day baseline

- **Statement:** The system shall prorate a newly admitted ad's first-day baseline by the remaining fraction of its actual Chicago calendar day.
- **Rationale:** Q38, Q85.
- **Depends on:** REQ-151

#### Acceptance criteria

- [ ] A 1,000-cent baseline admitted at noon on an ordinary day has a 500-cent first-day target; subsequent full days have a 1,000-cent target.
- [ ] DST uses actual local-day boundaries; trial days remain 24 elapsed hours. Unsupported provider pacing/minimums block live execution and notify operators rather than inventing a workaround.

#### Verification

- **Command:** `node --test tests/launch/REQ-152.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-153 - Baseline-first boost pool

- **Statement:** The system shall calculate the boost pool from residual verified daily headroom after protecting baseline coverage.
- **Rationale:** Q51, Q75.
- **Depends on:** REQ-151

#### Acceptance criteria

- [ ] Apply the manager boost percentage only to residual headroom; do not expose protected future baseline money or subtract today's embedded baseline twice.
- [ ] Baseline plus boosts cannot exceed daily/total authority or verified headroom. The nonboosted residual remains uncommitted. Extra funding does not automatically increase limits.

#### Verification

- **Command:** `node --test tests/launch/REQ-153.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-154 - Ranked boost selection

- **Statement:** The system shall select the boosted group from eligible funded entries using current daily competition ordering.
- **Rationale:** Q23 GitHub decision, Q37, Q69.
- **Depends on:** REQ-153

#### Acceptance criteria

- [ ] Use unrounded score, then link clicks, attributed fundraising and impressions. Only a remaining exact tie expands the cutoff group beyond the selected count.
- [ ] Split the same boost pool across the actual group; stable cent ordering cannot alter shared rank. Boosted entries also receive baseline. Missing/stale required score coverage holds new boost commitments and immediately notifies both operators under accepted Q91.
- [ ] While required eligible-entry score coverage is missing or stale, financially safe baselines may continue but no new boosts are committed. Immediately notify campaign manager and administrator and show the missing scope. Do not create per-entry startup, zero or rank for unknown data; retain already committed spending and resume boosts only when complete usable coverage returns (Q91).

#### Verification

- **Command:** `node --test tests/launch/REQ-154.test.ts` (planned; file absent).
- **Pass condition:** All 3 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-155 - Startup boost allocation

- **Statement:** The system shall split only the defined boost pool equally before usable daily performance exists.
- **Rationale:** Q70.
- **Depends on:** REQ-153

#### Acceptance criteria

- [ ] Each eligible funded entry retains its fixed baseline; the startup boost pool is equal across that group and other residual funds remain uncommitted.
- [ ] Missing/stale evidence cannot become ordinary no-performance startup or valid zero. Once usable daily results exist, use the ranked group.

#### Verification

- **Command:** `node --test tests/launch/REQ-155.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-156 - Meta/TikTok spending shares

- **Statement:** The system shall apply the manager's Meta/TikTok percentages to each entry's baseline and boost.
- **Rationale:** Q63.
- **Depends on:** REQ-153

#### Acceptance criteria

- [ ] Shares total 100% and allow zero on either provider; count the competition entry once across placements.
- [ ] Meta covers Facebook/Instagram under a validated placement contract. Independent network-level enforcement is not promised. Weighted whole-cent splits must conserve their source amount.

#### Verification

- **Command:** `node --test tests/launch/REQ-156.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-157 - Unavailable provider share

- **Statement:** The system shall hold an unavailable provider's share without automatic redistribution.
- **Rationale:** Q64, Q66.
- **Depends on:** REQ-156

#### Acceptance criteria

- [ ] Healthy eligible placements may continue with their own authorized share and finance safeguards. Identify blocked placement and immediately notify both operators.
- [ ] Manager split changes are explicit. Before a provider-interrupted ad can fail continuation after recovery, require its complete normal-delivery evaluation window under the assigned policy; history and limits remain intact.

#### Verification

- **Command:** `node --test tests/launch/REQ-157.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-158 - Spending exclusions

- **Statement:** The system shall deny new baseline and boost spending while an entry is ineligible for paid participation.
- **Rationale:** Q69.
- **Depends on:** REQ-150

#### Acceptance criteria

- [ ] Withdrawn, performance-cut, paused, fraud-suspended and currently disqualified entries receive no new allocations, regardless of public rank.
- [ ] Past-only disqualification does not itself prohibit valid future participation. Respect separate fraud hold, public visibility, retrospective eligibility and prize-correction rules in the base PRD.

#### Verification

- **Command:** `node --test tests/launch/REQ-158.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-159 - Admission-bound performance policy

- **Statement:** The system shall bind every paid admission to a recorded continuation-policy version.
- **Rationale:** Q40, Q43, Q57.
- **Depends on:** REQ-148

#### Acceptance criteria

- [ ] Policy defines impressions/clicks/fundraising targets, configurable nonnegative weights totaling 100%, passing score and trial duration. Zero weight ignores its metric; equality with passing score passes; public weights remain 40/30/30.
- [ ] Use the capped square-root method and unrounded score. Active admissions retain their policy for initial and later evaluations. New admissions/retrials can use revised policies; both new ads and queued retrials bind the published policy current at actual paid admission, disclosed and permanently recorded then. Authorization determines queue time, not an earlier policy lock (accepted Q92).

#### Verification

- **Command:** `node --test tests/launch/REQ-159.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-160 - Initial trial clock

- **Statement:** The system shall measure the trial from first confirmed managed paid delivery, excluding confirmed pauses.
- **Rationale:** Q41, Q46, Q67–Q68.
- **Depends on:** REQ-159

#### Acceptance criteria

- [ ] One trial day is 24 elapsed hours. Waiting, approval and enrollment alone do not start its clock.
- [ ] Evaluate the trial's own fixed activity window when complete reporting exists; no need to wait for midnight. Incomplete data is not failure. Provider interruption additionally uses its fresh-window protection; an overrun stops at the locked funded end as incomplete under accepted Q90.
- [ ] If delayed delivery, pauses or required fresh-window recovery push completion beyond the locked funded end, stop paid delivery at that end and mark the trial incomplete rather than failed for performance. Preserve eligible history and immediately notify both operators; do not automatically extend campaign dates, funding or trial history (Q90).

#### Verification

- **Command:** `node --test tests/launch/REQ-160.test.ts` (planned; file absent).
- **Pass condition:** All 3 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-161 - Fixed daily continuation windows

- **Statement:** The system shall evaluate continuing performance in fixed windows ending at Chicago midnight.
- **Rationale:** Q50, Q88.
- **Depends on:** REQ-160

#### Acceptance criteria

- [ ] After the initial pass, each daily window covers the assigned trial duration with confirmed pauses excluded; required data must be complete.
- [ ] Persist the window identity/end and policy version. Delayed retries cannot slide it. Notify blocked evaluations immediately. Multiple overdue windows follow the accepted chronological order in Q93.
- [ ] Process scheduled windows in chronological order; an incomplete earlier window holds the sequence. The first complete failure cuts spending at actual decision time, without retroactive cutoff. A later passing window cannot undo that cut automatically; further paid participation requires the selected manager-authorized retrial process (Q93).

#### Verification

- **Command:** `node --test tests/launch/REQ-161.test.ts` (planned; file absent).
- **Pass condition:** All 3 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-162 - Confirmed placement stopping

- **Statement:** The system shall keep paid stopping unresolved until all relevant placements are confirmed stopped.
- **Rationale:** Q58–Q59.
- **Depends on:** REQ-150, REQ-161

#### Acceptance criteria

- [ ] Cut/withdrawal immediately blocks new allocations and requests supported pauses. Failed/uncertain outcomes immediately identify affected placements and notify both operators.
- [ ] Native-tool fallback requires reconciliation. Keep slot and liabilities until confirmed; performance cuts remain public, while withdrawal/removal keeps its public-hide and earning-cutoff effects.

#### Verification

- **Command:** `node --test tests/launch/REQ-162.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-163 - Explicit advertising retrial

- **Statement:** The system shall require manager authorization before restarting a performance-cut ad on a new trial.
- **Rationale:** Q48, Q86.
- **Depends on:** REQ-148, REQ-159

#### Acceptance criteria

- [ ] Improved public activity alone cannot restart paid spending. Require capacity/funding and retain earlier policy/trial/cutoff history.
- [ ] A retrial joins the shared queue by new authorization time. Capacity expansion still requires administrator approval; an otherwise in-capacity retrial does not create a new administrator gate.

#### Verification

- **Command:** `node --test tests/launch/REQ-163.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-164 - Validated spending edits

- **Statement:** The system shall activate a manager spending edit on the next fresh validated allocation cycle after reserve checks.
- **Rationale:** Q56, Q87.
- **Depends on:** REQ-151, REQ-153

#### Acceptance criteria

- [ ] Validate daily/total limits, baseline, boost percentage, top count and authorized share edits as an atomic version change; unfunded increases cannot activate.
- [ ] Resize future baseline coverage without cancelling incurred/uncertain obligations. Below-obligation limits stop new spending, request needed pauses and notify operators. History and assigned performance rules remain intact.

#### Verification

- **Command:** `node --test tests/launch/REQ-164.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-165 - Unreliable financial evidence

- **Statement:** The system shall block new allocations and request financial safety pauses when required financial evidence is missing, inconsistent or too old.
- **Rationale:** Q71.
- **Depends on:** REQ-150

#### Acceptance criteria

- [ ] Retain slots and immediately notify both operators, including the user's designated operator identity. A last-known balance is not current authority.
- [ ] Performance-score incompleteness alone follows its separate rules. Missing administrator-approved freshness/coverage settings are launch blockers, not permissive defaults.

#### Verification

- **Command:** `node --test tests/launch/REQ-165.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-166 - Distinct funds and obligations

- **Statement:** The system shall reconcile allocatable advertising funds without merging collection and Issuing balances or counting coverage twice.
- **Rationale:** GitHub #16/#19, Q51, Q72–Q75.
- **Depends on:** REQ-151, REQ-165

#### Acceptance criteria

- [ ] Use correct nonprofit, USD and approved product/account. Distinguish contribution collection, Issuing availability, authorizations, posted charges, fees/transfers/refunds/disputes and unbilled platform delivery.
- [ ] A provider-reflected hold/posted charge is not deducted again as the same local obligation. Released authorization is not proof of canceled debt. Unmatched/provisional credits cannot establish verified available funding. Actual matching/release contracts remain provider-gated.

#### Verification

- **Command:** `node --test tests/launch/REQ-166.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-167 - Financial shortfall and recovery

- **Statement:** The system shall request financial safety pauses when verified funds cannot cover remaining baseline commitments and obligations.
- **Rationale:** Q76–Q77.
- **Depends on:** REQ-165, REQ-166

#### Acceptance criteria

- [ ] Stop new admissions/discretionary boosts first; if remaining baseline commitments/obligations lack verified funding, pause affected placements, reserve slots and immediately alert both operators.
- [ ] Never silently dilute baseline or borrow prizes, creator earnings or another nonprofit's funds. Pauses retain slots, costs and incident history; the separately specified verified-recovery transition governs resumption.

#### Verification

- **Command:** `node --test tests/launch/REQ-167.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-168 - Actual advertising provider fees

- **Statement:** The system shall account for actual contribution-processing and ad-payment fees against that campaign's advertising fund.
- **Rationale:** Q78.
- **Depends on:** REQ-166

#### Acceptance criteria

- [ ] Record gross contributions, fees and net available amounts separately; baseline coverage remains funded after fees/reserves.
- [ ] Contributor disclosure explains fee reduction. No Slander application fee or creator commission is introduced; actual provider records determine fees.

#### Verification

- **Command:** `node --test tests/launch/REQ-168.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-169 - Advertising contribution classification

- **Statement:** The system shall route advertising contributions to the selected campaign fund without creating fundraising earnings or score credit.
- **Rationale:** Q52–Q53.
- **Depends on:** REQ-144

#### Acceptance criteria

- [ ] No ad earmarking or cross-nonprofit routing. Baseline/boost policy controls spending.
- [ ] The contribution creates no creator commission, prize replenishment or fundraising input in either public or continuation score. Tracked fundraising donations retain their separate rules.

#### Verification

- **Command:** `node --test tests/launch/REQ-169.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-170 - Reviewed contributor refunds

- **Statement:** The system shall execute individually approved contributor refunds only with verified supported funding.
- **Rationale:** Q79–Q81.
- **Depends on:** REQ-145, REQ-166

#### Acceptance criteria

- [ ] Manager requests, administrator approves full/partial amount up to remaining unrefunded contribution; beneficiary is the original contributor through a supported route.
- [ ] Preserve baselines/other obligations. Blocked approved execution stays visibly pending/unpaid and immediately alerts operators. No automatic entitlement or discretionary approval gate on forced provider reversals is implied.

#### Verification

- **Command:** `node --test tests/launch/REQ-170.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-171 - Closure-only campaign returns

- **Statement:** The system shall return unused campaign balance to the same nonprofit only after paid closure and surplus reconciliation.
- **Rationale:** Q79–Q82.
- **Depends on:** REQ-145, REQ-162, REQ-166

#### Acceptance criteria

- [ ] Require manager request/admin approval, confirmed stopped placements, returnable surplus after obligations/reserves and actual provider/purpose permission.
- [ ] No active-campaign return, cross-campaign transfer or unconditional whole-balance release. Preserve outstanding return and reserve evidence until actual settlement is verified.

#### Verification

- **Command:** `node --test tests/launch/REQ-171.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-172 - Disputed-fund exclusion

- **Statement:** The system shall immediately remove disputed contribution amounts from spendable funds without duplicate deduction.
- **Rationale:** Q83.
- **Depends on:** REQ-166

#### Acceptance criteria

- [ ] Notify both operators immediately and recompute funding; shortages follow the financial pause policy.
- [ ] Retain delivered-ad costs and earlier records. Dispute outcome, recovery, fees and mandatory reversal states reconcile once against the same contribution; actual program loss responsibility remains unvalidated.

#### Verification

- **Command:** `node --test tests/launch/REQ-172.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-173 - Approved numeric safety policy

- **Statement:** The system shall block paid launch until evidence-based financial safety settings have administrator approval.
- **Rationale:** Q84.
- **Depends on:** REQ-145, REQ-165

#### Acceptance criteria

- [ ] Require reserves for unbilled delivery/refunds/disputes/fees, maximum financial-data age and release evidence; manager cannot weaken them.
- [ ] Missing settings cannot become zero reserve or unlimited age. Approved values identify provider/account applicability and evidence; no numerical defaults are selected in this document.

#### Verification

- **Command:** `node --test tests/launch/REQ-173.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-174 - Immediate operator incidents

- **Statement:** The system shall create immediate operator notifications for the selected blocking events and preserve their lifecycle.
- **Rationale:** Q42, Q49, Q59, Q64, Q66, Q68, Q76; launch-blocker instruction.
- **Depends on:** REQ-145

#### Acceptance criteria

- [ ] On detection, immediately persist visible reason/status/resolution role and attempt email to manager and administrator, including designated user recipient; deduplicate the same recipient when holding both roles.
- [ ] No intentional grace threshold for these selected financial/delivery/capacity/evaluation/launch blocks. Repeated checks update one incident; resolution notifies recovery. Failed email retries at 1/5/15/60 minutes while the dashboard persists. Actual detection/dispatch bounds still require reviewed evidence.

#### Verification

- **Command:** `node --test tests/launch/REQ-174.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-175 - Provider and production launch gates

- **Statement:** The system shall keep paid operation disabled until all applicable provider, configuration and verification gates pass.
- **Rationale:** GitHub #20/#21; PRD O-01/O-02/O-07/V-01; Q84.
- **Depends on:** REQ-146, REQ-151, REQ-173, REQ-174

#### Acceptance criteria

- [ ] Require actual Stripe program/funding/read/return eligibility, Meta/TikTok grant/objective/media/reporting/payer/instrument evidence, Clerk access evidence, funded prizes/baselines/safeguards and production behavior verification.
- [ ] Every unmet gate is visible and immediately notified. A passing fixture, closed research ticket, paid balance, structural audit or user assent is not provider approval. Return unsupported routes for decision; never substitute pooled/manual-only models silently.

#### Verification

- **Command:** `node --test tests/launch/REQ-175.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-176 - Durable reproducible allocation plans

- **Statement:** The system shall retain a scoped immutable source snapshot and explanation for every allocation plan.
- **Rationale:** REQ-131 and Q51/Q56/Q87; engineering contract confirmed in Q94.
- **Depends on:** REQ-164, REQ-166

#### Acceptance criteria

- [ ] Record nonprofit/campaign/day, actor/authority, settings/policy versions, ordered eligible entries, score coverage/as-of evidence, financial snapshot and obligation references, cent amounts and blocked reasons.
- [ ] Persist across sessions/restart. LocalStorage, demo roles/targets/money/simulated metrics cannot originate production plans. New snapshots/settings create new revisions without rewriting earlier plans.

#### Verification

- **Command:** `node --test tests/launch/REQ-176.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-177 - Atomic admissions and reservations

- **Statement:** The system shall prevent concurrent jobs from overbooking the same slot or spending headroom.
- **Rationale:** Selected limits and duplicate-prevention invariants; engineering contract confirmed in Q94.
- **Depends on:** REQ-148, REQ-150, REQ-166

#### Acceptance criteria

- [ ] Reserve slot and funding against one validated revision atomically or reject/recompute on conflict. Repeating one operation identity cannot create another reservation/admission.
- [ ] A crash or uncertain provider result cannot free capacity or duplicate obligation coverage. CT-03 transaction/journal mechanics are confirmed in Q94 and must be verified by future implementation tests; publication remains separately authorized.

#### Verification

- **Command:** `node --test tests/launch/REQ-177.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-178 - Reconciled external write outcomes

- **Statement:** The system shall preserve uncertain external writes instead of treating timeout as confirmed failure.
- **Rationale:** Q58–Q59/Q65/Q77/Q87; engineering contract confirmed in Q94.
- **Depends on:** REQ-177

#### Acceptance criteria

- [ ] Persist intended provider object/action identity before dispatch and retain provider references/outcome evidence; uncertain create/change/pause/refund/return is pending reconciliation.
- [ ] Do not create a replacement object/payment or release a reservation on timeout alone. Bind money-action approval to beneficiary/amount/destination; changed contents require renewed review under CT-04 confirmed in Q94. Provider-specific reconciliation remains gated.

#### Verification

- **Command:** `node --test tests/launch/REQ-178.test.ts` (planned; file absent).
- **Pass condition:** All 2 criteria reach production-intended service behavior with relevant denial, boundary, duplicate, restart and failure assertions; no missing-file, import-only, skipped, zero-test or demo-only pass.
- **Evidence:** Criterion-mapped runner output, isolated persisted records and redacted decision/provider-contract traces; browser evidence for visible flows.

### REQ-179 - Verified financial recovery

- **Statement:** The system shall resume a financial safety pause automatically only after verified recovery within existing authority.
- **Rationale:** Accepted Q77; split from REQ-167 so shortfall entry and recovery are independently falsifiable.
- **Depends on:** REQ-162, REQ-165, REQ-166, REQ-167

#### Acceptance criteria

- [ ] Required financial evidence is reliable, funding is restored, placement state is reconciled, existing approved limits suffice and no separate hold applies before resumption. Missing evidence or an unresolved provider outcome prevents resumption.
- [ ] Immediately notify both operators and preserve incident/obligation history. Recovery cannot approve expansion, reset trials, override fraud/removal holds or cancel incurred charges. Actual stability/freshness/release evidence remains provider-validated safety policy.

#### Verification

- **Command:** `node --test tests/launch/REQ-179.test.ts` (planned; file absent).
- **Pass condition:** Both criteria reach production-intended service transitions with denial, duplicate, restart and unresolved-provider assertions; missing-file/import-only/zero-test outcomes do not pass.
- **Evidence:** Controlled-clock runner output, persisted incident and placement state transitions, financial snapshot/authority references and intercepted notification records.

## Constraints

1. Money is whole USD cents; an allocation target is distinct from delivered spend, authorization, capture and settled payment. Provider overspend/late liability is not canceled by an application budget.
2. Fixed public competition rules and admission-assigned continuation rules are independent of editable advertising controls. No future allocation edit rewrites history.
3. Reserved slots do not imply active daily spending. Baseline funded-run coverage, trial protection and today's baseline overlap; they are not three additive liabilities.
4. Normal no-performance startup is distinct from unknown/stale metrics. Unknown financial evidence blocks new spending even if performance is known.
5. Public underperformance visibility is retained; withdrawal/removal, suspected-fraud holds, dated disqualification and finalized-prize correction remain distinct actions.
6. Immediate notification means no intentional application waiting threshold after detection. Real detector/dispatch limits require measurement and review; this draft does not invent a provider event SLA or claim live monitoring.
7. CT-01–CT-04 and the bounded slice/harness are confirmed by Q94. Q89–Q93 are accepted behavior. Their confirmation establishes specification, not implementation/test evidence or provider approval; publication/build work still requires separate authorization.

## Dependencies and assumptions

### Evidence gates

| Gate | Required evidence / owner | Credential-free progress | Blocks |
| --- | --- | --- | --- |
| PG-01 | Human-obtained Stripe program/use-case/account approval, #20 | Prepare exact inquiry and review contracts; send nothing | Actual collection/Issuing/payer eligibility |
| PG-02 | #21 approved funding/return rail, source/destination, consent and actual balance/read semantics; authorized validator | Abstract ledger/read contracts and error fixtures | Real funding, refunds, return and financial availability certification |
| PG-03 | Meta/TikTok app/client/grant, selected objectives/media/identities, pacing/minimums, confirmed delivery/pause, instrument/payer and reporting contracts; authorized validator | Adapters as interfaces, faithful candidate fixtures, mappings, queue/state logic | Live ad create/control, comparable score inputs, completeness and fine-grain pause windows |
| PG-04 | Clerk invitation forwarding/replay/revocation/recovery behavior; authorized validator | Server authorization boundary with explicit injected identities | Real invite/login/recovery acceptance |
| PG-05 | Administrator-approved actual reserves, freshness and release parameters from PG-01–03 evidence | Required-field validation and blocked states | Any paid launch with unset or unvalidated policy |
| PG-06 | Production-flow verification and consolidated user review | Build specification and future test design | Launch/Ralph completion; not a reason to require completed code before drafting a bounded ticket |

No live or isolated account capability is established. If a candidate fails, return the concrete limitation and options to the user. Do not ask the user to guess provider facts.

### Engineering contract confirmed in Q94

The user confirmed these mechanics in Q94. They are now specification choices, not proof of provider capabilities, actual financial values or successful implementation.

**CT-01 — Money conservation.** Use whole cents. Prorate a first-day baseline with `dailyCents * remainingLocalDaySeconds / actualLocalDaySeconds`, using the existing half-up money convention. Equal pools divide integer cents with remainder in ascending entry-creation time then stable ID, without changing leaderboard rank. Weighted provider splits use largest fractional remainders and fixed Meta-before-TikTok ties. Reject invalid/nonfinite requested amounts and negative allocation targets/limits, weights not totaling 100%, active-component targets at or below zero, passing scores outside 0–100 and nonpositive trial duration. Preserve an actual negative source balance as a deficit that cannot authorize spending. Validate an active daily baseline as positive whole cents, top count as a positive integer, boost share in 0–100%, provider shares in 0–100%, full funded-run coverage and daily/total coverage for the proposed commitments. Zero authority produces no paid admission/allocation; it is not permission to invent funding. No unsafe integer arithmetic. A 100% residual boost share still preserves baseline because that reserve is removed first.

**CT-02 — One obligation, one coverage state.** Start from approved nonprofit USD Issuing availability. Additional obligations subtract only coverage not already reflected there. Maintain auditable identity/matching evidence for provider-reflected versus local commitments. A balance hold, matched posted charge and its local obligation cannot all subtract the same cost. Uncertain coverage stays held; absence of an authorization link is not canceled debt. Maintain the whole remaining baseline reserve; today's eligible baseline consumes its embedded portion. Extra boost headroom is the minimum of free verified cash after remaining baseline/safety/other commitments, remaining daily authority after today's baseline/commitments, and remaining campaign-total authority after protected future commitments. Do not add a trial reserve again or subtract today's baseline twice. Actual provider matching/release rules remain PG-02/03.

**CT-03 — Atomic planning and admission.** A plan is scoped to nonprofit, campaign, Chicago day, authority/settings revision, input snapshot and stable operation identity. Compare-and-reserve slot/funding in one durable transaction; on changed revision reject/recompute. Queue ties use stable entry ID. Same identity returns the same result, a new input/settings revision creates a distinguishable plan, and restart cannot duplicate a slot or obligation. Revalidate financial and authority snapshots before any future provider write.

**CT-04 — Write journal and approval contents.** Separate proposed, reserved, dispatched, uncertain, provider-confirmed and reconciled outcomes. Persist operation identity/intended object before dispatch and preserve provider references. Provider-specific idempotency and status lookup require PG evidence; do not pretend every endpoint supports an idempotency key. Uncertain outcomes cannot become replacement ads/payments or released slots. Refund/return approval binds beneficiary, amount, currency, source, permitted destination/route and request revision; changed contents need renewed administrator review. Cumulative voluntary refunds, mandatory reversals and dispute recoveries reconcile once, without releasing uncertain funds or silently charging retained fees against the approved refund amount.

## Open questions

The user accepted Q89–Q93 on 2026-11-11, including immediate notification for missing-score boost holds. The table below is a resolved decision record. Q94 also confirms CT-01–CT-04 and the bounded preview/harness. Provider contracts, actual safety values and production evidence remain PG gates, not facts established by specification confirmation.

| Accepted decision | Resolved boundary | Required rule |
| --- | --- | --- |
| Q89 / RD-01 | Empty/paused slots retain capacity and future baseline coverage, required an explicit elapsed-unused release boundary. | Release an elapsed day's unused local allocation only after delivery/liability reconciliation proves it free. Preserve all future baseline and uncertain obligations. Released money stays in this campaign and can support future authorized allocations; no automatic refund/return or cross-provider shift within the old plan. |
| Q90 / RD-02 | Delivery delays/pauses/fresh-window protection can push a validly admitted trial past the locked funded end. | Stop paid delivery at that end, record the trial as incomplete rather than failed for performance, preserve eligible history and notify both operators. Do not extend dates, funding or trial history automatically. A new authorized campaign/run decision is required for further spending. |
| Q91 / RD-03 | New entrants can lack scores while older entrants have usable results; must not receive an invented per-entry startup bonus or zero score. | Continue financially safe baselines but hold new boost commitments whenever required eligible-entry score coverage is missing/stale. Do not create a per-entry startup bonus, zero or rank for unknown data. Already committed boosts remain obligations; resume calculation when a complete usable snapshot exists. Immediately notify both operators when the hold occurs, as explicitly required by the user. |
| Q92 / RD-04 | Retrial authorization may precede admission and intervening policy changes. | Bind both first admissions and queued retrials to the published policy current at actual paid admission, disclose it then and record it permanently. Authorization sets queue time, not an earlier policy lock. Existing active admissions keep their assigned version. |
| Q93 / RD-05 | Several delayed fixed evaluation windows may become ready together, with older failure and newer pass. | Process scheduled windows in chronological order; an incomplete earlier window holds that evaluation sequence. The first complete failure cuts at actual decision time, never retroactively. A newer pass cannot automatically undo a cut; normal manager-authorized retrial applies. |

Live notification detection/dispatch targets, exact provider contracts, approved numeric safety values and final asset/funding approval remain evidence gaps owned by PG gates. Accepted RD decisions do not establish these provider facts or values.

## First complete build slice — candidate for separate authorization

**Durable manager allocation preview**, covering browser → server authorization boundary → plan service → isolated durable records → explanation. No provider writes, live payments, real credentials or account setup. The slice uses the same intended planner that later live orchestration will call; production mode cannot accept fixture evidence or demo identity headers. Real Clerk integration is a separate gate.

**Q105 clarification:** Saving a preview is advisory: persist its settings, inputs, calculation and explanation without reserving campaign money or ad slots. Separate tests exercise the intended compare-and-reserve behavior against isolated campaign records, including concurrency and restart. This clarifies the preview boundary without weakening CT-03's future admission guarantees. The [Convex harness review](convex-allocation-preview-harness-review.md) records the replacement design confirmed in Q106. Actual harness wiring and behavioral validation remain implementation work.

Required preview inputs identify nonprofit/campaign, Chicago date/admission times, approved authority, fixed baseline, remaining protected funded-run coverage, current commitments, boost percentage/top count, provider shares, eligible entries and a complete explicit source/finance snapshot. Test-mode provenance is visible. A blocked result is a persisted preview result with scoped reasons, not fabricated money/metrics or proof of a provider gate passing. Accepted Q91 also governs preview explanations: with reliable finances but incomplete required scores, show financially safe baselines and a held boost component with immediate intercepted operator notification. Unknown finances block spending entirely; neither condition becomes startup or fabricated zero.

| AC | Observable acceptance and verification scenario |
| --- | --- |
| S1-01 | Manager fixture identity can save settings/preview; guest/creator/wrong-nonprofit direct API requests are denied. A second isolated nonprofit cannot read/change the first. Test authentication is explicit and cannot be enabled as a live demo-role fallback. |
| S1-02 | Settings, input snapshot, resulting plan, actor and explanation persist through service restart and two authorized sessions. Repeating one operation identity does not duplicate the plan; changed snapshot/settings creates a new revision and preserves old results. |
| S1-03 | Four eligible entries each have a 1,500-cent daily baseline, 10,000-cent daily authority and 4,000 cents of verified residual headroom after the full funded-run reserve. With a 50% boost share, top count one and two entries exactly tied after ALL existing tie-breakers, baseline is 6,000 cents, boost pool 2,000, tied entries each receive 2,500 total and other entries 1,500; 2,000 daily headroom remains uncommitted. |
| S1-04 | On explicit healthy no-performance startup with those inputs, each entry receives 1,500 baseline plus 500 boost; total planned is 8,000 and 2,000 remains uncommitted. Missing/stale score coverage with reliable finance is a baseline-only preview with held boosts and immediate notification, not startup; unknown financial evidence blocks the financial plan. |
| S1-05 | One entry across multiple placements consumes one slot/base amount. A 60/40 provider split of a 2,500-cent entry target produces 1,500 Meta and 1,000 TikTok cents. A blocked provider share is visibly held, without moving it to the other provider. Paused/stopping slots remain occupied. |
| S1-06 | A 1,000-cent baseline admitted at noon on an ordinary Chicago day has 500 first-day cents. Explicit spring/fall fixtures use real local boundaries; zero/no-entry and one-cent remainder fixtures conserve cents without creating money or changing rank. |
| S1-07 | Missing safety configuration, unknown finances, inadequate full-run baseline coverage, invalid percentage/target inputs or a concurrently changed authority revision produce explicit blocked/rejected results. Future baseline remains protected and today's overlap is not counted twice. |
| S1-08 | Manager UI explains settings/input version, financial provenance, baseline/boost/provider cents, tie expansion, occupied versus eligible entries and blocked reasons from the persisted server plan. No simulated metric progression or donor/private finance data leaks to public routes. |
| S1-09 | Saving previews, including concurrent saves/retries, does not reserve campaign money or ad slots. Separate concurrent/restart tests invoke intended reservation behavior against isolated test campaign records and cannot reserve more slots/funds than configured. Preview mode has no code path dispatching provider ads, charges, refunds, transfers or invitations. Planned app behavior tests plus a browser journey must reach assertions, not merely import modules. |
| S1-10 | With older funded entries having usable scores and a new eligible funded entry missing required reports, preserve financially safe baseline targets, commit zero new boost money, identify the incomplete scope and record immediate manager/admin notification. Do not assign the entrant zero score or a private startup bonus. A later complete snapshot enables the ordinary ranked calculation in a new plan revision. |

**Implemented bounded checks:** `npm run test:launch:planner`, `npm run test:launch:backend` and `npm run test:launch:browser` exercise the intended planner, actual isolated Convex backend and desktop/mobile journeys. `npm run test:launch` runs all three; `npm run build:launch` checks the dedicated bundle. See [executed evidence and acceptance mapping](allocation-preview-verification.md). The broader per-REQ production commands remain future work. Existing regression/build commands remain `npm test` and `npm run build`.

**Replacement harness design confirmed in Q106:** The Q94 Express/SQLite fixture-server design is superseded. The preview must exercise the selected Convex backend with isolated durable test records, explicit identities, denied wrong-role/nonprofit access, transaction/concurrency behavior and a real browser journey. Fixture identity or simulated finance must never be available as a production fallback. The linked harness review defines the accepted boundaries. Under the subsequent explicit build request, the replacement harness, actual function/client path, private-state serving restrictions, fixture issuer separation, same-state restart and concurrent-operation checks were implemented and exercised; exact commands and limits are in the run guide/evidence above. The existing demo suite remains regression coverage; no fixture certifies actual provider capability.

**Slice specification gate settled in Q106:** CT-01–CT-04, the bounded input/output/authorization behavior and all ten acceptance scenarios remain selected, with Q105 clarifying advisory preview saves. Q106 confirms the replacement Convex harness design and restores bounded specification readiness for separately requested ticket drafting. Q106 itself was design agreement; the subsequent separately requested implementation now has bounded local harness/browser evidence, without certifying provider or whole-launch readiness. Ticket publication or implementation still needs a separate user request. Accepted RD rules cannot be ignored where they affect the slice. Reconciliation/late-run/trial/backlog execution remains outside this first preview; its inputs and explanations must not contradict those selected rules. No production allocator, grant, financial balance or live readiness is certified by its fixtures.

## Decision traceability

- Q105 / 2026-11-11: The user accepted advisory preview saves with no campaign money/slot reservation, plus separate tests of intended reservation behavior against isolated campaign records. Harness details were subsequently confirmed in Q106; no implementation or publication was authorized.
- Q106 / 2026-11-11: The user answered "I like this design," confirming the complete replacement Convex harness review. The design frontier is empty and the bounded slice is specification-ready for separately requested ticket drafting. Lifecycle/auth wiring and behavioral evidence remain unproven; full launch remains Blocked. No implementation or publication was authorized.

| Audit item | Consolidated outcome / remaining gate |
| --- | --- |
| C1 | Automated operation, baseline/boost, continuation/capacity/stopping selected; REQ-146–REQ-164; PG-03 and accepted RD rules apply |
| C2 | Public campaign-level advertising contributions separated from fundraising; REQ-169, REQ-168, REQ-170, REQ-171, REQ-172 |
| C3 | adoption.is-first plus isolated reuse and separate roles; REQ-144, REQ-145; actual grants PG-03/04 |
| C4 | Editable operational spending versus fixed assigned continuation policy; REQ-159, REQ-164 |
| C5 | Requested stop versus confirmed provider cessation, retained slots and alerts; REQ-162, REQ-150, REQ-174 |
| C6 | Collection/Issuing/obligation separation explicit; REQ-166, REQ-175; PG-01/02 |
| U1 | Intended ownership and guided onboarding selected; actual account/grant/lifecycle facts PG-01/03/04 |
| U2 | Desired workflows/goals/enrollment/splits selected; supported endpoint/media/identity/budget/mapping facts PG-03 |
| U3 | Eligibility, startup, reserved slots, interruption and queue selected; RD-01–05 accepted |
| U4 | Funded-run, shortages/recovery, fees/refunds/returns/disputes and safety authority selected; actual values PG-05 |
| U5 | Funding/return routes remain PG-01/02; #20/#21 are not closed by interview assent |
| U6 | CT-01–CT-04 and preview/harness confirmed in Q94; RD-01–05 accepted; future implementation must verify them |
| U7 | Provider/Clerk evidence remains PG-01–05 |
| U8 | Current checklists mapped, future tests absent; PG-06 and consolidated review remain |

## Ralph completion contract

**Not executable and not authorized.** Requirement-local commands are planned paths, absent today. A missing file is not behavioral red evidence. Passing the document audit only checks structure.

- **REQ-144:** planned `node --test tests/launch/REQ-144.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-145:** planned `node --test tests/launch/REQ-145.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-146:** planned `node --test tests/launch/REQ-146.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-147:** planned `node --test tests/launch/REQ-147.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-148:** planned `node --test tests/launch/REQ-148.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-149:** planned `node --test tests/launch/REQ-149.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-150:** planned `node --test tests/launch/REQ-150.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-151:** planned `node --test tests/launch/REQ-151.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-152:** planned `node --test tests/launch/REQ-152.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-153:** planned `node --test tests/launch/REQ-153.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-154:** planned `node --test tests/launch/REQ-154.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-155:** planned `node --test tests/launch/REQ-155.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-156:** planned `node --test tests/launch/REQ-156.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-157:** planned `node --test tests/launch/REQ-157.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-158:** planned `node --test tests/launch/REQ-158.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-159:** planned `node --test tests/launch/REQ-159.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-160:** planned `node --test tests/launch/REQ-160.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-161:** planned `node --test tests/launch/REQ-161.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-162:** planned `node --test tests/launch/REQ-162.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-163:** planned `node --test tests/launch/REQ-163.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-164:** planned `node --test tests/launch/REQ-164.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-165:** planned `node --test tests/launch/REQ-165.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-166:** planned `node --test tests/launch/REQ-166.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-167:** planned `node --test tests/launch/REQ-167.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-168:** planned `node --test tests/launch/REQ-168.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-169:** planned `node --test tests/launch/REQ-169.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-170:** planned `node --test tests/launch/REQ-170.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-171:** planned `node --test tests/launch/REQ-171.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-172:** planned `node --test tests/launch/REQ-172.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-173:** planned `node --test tests/launch/REQ-173.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-174:** planned `node --test tests/launch/REQ-174.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-175:** planned `node --test tests/launch/REQ-175.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-176:** planned `node --test tests/launch/REQ-176.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-177:** planned `node --test tests/launch/REQ-177.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.
- **REQ-178:** planned `node --test tests/launch/REQ-178.test.ts`; cover every criterion plus applicable provider gate/denial/failure/recovery assertions.

- **REQ-179:** planned `node --test tests/launch/REQ-179.test.ts`; cover both recovery criteria with actual authority/evidence and independent-hold assertions.

Then run applicable real browser/service suites and `npm test` / `npm run build`, preserving any unrelated baseline failures. Provider/account contract checks run only in separately authorized isolated environments with redacted records. Update criterion-to-command mapping after any contract revision. Whole launch requires PG evidence, complete implemented verification and production release review. Q94 completes specification review only. No structural pass, preview pass, callback receipt, research closure or nominal balance may override a failed gate.


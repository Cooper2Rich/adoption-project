# adoption.is launch verification plan

> **Remaining-build review, 2026-11-12:** Use the [consolidated remaining launch scope](remaining-launch-build-spec.md) for current boundaries. The per-requirement commands below remain planned coverage, not passing results or required test filenames. The separate bounded S1 Convex/browser implementation has [executed evidence](allocation-preview-verification.md); its completion does not certify the remaining production/provider flows.

> **Q95–Q104 architecture correction, 2026-11-11:** The launch now targets Convex backend, Vercel frontend hosting and Stripe payments under [ADR-0001](adr/0001-convex-vercel-launch-stack.md). Q98 adopts private Vercel Blob originals and Mux streaming with Convex permissions/records under [ADR-0002](adr/0002-preserve-originals-in-private-blob-with-mux-playback.md); Q100 permits original downloads by the uploading creator, that campaign's manager and authorized platform administrators; Q101 retains originals without automatic expiry after completion/withdrawal and requires explicit administrator action for deletion. Q102 blocks deletion while active/publishing and requires confirmation plus an audit record; Q103 provides a 30-day recovery window before permanent removal. Q99 retains Clerk for applicable application authentication and Convex for access enforcement; O-07 verification remains required. The earlier Express/SQLite harness is superseded. Commands, fixtures and persistence/authorization/restart/concurrency checks below are historical test designs requiring adaptation to the selected architecture; none proves Convex behavior or revised-slice readiness. Q96 defers product-feedback tools and usage analytics, while payment confirmation, video-processing updates and advertising controls remain required. Existing behavioral criteria remain unless explicitly revised.

**Updated 2026-11-11. Status: planned, not implemented.** This map covers the current base PRD and advertising supplement after Q36-Q93 and final confirmation Q94. It replaces older checkbox counts; criteria use their current order, while stable requirement IDs are retained. No tests, app changes or provider operations were performed in this consolidation.

## Verification layers

### Additional architecture/media checks after Q95–Q104

These planned checks complement the requirement map below; they are not implemented tests or passing evidence. Their concrete runner and isolated Convex test environment remain to be established.

- Reach the selected Convex backend from the actual Vercel-targeted frontend. Verify Clerk identity plus server-side role, nonprofit/campaign and resource authorization; deny cross-creator/cross-nonprofit direct requests and production fixture identities.
- Upload exact original bytes directly to private Blob storage, verify integrity and accepted size/format/duration boundaries, then ingest through Mux. Failures/retries cannot duplicate a source revision, expose private originals or label unverified/unfinished processing ready.
- Permit original downloads only for the uploading creator, scoped manager and authorized administrator. Deny public/other-creator access and recheck current permissions before issuing links. Exercise expiry without claiming that a Convex flag invalidates an already-issued URL immediately.
- Retain original bytes after withdrawal, campaign completion and playback removal. Those events do not themselves start a purge.
- Deny original deletion while the ad is active/publishing. Require confirmed administrator intent and an audit record; repeat requests cannot restart the deadline or create duplicate deletion operations unintentionally.
- Preserve the original through the 30-day recovery window; exercise restore before the deadline and verify it prevents purge. Test the deadline, restore/purge races, renewed active use, duplicate jobs, failure/retry and uncertain external deletion. Retain the audit record and report physical deletion only on confirmed evidence.

### General evidence layers

- Document checks: audit both PRD files, check IDs/dependencies and map every acceptance checkbox. This does not prove application behavior.
- Credential-free behavior: production-intended services, isolated persistent stores, explicit injected identities, controlled clocks, deterministic provider/finance contracts with provenance, failure/restart/concurrency cases and an actual browser-to-server preview journey. Never implement a duplicate test-only calculator.
- Provider contract evidence: authorized isolated accounts and required program approval, scoped tokens, test-mode payment lifecycle, objective/media/identity, balances/funding, confirmed writes, report coverage and Clerk access. Candidate fixtures are not evidence these accounts/contracts exist.
- Release evidence: relevant service/browser tests plus build/regression, no skipped/zero-test/import-only pass, all review decisions resolved and actual launch gates passed. Passing implementation tests are completion evidence; a bounded ticket needs a precise contract and feasible test design first.

No command below is claimed runnable today. Designated test files are absent. Missing-file failure does not reach behavior and is not a meaningful red assertion. Actual harness wiring must be specified and exercised when implementation is separately authorized. No secret or provider approval is assumed.

## Complete criterion-to-command map

| Requirement | Source | Designated future command | Every criterion to exercise |
| --- | --- | --- | --- |
| REQ-101 - Single-campaign launch | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-101.test.js` | REQ-101.1, REQ-101.2, REQ-101.3 |
| REQ-102 - Public homepage | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-102.test.js` | REQ-102.1, REQ-102.2 |
| REQ-103 - Public viewer experience | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-103.test.js` | REQ-103.1, REQ-103.2, REQ-103.3 |
| REQ-104 - Public competition standings | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-104.test.js` | REQ-104.1, REQ-104.2, REQ-104.3 |
| REQ-105 - Email-invited creator access | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-105.test.js` | REQ-105.1, REQ-105.2, REQ-105.3 |
| REQ-106 - Campaign manager and platform-administrator permissions | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-106.test.js` | REQ-106.1, REQ-106.2, REQ-106.3, REQ-106.4 |
| REQ-107 - Versioned participation acceptance | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-107.test.js` | REQ-107.1, REQ-107.2, REQ-107.3 |
| REQ-108 - Creative submissions | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-108.test.js` | REQ-108.1, REQ-108.2, REQ-108.3 |
| REQ-109 - Manager creative review | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-109.test.js` | REQ-109.1, REQ-109.2 |
| REQ-110 - Ad-specific fundraising link | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-110.test.js` | REQ-110.1, REQ-110.2 |
| REQ-111 - Confirmed Stripe fundraising | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-111.test.js` | REQ-111.1, REQ-111.2 |
| REQ-112 - Attribution earning window | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-112.test.js` | REQ-112.1, REQ-112.2, REQ-112.3, REQ-112.4 |
| REQ-113 - Locked competition rules and versioned advertising controls | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-113.test.js` | REQ-113.1, REQ-113.2, REQ-113.3, REQ-113.4, REQ-113.5 |
| REQ-114 - Paid platform performance | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-114.test.js` | REQ-114.1, REQ-114.2 |
| REQ-115 - Weighted competition score | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-115.test.js` | REQ-115.1, REQ-115.2 |
| REQ-116 - Chicago competition periods | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-116.test.js` | REQ-116.1, REQ-116.2, REQ-116.3 |
| REQ-117 - Complete data and empty periods | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-117.test.js` | REQ-117.1, REQ-117.2, REQ-117.3 |
| REQ-118 - Ranks and shared prizes | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-118.test.js` | REQ-118.1, REQ-118.2, REQ-118.3 |
| REQ-119 - Delayed winner finalization | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-119.test.js` | REQ-119.1, REQ-119.2, REQ-119.3 |
| REQ-120 - Refunds and corrections | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-120.test.js` | REQ-120.1, REQ-120.2 |
| REQ-121 - Fundraising commissions | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-121.test.js` | REQ-121.1, REQ-121.2 |
| REQ-122 - Separate campaign funds | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-122.test.js` | REQ-122.1, REQ-122.2 |
| REQ-123 - Fixed weekly prize replenishment | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-123.test.js` | REQ-123.1, REQ-123.2 |
| REQ-124 - Replenishment shortfall warning | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-124.test.js` | REQ-124.1, REQ-124.2, REQ-124.3 |
| REQ-125 - Thirty-second refresh | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-125.test.js` | REQ-125.1, REQ-125.2 |
| REQ-126 - Import outage notification | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-126.test.js` | REQ-126.1, REQ-126.2, REQ-126.3, REQ-126.4 |
| REQ-127 - Audited manual fallback | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-127.test.js` | REQ-127.1, REQ-127.2, REQ-127.3 |
| REQ-128 - Approved weekly payments | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-128.test.js` | REQ-128.1, REQ-128.2, REQ-128.3, REQ-128.4 |
| REQ-129 - Payment retries and reversals | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-129.test.js` | REQ-129.1, REQ-129.2 |
| REQ-130 - Private creator status | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-130.test.js` | REQ-130.1, REQ-130.2 |
| REQ-131 - Persistent records and traceability | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-131.test.js` | REQ-131.1, REQ-131.2 |
| REQ-132 - Automated advertising boundary | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-132.test.js` | REQ-132.1, REQ-132.2 |
| REQ-133 - Withdrawal and discretionary removal | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-133.test.js` | REQ-133.1, REQ-133.2, REQ-133.3 |
| REQ-134 - Disqualification | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-134.test.js` | REQ-134.1, REQ-134.2 |
| REQ-135 - Temporary fraud suspension | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-135.test.js` | REQ-135.1, REQ-135.2, REQ-135.3 |
| REQ-136 - Finalized prize correction | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-136.test.js` | REQ-136.1, REQ-136.2, REQ-136.3 |
| REQ-137 - Already-paid prize loss | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-137.test.js` | REQ-137.1, REQ-137.2, REQ-137.3 |
| REQ-138 - Creative upload validation | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-138.test.js` | REQ-138.1, REQ-138.2, REQ-138.3 |
| REQ-139 - Creator-owned submission fixes | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-139.test.js` | REQ-139.1, REQ-139.2 |
| REQ-140 - Public ad outage diagnostics | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-140.test.js` | REQ-140.1, REQ-140.2 |
| REQ-141 - Public ad outage recovery | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-141.test.js` | REQ-141.1, REQ-141.2 |
| REQ-142 - Operational alert delivery | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-142.test.js` | REQ-142.1, REQ-142.2, REQ-142.3 |
| REQ-143 - Blocked payment recipients | [PRD-adoption-is-launch.md](PRD-adoption-is-launch.md) | `node --test tests/launch/REQ-143.test.js` | REQ-143.1, REQ-143.2 |
| REQ-144 - Nonprofit-scoped provider assets | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-144.test.js` | REQ-144.1, REQ-144.2 |
| REQ-145 - Expansion and financial review authority | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-145.test.js` | REQ-145.1, REQ-145.2 |
| REQ-146 - Initial advertising goals | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-146.test.js` | REQ-146.1, REQ-146.2 |
| REQ-147 - Explicit external-ad enrollment | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-147.test.js` | REQ-147.1, REQ-147.2 |
| REQ-148 - Shared admission queue | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-148.test.js` | REQ-148.1, REQ-148.2 |
| REQ-149 - Expandable funded capacity | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-149.test.js` | REQ-149.1, REQ-149.2 |
| REQ-150 - Reserved slot lifecycle | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-150.test.js` | REQ-150.1, REQ-150.2 |
| REQ-151 - Funded-run baseline coverage | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-151.test.js` | REQ-151.1, REQ-151.2, REQ-151.3 |
| REQ-152 - Partial first-day baseline | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-152.test.js` | REQ-152.1, REQ-152.2 |
| REQ-153 - Baseline-first boost pool | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-153.test.js` | REQ-153.1, REQ-153.2 |
| REQ-154 - Ranked boost selection | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-154.test.js` | REQ-154.1, REQ-154.2, REQ-154.3 |
| REQ-155 - Startup boost allocation | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-155.test.js` | REQ-155.1, REQ-155.2 |
| REQ-156 - Meta/TikTok spending shares | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-156.test.js` | REQ-156.1, REQ-156.2 |
| REQ-157 - Unavailable provider share | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-157.test.js` | REQ-157.1, REQ-157.2 |
| REQ-158 - Spending exclusions | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-158.test.js` | REQ-158.1, REQ-158.2 |
| REQ-159 - Admission-bound performance policy | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-159.test.js` | REQ-159.1, REQ-159.2 |
| REQ-160 - Initial trial clock | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-160.test.js` | REQ-160.1, REQ-160.2, REQ-160.3 |
| REQ-161 - Fixed daily continuation windows | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-161.test.js` | REQ-161.1, REQ-161.2, REQ-161.3 |
| REQ-162 - Confirmed placement stopping | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-162.test.js` | REQ-162.1, REQ-162.2 |
| REQ-163 - Explicit advertising retrial | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-163.test.js` | REQ-163.1, REQ-163.2 |
| REQ-164 - Validated spending edits | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-164.test.js` | REQ-164.1, REQ-164.2 |
| REQ-165 - Unreliable financial evidence | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-165.test.js` | REQ-165.1, REQ-165.2 |
| REQ-166 - Distinct funds and obligations | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-166.test.js` | REQ-166.1, REQ-166.2 |
| REQ-167 - Financial shortfall and recovery | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-167.test.js` | REQ-167.1, REQ-167.2 |
| REQ-168 - Actual advertising provider fees | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-168.test.js` | REQ-168.1, REQ-168.2 |
| REQ-169 - Advertising contribution classification | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-169.test.js` | REQ-169.1, REQ-169.2 |
| REQ-170 - Reviewed contributor refunds | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-170.test.js` | REQ-170.1, REQ-170.2 |
| REQ-171 - Closure-only campaign returns | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-171.test.js` | REQ-171.1, REQ-171.2 |
| REQ-172 - Disputed-fund exclusion | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-172.test.js` | REQ-172.1, REQ-172.2 |
| REQ-173 - Approved numeric safety policy | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-173.test.js` | REQ-173.1, REQ-173.2 |
| REQ-174 - Immediate operator incidents | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-174.test.js` | REQ-174.1, REQ-174.2 |
| REQ-175 - Provider and production launch gates | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-175.test.js` | REQ-175.1, REQ-175.2 |
| REQ-176 - Durable reproducible allocation plans | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-176.test.js` | REQ-176.1, REQ-176.2 |
| REQ-177 - Atomic admissions and reservations | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-177.test.js` | REQ-177.1, REQ-177.2 |
| REQ-178 - Reconciled external write outcomes | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-178.test.js` | REQ-178.1, REQ-178.2 |
| REQ-179 - Verified financial recovery | [adoption-launch-advertising-contract.md](adoption-launch-advertising-contract.md) | `node --test tests/launch/REQ-179.test.js` | REQ-179.1, REQ-179.2 |

## First credential-free slice

**Q105–Q106 confirmed design:** Assert that repeated/concurrent preview saves persist advisory results without consuming campaign money or ad slots. Separately exercise intended reservation transactions against isolated campaign records for contention, revision conflicts, duplicate requests and restart. The [Convex harness review](convex-allocation-preview-harness-review.md) specifies real-backend/browser, isolation, authentication and evidence boundaries confirmed in Q106. The subsequent explicit implementation request produced the [bounded implementation evidence](allocation-preview-verification.md); the original review itself did not execute a runner.

The supplement's S1-01 through S1-10 are implemented as the bounded browser → authorized Convex functions → intended planner → isolated durable records journey. Run `npm run test:launch` for the planner, actual-backend and desktop/mobile suites; see the [evidence mapping](allocation-preview-verification.md). Denied direct requests, nonprofit separation, same-state restart, concurrent retries/reservations, advisory non-consumption, mixed-score holds and intercepted notification lifecycle are covered. Broader per-REQ production checks remain future work. No fixture certifies real finance, Clerk integration, provider contracts or whole-launch readiness.

## Discriminating behavior scenarios

1. **REQ-101/105/106/130/131/144/145/176:** Same persisted record across two authorized sessions/restart; wrong role/nonprofit/creator direct requests denied. Two-role one-person actions remain separately recorded. Explicit test identity cannot become a production demo-role bypass. No demo sample money/UTC rules/simulated metrics enter live state. Clerk forwarding/replay/revocation/recovery requires separate actual integration evidence.
2. **REQ-104/114-119/125-127:** Missing fields/pages/placements retain last-known public standings with delay, never zero; finalization holds after 48 elapsed hours until complete. Complete affirmative zeros yield no winner. Certified corrections cover only their declared scope and preserve imports/conflicts/release. Ready finalization and overdue recovery create one award within the original five-minute rule.
3. **REQ-116/118/119/152/159-161:** Chicago midnight/Monday, spring/fall DST, start-inclusive/end-exclusive boundaries, partial campaign periods, initial trial's own completion versus midnight continuation, assigned policy versions and immutable fixed windows. Provider granularity/coverage must actually support selected timestamps. Assert accepted Q90 incomplete-at-funded-end, Q92 admission-time policy assignment and Q93 chronological backlog/failure-at-decision-time outcomes.
4. **REQ-125/126/142/174/175:** Existing import-liveness checks at 299/300/301 seconds distinguish strict more-than-five-minute outage from successful unchanged or incomplete coverage. New selected delivery/financial/launch blocks notify immediately on detection without that grace. Persist one incident across restart; retry email 1/5/15/60 minutes, retain failed delivery and one resolution notice. Evidence must separate detector latency, application dispatch and provider email delivery; no invented SLA.
5. **REQ-111/112/120/121/128/129/136/137/143:** Payment-time attribution, pending/failed/delayed/duplicate/out-of-order events, partial/cumulative refunds with whole-cent half-up commission differences, no ordinary finalized-prize reopening, confirmed correction, paid-prize loss distinct from commission debt, exact reviewed payment contents, unknown-outcome reconciliation, held recipients and fresh catch-up approval. No duplicate payment/loss or automatic creator bank debit.
6. **REQ-122/151/153/165-173/179:** Correct nonprofit USD product balance; collection does not equal Issuing spend availability. Same obligation cannot be deducted as authorization hold, local promise and matched posted charge. Released hold does not prove canceled debt. Protect the full future baseline; current-day/trial overlap counted once. Unbilled delivery, taxes/fees, concurrent reservations, contributions/refunds/disputes/unmatched credits and uncertainty keep conservative coverage. Actual safety parameters cannot default to zero/unlimited age. Fee/refund/return/provider-state contracts remain account-gated.
7. **REQ-148-158/163/164/177:** Eligible queue order and retrial timestamp, skip blocked entry without losing its order, exactly-once concurrent slot/fund reservation, full-run funding before open/expansion, partial first day, one entry across placements, baseline-first residual boost pool, full tie-breaker cutoff ties and cent conservation. Healthy zero-performance startup is distinct from missing/stale input. Snapshot/settings changed mid-reservation rejects/recomputes. Assert accepted Q89 reconciled elapsed allocation release with future reserve protection and Q91 baseline-safe/new-boost-hold behavior, including immediate notification.
8. **REQ-133-135/147/150/157/160/162/178:** External enrollment versus report-only mapping, future managed-trial boundary and preserved prior costs. Underperformance stays public, withdrawal hides and stops future earnings, dated disqualification is distinct, suspected fraud reserves slots/earnings. A pause timeout cannot free a slot/create a replacement ad. Native fallback reconciles. Healthy provider retains own share while failed share is held; fresh full normal window is required after recovery. Assert Q90 stops at the locked funded end, labels the incomplete trial accurately and alerts without extending dates.
9. **REQ-170-172/178:** Refund original contributor versus closure-only nonprofit return, campaign-manager request/admin approval, exact reviewed content, verified liquidity, pending/unpaid status on block and immediate alerts. Repeated events and overlapping voluntary refund/mandatory reversal/dispute recovery reconcile once and cannot refund more than permitted cumulative value. Return destination/purpose/program evidence remains required.
10. **REQ-138-141:** Accepted upload size/format/duration boundaries and creator-only fixes, before/after-approval revision identity, technical media outage detection strictly beyond 60 seconds, one visitor failure insufficient, restoration after two checks 30 seconds apart. Recovery cannot override separate removal/suspension or reset earnings/entry identity.

## Evidence and completion

Each criterion needs a falsifying assertion against real intended behavior and a meaningful failing run, then green evidence after implementation. Record runner counts, no skips and redacted persisted objects/browser traces. Assign and validate actual provider commands only after authorization/setup; mark unavailable account tests BLOCKED rather than silently skipped. Run `npm test` and `npm run build` plus applicable browser suites and retain unrelated preexisting failures. Update this mapping after every acceptance revision.

CT mechanics and unaffected Q89–Q94 preview behavior remain accepted. Q95–Q104 supersede the Express/SQLite harness and select the Convex/Vercel/Clerk/Stripe/Blob/Mux architecture and video policies. Q105 clarifies advisory previews; Q106 confirms the replacement harness design and restores bounded specification readiness for separately requested ticket drafting. Exact runner/lifecycle/auth wiring and behavioral evidence remain unproven. Provider approvals and implementation/behavioral evidence remain required for a full launch. No ticket publication or implementation is authorized here.

## Historical baseline — 2026-11-07, not rerun

- `node --test tests/public-ranking.test.js`: exit 0; six demo formula tests passed, without production integration.
- `npm test`: exit 1; 17 passed and 12 test files failed to load because installed `zod` is incomplete (`ERR_MODULE_NOT_FOUND`). This is a dependency failure, not evidence of correctness or a launch regression.
- `node --test tests/launch/REQ-117.test.js`: exit 1, file absent. All designated launch files are absent; the command did not exercise production behavior.

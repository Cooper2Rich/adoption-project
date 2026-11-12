# Product Requirements Document: adoption.is First Campaign Launch

> **Remaining-build review, 2026-11-12:** Start with the [consolidated remaining launch scope](remaining-launch-build-spec.md). It preserves this document's acceptance criteria, the advertising supplement and accepted media decisions, and separates the implemented local preview from remaining production/provider work. Historical authorization/readiness statements below describe their original checkpoints.

> **Q95–Q104 architecture correction, 2026-11-11:** The intended launch uses a Convex backend, a Vercel-hosted frontend and Stripe payments. [ADR-0001](adr/0001-convex-vercel-launch-stack.md) supersedes the Q94 Express/SQLite harness selection wherever it appears below. Q98 adopts private Vercel Blob for original videos, Mux for streaming and Convex for media permissions/records under [ADR-0002](adr/0002-preserve-originals-in-private-blob-with-mux-playback.md); Q100 permits original downloads by the uploading creator, that campaign's manager and authorized platform administrators; Q101 retains originals without automatic expiry after completion/withdrawal and requires explicit administrator action for deletion. Q102 blocks deletion while active/publishing and requires confirmation plus an audit record; Q103 provides a 30-day recovery window before permanent removal. Q99 retains Clerk for applicable application authentication, with Convex enforcing current access permissions; public viewing/donating remain account-free. Q96 defers user-feedback tools, usage analytics and similar product-improvement tools until after initial release; payment confirmation, video-processing updates and advertising controls remain in launch scope. Q104 confirms the revised architecture and policies; previous specification-ready/harness claims and audits do not establish readiness of the revised design. Unaffected product requirements remain in force pending explicit corrections. No implementation is authorized.

**Subsequent bounded implementation:** After Q106 the user explicitly selected "Start implementation, preparing the spec and plan as needed." The local manager allocation-preview path and S1 checks are now implemented; see [verification evidence](allocation-preview-verification.md) and the [run guide](ALLOCATION-PREVIEW.md). Prior no-implementation statements describe the planning checkpoints. This is not a whole-launch implementation or live-provider/deployment authorization; real Clerk, provider/account, actual safety-value and full production gates remain open.

- **Status:** Blocked
- **Scope status:** Q95–Q104 correct the launch architecture and video access/retention policies. The earlier Q94 Express/SQLite preview harness is superseded; Q105–Q106 confirm advisory previews and the replacement Convex harness design. Actual lifecycle/auth wiring and behavioral validation remain implementation work. Unaffected product decisions and CT-01–CT-04 remain accepted. No implementation or publication is authorized.
- **Readiness status:** Architecture/video policies confirmed in Q104; replacement Convex harness design confirmed in Q106 after Q105 clarified advisory previews. The bounded slice is specification-ready for separately requested ticket drafting, with implementation/behavioral evidence still absent. Whole-launch/Ralph readiness remains blocked by provider evidence, actual safety settings and production verification.
- **Source:** Original product interview Q1-Q50, completed 2026-11-06, plus follow-up grill-with-docs rounds recorded under Decision traceability. Later answers replace earlier conflicting recommendations.
- **Last updated:** 2026-11-11

**Specification state, 2026-11-11:** Q94 historically confirmed the [consolidated advertising contract](adoption-launch-advertising-contract.md); Q95–Q104 supersede its stack/harness choice and add the selected video architecture. CT-01–CT-04 and unaffected product behavior remain accepted. REQ-101–REQ-143 retain stable IDs. The [review brief](adoption-launch-final-review.md) records the revised understanding and outstanding decisions. Provider/account evidence, actual approved safety settings and implemented verification remain blocked. No tickets, implementation or live operations are authorized.

## Objective

Launch a real, automation-first adoption.is campaign in which the public can discover approved ads, watch them, donate through ad-specific tracked fundraising links, and follow a public competition. Invited creators contribute creative work and earn campaign-defined fundraising commissions plus fixed daily and weekly competition prizes. One adoption.is campaign manager operates the campaign and approves weekly creator payment batches.

The public homepage and public viewer experience are critical launch functionality, not optional promotional pages. Successful launch means the complete public, creator, and manager journeys satisfy the acceptance criteria below using shared persistent records and validated integrations. No numerical fundraising or adoption-outcome target was agreed; none is invented here.

## Current state and evidence

- Inspected the running local public demo at port 5173, including its homepage, Discover page, creator entry screen, and manager campaign list. Its brand is adoption.is. It currently shows multiple fictional campaigns and demo role switching.
- README.md describes a browser-local public demo without real payments or ad delivery. src/public-demo/api.ts and src/public-demo/workspace.js use browser-local storage. The original Express workspace also exists; neither its presence nor a passing demo test proves the agreed production journeys work.
- src/public-demo/ranking.ts implements capped square-root scoring with weights 40 impressions / 30 total link clicks / 30 fundraising, followed by clicks, fundraising, and impressions as tie-breakers. The older 15/10/35/40 grading illustration is not the selected score.
- src/public-demo/leaderboard-periods.ts currently uses UTC. The agreed launch timezone is America/Chicago; the existing period tests are evidence of a difference, not proof of compliance.
- src/public-demo/leaderboard-simulation.ts fabricates changing demo metrics. Fictional results must not enter live competition or financial records.
- Existing test commands include npm test, npm run test:e2e, and npm run test:public. Their current coverage is a baseline, not complete verification of these requirements.
- docs/PRD.md and docs/PRD.audit.json are preserved historical artifacts. Their claims about an empty repository, Instagram-only publication, fixed 10% commission, tiers, and guarantees are not current launch authority.

## Scope

- **Permitted repository changes in this task:** This launch PRD, its audit/readiness evidence, supporting provider research and verification plan, and the root domain glossary. No application implementation, deployment, live provider setup, invitation, financial operation, or issue publication is authorized by this documentation task.
- **Intended product scope:** adoption.is-first rollout, public homepage and viewer pages, public daily/weekly standings, email-invited creators through Clerk, submission review, tracked fundraising through Stripe, public advertising crowdfunding plus optional nonprofit contributions, automated advertising creation/control and performance imports for Instagram/Facebook/TikTok, commission/prize accounting, prize-fund replenishment, alerts, and manager-approved automated weekly creator payments. Later-nonprofit connection reuse and rollout boundaries are being reconciled under C3; approved provider access/funding remain prerequisites.
- **Preserved behavior:** Existing application files and historical documentation remain unchanged. The demo is evidence, not a requirement inventory. This document uses REQ-101 onward to avoid reusing historical REQ-001 through REQ-024 with different meanings.
- **External side effects:** None during documentation. Eventual production donations, transfers, emails, and payouts require authorized accounts, approved implementation, and the readiness gates below.

## Non-goals

- A multi-organization marketplace, commercial campaign support, multiple launch campaigns, or a public campaign selector.
- Public viewer accounts, sign-in requirements for public actions, viewer profiles, or giving-history accounts.
- Advertising spend outside the approved campaign limits, verified funding and selected supported provider workflows. Automated advertising within those boundaries is now in scope; provider eligibility is not established by this scope change.
- Scoring unpaid posts, unrelated paid ads, public-page views, or public-page fundraising-link clicks. Confirmed fundraising through a tracked link still counts.
- Donation-count votes, CTR-based grading, creator portfolio tiers, automatic guarantees, app-use fees, or the demo's fixed commission split.
- Monthly or final-campaign prize schedules for this first campaign; daily and weekly prizes are selected.
- Guaranteeing that advertising providers produce newly measured data every 30 seconds.
- Mandatory second approval for creator payments, autonomous unapproved creator payments, or automatic debits of a creator's bank account after refunds. Capacity expansion and refund/return requests require platform-administrator approval of campaign-manager requests. One person may hold both roles with separately recorded actions; no broader administrator powers are implied.
- Automatically reopening finalized competition awards for ordinary refunds.

## Agreed policy summary

- Adoption.is alone is public at first rollout, with reusable nonprofit-scoped records, grants and finance. Each nonprofit initially has one advertising campaign. Nonprofits own intended advertiser assets; Slander owns developer applications and uses delegated access. Provider approval remains unvalidated.
- Creator access uses Clerk invitations and supported recovery. One person may hold campaign-manager and platform-administrator roles, with separately recorded request/approval actions. Capacity expansion and discretionary advertising refunds/returns need administrator approval; creator payouts retain manager approval.
- Public discovery, viewing, approved waiting creatives and tracked fundraising are account-free. Paid launch waits for the full prize schedule, advertised funded-run baseline, approved safety configuration and validated providers. Prelaunch crowdfunding and creator review may precede paid launch.
- Tracked fundraising donations retain attribution, commission, refund and earnings rules below. Advertising contributions instead fund the selected campaign's baseline/boost allocation, without per-ad earmarking, creator commissions, prize replenishment or fundraising-score credit. Actual provider fees reduce that campaign's advertising fund.
- Public competition uses capped square-root score weights 40 impressions / 30 total link clicks / 30 attributed fundraising, with configured positive daily/weekly targets and existing tie-breakers. Unrounded comparisons, Chicago calendar periods, full-period prize eligibility, 48-elapsed-hour finalization and complete-data/no-zero substitution remain unchanged.
- Advertising uses fixed per-funded-ad daily baseline, prorated on first admission day; after protecting full funded-run coverage, the manager's residual boost share goes to the daily top eligible funded group including exact cutoff ties. At healthy no-performance startup only that defined boost pool divides equally. Other money stays uncommitted. Provider shares total 100%, unavailable shares are held and operators immediately notified.
- Continuation has independently configured nonprofit weights/targets/passing score/trial duration. Each admission keeps its policy. Trial starts on first confirmed managed delivery with pauses excluded; continued windows end Chicago midnight and wait for complete fixed-window data. Underperforming ads lose spend but remain public. Full normal-delivery evaluation follows provider interruption recovery.
- Paused/interrupted/stopping ads retain slots. Cuts or withdrawals free slots only after all relevant placements are confirmed stopped. New ads and retrials share an eligibility-aware queue; an old creative cannot jump ahead on retrial. Financial uncertainty or uncovered baseline obligations stops new allocations and requests pauses. Recovery is automatic only within verified existing authority and other holds.
- Routine spending edits apply on the next validated cycle after safe reserve resizing; they cannot undo incurred/uncertain obligations. Contribution refunds are reviewed individually; nonprofit balance returns are closure-only. Both use manager request/admin approval. Disputed funds immediately cease being spendable without double deduction.
- Retain the original commission/prize separation, fixed weekly prize replenishment, 24-elapsed-hour precheck, Wednesday-noon creator-batch preparation, exact-content approval, duplicate prevention and paid-prize-loss policy. Legacy references to the sole manager identify the original recipient, not administrator privileges.
- Every detected selected launch/financial/delivery/capacity/evaluation block immediately notifies both operators, including the user's designated identity, without an intentional grace period. Retain visible incidents, delivery failures, selected retries and recovery notices. Actual detector/dispatch bounds are unvalidated; no live monitoring is enabled.
- The supplement is the consolidated advertising contract and review surface. Q89-Q93, CT-01 through CT-04 and provider gates remain open; do not convert a recommendation or structural pass into a decision, provider guarantee or implementation authorization.

## Requirements

### REQ-101 - Single-campaign launch

- **Statement:** The application shall expose only the adoption.is campaign in the first launch.
- **Rationale:** Q1 and Q16 narrow the demo to one organization and campaign.
- **Depends on:** None

#### Acceptance criteria

- [ ] Given public or creator navigation, when a user opens the application, then the adoption.is campaign is available without a campaign selector or another organization's campaign.
- [ ] Given a manager preparing the launch, when campaign settings are saved, then the resulting campaign belongs to adoption.is; generic marketplace onboarding is not needed.
- [ ] Given a second nonprofit represented in isolated verification records, when its records, permissions, provider connections or financial mappings are accessed, then they cannot be confused with or accessed through an unauthorized adoption.is campaign scope. The reusable boundaries must not require exposing a second campaign in the first public rollout.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Single-campaign route and configuration checks. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-102 - Public homepage

- **Statement:** The application shall provide an account-free adoption.is campaign homepage.
- **Rationale:** Q15 identifies the public homepage as critical launch scope.
- **Depends on:** REQ-101

#### Acceptance criteria

- [ ] Given an unauthenticated visitor, when the homepage opens, then the visitor can understand the campaign and reach the public viewer experience.
- [ ] Given the launch homepage, when it displays approved ads or standings, then they refer to the same campaign records as the viewer pages rather than separate fictional fixtures.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Public homepage browser checks. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-103 - Public viewer experience

- **Statement:** The application shall provide account-free discovery of approved ads.
- **Rationale:** Q16-Q17 confirm browsing, watching, details, and ad-linked fundraising without viewer accounts.
- **Depends on:** REQ-102

#### Acceptance criteria

- [ ] Given an approved public ad, when a guest browses or opens its detail page, then its media, creator attribution, campaign context, and tracked fundraising action are accessible without sign-in.
- [ ] Given a pending or rejected submission, when a guest requests it through a direct route, then its private submission content is not exposed.

- [ ] With no approved public entries, show "No approved ads yet" without fictional substitutes. Failed media shows "This ad's media is unavailable" with retry and otherwise-valid fundraising access; follow REQ-140/REQ-141 for outages.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Guest discovery, playback, detail, and fundraising-entry browser checks. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-104 - Public competition standings

- **Statement:** The public viewer experience shall display the campaign leaderboard.
- **Rationale:** Q16 and Q18 require public provisional standings and confirmed winners.
- **Depends on:** REQ-103, REQ-115, REQ-119

#### Acceptance criteria

- [ ] Given a visitor without an account, when daily or weekly standings are opened from the public viewer experience, then the selected period, ranked ads, provisional or final status, and source-update information are visible.
- [ ] Given finalized past results, when the visitor opens the corresponding completed period, then confirmed winners are shown without donor identities, creator payment-account details, or private financial records.

- [ ] When required data is missing, retain last-known standings with update time and "Some results are delayed" labeling. Never replace missing data with zero or label incomplete results final; without prior standings, do not fabricate them.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Guest leaderboard and completed-results browser checks. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-105 - Email-invited creator access

- **Statement:** The application shall restrict creator access to invited email identities authenticated through Clerk sign-in magic links.
- **Rationale:** Q5, Q7, and Q17 establish invite-only creators without public viewer accounts.
- **Depends on:** REQ-101

#### Acceptance criteria

- [ ] Given an invitation to one email address, when its owner authenticates with that invited identity through Clerk, then creator access is granted.
- [ ] Given another authenticated identity or a revoked creator, when it uses a forwarded invitation or requests a protected creator operation, then access is denied on the server.

- [ ] Authentication and access recovery use Clerk-supported flows, not an internal recovery system. Provider-supported identity matching, expiry/replay, revocation and sole-manager recovery require O-07 investigation.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Clerk invitation, forwarded-link, revocation, and authorization integration checks. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-106 - Campaign manager and platform-administrator permissions

- **Statement:** The application shall distinguish campaign-manager permissions from platform-administrator capacity-expansion approval while allowing one person to hold both roles at initial launch.
- **Rationale:** Q44/Q55 supersede the earlier sole-role interpretation specifically for capacity expansion; creator-payment approval remains with the campaign manager.
- **Depends on:** REQ-105

#### Acceptance criteria

- [ ] Given the authenticated campaign manager, when management functions are requested, then the person can configure the campaign, invite or revoke creators, review ads, map placements, inspect funds, enter fallback data, make auditable corrections, and approve payment batches.
- [ ] Given an ordinary creator or guest, when the same functions are requested directly, then authorization is denied. A campaign manager without platform-administrator permission cannot approve capacity expansion. Later nonprofit managers receive only their authorized campaign scope, without automatic platform-administrator privileges.
- [ ] Given a capacity-expansion request, when an authorized platform administrator approves it after funding and spending-limit checks, then the request and approval are separately recorded with actor, role and time. One person may perform both actions if assigned both roles; a second human is not mandatory. Creator-payment batches do not acquire a second-approver requirement.
- [ ] Contributor refunds and closure-only nonprofit balance returns require separately recorded manager request and administrator review/approval. Manager authority alone cannot approve execution; creator-payment approval remains unchanged. Accepted beneficiary/amount limits are consolidated in the supplement; actual provider execution and release evidence remain validation gates.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Manager-versus-creator authorization integration checks. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-107 - Versioned participation acceptance

- **Statement:** The application shall record versioned participation acceptance before campaign signup.
- **Rationale:** Q21-Q22 and Q41 require advance disclosure of the rules.
- **Depends on:** REQ-105, REQ-113

#### Acceptance criteria

- [ ] An invited creator must accept the versioned use agreement before campaign signup completes; submission is blocked without acceptance.
- [ ] Given accepted terms, when the acceptance record is inspected, then it identifies the creator, accepted version, and acceptance time, covering commission, prizes, score, cutoffs, refunds, and creative use.

- [ ] The signup agreement grants permission for public display and advertising of campaign submissions without further creator approvals per submission or placement. Creators retain ownership and confirm permission to authorize included content. New advertising use ends on withdrawal or campaign completion; private records remain available to explain results and payments. Other creator legal matters belong in the pre-signup use agreement.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Terms-version and consent-gate integration checks. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-108 - Creative submissions

- **Statement:** The application shall accept versioned video or still-image submissions from participating creators.
- **Rationale:** Q14 and Q41 identify submission content and rights evidence.
- **Depends on:** REQ-107

#### Acceptance criteria

- [ ] Given a participating creator, when an allowed video or still image is submitted, then the saved version includes its media, title, description, creator, and reference to the accepted campaign-use agreement; no per-submission permission approval is requested.
- [ ] Given a revision, when submitted, then its prior version and evidence remain identifiable and the changed creative requires fresh review; successful upload alone never promises platform placement.

- [ ] Before first approval, corrected files retain the entry and tracked link, preserve earlier submissions and require review. Media replacement after approval creates a new entry and link requiring fresh approval; it inherits none of the old approval, metrics or earnings. The original entry and history remain intact. Title/description-only edits retain identity; unchanged creative across platforms remains one entry.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Media validation, signup-agreement reference and revision-history checks against accepted REQ-138 limits. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-109 - Manager creative review

- **Statement:** The application shall require manager approval before a submission is public or eligible for advertising use.
- **Rationale:** Q8 rejects treating demo automatic eligibility as production approval.
- **Depends on:** REQ-106, REQ-108

#### Acceptance criteria

- [ ] Given pending, rejected, or newly revised content, when public display or advertising-use eligibility is evaluated, then that version is excluded until approved.
- [ ] Given rejection, when the creator views the submission, then the rejection reason is available and the creator can submit a revision; approving a version does not launch an external ad.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Approval, rejection-reason, revision, and public-visibility integration checks. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-110 - Ad-specific fundraising link

- **Statement:** The application shall create a unique tracked fundraising link when an ad is created.
- **Rationale:** Q25 and Q40 distinguish donation attribution from authentication.
- **Depends on:** REQ-108

#### Acceptance criteria

- [ ] Given creation of an ad, when its saved record is returned, then it has a tracked fundraising link bound to that ad, distinct from a Clerk sign-in magic link.
- [ ] Given the same creative mapped to multiple platform placements or its tracked link shared with another person, when an attributed donation is recorded, then the original ad identity is retained rather than creating another competition entry.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Ad-link creation, uniqueness, sharing, and placement-mapping checks. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-111 - Confirmed Stripe fundraising

- **Statement:** The application shall record fundraising from provider-confirmed Stripe payment results.
- **Rationale:** Q19 and the platform clarification select Stripe for fundraising and payment setup.
- **Depends on:** REQ-110

#### Acceptance criteria

- [ ] Given a donation checkout started through an ad's tracked link, when the provider confirms a successful payment, then its amount, completion time, financial identity, and ad association are recorded once.
- [ ] Given an abandoned, pending, failed, or duplicate financial event, when fundraising totals are updated, then no unconfirmed or duplicate donation is counted; a browser return alone is not payment proof.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Stripe test-mode successful, pending, failed, duplicate, and delayed-event checks; provider state mapping remains O-02. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-112 - Attribution earning window

- **Statement:** The application shall award fundraising credit only to qualifying completed donations within the campaign earning window.
- **Rationale:** Q33 and Q40 settle link attribution and the post-campaign cutoff.
- **Depends on:** REQ-111, REQ-113

#### Acceptance criteria

- [ ] Given a valid tracked-link checkout, when a qualifying donation completes inside the configured earning window, then exactly its originating ad receives fundraising credit and its creator receives the applicable commission.
- [ ] Given earlier browsing, a donation without a valid ad identifier, or completion after the earning cutoff, when attribution is calculated, then browsing does not reassign credit and no campaign commission or competition fundraising credit is generated for the latter cases; the donation still supports adoption.is.

- [ ] Use provider-authoritative successful-payment time, not notification receipt time. The earning window includes its start and excludes its end, including delayed/reordered events. Qualifying donations inside the earning window but outside eligible prize periods earn commission without competition fundraising credit.
- [ ] Otherwise-valid old tracked links continue account-free checkout after cutoff, withdrawal or ordinary manager removal. Later donations support adoption.is without campaign commission or competition credit.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Checkout-origin, shared-link, missing-attribution, and cutoff-boundary checks. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-113 - Locked competition rules and versioned advertising controls

- **Statement:** The application shall lock competition and earnings rules at campaign creation while retaining separately controlled advertising settings and admission-specific performance policies.
- **Rationale:** Q21-Q24 fix competition/earnings rules; Q44/Q56/Q57 explicitly allow advertising-control changes without rewriting accepted rules or existing ads' performance policies.
- **Depends on:** REQ-101, REQ-106

#### Acceptance criteria

- [ ] Campaign creation requires USD currency, campaign dates and earning window, commission rate, daily and weekly targets, fixed prize amounts and schedule, fixed weekly replenishment amount and time, and weekly creator-payment batch schedule.
- [ ] Once created, any edit to these campaign rules is rejected, even before invitations or creator acceptance. Historical rules and accepted terms versions remain available; no post-creation rules amendment process is approved.
- [ ] Campaign-manager changes to daily/total advertising limits, daily baseline amount, boost percentage and top count are recorded and govern future uncommitted spending only, subject to verified funding. They cannot overwrite past allocations, cancel incurred charges or alter competition/earnings rules. Capacity expansion requires its separately recorded administrator approval; precise activation timing and lower-limit handling remain U6 contract work.
- [ ] Each paid admission records its continuation weights, targets, passing score and trial duration policy version. Both initial and ongoing evaluations use that version. Revised policies apply to new admissions and newly authorized retrials, not retroactively to existing ads or results.

- [ ] Weekly creator-payment preparation occurs Wednesday at noon America/Chicago, separate from the campaign-configured weekly prize-replenishment schedule.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Required-configuration, USD and creation-lock checks, including accepted precision, rounding and split remainders. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-114 - Paid platform performance

- **Statement:** The application shall aggregate eligible paid-ad performance into its originating competition entry.
- **Rationale:** Q23, Q43, and Q44 select the metric sources and one-entry model.
- **Depends on:** REQ-109, REQ-110

#### Acceptance criteria

- [ ] Given authorized Instagram, Facebook, and TikTok campaign placements mapped to an approved ad, when metrics are imported, then eligible impressions and total link clicks are combined for that entry with a platform breakdown and no duplicate placement or overlapping-report count.
- [ ] Given unpaid posts, unrelated paid ads, public viewer activity, public fundraising-link clicks, or platform-estimated donation conversions, when scoring inputs are produced, then those sources do not substitute for qualified paid impressions/clicks or confirmed Stripe fundraising.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Platform-report contract, placement-mapping, exclusions, and deduplication checks; provider fields remain O-01. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-115 - Weighted competition score

- **Statement:** The application shall compute the agreed capped square-root score from period-specific metrics.
- **Rationale:** Q20 and Q22 select the current public-demo formula, not the historical grade.
- **Depends on:** REQ-112, REQ-113, REQ-114

#### Acceptance criteria

- [ ] Given complete nonnegative metrics and positive period targets, when scored, then the result follows the formula in Agreed policy summary, with maximum contributions of 40, 30, and 30 and a maximum total of 100.
- [ ] Given impressions 25, clicks 36, and fundraising 64 against targets 100 for each, when scored, then the result is 62; values above targets cannot exceed their component caps and CTR or donation-count votes cannot replace total clicks or dollars.

#### Verification

- **Command:** `node --test tests/public-ranking.test.js` (existing formula baseline only; not production integration coverage).
- **Pass condition:** Weighted calculation and invalid/missing-input checks. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-116 - Chicago competition periods

- **Statement:** The application shall partition competition activity into America/Chicago daily and Monday-Sunday weekly periods.
- **Rationale:** Q26 specifies campaign-local boundaries and independent daily/weekly targets.
- **Depends on:** REQ-113, REQ-114

#### Acceptance criteria

- [ ] Given activity around a Chicago midnight or Monday boundary, when bucketed, then it belongs to exactly the applicable local day and week rather than the UTC calendar date.
- [ ] Given daily versus weekly calculation or a daylight-saving transition, when the period is evaluated, then its actual Chicago calendar boundaries and selected daily/weekly targets are used; a calendar day is not assumed to be exactly 24 elapsed hours.

- [ ] Competition periods include their start and exclude their end. Only full Chicago calendar days and complete Monday-Sunday weeks wholly contained within competition dates award prizes; partial opening/closing periods have no prize. Otherwise-eligible donations in partial periods can still earn commission.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Chicago midnight, week rollover, daylight-saving, and separate-target checks. Every acceptance criterion must be exercised against real application behavior or faithful provider test-mode contracts; existing demo results alone do not satisfy it.
- **Evidence:** Requirement-mapped automated test output, relevant redacted records, and browser traces where applicable.

### REQ-117 - Complete data and empty periods

- **Statement:** The application shall distinguish valid zero activity from missing required competition data.
- **Rationale:** Implements the agreed launch policy captured in the decision traceability section.
- **Depends on:** REQ-114, REQ-115, REQ-116

#### Acceptance criteria

- [ ] Missing required metrics remain identified as incomplete, are not replaced with zero, and hold finalization rather than silently excluding an otherwise eligible entry.
- [ ] Track completeness separately for each required entry, source, metric and competition period. A successful request, an unchanged value, or a partial response alone does not establish complete period coverage. A known zero requires affirmative complete coverage; an absent field, unavailable page, missing placement or unknown coverage remains missing. REQ-127 certification satisfies only its exact covered scope. O-01 must establish which source evidence can prove coverage before a period can be finalized.
- [ ] A fully known all-zero period produces no winner or prize obligation; unused money stays in the campaign prize fund.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-118 - Ranks and shared prizes

- **Statement:** The application shall rank ads by unrounded score, then clicks, fundraising dollars and impressions, in descending order.
- **Rationale:** Implements the agreed launch policy captured in the decision traceability section.
- **Depends on:** REQ-115, REQ-117

#### Acceptance criteria

- [ ] Displayed score rounding cannot change rank. Equal scores are resolved using the specified tie-breakers in order.
- [ ] An exact remaining tie has shared rank and splits one fixed USD prize, not a full prize per winner. Divide its whole cents equally; allocate remaining cents one per tied entry in ascending entry-creation time, then ascending stable entry ID, until exhausted. The allocated amounts sum exactly to the fixed prize.
- [ ] Each ad competes independently. Multiple ads per creator, repeated daily wins and daily-plus-weekly wins are allowed.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-119 - Delayed winner finalization

- **Statement:** The application shall finalize a competition period no earlier than 48 elapsed hours after its end and only with complete required data.
- **Rationale:** Implements the agreed launch policy captured in the decision traceability section.
- **Depends on:** REQ-116, REQ-117, REQ-118

#### Acceptance criteria

- [ ] Before the 48-hour delay ends, standings remain provisional and no finalized prize obligation is created.
- [ ] After the delay, missing required data holds finalization with the missing source visible to the manager and an alert sent to the manager. Once the delay has elapsed and required data is complete, automatically finalize within five minutes without manager action, recording the source snapshot, rules, winners and awards exactly once. Recovery from an outage processes ready overdue periods within five minutes of recovery; concurrent or repeated execution cannot create duplicate awards.
- [ ] Finalized unpaid prizes enter the next weekly payment batch. Public history distinguishes finalized winners from provisional standings.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-120 - Refunds and corrections

- **Statement:** The application shall reconcile refunded or reversed fundraising without automatically reopening finalized prizes.
- **Rationale:** Implements the agreed launch policy captured in the decision traceability section.
- **Depends on:** REQ-111, REQ-112, REQ-119

#### Acceptance criteria

- [ ] A confirmed refund or reversal reduces eligible attributed fundraising and recalculates affected provisional standings for the original donation period without applying the event twice. Recompute commission on the remaining eligible donation amount at the original locked rate using whole-cent, half-up rounding; record only the difference from commission already recognized. Cumulative reversals cannot exceed the original commission.
- [ ] An ordinary refund does not automatically reopen a finalized prize. Later imported reports or manual corrections preserve finalized winners and prize obligations, retain the discrepancy and notify the manager. Exceptional finalized-prize corrections require the explicit manager action in REQ-136; already-paid mistakes follow REQ-137.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-121 - Fundraising commissions

- **Statement:** The application shall calculate commissions using the locked campaign percentage on eligible attributed gross fundraising before processing fees, less refunds.
- **Rationale:** Implements the agreed launch policy captured in the decision traceability section.
- **Depends on:** REQ-111, REQ-112, REQ-113, REQ-120

#### Acceptance criteria

- [ ] An eligible donation earns the configured commission on gross fundraising before processing fees; gross donations, refunds, fees and commissions remain separate ledger amounts. All monetary accounting uses whole USD cents. Calculate each donation commission at the locked rate and round to the nearest cent, with exact half-cent amounts rounded up.
- [ ] Unattributed and post-cutoff donations support adoption.is but create no campaign creator commission or competition fundraising credit.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-122 - Separate campaign funds

- **Statement:** The application shall separately account for fundraising, reserved creator earnings, advertising funds and the campaign prize fund.
- **Rationale:** Implements the agreed launch policy captured in the decision traceability section.
- **Depends on:** REQ-113, REQ-121

#### Acceptance criteria


- [ ] The full promised daily/weekly prize schedule and funded-run baseline coverage must be funded before paid advertising/competition starts. Prelaunch setup, creator invitation/submission/review, approved-provider crowdfunding and public waiting ads are permitted. A shortage cannot rewrite locked competition/earnings rules. Advertising coverage and related gates are specified by supplemental REQ-151 and REQ-173 through REQ-175.
- [ ] Separately account for fundraising, reserved creator earnings, advertising funding and prize funds. Advertising contributions primarily fund the selected campaign, supplemented by nonprofit/client contributions, without per-ad earmarking, creator commission, prize replenishment or fundraising-score credit. Advertising reserves, fees, refunds, returns, disputes and reconciliation follow supplemental REQ-165 through REQ-173; prize obligations cannot consume advertising allocations or reserved creator earnings.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-123 - Fixed weekly prize replenishment

- **Statement:** The application shall schedule a fixed-dollar weekly replenishment from available unreserved fundraising into this campaign's prize fund.
- **Rationale:** Implements the agreed launch policy captured in the decision traceability section.
- **Depends on:** REQ-113, REQ-122

#### Acceptance criteria

- [ ] The campaign-configured amount, weekday and Chicago time determine the transfer. With sufficient available funds, execute that fixed amount exactly once for each scheduled occurrence.
- [ ] Replenishment does not change promised daily or weekly prize values, use a donation percentage, or fund another campaign.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-124 - Replenishment shortfall warning

- **Statement:** The application shall check replenishment funding 24 elapsed hours before the scheduled transfer and again at execution.
- **Rationale:** Implements the agreed launch policy captured in the decision traceability section.
- **Depends on:** REQ-123

#### Acceptance criteria

- [ ] A shortfall at the advance check immediately creates an in-app warning and email to the campaign manager identifying scheduled amount, time, available amount and shortfall. This original prize event notifies the campaign manager; it does not collapse the distinct platform-administrator role.
- [ ] If execution cannot fund the entire fixed replenishment amount, transfer nothing, preserve reserved creator earnings and nonnegative balances, record the shortfall, and notify the manager. Retry hourly until that scheduled obligation is fulfilled; never duplicate a completed transfer or retry an unknown outcome as a new transfer without reconciliation.
- [ ] Retain the original advance funding check 24 elapsed hours before the scheduled replenishment and recheck at execution. The proposed 48-hour check and separate next-two-days coverage check are withdrawn. For a scheduled midnight execution, the advance check occurs 24 elapsed hours earlier; on ordinary non-DST dates this is midnight the prior day in America/Chicago. An advance check does not guarantee that execution-time funds remain available.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-125 - Thirty-second refresh

- **Statement:** The application shall refresh public standings from stored results every 30 seconds and target 30-second background polling subject to provider limits.
- **Rationale:** Implements the agreed launch policy captured in the decision traceability section.
- **Depends on:** REQ-104, REQ-114

#### Acceptance criteria

- [ ] An open public standings page displays newly stored results on its next 30-second refresh without page reload or login.
- [ ] Provider rate limits and reporting delays are respected. Display last successful import and reporting delay; polling is not presented as guaranteed new measurements every 30 seconds. Never fabricate metric changes.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-126 - Import outage notification

- **Statement:** The application shall notify the campaign manager when a required source has no successful import for more than five minutes.
- **Rationale:** Implements the agreed launch policy captured in the decision traceability section.
- **Depends on:** REQ-114, REQ-125

#### Acceptance criteria

- [ ] An outage exceeding five minutes creates an in-app warning and immediate email once per incident, identifying the source and last successful import.
- [ ] Start monitoring when a source first becomes required for an eligible placement, including before its first successful import. Until the first success, measure elapsed time from that activation and display that no successful import has occurred. At exactly five minutes do not open the incident; after five minutes open one, including across restarts. When no longer required, stop monitoring that source for that scope without concealing existing history.
- [ ] A successful import means the requested import operation completed without transport, authorization, pagination or processing failure; a response that lacks complete period coverage can be a successful import but does not clear the separate completeness hold in REQ-117. Failed or incomplete operations do not reset the last-success clock. Record the operation outcome and coverage separately.
- [ ] Successful imports of unchanged values do not trigger this warning. Recovery sends one recovery notice and resolves the incident.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-127 - Audited manual fallback

- **Statement:** The application shall allow manager-entered source metrics and corrections with provenance and reconciliation against later imports.
- **Rationale:** Implements the agreed launch policy captured in the decision traceability section.
- **Depends on:** REQ-106, REQ-114, REQ-115

#### Acceptance criteria

- [ ] A manual entry records manager, time, source, period, prior/new values and reason, and uses the same scoring formulas as imported metrics.
- [ ] A later import covering manually recorded activity does not double-count it; reconciliation preserves correction history and source provenance.

- [ ] An evidence-backed, manager-certified correction overrides imports for its exact entry, metric and time range until explicit manager release. Certification satisfies completeness only for its covered scope. Preserve matching imports without double counting, retain conflicting later imports and notify the manager rather than silently replacing the correction; retain certification/release history. This evidence requirement does not apply to discretionary removal or disqualification.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-128 - Approved weekly payments

- **Statement:** The application shall prepare weekly creator payment batches for manager approval before automated payment.
- **Rationale:** Implements the agreed launch policy captured in the decision traceability section.
- **Depends on:** REQ-106, REQ-119, REQ-121, REQ-122

#### Acceptance criteria

- [ ] A batch itemizes each creator's payable commissions, finalized unpaid prizes and adjustments; provisional prizes are excluded.
- [ ] An unapproved batch sends no payment. Approval authorizes only its reviewed contents; automated payment exposes success/failure per recipient. Provider payment capability remains O-02 investigation work; Q16 fixes the preparation schedule.

- [ ] Prepare batches Wednesday at noon America/Chicago for the preceding Monday-Sunday's eligible commissions and finalized prizes plus unpaid eligible carryover. Notify the sole manager when ready for approval. Late approval delays execution; outage recovery prepares one catch-up batch without duplicate obligations or payments.
- [ ] Approval binds exact reviewed recipients and amounts. Refunds, prize corrections or other changes invalidate approval of the changed batch and require fresh approval. Completed payments remain unchanged; reconcile unknown outcomes before retry.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-129 - Payment retries and reversals

- **Statement:** The application shall prevent duplicate payments and handle already-paid commission reversals without automatic creator bank debits.
- **Rationale:** Implements the agreed launch policy captured in the decision traceability section.
- **Depends on:** REQ-120, REQ-128

#### Acceptance criteria

- [ ] Repeated jobs, timeouts and provider callbacks produce at most one payment per obligation. Preserve provider references and pending/failed/settled states; unknown outcomes cannot become new payments.
- [ ] An already-paid commission reversal creates a negative commission balance offset only against future commissions and flagged for manager review. Do not deduct it from fixed prizes or debit the creator's bank account automatically. An erroneous prize already paid is instead a loss under REQ-137, not a commission reversal.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-130 - Private creator status

- **Statement:** The application shall show each invited creator their submissions, performance and earnings without exposing private records publicly.
- **Rationale:** Implements the agreed launch policy captured in the decision traceability section.
- **Depends on:** REQ-105, REQ-109, REQ-114, REQ-121, REQ-128

#### Acceptance criteria

- [ ] The authenticated workspace shows the creator's review status, rejection reasons, platform breakdown, freshness, attributed fundraising, commissions, finalized prizes and payment states.
- [ ] Public viewers and other creators cannot retrieve private earnings, invitations or payment setup records; approved public ads and standings remain accessible.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-131 - Persistent records and traceability

- **Statement:** The application shall maintain shared durable campaign records with server-enforced authorization independent of browser-local demo state.
- **Rationale:** Implements the agreed launch policy captured in the decision traceability section.
- **Depends on:** REQ-105, REQ-106, REQ-110, REQ-127, REQ-129

#### Acceptance criteria

- [ ] Two authorized sessions and a process restart retrieve the same saved records; localStorage, fixtures and simulated demo changes cannot originate live scores or financial transactions.
- [ ] Corrections, approvals, payments and donation reconciliation retain actor/source, time, affected records and resulting changes. Unauthorized mutations are denied; public clients and audit evidence do not expose provider credentials.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-132 - Automated advertising boundary

- **Statement:** The application shall automate paid advertising for approved entries admitted within campaign capacity, spending authority and verified funding.
- **Rationale:** The newer GitHub advertising scope and Q36-Q51 supersede the prior platform-native-only launch prohibition. Detailed provider workflows and execution contracts remain U2/U6 blockers.
- **Depends on:** REQ-109, REQ-114

#### Acceptance criteria


- [ ] Automate paid advertising for approved entries admitted within verified capacity, funding and authority, without another per-entry opt-in. Public waiting creatives receive no paid spending or started trial. Expanded goals, admissions, baseline/boost/provider allocation, continuation, edits and stopping are atomically specified in supplemental REQ-146 through REQ-164, with actual provider capability still gated.
- [ ] Map the same unchanged approved creative across Facebook/Instagram/TikTok as one competition entry with provider breakdown and no duplicate metrics. Platform-native ads can be mapped for reporting, but require explicit enrollment and validated control rights before automated management; follow supplemental REQ-147. Stripe remains financial, not an advertising-metrics source.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Every acceptance criterion above is exercised against application behavior or faithful provider test-mode contracts, including failure cases; demo-only success does not satisfy it.
- **Evidence:** Requirement-mapped test output, redacted records and browser traces for user-facing behavior.

### REQ-133 - Withdrawal and discretionary removal

- **Statement:** The application shall stop future participation on withdrawal or discretionary manager removal.
- **Rationale:** Accepted follow-up Q22/Q29.
- **Depends on:** REQ-106, REQ-109, REQ-112

#### Acceptance criteria

- [ ] The campaign manager can remove an ad for any reason with a recorded stated reason, without evidence uploads or another approver. Hide the public entry and end future participation at the recorded effective time. Immediately block new advertising allocations and request pauses through selected supported provider controls. Keep its funded slot occupied and show "Stopping advertising" until every relevant paid placement is confirmed stopped; preserve incurred and outstanding obligations before funding a replacement.
- [ ] Preserve history and eligibility of activity before the effective withdrawal/removal time. Activity at or after that time earns neither commission nor competition credit. The tracked link continues supporting adoption.is. Removal does not silently disqualify past activity.
- [ ] A failed or uncertain provider pause immediately alerts the campaign manager and platform administrator with the affected placements, retaining unresolved status. A manager may use native platform controls as fallback; reconcile provider state before reporting completion or freeing capacity. This stopping protocol also applies to performance cuts, which do not hide the public ad or establish withdrawal/disqualification.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Exercise all criteria against application behavior or faithful provider test-mode contracts, including boundary, denial, duplicate and recovery paths. Demo-only success is insufficient.
- **Evidence:** Requirement-mapped automated output, redacted durable records and browser traces for user-facing behavior.

### REQ-134 - Disqualification

- **Statement:** The application shall let the manager make selected entry activity ineligible for selected date ranges.
- **Rationale:** Accepted follow-up Q29.
- **Depends on:** REQ-106, REQ-117, REQ-120, REQ-133

#### Acceptance criteria

- [ ] Record the selected entries, dates, manager, time and stated reason. No evidence upload or second approver is required. Preserve affected records and unrelated valid activity.
- [ ] Exclude selected activity from unfinalized results. Changes to finalized awards require REQ-136/REQ-137, never silent revision. Ad removal alone does not establish a fraud finding.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Exercise all criteria against application behavior or faithful provider test-mode contracts, including boundary, denial, duplicate and recovery paths. Demo-only success is insufficient.
- **Evidence:** Requirement-mapped automated output, redacted durable records and browser traces for user-facing behavior.

### REQ-135 - Temporary fraud suspension

- **Statement:** The application shall support reversible suspension of an entry for suspected fraud.
- **Rationale:** Accepted follow-up Q13.
- **Depends on:** REQ-106, REQ-119, REQ-128

#### Acceptance criteria

- [ ] Require a recorded manager reason, hide the entry, stop new placements, hold its unpaid earnings and hold unfinalized prize periods in which it could affect the winner. Preserve incoming evidence and existing finalized records.
- [ ] While fraud suspension applies, deny new baseline/boost allocations and use the temporary-pause protocol for existing paid placements, retaining the funded slot and operator alerts. Suspicion alone does not release the slot, confiscate earnings or rewrite finalized awards.
- [ ] Require explicit manager resolution. Suspicion alone does not confiscate earnings or revise finalized awards. Preserve the resolution and any continued hold.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Exercise all criteria against application behavior or faithful provider test-mode contracts, including boundary, denial, duplicate and recovery paths. Demo-only success is insufficient.
- **Evidence:** Requirement-mapped automated output, redacted durable records and browser traces for user-facing behavior.

### REQ-136 - Finalized prize correction

- **Statement:** The application shall require explicit manager confirmation to correct a finalized prize.
- **Rationale:** Accepted follow-up Q30.
- **Depends on:** REQ-106, REQ-118, REQ-119, REQ-128

#### Acceptance criteria

- [ ] Before confirmation, show original winner, corrected winner and changed prize amounts. Without confirmation, no award or payment authorization changes.
- [ ] Preserve the original result and append a visible correction record with manager, time and financial changes. Show the corrected public winner without private financial details. Include corrected obligations in freshly approved batches without duplicate obligations or payments.
- [ ] Ordinary imports, refunds and removal actions cannot trigger this correction automatically. No correction initiates automatic bank debits. Already-paid mistakes follow REQ-137.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Exercise all criteria against application behavior or faithful provider test-mode contracts, including boundary, denial, duplicate and recovery paths. Demo-only success is insufficient.
- **Evidence:** Requirement-mapped automated output, redacted durable records and browser traces for user-facing behavior.

### REQ-137 - Already-paid prize loss

- **Statement:** The application shall classify an erroneous prize already paid as a loss.
- **Rationale:** Accepted follow-up Q35.
- **Depends on:** REQ-106, REQ-122, REQ-128, REQ-129, REQ-136

#### Acceptance criteria

- [ ] A confirmed correction of an erroneous prize already paid preserves the original payment and labels its erroneous paid amount as a loss, separate from commission-refund balances. Do not recover it through automatic bank debits or future-earnings offsets.
- [ ] Record and pay the correct creator's prize through the approved-payment process. The original payment or loss does not satisfy the corrected obligation. If funding or recipient eligibility blocks execution, retain the amount owed visibly rather than marking it paid; do not consume unrelated reserved earnings or advertising allocations.
- [ ] Notify the campaign manager of the loss and corrected-payment status, preserving the selected recipient for this prize event. Reprocessing cannot duplicate losses or corrected payments; this does not confer platform-administrator permissions.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Exercise all criteria against application behavior or faithful provider test-mode contracts, including boundary, denial, duplicate and recovery paths. Demo-only success is insufficient.
- **Evidence:** Requirement-mapped automated output, redacted durable records and browser traces for user-facing behavior.

### REQ-138 - Creative upload validation

- **Statement:** The application shall validate uploads against accepted submission limits.
- **Rationale:** Accepted follow-up Q14/Q24/Q25.
- **Depends on:** REQ-108

#### Acceptance criteria

- [ ] Accept JPEG/PNG photos up to 100,000,000 bytes each, at most 10 photos per entry and up to 1,000,000,000 photo bytes total. The 100 MB allowance is per photo, not shared.
- [ ] Accept MP4 video with H.264 video and AAC audio or no audio track, up to 5,000,000,000 bytes and at most 60 seconds. Limits use decimal MB/GB.
- [ ] Reject unsupported formats or excessive size, duration or photo count with an actionable explanation. Exact-limit files are not rejected solely for exceeding a limit. Disclose that submission acceptance does not guarantee platform acceptance.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Exercise all criteria against application behavior or faithful provider test-mode contracts, including boundary, denial, duplicate and recovery paths. Demo-only success is insufficient.
- **Evidence:** Requirement-mapped automated output, redacted durable records and browser traces for user-facing behavior.

### REQ-139 - Creator-owned submission fixes

- **Statement:** The application shall leave creator-side media corrections to the creator.
- **Rationale:** Accepted follow-up Q15/Q27.
- **Depends on:** REQ-108, REQ-109, REQ-138

#### Acceptance criteria

- [ ] Staff do not fix, reformat or make micro changes to submitted media. Report submission/formatting problems to the creator rather than silently modifying files.
- [ ] Creator corrections follow the pre-first-approval and post-approval identity rules in REQ-108. Signup permission does not authorize staff editing or remove manager creative review.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Exercise all criteria against application behavior or faithful provider test-mode contracts, including boundary, denial, duplicate and recovery paths. Demo-only success is insufficient.
- **Evidence:** Requirement-mapped automated output, redacted durable records and browser traces for user-facing behavior.

### REQ-140 - Public ad outage diagnostics

- **Statement:** The application shall start diagnostics after more than one minute of continuous ad unavailability.
- **Rationale:** Accepted follow-up Q28/Q31.
- **Depends on:** REQ-103, REQ-109, REQ-139

#### Acceptance criteria

- [ ] Measure continuous unavailability from first detected failure. During the first minute show unavailable media and retry access. After confirmed failure exceeds 60 seconds, temporarily hide the public ad and start diagnostics to identify the failure point; exactly 60 seconds does not cross that threshold.
- [ ] One visitor connection failure alone cannot hide a working ad. Retain incident/diagnostic results without editing creator media. Technical outages do not change approval, disqualify entries, cancel valid earnings or stop working external placements. Otherwise-valid tracked links remain usable.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Exercise all criteria against application behavior or faithful provider test-mode contracts, including boundary, denial, duplicate and recovery paths. Demo-only success is insufficient.
- **Evidence:** Requirement-mapped automated output, redacted durable records and browser traces for user-facing behavior.

### REQ-141 - Public ad outage recovery

- **Statement:** The application shall automatically restore a technically hidden ad after confirmed recovery.
- **Rationale:** Accepted follow-up Q32.
- **Depends on:** REQ-140

#### Acceptance criteria

- [ ] Restore after two successful availability checks 30 seconds apart, not after one success or checks less than 30 seconds apart. Do not override separate removal, suspension, disqualification or approval restrictions.
- [ ] Notify the sole manager of outage and recovery through REQ-142. Preserve incident history and original creative; recovery creates no new entry or tracked link.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Exercise all criteria against application behavior or faithful provider test-mode contracts, including boundary, denial, duplicate and recovery paths. Demo-only success is insufficient.
- **Evidence:** Requirement-mapped automated output, redacted durable records and browser traces for user-facing behavior.

### REQ-142 - Operational alert delivery

- **Statement:** The application shall retain operational alerts independently of email delivery.
- **Rationale:** Accepted follow-up Q19.
- **Depends on:** REQ-106, REQ-126

#### Acceptance criteria

- [ ] Attempt email immediately and retry failed delivery after 1, 5, 15 and 60 minutes. After exhaustion show "Email delivery failed" while retaining the problem on the manager dashboard. Email delivery does not resolve the underlying incident.
- [ ] Repeated checks update one incident instead of generating repeated alerts. Recovery produces one recovery notice. Existing import outages, prize-replenishment shortfalls, batch-ready notices, public-ad outage/recovery and prize-loss notices retain campaign-manager delivery. Capacity/waiting, failed or uncertain stopping, unavailable delivery providers, provider-interrupted evaluations, pause-reserved slots, financial safety pauses and insufficient initial baseline-trial coverage immediately notify both campaign manager and platform administrator on detection. These new financial/delivery/slot events do not wait for the separate more-than-five-minute import-liveness threshold. Monitor sampling intervals and delivery-latency bounds remain U6/U8 acceptance precision, not an implied instantaneous provider signal.
- [ ] Every detected launch blocker immediately alerts both operators, including the requesting user's designated operator identity, and remains visibly tracked with reason, resolution role and status until resolved. Missing required approval/configuration/funding/contracts and failed required verification are blockers even before live operation. Update the same unresolved incident without duplicate alerts and send a resolution notice. An email failure preserves dashboard visibility and uses the established retry policy. No claim of live monitoring or instantaneous provider detection follows from this requirement; exact monitor coverage/detection/dispatch verification remains U6/U8 work.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Exercise all criteria against application behavior or faithful provider test-mode contracts, including boundary, denial, duplicate and recovery paths. Demo-only success is insufficient.
- **Evidence:** Requirement-mapped automated output, redacted durable records and browser traces for user-facing behavior.

### REQ-143 - Blocked payment recipients

- **Statement:** The application shall hold restricted-recipient payments without blocking other approved recipients.
- **Rationale:** Accepted follow-up Q18.
- **Depends on:** REQ-128, REQ-129, REQ-130

#### Acceptance criteria

- [ ] Retain a restricted recipient's earnings as reserved and visible with private setup/restriction guidance; allow other approved recipients to be paid. Provider onboarding and eligibility semantics remain O-02 investigation work.
- [ ] After resolution, require fresh approval of the held payment. Do not substitute another destination or retry an uncertain transfer as if it had failed.

#### Verification

- **Command:** Not assigned: production verification does not yet exist; V-01 blocks implementation readiness.
- **Pass condition:** Exercise all criteria against application behavior or faithful provider test-mode contracts, including boundary, denial, duplicate and recovery paths. Demo-only success is insufficient.
- **Evidence:** Requirement-mapped automated output, redacted durable records and browser traces for user-facing behavior.

## Constraints

- The public homepage, viewer experience and leaderboard are release-critical. Launch serves adoption.is and one campaign only.
- This document does not authorize implementation, deployment, live invitations, email, charges, transfers or payouts. Later validation uses isolated accounts and provider test modes.
- Secrets stay server-side. Public routes must not expose private earnings, donor/payment details, invitation credentials or provider credentials.
- Nonprofit-owned advertising assets and Slander-owned developer applications use provider-approved delegated access. Initial provider setup and identity/agreements are guided outside fully self-service Slander provisioning; automated ad operation is enabled only after mappings, permissions and financial readiness are verified.
- Provider polling is not a freshness guarantee. Missing metrics remain identifiable and block finalization.
- Competition boundaries use America/Chicago. The 48-hour finalization delay and 24-hour funding check use elapsed time, including across daylight-saving transitions.
- Internal allocations and actual provider settlements must remain distinguishable. Do not label a ledger-only reallocation as a completed bank transfer.
- Historical demo policy, sample money, fictional campaigns, role switches and simulated statistics are not production requirements unless explicitly adopted here.

## Dependencies and assumptions

- Clerk handles authentication and access recovery; no internal recovery system is approved. Investigate supported identity matching, expiry/replay, revocation and sole-manager recovery before integration acceptance (O-07).
- Stripe is the selected hosted fundraising checkout and financial integration direction. Custody, creator onboarding, payout capability and prize-fund movement remain unvalidated (O-02). Checkout alone does not establish a payout architecture.
- Instagram, Facebook and TikTok are the selected paid-ad sources. Authorized credentials, scopes, account mapping, comparable metrics and completeness require O-01. The interview phrase API keys does not prescribe an unsupported provider credential mechanism.
- The first-party documentation findings and limitations are recorded in docs/provider-research-adoption-is-launch.md. They do not establish provider-account capability or a complete reporting contract. In particular, Clerk invitation possession and forwarded-link protection require isolated verification and mitigation for REQ-105; neither a verified email label nor documentation alone proves that requirement.
- One person may hold campaign-manager and platform-administrator permissions at first launch. They remain distinct roles, and capacity request/approval are separate recorded actions; ordinary creator payments retain campaign-manager approval without a mandatory second human. Role assignment/recovery details remain U1/U7 work.
- Dates, earning cutoff, commission rate, fixed daily/weekly prize amounts, positive daily/weekly competition targets, weekly replenishment amount and its schedule are required locked campaign configuration. Exact values are chosen at campaign creation, not inferred from examples. Advertising controls have separate edit permissions and performance policies are assigned by admission, as selected in Q56/Q57.
- No campaign-wide numerical success KPI or public creator self-enrollment avenue was agreed. Creator enrollment starts with email invitations. Automated advertising is now selected scope, conditional on supported provider access, approved funding and the remaining execution contracts.
- GitHub publication is separate from this draft. The configured issue repository resolves to a renamed target; confirm the intended target before future publication rather than silently changing it.

## Open questions

Settled product decisions are resolved records, not questions to ask again. Provider investigation and executable verification remain blockers. Present a new product trade-off only if investigation establishes one.

| ID | Required resolution | Impact / next work |
| --- | --- | --- |
| O-01 | Map paid impressions and total link-click fields, account scopes, reporting timezone, backfills, rate limits and completeness for each provider. Decide what happens if a provider cannot supply comparable metrics. | Open: candidate contracts, provider questions and exact isolated-account checks are in [the O-01 validation note](o-01-reporting-validation.md). Primary-source research and test-account validation are required before integration design is committed. No claim of guaranteed 30-second measurements. |
| O-02 | Validate Stripe confirmation/refund semantics, beneficiary/custody setup, payout onboarding and eligibility, available-balance evidence, and whether prize replenishment is a ledger allocation or supported actual transfer. | Technical validation and financial/legal review where needed; no invented payout or custody architecture. |
| O-03 | Resolved: whole USD cents, half-up per-donation rounding, deterministic tied-prize remainders and remaining-amount partial/cumulative refund recalculation. | REQ-118, REQ-120, REQ-121 and REQ-129. Do not reopen. |
| O-04 | Resolved: prospective removal, discretionary disqualification, temporary fraud suspension, confirmed finalized-prize corrections and already-paid prize losses. | REQ-133 through REQ-137; no evidence gate for discretionary removal/disqualification, no automatic creator bank debits. Notify the sole manager/admin of losses. |
| O-05 | Resolved: upload sizes/units/count, formats/codecs, 60-second duration, creator-only fixes, revision identity and signup-use permission. Other creator legal matters use the pre-signup agreement. | REQ-107, REQ-108 and REQ-138/REQ-139. No per-submission or placement creator consent gate. |
| O-06 | Resolved: Wednesday-noon payment preparation, exact-content approval, blocked recipients, notification retries and public-ad outage/recovery. | REQ-128 and REQ-140 through REQ-143. Replenishment retains its separate 24-elapsed-hour precheck, execution recheck and hourly full-or-nothing shortage retries. |
| O-07 | Investigate Clerk-supported identity recovery, invitation matching, expiry/replay, revocation and sole-manager recovery without inventing an internal recovery system. | Provider research and isolated integration verification, not another recovery-policy interview. |
| V-01 | Supply and exercise unattended production verification for every requirement, including authorization, provider contracts, time boundaries, money and recovery. | Demo tests do not certify launch readiness. Complete criterion-to-command mapping before implementation-readiness claims. |

The executable-check design and current red baseline are recorded in docs/adoption-launch-verification-plan.md. Those planned production tests are absent; a missing-file failure does not exercise application behavior and does not satisfy V-01.

## Decision traceability

Round notes below preserve what was known at the time. Later answers supersede earlier open descriptions. All accepted follow-up decisions through Q35 are now reconciled above; historical phrases such as "remain open" or "pending reconciliation" do not reopen a subsequently settled decision.

### Follow-up grill-with-docs, round 1

The following accepted decisions supersede conflicting original requirements and summaries. This follow-up does not authorize implementation. Existing audit files describe the preceding draft and have not been rerun.

- Q1 / REQ-113 / O-03: Campaign currency is USD. Precision, commission rounding and indivisible split-prize remainders await explicit confirmation; the answer explicitly confirmed currency only.
- Q2 / REQ-113: All campaign rules are set in stone when the campaign is created, independently of invitations or creator acceptance. Creation requires the dates, earning window, commission rate, score targets, prizes and schedules already enumerated in REQ-113; subsequent changes to these rules are rejected. This replaces the original participation-triggered lock. The separate funding milestone discrepancy in REQ-122 remains unconfirmed.
- Q3 / REQ-108 through REQ-110 / O-05: Replacement creative creates a new competition entry and tracked fundraising link requiring fresh approval. The original entry, approval, metrics, attribution and history remain intact; the replacement inherits none of its approval or results. Title/description edits without replacement creative retain entry/link identity. The same unchanged creative across multiple platforms remains one entry.
- Q4 / REQ-111, REQ-112, REQ-116: Competition periods and earning windows include their start instant and exclude their end instant. Use the provider-authoritative successful-payment time, not notification receipt time, including delayed/reordered notifications. Qualifying donations inside the earning window but outside eligible prize periods earn commission without competition fundraising credit. Exact provider state/time mapping remains O-02.
- Q5 / REQ-116 / O-04: Only complete Chicago calendar days and complete Monday-Sunday weeks contained within campaign competition dates award prizes. Partial opening/closing periods have no prize; otherwise-eligible donations can still earn commission. Removal, fraud and exceptional finalized corrections remain open.
- Q6 / REQ-117, REQ-119, REQ-127: Evidence-backed manager-certified corrections take precedence for the exact entry, metric and time range until explicit manager release. Certification can satisfy a completeness hold only for its covered scope. Retain and flag conflicting later imports to the manager; never silently substitute them or double-count matching reports. Preserve correction, import and release history.

### Follow-up grill-with-docs, round 2

- Q7: Accepted whole-USD-cent accounting, per-donation commission rounding to nearest cent with half cents up, and exact tied-prize remainder allocation by oldest entry then stable entry ID. Resolves O-03.
- Q8: Creators may accept terms and submit before funding arrives; the full promised prize schedule and initial advertising allocation must be funded before competition starts. Locked rules cannot change to fit a shortage. Resolves the round-1 funding milestone ambiguity.
- Q9: Automatically finalize within five minutes once the 48-hour delay and completeness conditions are satisfied, including recovery of overdue ready periods, without manager action and without duplicate awards.
- Q10: Later imports/manual corrections do not change finalized winners or prize obligations automatically; retain discrepancies and notify the manager. Exceptional fraud/error corrections need a separate explicit audited manager action, with its rules still open.
- Q11: Accepted full-or-nothing fixed replenishment, manager notification and hourly shortage retries without consuming reserved earnings or duplicating uncertain/completed transfers. The user additionally expects a 48-hour-prior check for the next two days of competition payouts. Its reference point, covered obligations, reservation behavior and relationship to the original 24-hour check are not yet settled; do not assume them.

### Follow-up funding-clock clarification

- The user withdrew the proposed 48-hour check and returned to the original 24-hour advance funding check. Their corrected example is midnight the prior day for midnight execution the next day, not midnight-to-noon on the same day. This supersedes the unresolved 48-hour/two-day proposal in round 2 Q11.
- Preserve REQ-124: check 24 elapsed hours before the scheduled replenishment and again at execution; do not introduce a separate rolling two-day coverage policy. The example does not independently select the actual weekly creator-payment schedule or change the replenishment amount. Existing elapsed-hour semantics remain authoritative across daylight-saving transitions.

### Follow-up grill-with-docs, round 3

Answers captured pending acceptance-criteria reconciliation. Status remains Blocked; audits have not been rerun. Unaccepted recommendations are not decisions.

- Q12: Withdrawal and disqualification are separate actions. Specific withdrawal effects on placements, visibility, earnings, eligibility and history remain unconfirmed.
- Q13: Accepted reversible manager suspension for suspected fraud: hide the entry, stop new placements, hold its unpaid earnings and hold unfinalized prize periods in which it could affect the winner. Preserve incoming evidence and finalized records. Require a reason and explicit resolution; suspicion alone does not confiscate earnings. Confirmed-fraud outcomes and finalized-award corrections remain open.
- Q14: Selected 5 GB ad uploads and 100 MB per individual photo. Multiple photos add storage separately; 100 MB is not a shared multi-photo limit. Submission limits do not promise platform acceptance. Duration, formats/codecs, photo count, combined-ad limit and exact byte units remain unconfirmed.
- Q15: Creators make all micro changes and fix creator-side submission or formatting issues; campaign staff do not fix submissions. The proposed staff editing permission was rejected. Ownership, creative-use permissions, use duration and rights warranties remain unconfirmed. Clarify corrective-media identity against Q3's new-entry rule.
- Q16: Accepted Wednesday at noon America/Chicago payment-batch preparation for the preceding Monday-Sunday's eligible commissions and finalized prizes plus unpaid eligible carryover. Manager approval remains mandatory; late approval delays execution. Recovery prepares one catch-up batch without duplicates. The separate prize-replenishment clock is unchanged.
- Q17: Accepted recalculating commission on the remaining eligible donation amount after partial refunds using agreed rounding, recording only the difference from commission already recognized. Cumulative reversals cannot exceed original commission. Already-paid reversals become a negative commission balance offset against future commissions, not bank debits or fixed prizes. Ordinary refunds do not reopen finalized awards.
- Q18: Accepted holding a restricted recipient's payment while retaining reserved, visible earnings and private setup/restriction guidance. Other approved recipients can be paid. Resolution requires fresh approval of the held payment; never substitute destinations or treat uncertain transfers as failed.
- Q19: After clarification, accepted an immediate alert-email attempt with retries after 1, 5, 15 and 60 minutes. Keep the underlying problem visible on the manager dashboard; if all attempts fail, show email delivery failure. Notification delivery does not resolve the underlying incident. Repeated checks update the same incident; recovery creates one recovery notice as previously proposed.
- Q20: Use Clerk authentication and Clerk-supported access recovery, not an internally built recovery system. Investigate provider behavior; do not infer acceptance of all proposed expiry/replay/revocation details or an internal identity-verification process. Existing application authorization requirements remain unchanged.
- Q21: After clarification, accepted keeping last-known public standings visible with their update time and a warning that some results are delayed. Missing data is not replaced with zero, and results are not labeled final until required data is complete. The user explicitly confirmed that the response numbered 20 approved Q21. Empty-campaign and media-failure behavior were not part of this clarified approval and remain open.
- Q22: No question Q22 was posed and no answer was supplied; no decision recorded.

Reconciled 2026-11-07: acceptance criteria and the open-items table include these resolutions. Do not ask these settled decisions again.

### Follow-up grill-with-docs, round 4

Accepted answers below supersede conflicting earlier open-item descriptions. Requirement reconciliation and audit reruns remain pending; status remains Blocked.

- Q22: Accepted withdrawal: hide the competition entry and stop its placements. Activity before withdrawal retains eligibility; activity after withdrawal earns neither commission nor competition credit. The tracked fundraising link continues accepting donations for adoption.is. Preserve history. Withdrawal remains distinct from disqualification.
- Q23: The campaign manager may remove an ad for any reason; evidence is not a prerequisite. A campaign guideline-policy violation can be the stated reason. This rejects the proposed evidence requirement for removal, but does not authorize invented evidence, establish that fraud occurred, or settle retroactive earnings cancellation, finalized-award corrections or bank debits. Clarify the relationship between discretionary removal and disqualification. Evidence-backed certified metric corrections remain a separate existing concept.
- Q24: Accepted JPEG/PNG photos and MP4 video with H.264 video and AAC audio, or no audio track; maximum video length is 60 seconds. Creators correct unsupported files. Submission acceptance does not guarantee ad-platform acceptance.
- Q25: Accepted up to 10 photos per competition entry, each up to 100 MB, totaling up to 1 GB of photos. Use decimal byte units: 100 MB is 100,000,000 bytes and 5 GB is 5,000,000,000 bytes. The previously accepted 5 GB ad-upload limit and separate platform-limit disclaimer remain unchanged.
- Q26: Creative-use permission is granted when creators sign up for a campaign; no additional explicit approvals are required. Capture that permission through campaign participation acceptance, not per submission or placement. Do not infer acceptance of all previously proposed ownership, warranty, use-duration or retention terms from this answer. Campaign staff still do not edit creator submissions.
- Q27: Accepted creator corrections before first approval within the same competition entry and tracked fundraising link, retaining previous submissions and reviewing corrected files. After approval, media replacement creates a new entry and tracked fundraising link. Title/description-only edits retain entry identity.
- Q28: Accepted honest empty and failed-media states, retry access and otherwise-valid fundraising-link continuity without fictional ads/results. Added an outage feedback loop: if an ad remains down on the site for longer than one minute, start diagnostics to identify the failure point and temporarily take the public ad down until the issue is resolved. Temporary removal timing, diagnostic scope, restoration criteria and earnings/placement effects need clarification; do not equate a technical outage with withdrawal or disqualification or infer permission to modify creator media.

### Follow-up grill-with-docs, round 5

Confirmed 2026-11-07. These decisions supersede earlier unresolved descriptions. Do not ask the removal/disqualification distinction again. Requirement reconciliation and audit reruns remain pending; status remains Blocked.

- Q29: Accepted discretionary manager removal for any reason without evidence uploads or another person's approval. Ordinary removal stops future participation while preserving valid past earnings. Disqualification is the separate action that makes selected entries' activity in selected date ranges ineligible; record the manager's stated reason without requiring evidence. This settles the distinction and supersedes Q12/Q23's open descriptions. Existing evidence-backed certified metric corrections are a different action.
- Q30: Accepted a separate explicit manager action to correct a finalized prize. Before confirmation, show the original winner, corrected winner and changed prize amounts. Preserve the original result and append a visible correction record; never silently overwrite history or automatically debit a creator's bank account. Treatment of prizes already paid remains a separate unresolved operational decision.
- Q31: Accepted continuous-failure measurement from the first detected failure. Show an unavailable message during the first minute. After more than 60 seconds of confirmed unavailability, temporarily hide the public ad and start diagnostics. One visitor's connection failure alone cannot hide an otherwise-working ad.
- Q32: Accepted automatic restoration after two successful checks 30 seconds apart and manager notification of outage and recovery. A technical outage does not change approval, disqualify an entry, cancel valid earnings or stop working external placements. Diagnostics do not edit creator files.
- Q33: Accepted creator ownership and confirmation of permission to authorize included content, with campaign-signup permission covering public display and advertising of submissions throughout that campaign without further approvals. New advertising use ends at withdrawal or campaign completion; private records remain available to explain past results and payments. Campaign staff do not edit submissions. Other creator legal matters are handled through a use agreement before signup; do not reopen them as individual product-approval questions or treat this PRD as legal drafting.
- Q34: Accepted that payment approval binds the exact reviewed recipients and amounts. Changes after approval, including refunds or prize corrections, require fresh approval of the changed batch. Completed payments remain unchanged; reconcile uncertain payment outcomes before retrying. Do not send a changed amount under an old approval.

### Follow-up grill-with-docs, round 6

- Q35 / 2026-11-07: An erroneous prize already paid is labeled as a loss; pay the correct creator and notify admin. Admin is the existing sole campaign manager. REQ-137 keeps loss recognition separate from commission adjustments and preserves payment approval, funding safeguards, recipient eligibility and duplicate prevention. This supersedes the proposed manual recovery of already-paid prizes.

### Clarification checkpoint - 2026-11-09

The user confirmed that product clarification is complete for now. Preserve the settled answers through Q35. O-01, O-02 and O-07 remain provider-validation blockers; V-01 and the remaining semantic acceptance gaps remain verification/readiness work. Ask a new product question only when validation establishes a concrete trade-off, resuming at Q36 with facts and a recommendation. This checkpoint is not final consolidated document approval or implementation authorization. Status remains Blocked; final review follows evidence collection.

### Follow-up grill-with-docs, round 7 - advertising activation and continuation

- Q36 / 2026-11-10: The user specified baseline paid advertising for every entering creative and a different paid amount for a selected top group. Initial campaign creator capacity depends on the cost per creator the nonprofit is willing to fund, with an opportunity to grow based on advertising results. After an evaluation period, ads below a defined performance minimum stop receiving campaign advertising spend but remain publicly viewable on Slander. This supersedes the recommendation that the manager separately opt each approved creative into paid advertising. Existing creative review and provider/funding safeguards are not waived.
- Q36 unresolved precision: The user said the top count is set by the "creator", whereas the prior GitHub decision and glossary assign it to the campaign manager. Confirm the actor rather than silently changing permissions. Also resolve whether capacity/funding is per creator or per competition entry, the amount/time unit and fixed-versus-pooled baseline model, and the performance metric, threshold, evaluation window and subsequent reactivation behavior. No amounts, windows, creator submission cap, admission guarantee or growth rule have been inferred. Earlier baseline-plus-boost pool and daily-ranking decisions remain the prior authority unless explicitly superseded; compatibility with the new cost-based capacity model needs confirmation.
- Q37 / 2026-11-10: The user corrected "creator" to campaign manager. The campaign manager retains control of the top-ad count; the glossary's actor remains correct.
- Q38 / 2026-11-10: The user accepted a manager-set fixed daily baseline advertising amount per approved creative, with boosts added on top. This replaces dilution of a fixed baseline pool as more creatives join. Capacity must respect that funded per-creative cost rather than automatically reducing existing baseline amounts to admit more entries. The interaction with boost percentage, daily/total envelopes, reservations, partial days and later loss of spending eligibility remains to be specified; no numerical baseline amount was selected.
- Q39 / 2026-11-10: The user rejected continuation based solely on fundraising efficiency. The nonprofit chooses the performance minimum, taking account of more than fundraising, similarly to the leaderboard. This does not yet choose the existing composite score, configurable component weights, individual metric thresholds or another precise evaluation method. Advertising continuation is separate from public availability. No threshold, evaluation duration, reactivation rule or change to public competition scoring was approved.
- Q40 / 2026-11-10: The user chose nonprofit-configurable contribution weights for baseline/continuation performance instead of mandatory 40/30/30 weights. Public competition weights remain unchanged. Metric set, weight validation, normalization targets, passing threshold and evaluation window still need precise rules; no numerical values or unrestricted custom metrics were inferred.
- Q41 / 2026-11-10: The user accepted manager-configured initial trial duration, disclosed before admitting creatives, starting from confirmed paid delivery. Incomplete provider reporting postpones the performance decision rather than counting as failure. No duration was selected; paused time, evaluation cadence after the trial, and funding safety during reporting delays remain open.
- Q42 / 2026-11-10: The user accepted capacity measured in approved ads, not people: ten approved-ad slots are consumed by ten ads even if some belong to the same creator. At capacity, notify the campaign manager and platform administration and offer expansion. Capacity is not fixed for the campaign's lifetime and may grow depending on campaign manager and administrator decisions. This changes the former blanket immutability interpretation for capacity. The mention of platform administration reopens the older sole-manager/admin equivalence in REQ-106: expansion permissions, whether both must approve, and whether one person may hold both roles remain unresolved. Slot release after paid-spend cutoff and handling additional submissions are not yet selected. Funding and approved spending limits still constrain any expansion; no automatic increase was authorized.
- Q43 / 2026-11-10: The user accepted the existing capped square-root method for advertising continuation, using impressions, link clicks and confirmed fundraising with independently configured continuation weights, targets and a minimum score. Weights total 100%; a zero weight ignores its metric. Scores meeting or exceeding the configured threshold pass. This does not alter public competition scoring. Evaluation-window semantics and exact settings validation remain to be specified.
- Q44 / 2026-11-10: The user accepted campaign-manager-requested and platform-administrator-approved capacity expansion, following funding and spending-limit checks. Both receive capacity notifications. Capacity expansion alone cannot raise spending limits. This supersedes REQ-106's sole-operator/no-second-approver assumption specifically for expansion; it does not add a second approver for creator payments or other operations. Role overlap, assignment/recovery and other administrator permissions remain unresolved.
- Q45 / 2026-11-10: The user accepted capacity counting ads receiving campaign-funded advertising, including initial trials. Ads cut for underperformance remain publicly viewable and release their funded slots for new creatives. A capacity of ten can therefore coexist with thirteen public ads when three have lost spending eligibility. External pause confirmation, residual obligations and financial headroom must still be reconciled before replacement spend; no guarantee of instant external cessation was established.
- Q46 / 2026-11-10: The user accepted counting the trial from first confirmed paid delivery, with each trial day equal to 24 elapsed hours and confirmed pauses excluded. At trial end, evaluate activity from that trial window once required reporting is complete. Reporting delays postpone judgment, not cause failure. Provider evidence for partial/multi-placement pauses and trial coverage remains technical validation work; no numeric duration was selected.
- Q47 / 2026-11-10: The user accepted continuing submissions at capacity, public display of manager-approved waiting creatives, and automatic oldest-waiting-approved-first admission when capacity and sufficient funding become available. Trial timing starts only at first confirmed paid delivery. The user additionally required immediate campaign-manager and administrator alerts "after that happens" to resolve the error. The exact trigger (entering the queue, automatic admission, or both) and alert-resolution condition need confirmation rather than inference. Queue tie-breaking and retrial priority remain execution details to specify.
- Q48 / 2026-11-10: The user accepted manager-authorized retrials for cut ads, subject to capacity and funding, retaining earlier trial/cutoff history. Improved public activity alone does not automatically restart advertising. Administrator approval is required when capacity expansion is necessary; no additional administrator approval for an otherwise in-capacity retrial was added. Retrial queue priority and any repeat-trial limit remain open.
- Q49 / 2026-11-10: The user accepted immediate campaign-manager and platform-administrator alerts when an approved creative must wait because capacity is full. Keep the capacity issue visible while approved ads wait; resolve it when none remain waiting. Automatic admission requires no additional approval. Per-event delivery/deduplication and funding-only waiting states remain acceptance precision to specify; no provider error is inferred merely from capacity waiting.
- Q50 / 2026-11-10: The user accepted continuing evaluation after a passed trial, once per Chicago calendar day using the most recent full window of configured trial duration with confirmed pauses excluded. Apply continuation targets to that window; complete below-minimum results stop paid spending, while incomplete reporting postpones the decision. No permanent eligibility based on a strong initial trial. Exact daily execution time, provider coverage and spending safety during reporting delay remain to be specified.
- Q51 / 2026-11-10: The user accepted reserving fixed baseline funding first and applying the manager-selected boost percentage to the remaining allocatable daily funds. Split this pool across the selected top entries, including cutoff ties; leave remaining funds uncommitted. This supersedes the older percentage-of-total rule. Example accepted as illustration only: 100 USD daily headroom less 60 USD baseline leaves 40 USD, of which a 50% boost share assigns 20 USD to boosts and leaves 20 USD uncommitted. No real amounts were selected. Funding/reservations must avoid double counting; U4/U6 retain responsibility for authoritative headroom, existing obligations and execution.
- Q52 / 2026-11-10: The user accepted advertising contributions funding advertising only, without generating creator commissions, prize-fund replenishment or fundraising points in either score. Tracked fundraising donations retain their agreed credit/commission treatment. Buying amplification does not itself improve an ad's fundraising score. The historical demo commission split on advertising contributions is not selected production behavior. This classifies contributions; it does not establish provider-approved custody, fee treatment, refunds or an actual funding route.
- Q53 / 2026-11-10: The user's "EYs" is read as affirmative acceptance: public advertising contributors select a nonprofit campaign rather than earmarking an individual ad. The campaign's baseline-and-boost policy allocates spending; contributions cannot redirect another nonprofit's funds or buy a creator's rank. No donor-directed per-ad advertising allocation is in scope.
- Q54 / 2026-11-10: The user accepted adoption.is-only first production rollout without a public campaign selector, with reusable nonprofit-scoped identities, permissions, provider connections and financial records for later onboarding. Each nonprofit initially has one advertising campaign. This requires reusable isolation, not a full public multi-client marketplace at launch.
- Q55 / 2026-11-10: The user accepted distinct campaign-manager and platform-administrator permission roles while allowing one person to hold both for the initial rollout. Capacity-expansion request and approval remain separate recorded actions even for that person. Later nonprofit campaign managers do not automatically become platform administrators. This resolves the prior role-overlap uncertainty; it does not assign additional administrator powers or change creator-payment approval.
- Q56 / 2026-11-10: The user accepted campaign-manager edits to daily/total advertising limits, daily baseline amount, boost percentage and top count during a campaign. Record changes and apply them to future uncommitted spending within verified funding, without rewriting past allocations, cancelling incurred charges or altering competition/prize/commission rules. Capacity expansion retains administrator approval. Fixed daily baseline means a configured per-funded-ad amount rather than dilution as more creatives join; it does not freeze that operational amount for the campaign's lifetime. Exact activation timing, decreases below commitments and treatment of a partially spent day remain execution contracts to specify.
- Q57 / 2026-11-10: The user accepted binding each admission to its own recorded continuation weights, targets, passing score and trial duration version for the initial trial and subsequent evaluations. Changed policies apply to newly admitted ads and newly authorized retrials only. Existing ads retain their assigned policy; changing settings cannot retroactively turn a passing result into failure. Public competition/earnings rules remain locked independently.
- Q58 / 2026-11-10: The user accepted immediately stopping new spending allocations and requesting pauses across paid placements when an ad fails continuation or is withdrawn, while showing "Stopping advertising" and keeping its funded slot occupied until all relevant paid placements are confirmed stopped. Outstanding charges/obligations remain accounted for before funding replacement ads. This refines Q45's slot-release rule with an external-confirmation boundary. Performance cuts remain publicly visible; withdrawal keeps its existing public-hide behavior and eligibility cutoff.
- Q59 / 2026-11-10: The user accepted immediate alerts to campaign manager and platform administrator on rejected pause requests or uncertain outcomes, identifying affected placements. Keep stopping unresolved, allow manager native-tool fallback, and reconcile provider status before marking stopped or freeing the slot. Repeated attempts cannot conceal uncertainty or falsely report success. Exact supported pause/status contracts and safe write reconciliation remain U2/U6 provider-validation work.
- C6 disposition / 2026-11-10: Rechecked GitHub #20/#21 read-only: both remain open with no comments/evidence of approval. Prior #16/#19 selections establish a conditional Connect + Issuing baseline and required read/reconciliation surfaces, not an approved funding route or account capability. REQ-122 now explicitly separates collected money, Issuing availability, holds and platform liabilities and retains live readiness gates. Do not ask the user to determine provider facts or treat assent as validation. Actual route/read contracts remain U4/U5/U7 blockers.
- Q60 / 2026-11-10: The user accepted nonprofit ownership of advertiser accounts and associated brand identities, with Slander ownership of its developer applications and delegated operating access to nonprofit assets. This is intended ownership conditional on provider acceptance, not evidence of existing ownership/grants or an approved payer arrangement. Actual credentials, asset permissions and revocation/recovery remain validation work.
- Q61 / 2026-11-10: The user accepted guided provider-supported initial account creation, identity verification and required agreements, followed by connecting approved assets and verifying account, permission and financial mappings before automation. Reuse suitable existing accounts where permitted. Fully self-service account provisioning inside Slander is deferred; automated ad operation remains scope. No account setup or provider activity was authorized or performed by this decision.
- Q62 / 2026-11-10: The user accepted initial manager-selectable awareness and tracked-fundraising-page-visit advertising goals, subject to exact provider configuration validation. Advanced donation-conversion optimization is deferred. Nonprofit continuation weights remain independently configurable, and public leaderboard scoring is unchanged. Desired product goals are selected; no provider objective identifier or supported format/identity mapping was certified.
- Q63 / 2026-11-10: The user accepted a manager-configured spending split between Meta advertising across Facebook/Instagram and TikTok, applied to each funded ad's baseline and boost. Shares total 100%, with 0% allowed for either provider. Facebook/Instagram controls within Meta follow the validated supported provider configuration; independent network-level budget enforcement was not promised. Exact-cent conservation, change timing and unavailable-provider handling remain to be specified.
- Q64 / 2026-11-10: The user accepted holding an unavailable provider's share unspent while eligible healthy placements continue only with their own approved share, without automatic cross-provider redistribution. Alert both campaign manager and administrator and identify the blocked placement. The user specifically required an immediate administrator alert and the tightest possible feedback loop; there is no waiting period for that administrator notification. The manager may explicitly change the split. This does not override separate financial-data/funding safety gates, certify provider reporting or choose a new delivery-monitor sampling interval. Partial-delivery trial/evaluation effects and recovery handling remain open.
- Q65 / 2026-11-10: The user accepted explicit manager enrollment of externally created ads into automation after verifying nonprofit account, approved creative, tracked destination, control permissions and existing spending obligations. Unrelated account ads cannot be auto-enrolled. Reporting-only mapping remains distinct from management permission. Historical metrics, initial trial boundary and adopted-object reconciliation remain contracts to specify; no account access or enrollment occurred.
- Q66 / 2026-11-10: The user accepted requiring a complete normal-delivery evaluation window after provider recovery before an affected ad may fail continuation, preserving interruption history. Healthy placements may continue within their approved share and financial safeguards, without increasing the spending envelope. The user additionally required immediate notification and the tightest feedback loop; campaign manager and platform administrator are the operator recipients established for these delivery incidents. Recovery protection does not assign a new policy version or erase past results. Precise availability/coverage evidence remains provider validation work.
- Q67 / 2026-11-10: The user accepted first-time external enrollment using activity after enrollment and the next confirmed paid delivery for its initial managed trial, not lifetime provider totals. Preserve earlier reports, already eligible competition history and existing financial obligations. Enrollment cannot erase costs or reset an existing Slander trial; repeated enrollment is not a route to a new free trial. No retrospective change to donation/competition eligibility was selected.
- Q68 / 2026-11-10: The user accepted reserving funded slots during temporary manager pauses and provider interruptions, excluding paused trial time where applicable. Waiting ads cannot take those reserved slots. A performance cut, withdrawal or explicit end of funded participation releases capacity only after confirmed placement stopping. The user additionally requested immediate notification when pauses reserve slots, with the tightest possible feedback loop; notify campaign manager and platform administrator, consistent with the established capacity/delivery recipients. Exact monitor sampling and notification delivery bounds remain to be specified rather than inferred as zero latency.
- Q69 / 2026-11-10: The user accepted no new baseline or boost spending for withdrawn, performance-cut, temporarily paused, fraud-suspended or currently disqualified ads. A disqualification restricted to past dates does not itself bar otherwise-valid future participation. Select top boosts among eligible funded entries using unchanged daily leaderboard order; high public rank cannot override spending ineligibility. Temporary holds retain reserved capacity under the agreed rule. End-of-disqualification restart still requires applicable eligibility/authorization/provider/finance checks; no retroactive confiscation or changed public-visibility rule was selected.
- Q70 / 2026-11-10: The user explicitly changed startup allocation to fixed baseline per eligible funded ad plus equal division of the defined residual boost pool until usable daily scores exist, retaining any uncommitted remainder. Once usable daily scores exist, the selected top group receives boosts. This replaces the earlier full-allocatable-budget-equal startup behavior; missing or stale reporting cannot masquerade as startup. Provider spend shares and all funding/authorization gates continue to apply.
- U4 evidence checkpoint / 2026-11-10: Read-only extraction of GitHub #19's [published evidence note](https://github.com/Cooper2Rich/adoption-project/blob/14a3f26d2df44bdc28e691c4980da8ea510c3ffa/docs/campaign-finance-read-api-research.md) and #22 distinguishes collection from Issuing availability, provider-reflected authorization holds from additional obligations, late captures and platform delivery not yet charged. Its proposed allocator reservations/freshness/refund policies are design inferences, not approved numerical rules. No account-specific availability/read/funding capability or complete-liability guarantee was validated. No provider reserve percentage, settlement duration, freshness limit or polling guarantee is inferred.
- Q71 / 2026-11-10: The user accepted missing, inconsistent or outdated required financial balance/spending-obligation evidence blocking new allocations and triggering pauses of existing affected campaign placements. Immediately notify campaign manager and administrator, retain slots and show the unresolved financial condition; last-known balance is not permission to keep spending. Missing performance scores alone retain separate performance rules. Actual freshness criteria and restart authority remain open; no threshold was selected.
- Q72 / 2026-11-10: The user accepted full initial baseline-trial funding before admission, protected from other admissions/discretionary boosts, with overlap counted once and separate liability/risk coverage retained. Insufficiently funded ads wait with immediate operator alerts. The user additionally stated "baseline trial must be funded before opening a campaign". Record that additional milestone without assuming whether it means all configured slots or only currently admitted creatives, or whether opening blocks draft setup, creator intake, public crowdfunding or only paid competition launch. Clarify those two scope questions next. The 5-USD/day seven-day example was illustrative, not selected configuration.
- Q73 / 2026-11-10: The user accepted initial and expansion-slot funding but clarified that trial funding can vary as long as it meets funded-days and funded-ads requirements, depending on days open and slots open. Retain the full-trial-before-admission requirement and record this variable coverage condition; do not assume a fixed 350-USD campaign requirement from the illustration. Clarify whether days means each admitted ad's full trial or the full advertised campaign span, how late admissions fit, and what count is open versus merely configured future capacity. No numerical dates, amounts or automatic capacity changes were selected.
- Q74 / 2026-11-10: The user accepted defining opening as paid advertising/competition launch while allowing campaign setup, creator invitations/submissions/review, public advertising crowdfunding through approved provider flows and public display of approved waiting creatives beforehand. Paid launch waits for baseline coverage, promised prizes and safeguards. This resolves the crowdfunding-before-spend milestone without authorizing any current live setup, collection, publishing or spending; competition dates remain subject to the earlier locked-rule policy.
- Q75 / 2026-11-10: The user accepted baseline funding for the advertised campaign run, calculated from daily baseline per ad, open slots and funded campaign days, with enough funded days to complete each initial trial. A shorter funded opening is possible if those trial requirements are met. This clarifies Q73: a 30-day run requires 30 days of baseline coverage, rather than only a seven-day trial reserve; those numbers are illustrative, not configuration. Exact mid-day/DST proration, late admissions, released-slot funding and reserve resizing after authorized settings changes remain execution precision, not implicit permission to reduce promised coverage.
- Q76 / 2026-11-10: The user accepted stopping new admissions/discretionary boosts first during a shortfall, and pausing affected paid placements with slots retained if verified funds cannot cover remaining baseline commitments and obligations. Immediately notify both campaign manager and administrator; the user specifically requested immediate notification to them and the tightest feedback loop. Configure their designated operator identity before launch without inferring contact details or sending messages now. Do not silently dilute baselines or borrow prizes, creator earnings or another nonprofit's funds. Actual incident detection/dispatch bounds remain U6/U8 precision.
- Q77 / 2026-11-10: The user accepted automatic resumption after reliable financial evidence and required funding recover, within existing approved limits and with no other hold. Immediately notify both operators and preserve history. Capacity expansion and other required approvals cannot be bypassed. Unknown provider write/stop states and financial obligations still require reconciliation before safe resumption; no new spending authority or reset of trial history is created.
- Q78 / 2026-11-10: The user accepted paying actual advertising-contribution processing and advertising-payment fees from the affected campaign's advertising fund. Record gross contributions, actual fees and net available funds separately; required baseline coverage must be funded after fees/reserves. Clearly disclose the reduction to contributors. This adds no Slander application fee or creator commission and selects no provider fee rate or refund-fee treatment.
- Q79 clarification checkpoint / 2026-11-10: The user first requested clarification of the proposed voluntary advertising-contribution refund workflow, without accepting it at that point. The subsequent answer below supersedes only the approval-chain uncertainty; do not treat the earlier explanation as blanket acceptance of every proposed refund rule.
- Q79 / 2026-11-10: The user answered "Yes by campaign request and admin review to have a refund." Record a campaign-manager/campaign-side request followed by platform-administrator review/approval, superseding manager-only authorization. Beneficiary remains to clarify: a contribution refund to its original payer and return of an unused campaign balance to the nonprofit are distinct flows with different records/provider constraints. No donor refund entitlement, automatic return, amount, fee deduction, funding-shortage handling or legal/provider override policy was selected. No transaction or notification was authorized/performed.
- Q80 / 2026-11-10: The user chose C, both flows: original-contributor advertising refunds and unused campaign balance returns to the nonprofit. Keep separate records, beneficiaries and provider execution/accounting. Apply the selected campaign-manager-request/platform-administrator-review approval chain to both. This resolves Q79's beneficiary scope without selecting eligibility, refund entitlement, fee deductions, return timing, active/closed campaign conditions or provider permissions. No unrestricted use of returned public contributions is implied.
- Q81 / 2026-11-11: The user accepted individually reviewed full or partial contributor refunds, up to the remaining unrefunded amount, following campaign-manager request and platform-administrator approval. Return to the original contributor through a supported refund route only with verified refund funding that preserves protected baselines/other obligations. If approved execution is unavailable, retain visibly pending status and immediately alert both operators. No automatic refund entitlement, numerical request deadline, fee-deduction rule or provider ability was selected; forced reversals remain separate from discretionary approval.
- Q82 / 2026-11-11: The user accepted first-release nonprofit balance returns only after paid-campaign closure, confirmed placement stopping and reconciliation identifying returnable surplus after obligations and required reserves. Manager requests; administrator approves. Provider restrictions and designated purpose still apply. No active-campaign balance return or unconditional release of all balances is authorized, and no fixed liability-expiry period or permitted bank route is inferred.
- Q83 / 2026-11-11: The user accepted immediately excluding disputed advertising-contribution amounts from spendable funds, without double subtraction if provider availability already reflects removal. Immediately notify both operators and recalculate coverage; resulting shortages follow the selected pause rules. Delivered advertising remains a recorded cost. Provider dispute lifecycle, mandatory reversals, eventual credit release and legal/program loss responsibility remain factual validation work; no campaign or platform legal liability is inferred solely from this application policy.
- Q84 / 2026-11-11: The user accepted platform-administrator approval of financial safety parameters before launch: reserves for unbilled advertising/refunds/disputes/fees, maximum acceptable financial-data age and held-fund/final-balance release evidence. Derive actual values from provider requirements and validation, record approval and prevent campaign managers weakening them. Missing settings block launch rather than becoming zero reserves or unlimited age. No actual numeric value was selected or provider guarantee inferred.
- Launch-blocker feedback instruction / 2026-11-11: The user explicitly requested immediate notification whenever anything blocks launch, with the tightest feedback loops. Record the global launch-blocker rule in REQ-142. Existing known blockers were immediately reported in chat: Stripe eligibility/funding, Meta/TikTok access/payment/reporting validation, Clerk validation, unset safety values and incomplete production verification. No live notification service or monitoring was started. The user has not authorized implementation, publishing tickets, provider/account setup or actual financial actions.
- U5 evidence checkpoint / 2026-11-11: Read-only recheck of GitHub #20 and #21 found both OPEN with no comments or approval evidence. Program eligibility and actual funding-route selection remain blocked; do not choose a direct or bank-mediated route without authoritative evidence, and do not reopen already selected ownership/financial policies as generic questions. Return a concrete unsupported result for user decision if validation establishes one.
- Q85 / 2026-11-11: The user accepted first-day baseline proration when an ad is admitted partway through an America/Chicago calendar day: use remaining actual local-day fraction, with full subsequent days at the configured daily amount and actual DST day length respected. The initial trial remains elapsed-time based. The 10-USD/noon/5-USD example is illustrative. Exact money rounding, funded-run boundary proration, admission-versus-provider-start reconciliation and supported provider pacing/minimums remain U6/U7 precision to state, without promising exact delivered spending.
- Q86 / 2026-11-11: The user accepted a single queue shared by new ads and retrials, ordered by new approval time or manager retrial-authorization time. Original creative approval cannot let a retrial jump ahead. Temporarily blocked entries retain queue position while eligible later entries can take available funded slots; immediately show and notify blocking reasons. Stable tie-breaking and concurrency remain engineering contracts. The user's blank "87." supplied no decision and is not recorded as approval.
- Q87 / 2026-11-11: The user accepted spending edits activating on the next fresh validated allocation cycle, with remaining baseline reserves verified/resized before activation. Unfunded increases cannot apply. Decreases cannot cancel incurred charges or uncertain provider commitments. If a new limit is below existing obligations, stop new spending, request necessary pauses and immediately alert both operators. Preserve settings/allocation history and reconcile unknown writes.
- Q88 / 2026-11-11: The user accepted continuing evaluation windows ending at Chicago midnight over the configured trial duration with confirmed pauses excluded. Evaluate the fixed window when required data is complete, without sliding delayed retries, and immediately notify blocked evaluations. The initial trial is evaluated at its own completion when reporting is complete, without waiting for midnight. Ordering multiple overdue windows remains an explicit review decision.
- Consolidation checkpoint / 2026-11-11: The supplement records accepted expanded requirements as REQ-144 onward, first credential-free slice acceptance, provider gates, proposed engineering contracts and five remaining boundary decisions Q89-Q93. Historical audits/test results do not certify this revision. No implementation, tests, provider operations or GitHub writes were performed.
- Q89 / 2026-11-11: Accepted release of an elapsed day's unused allocation only after delivery/liability reconciliation proves it free. Preserve future baseline reserves and uncertainty; released money remains in the same campaign, without automatic refund/return or redistribution within the old plan.
- Q90 / 2026-11-11: Accepted stopping at the locked funded end if delays/pauses prevent trial completion. Mark incomplete rather than failed for performance, preserve eligible history and immediately notify operators. No automatic date/funding/trial extension.
- Q91 / 2026-11-11: Accepted financially safe baseline continuation while missing/stale required eligible-entry score coverage holds new boost commitments. No fabricated zero, rank or per-entry startup bonus; prior commitments remain obligations. The user expressly required immediate notification of this hold; notify campaign manager and platform administrator, including their designated user recipient.
- Q92 / 2026-11-11: Accepted binding new admissions and queued retrials to the published policy current at actual paid admission, with disclosure and permanent recording then. Authorization sets queue position, not policy lock; existing admissions retain their assigned policy.
- Q93 / 2026-11-11: Accepted chronological delayed-window processing with an incomplete earlier window holding the sequence. First complete failure cuts at actual decision time without retroactive effects; later passing windows cannot undo the cut automatically, and manager-authorized retrial is required.
- Q94 / 2026-11-11: The user answered "Looks good" to the explicit final shared-specification review, confirming CT-01–CT-04, the isolated React/Vite/Express/SQLite preview harness and the consolidated accepted product contract. This confirms specification only; it authorizes no ticket publication, implementation, provider setup, external messages or financial action.
- Q105 / 2026-11-11: The user answered "Follow that recommendation": saved allocation previews are advisory and reserve no campaign money or ad slots. Separate tests exercise intended reservation behavior against isolated campaign records, including concurrency and restart. See the [Convex harness review](convex-allocation-preview-harness-review.md); the complete replacement design was subsequently confirmed in Q106. No implementation or publication is authorized.
- Q106 / 2026-11-11: The user answered "I like this design," confirming the complete Convex harness review. Shared understanding is complete for the bounded preview, isolated intended reservation tests and local-backend/browser verification design. The slice is specification-ready for separately requested ticket drafting; exact runner/lifecycle/auth wiring and passing behavior remain unproven. No implementation, ticket publication, account setup or deployment was authorized.
- Readiness after Q94: The credential-free durable allocation-preview slice is specification-ready for separately authorized ticket drafting/build work. Whole-launch/Ralph readiness remains blocked by actual provider/program/route/access evidence, administrator-approved numeric safety settings and future production verification. No remaining Q89–Q94 review decision is open; new product questions require a concrete contradiction or validated provider limitation.
- The earlier clarification checkpoint's instruction to defer new questions is superseded by the user's explicit request to work through the readiness audit. Preserve all unaffected Q1-Q35 decisions. Ask dependent advertising questions before declaring C1 resolved, then continue the audit order. No provider validation, code, live spending or GitHub publication was performed for this entry.

### Original interview

- Q1-Q12: adoption.is-only campaign, invited creators, Clerk email authentication, automation-first operations and manager approval. Agreement with recommendations is not blanket acceptance of demo behavior.
- Q13-Q21 and public-page clarification: fundraising earnings plus fixed prizes; homepage and public viewer are critical; public leaderboard; no viewer accounts; one campaign; selected demo weights and campaign-created settings.
- Q22-Q29: confirmed attributed donations rather than public site views/link clicks; daily and weekly prizes; Chicago and Monday-Sunday periods; delayed finalization and tie handling.
- Q30-Q36: refunds, commission basis, separate funding and fixed-dollar weekly prize replenishment; day-before shortfall notice. Percentage-based prize replenishment is explicitly superseded.
- Q37-Q41: approved weekly payments and one operator. Latest Q39 supersedes separate-admin/manager staffing. Each ad receives its own tracked donation link at creation.
- Q42 clarification and Q43-Q45: where ads run means Instagram, Facebook and TikTok; Stripe is financial only; authorized APIs import data; 30-second refresh. The unexplained earlier Q42 recommendation is not treated as blanket approval of another launch gate.
- Q46-Q50: five-minute unsuccessful-import warning, accepted operational boundaries and incident notification/recovery recommendations.
- This document supersedes historical demo policy for the adoption.is first launch only; the old PRD is preserved, not silently reapproved.

## Ralph completion contract

**Not executable yet.** This is a blocked product contract, not permission to run Ralph. Do not invent test filenames or substitute successful demo checks for missing production verification.

Coverage to supply under V-01:

- **REQ-101:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-102:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-103:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-104:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-105:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-106:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-107:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-108:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-109:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-110:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-111:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-112:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-113:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-114:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-115:** Existing baseline: node --test tests/public-ranking.test.js; production scoring and source-integration checks remain required.
- **REQ-116:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-117:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-118:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-119:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-120:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-121:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-122:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-123:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-124:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-125:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-126:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-127:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-128:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-129:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-130:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-131:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-132:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-133:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-134:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-135:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-136:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-137:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-138:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-139:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-140:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-141:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-142:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.
- **REQ-143:** Production verification command not assigned; cover every acceptance criterion and retain mapped evidence before readiness.

Ordered checks available now, from the repository root:

1. **Document structure only:** run the PRD skill audit against this file and save docs/PRD-adoption-is-launch.audit.json. Passing structure does not prove application behavior or resolve open questions.
2. **REQ-115 baseline only:** run node --test tests/public-ranking.test.js. This checks existing demo behavior, not the entire production requirement.
3. **Regression baseline:** run npm test. Record failures without changing unrelated application behavior to force this draft to pass.
4. **Future completion, blocked by V-01:** assign and run production checks for REQ-101 through REQ-143, followed by applicable build, regression and public/authenticated end-to-end checks against isolated test records.

Completion requires:

- [ ] The user has reviewed the document and every behavior-changing open question has a recorded resolution.
- [ ] Every requirement has an unattended command reaching its acceptance criteria and failure paths, exercised at least once.
- [ ] Every production requirement passes with preserved redacted evidence; demo baselines alone are insufficient.
- [ ] Provider test accounts validate donations, refunds, reporting completeness, approved payments and retries without unintended live effects.
- [ ] Applicable build and regression checks pass, or unrelated baseline failures have an explicitly accepted disposition.
- [ ] Semantic readiness passes: bounded scope, consistent decisions, atomic requirements, observable acceptance and complete executable traceability.

Retain **Blocked** until these conditions hold, even when the document structure audit passes.

## Draft validation record

Historical validation performed 2026-11-06:

- Document structure audit: passed, 32 requirements, zero errors, 10 warnings. Report: docs/PRD-adoption-is-launch.audit.json.
- Existing score baseline: node --test tests/public-ranking.test.js, 6 passed, zero failed.
- Existing regression baseline: npm test, 130 passed, zero failed.
- These checks do not verify new production behavior. In particular, existing UTC-period, historical commission and demo-role tests do not approve those policies for this Chicago-time, campaign-configured, single-manager launch.
- Warning review: REQ-116, REQ-118, REQ-119, REQ-122 and REQ-124 each describe one policy with necessary boundary conditions or enumerated inputs. They remain grouped for product review. REQ-125 (public refresh versus source polling), REQ-127 (manual input versus reconciliation), REQ-129 (duplicate prevention versus post-payment reversals), REQ-130 (workspace visibility versus privacy) and REQ-132 (no ad launch versus source mapping) contain separable implementation concerns. Preserve their scope, but split them during downstream ticket decomposition and map tests separately. These warnings are not being suppressed or treated as executable readiness.
- Historical record only: the 2026-11-07 reconciliation resolves O-03 through O-06 and adds REQ-133 through REQ-143. Current readiness depends on O-01/O-02/O-07 investigation, V-01, consolidated user review and the refreshed semantic audit. No application implementation, issue publication or live financial operation was performed.


### Reconciliation validation - 2026-11-07

- Accepted follow-up decisions Q1-Q35 are reconciled into acceptance criteria; REQ-101 through REQ-132 retain their identifiers, with REQ-133 through REQ-143 added for separately testable accepted behavior.
- Re-ran the PRD skill deterministic audit with the installed Python interpreter: 43 requirements, zero errors, 10 compound-requirement warnings; structure passes, but this is not executable readiness. Report: docs/PRD-adoption-is-launch.audit.json.
- Reviewed all ten warnings: REQ-116/118/119/122/124 bind one policy to its boundary conditions or financial invariants. REQ-125/127/129/130/132 still combine independently testable concerns; preserve scope and stable IDs, but refine atomicity and criterion-to-test mapping before implementation authorization. No warning was suppressed.
- Semantic audit refreshed in docs/PRD-adoption-is-launch.semantic-audit.md. O-03 through O-06 are settled, not further interview questions. O-01/O-02/O-07 provider investigation, V-01 production verification and consolidated user review still block readiness.
- Historical score/regression results above were not rerun for this documentation-only change and are not current production evidence. No application implementation, live-provider validation, deployment, financial operation or issue publication was performed.

### Investigation update - 2026-11-07

- Primary-source provider research is recorded in docs/provider-research-adoption-is-launch.md. It narrows O-01/O-02/O-07 but does not resolve account-specific reporting, financial arrangements, or Clerk forwarded-link and recovery behavior. Meta Insights documentation was inaccessible during research. No provider account or test-mode integration was operated.
- REQ-117 and REQ-126 now distinguish coverage completeness from import-operation success, define monitoring before the first successful import, and preserve the strict more-than-five-minute threshold. Provider-specific proof of coverage remains O-01.
- docs/adoption-launch-verification-plan.md maps all 43 requirements and individual acceptance criteria to designated future commands and identifies boundary/failure scenarios. Those files do not exist yet: missing-file failures are not behavioral red tests, and V-01 remains blocked.
- Current local baseline: `node --test tests/public-ranking.test.js` passed six demo tests. `npm test` failed with 17 passed and 12 test files unable to load an incomplete local `zod` installation. Neither result establishes launch readiness. The refreshed deterministic audit passes with zero errors and ten warnings; the semantic audit remains blocked.


### Consolidated structure check - 2026-11-11

The advertising supplement separates expanded requirements from this preserved base contract. Both document audits are structural only; current counts and warnings are recorded in the refreshed semantic audit. The complete verification map is regenerated from current checkboxes, not historical criterion counts. No application/provider tests or implementation were performed. Q89-Q94 are accepted, including CT-01 through CT-04 and preview/harness specification; separate publication/build authorization is still required; provider/account evidence and actual safety values remain blocked.

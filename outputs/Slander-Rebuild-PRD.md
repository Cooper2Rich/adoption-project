# Slander Rebuild Product Requirements Document

Version 2.2 with October 24 addendum | Prepared for Cooper Rich | October 24, 2026

- **Status:** Blocked
- **Source:** Existing local demo, original September 24 PRD, rebuild PRD version 1.0, and Cooper's October 21 and October 24 instructions in this chat.
- **Last updated:** 2026-10-24

This is the **second PRD**, revising `outputs/Slander-Rebuild-PRD.md`. It is the current specification for the rebuild and marketplace extension. `docs/PRD.md` remains historical source material; conflicting historical rules do not override this document. Status describes readiness for unattended implementation of the entire contract: new requirements do not yet have implemented acceptance tests, and live operation needs later provider and launch decisions. The provider-free product design is specified here and can progress without selecting a third-party service. No Ralph loop is authorized or started.

## October 24, 2026 addendum - daily winner and weekly scoring (pending organization)

Capture Cooper's latest decisions here for later organization into the requirements. This addendum takes precedence over conflicting grading weights, CTR requirements, and tie behavior elsewhere in this PRD, including REQ-215. The older grading text remains below pending reconciliation; it must not override these decisions. The existing version 2.2 audit predates this addendum and does not validate it.

- **Daily winner:** Include a winner for the ad campaign each day, using the same scoring weights and tie-breakers as the weekly winner, applied to that day's results. The daily winner payout remains **TBD** without inventing an amount or payout obligation. Exact daily measurement boundaries remain unspecified.
- **Daily and weekly scores:** Use **40% impressions, 30% total link clicks, and 30% funds raised** for both daily and weekly winners. CTR remains excluded from scoring and tie-breaking. Total link clicks are the click metric; do not substitute CTR.
- **Leaderboard updates:** Automatically refresh the daily and weekly leaderboard results every **10 minutes**. Display a visible countdown timer showing the minutes and seconds remaining until the next scheduled update. After each scheduled update, the timer counts down to the following update.
- **Daily and weekly score ties:** Compare the unrounded scores first. If they tie, compare the following in order within the applicable daily or weekly period, advancing only while still tied:

  1. Most total link clicks.
  2. Most funds raised.
  3. Most impressions.
  4. If all three are equal, declare a tie.

Display rounding must not create a tie between unequal unrounded scores. These decisions do not specify a new normalization method or alter the protected 10% creator commission, 90% beneficiary allocation before fees, or separate seed guarantees. Further organization and reconciliation of the detailed grading requirements are deferred as requested.

## Objective

Extend Slander's existing creator/nonprofit workflow into an external campaign marketplace serving multiple independent organizations. Organizations offer campaigns, creators submit creatives that receive automatic eligibility checks and promote eligible campaigns, public donors crowdfund nonprofit causes, and Slander attributes eligible donations to creatives and calculates a fixed 10% creator commission. Demonstrate the complete local flow through simulated funding, ad budgets, outcomes, and settlement reports while retaining the existing application and data.

Slander occupies the intermediary role illustrated by Awin, impact.com, CJ, PartnerStack, and ClickBank: offer discovery, campaign-specific terms, partner participation, tracking, reporting, and commission administration. Those companies are comparison examples only. This PRD selects none of them and assumes no access to their advertiser inventory. Slander's own campaign owners supply its campaigns.

## Current state and evidence

The inspected checkout is the working `demo` application at commit `e5475b4bb1ac5cf20e8ccdf5a5180bf0b730a55e`. It uses React, TypeScript, Vite, Express, Zod, Multer, and Node's built-in SQLite. `package.json` requires Node 24 or later. `server/domain.ts` contains submission eligibility, checks, review transitions, revisions, and export readiness; `server/access.ts` scopes identities and public/private projections; `server/store.ts` persists JSON workspace state under SQLite transactions. `server/app.ts` exposes the API and uploads. `src/types.ts` and `src/useDemoWorkspace.ts` define the existing client models and scoped loading.

The application supports project creation, creator submissions, revisions, nonprofit review, per-project Instagram username pairing, and manual JSON/media handoff. It has no implemented crowdfunding, commission ledger, ad buying, live publication, provider metrics, or creator payouts. Role/profile selectors model scope but are not production authentication. Upload URLs currently lack private ownership enforcement. Review history stores decisions, not full immutable prior creative content.

Existing checks are `npm test`, `npm run build`, `npm run test:e2e`, and `npm run format:check`. Their source was inspected; this documentation revision does not claim a fresh passing application test run. Version 1.0's temporary browser/socket failure is removed because it was a preparation incident, not a product requirement. The default local URL is http://localhost:3000 when the server runs; no public hosting is selected.

## Scope

This revision changes documentation only. Requirements below define subsequent implementation, not claims about features already built.

| Phase | Required outcome | External services |
| --- | --- | --- |
| A: preserve core and remove routine sign-off | Existing projects, submissions, revisions, pairing, export, scope, and responsive behavior; deterministic evaluation replaces mandatory creative approval | None |
| B: local marketplace | Offer discovery, versioned terms, participation, distribution records, crowdfunding and seed simulations, 10% ledger, budget reservations, analytics, settlement export | None; local fixtures exercise the same domain rules |
| C: live launch | Verified identities, real ads, real donations/settlement, real transfers, verified metrics | Choose and validate providers later; currently gated |

Preserve existing data and IDs. Reuse the UI shell, domain checks, access rules, SQLite transaction boundary, local media, and revision workflow. A fresh install must also work with fictional seed data; it is an acceptance case, not an instruction to discard the working application.

## Non-goals

- Replacing the stack, starting a separate application, or recreating working screens solely for parity.
- Selecting, installing, authenticating to, or integrating an affiliate network, payment processor, ad API, identity service, analytics service, or hosting service now.
- Assuming access to other networks' brands or blanket permission to advertise them.
- Equity crowdfunding, securities, investment returns, credit advances, or promises that Slander finances every creator's ads.
- Changing the 10% creator rate or interpreting it as an additional Slander platform fee.
- General retail checkout/fulfillment, arbitrary merchant-sale commission schemes, native mobile apps, chat, or AI moderation services.

## Business rules and funds

This section is the authoritative financial policy; all requirements use it.

| Rule | Required behavior |
| --- | --- |
| Creator rate | Fixed **10%** of each eligible completed attributed donation's gross amount before processor fees. Store `creatorCommissionBps = 1000`. The remaining **90% before fees** belongs to the nonprofit beneficiary. |
| Crowdfunding | Preserve public contributions to nonprofit campaigns, individual gifts, fundraising progress, and creator compensation from attributed gifts. Multiple people can fund the cause. This creates no investment ownership or donor financial return. |
| Seed support | Preserve nonprofit/business seed funding, its minimum-payout-guarantee purpose, and a separately recorded app-use payment. Seed creates neither a donation vote nor a donation commission. Earlier documents settled none of the amounts, guarantee formula, or fee. The configurable local guarantee formula below is an explicit new design, not an inherited promise. |
| Media money | Separate earmarked media funding or disclosed creator self-funding from donation and seed allocations. Never silently spend the beneficiary's 90% or creator's 10% on ads. The same dollar cannot support both a guarantee and an ad budget. |
| Budget payer | Each media plan names the payer of the advertising bill; default `unassigned` blocks a funded plan. Organic/manual creative handoff need not have a paid budget. |
| Rate lock | Campaign editors, tiers, awards, and imports cannot change the creator rate. Reject contradictory input; no provider rate replaces Slander's rate. |
| Currency | Phase B supports USD integer cents only. No floating-point money or automatic FX. |
| Refunds | Keep the same 10% on the remaining eligible gross base; append reversals rather than editing prior entries. |
| Simulation | Local gifts, balances, ad spend, metrics, and payout examples are conspicuously simulated and isolated from any real-money records. |
| Grading | REQ-215 is the sole official performance-grade policy; grades are independent of the protected commission, crowdfunding allocation, and seed minimum guarantees. |

For nonnegative gross cents `g`, creator cents are `floor((g * 1000 + 5000) / 10000)` using checked integer arithmetic (BigInt for multiplication/division, validated safe-integer bounds at JSON boundaries); beneficiary cents are `g - creatorCents`. Half a cent rounds upward. A $100.00 gift allocates $10.00 and $90.00 before fees. A $0.05 gift allocates $0.01 and $0.04 because cents cannot represent exactly half a cent. Partial refunds recompute cumulative entitlement on remaining gross and reverse the difference; independently rounding each refund is prohibited.

Simulation fees are explicitly zero and labeled a fixture assumption. Live fees, their payer, custody, and receipt issuer remain launch decisions. Never describe 90% before fees as guaranteed cash received after fees. The separate app-use fee has no default amount and cannot reduce the protected gross split.

## Workflow and state

A project is the existing campaign container. An offer is its versioned participation/funding policy. A creative is a submitted piece of content. A distribution is one eligible evaluated creative revision on one channel/placement. Multiple distributions do not duplicate the creative, evaluation, or gifts.

1. Admin creates a nonprofit campaign; business sponsors can fund or sponsor it separately.
2. The owner publishes an offer with terms, permitted channels, dates, fund allocations, and the fixed creator rate. Creators browse across organizations.
3. A creator accepts published terms and submits without invitation or routine owner sign-off. Deterministic rules evaluate participation and content eligibility.
4. Passing snapshots enter a deterministic exposure queue and become ready for authorized handoff without per-creative approval. Prepare an eligible revision for a declared destination. Instagram username pairing and manual handoff remain available. Creating a plan does not buy inventory.
5. Generate a tracking link bound to campaign, creative revision, creator, and distribution; exercise it through a simulated donation flow.
6. Eligible completed gifts produce one attributed vote, creator accrual, and beneficiary allocation. Accrual does not establish cash settlement.
7. Reconcile funding, media reservations/spend, gifts, commissions, adjustments, and weekly settlement exports from source events.

| Record | States or semantics |
| --- | --- |
| Project | Existing `draft`, `active`, `archived`; active displays as Published, meaning visible campaign. |
| Offer | `draft`, `open`, `paused`, `closed`; pause blocks new paid activity/link issuance. Existing links can accept gifts through the deadline under their frozen terms. Close/expiry ends new attribution; reopening before deadline requires all gates. |
| Participation | `requested`, `accepted`, `declined`, `suspended`; accepted references acknowledged terms. |
| Creative | Display Checking, Eligible, Needs fixes, Blocked/withdrawn, On hold; legacy `pending`, `approved`, `changes`, `rejected` are compatibility aliases, plus `held`. |
| Distribution | `draft`, `ready_for_handoff`, `exported`, `externally_verified`, `stopped`; local mode cannot set externally verified. |
| Donation | Attempt/pending, captured, settled, partial/full refund; unreconciled/disputed evidence holds allocation or payout as stated below. Completed for allocation means accepted captured evidence plus eligible exact attribution. |
| Settlement | `draft`, `held`, `approved`, `exported`, evidence-backed `paid`; local fixtures use `simulated_paid`. Export never means money moved. |

## Requirements

Legacy aliases BASE-01 through BASE-14 map to REQ-101 through REQ-114. Versions 2.1 and 2.2 supersede routine manual creative review/participation acceptance with deterministic eligibility; version 2.2 also makes REQ-215 the sole official four-metric grade. Preserve other baseline contracts except where the extension explicitly changes them. Future test paths below are planned acceptance deliverables, not files claimed to exist.

### REQ-101 - Workspace selection and scope changes

- **Statement:** The workspace shall display only data within the selected demo scope.
- **Rationale:** Preserve the working baseline contract identified by legacy BASE-01.
- **Depends on:** None

Legacy alias: **BASE-01**.

Start in Admin when no saved role exists. Persist the selected role in browser local storage. Do not persist the nonprofit or creator selection across reloads: re-entering either role requires a fresh profile choice. Nonprofit selection offers existing organizations; creator selection offers existing creators and creation of a demo creator profile.

The selection screen must contain no project data before identity selection. Creator name is required, trimmed, and at most 80 characters. Duplicate normalized demo names reuse the existing creator identity. New-profile creation selects that identity after saving.

On any role or identity change, clear the previous workspace immediately. Associate requests with both a scope key and request version so late responses cannot repopulate a new view. Clear stale dialogs, notifications, and search as appropriate. Refresh data when the window regains focus.

#### Acceptance criteria

- [ ] Switch nonprofit A to B while an A response is delayed; no A data appears in B workspace.
- [ ] Reload Creator view; show identity selection before private workspace data.

#### Verification

- **Command:** `npm run test:e2e`
- **Pass condition:** Exit 0 with the named parity cases covered; browser cases run both reference viewports.
- **Evidence:** Preserve command output and test report; this revision has not rerun the application suite.

### REQ-102 - Project dashboard

- **Statement:** The dashboard shall expose projects visible to the current role.
- **Rationale:** Preserve the working baseline contract identified by legacy BASE-02.
- **Depends on:** REQ-101

Legacy alias: **BASE-02**.

Display a mission-focused welcome area, a hero linking to personal submissions or campaign summaries, and scoped counts for published projects, checking/needs-fix creatives, and eligible creatives. Owners have no routine approval queue. Platform exceptions are separate; creator counts refer to their own work.

Project cards show cover image, cause, nonprofit, title, short description, status, submission/evaluation progress, creator avatars, and end date. Admin/nonprofit cards may show the paired Instagram destination or pending-account state. Creator cards must not show account controls or destination pairing.

Admin/nonprofit have All, Published, Draft, and Archived filters. Creator has published projects only. Provide newest-first and name A–Z sorting and grid/list layout. Case-insensitive search should cover relevant project text. A no-match state should distinguish filtering from a workspace with no projects.

#### Acceptance criteria

- [ ] Creators see only active projects; Admin sees all statuses.
- [ ] Filters and search preserve scope and show an explicit no-match state.

#### Verification

- **Command:** `npm run test:e2e`
- **Pass condition:** Exit 0 with the named parity cases covered; browser cases run both reference viewports.
- **Evidence:** Preserve command output and test report; this revision has not rerun the application suite.

### REQ-103 - Project creation and settings

- **Statement:** The server shall authorize project settings mutations by ownership.
- **Rationale:** Preserve the working baseline contract identified by legacy BASE-03.
- **Depends on:** REQ-101

Legacy alias: **BASE-03**.

Only Admin can create a project. Admin and the owning nonprofit can edit an existing project; only Admin can change its nonprofit assignment. A nonexistent or inaccessible project cannot be modified by submitting its identifier directly.

| Field | Rule |
| --- | --- |
| Name | Required trimmed string, 1–80 characters |
| Nonprofit name | Required trimmed string, 1–80; nonprofit cannot reassign it |
| Category/cause | Required trimmed string, 1–40 |
| Description | Required trimmed string, 1–600 |
| Creator brief | Required trimmed string, 1–1,200 |
| Cover | `forest`, `food`, `education`, or `seedling` |
| Start/end | Real calendar dates in `YYYY-MM-DD`; end at least start |
| Status | `draft`, `active`, or `archived` |
| Instagram input | Optional; at most 150 input characters before username normalization |

Cause options in the existing UI: Environment; Food & community; Education; Health & wellbeing; Animal welfare; Arts & culture; Other. The server permits other valid category strings within its length rule.

New projects default to draft, today as start date, and about 75 days later as end date. These are defaults, not a mandatory campaign duration. A nonprofit identity is attached at creation and preserved through edits. Record create and settings-update activity.

Settings have Project details and Instagram account tabs. Invalid required fields on the details tab must remain discoverable when saving from the account tab. Prevent duplicate saves while a request is pending. Show inline validation and retain input after an error.

#### Acceptance criteria

- [ ] Only Admin creates/reassigns projects; the owning nonprofit edits its own.
- [ ] Invalid dates or username leave existing data unchanged.

#### Verification

- **Command:** `npm test`
- **Pass condition:** Exit 0 with the named parity cases covered; browser cases run both reference viewports.
- **Evidence:** Preserve command output and test report; this revision has not rerun the application suite.

### REQ-104 - Project detail and date eligibility

- **Statement:** The server shall enforce the submission calendar.
- **Rationale:** Preserve the working baseline contract identified by legacy BASE-04.
- **Depends on:** REQ-103

Legacy alias: **BASE-04**.

Show full cover, mission, brief, cause, organization, exact dates, and status. Admin/nonprofit receive Project settings and account pairing actions. Admin/creator receive Submit a post only when submissions are open. Nonprofits do not submit content in the baseline.

Submissions are open only if the project is `active` and the current **UTC calendar date** lies inclusively between start and end. Enforce this on creation and revision on the server. A published project can remain discoverable outside its submission dates. Draft, archived, future, and ended projects reject submissions with a conflict and explanatory message.

Provide project-level All, Checking, Eligible, Needs fixes, Blocked, and On hold tabs. Creator lists contain only their own private submissions. Empty states explain either no matches or the first-submission opportunity. Display a closed-state message when submissions are unavailable.

Dates gate content creation/revision; automatic checks can run diagnostically on retained content. Non-archived content export requires current evaluation eligibility; new marketplace distributions additionally require the open in-window offer gates in REQ-204. Historical approval and legacy export cannot bypass those gates.

#### Acceptance criteria

- [ ] Draft, archived, future, and ended projects reject submissions without partial writes.
- [ ] Inclusive UTC start/end boundaries permit valid submissions.

#### Verification

- **Command:** `npm test`
- **Pass condition:** Exit 0 with the named parity cases covered; browser cases run both reference viewports.
- **Evidence:** Preserve command output and test report; this revision has not rerun the application suite.

### REQ-105 - Submission authoring and uploads

- **Statement:** The server shall validate each creative before persistence.
- **Rationale:** Preserve the working baseline contract identified by legacy BASE-05.
- **Depends on:** REQ-104

Legacy alias: **BASE-05**.

Admin can submit on a creator's behalf. Creator submissions use the selected creator's server-resolved name and ID regardless of a supplied name. Creators cannot impersonate a different creator by editing JSON. During revision, retain the original creator identity.

| Field | Rule |
| --- | --- |
| Title | Required trimmed string, 1–100 |
| Creator display name | Required trimmed string, 1–80; selected identity or Admin attribution |
| Caption | Required trimmed string, 1–2,200; visible live character count |
| Format | `photo`, `reel`, `carousel`, `story`, `other` |
| Media reference | Required, at most 300; valid local sample or existing upload |
| Media type | `image` or `video`, matching reference |
| Rights | Required boolean; false may submit but prevents eligibility |

Show the project brief inside the submission dialog. Include media preview, caption, format selection, and rights checkbox. Creator name is read-only in Creator view and during revision. Prevent submission while upload or save is pending.

Upload one file under multipart field `media`. Accepted MIME types are JPEG, PNG, WebP, MP4, and QuickTime MOV. Maximum is 30 × 1,024 × 1,024 bytes, inclusive at server limit. Generate unique stored filenames. Inspect file signatures, reject forged image/video types, and remove rejected uploaded bytes. Match submitted `mediaType` to the stored file extension.

Accept only approved sample paths `/images/forest.jpg`, `/images/food.jpg`, `/images/education.jpg`, `/images/seedling.jpg`, or an existing generated upload path. Arbitrary remote URLs, unknown local paths, and nonexistent upload references are invalid.

The form offers forest, food, and seedling image samples. Choosing a sample changes the format to photo. Uploading video initially selects reel; uploading image initially selects photo. Users may choose a proposal format afterward. Explain that carousel/story/other proposals can be retained and checked but require a supported handoff plan.

Successful creation appends a submitted history event, creates workspace activity, refreshes the scoped workspace, and shows Checking until the deterministic result is available. Do not display content as externally published.

#### Acceptance criteria

- [ ] A valid selected creator submission starts pending, revision 1; ownership cannot be spoofed.
- [ ] Forged, oversized, nonexistent, or unsupported media is rejected.

#### Verification

- **Command:** `npm test`
- **Pass condition:** Exit 0 with the named parity cases covered; browser cases run both reference viewports.
- **Evidence:** Preserve command output and test report; this revision has not rerun the application suite.

### REQ-106 - Versioned deterministic eligibility

- **Statement:** Each creative shall receive a reproducible eligibility evaluation.
- **Rationale:** Remove routine organizational review while retaining objective eligibility and traceability.
- **Depends on:** REQ-105

Legacy alias: **BASE-06**. This version intentionally replaces routine creative sign-off; retained storage/API names are compatibility aliases.

At campaign setup the owner configures one versioned policy: allowed channels/formats, campaign dates, authorized destination allowlist, required compensation/beneficiary disclosure blocks, rights declaration, file specifications, and any explicit factual claim text supplied for reuse. The platform supplies mandatory baseline rules that owners cannot turn off. Campaign-level permission remains distinct from signing off on each creative.

Evaluate a snapshot plus policy version and captured eligibility facts using deterministic code. Return `eligible`, `needs_fix`, or `held` with stable reason codes and actionable explanations. Given identical inputs and policy/fact versions, results match. Validate schema, file signature/type/size, rights confirmation, exact required structured fields, allowed destination, campaign/channel permission, current accepted terms, and known unresolved rights/abuse holds. Never use popularity, aesthetic quality, organization taste, or predicted success as an entry gate.

On successful evaluation, the exact snapshot becomes eligible automatically. Mechanical failures return needs_fix immediately, with no owner queue. A known unresolved complaint or unresolvable evidence conflict places only the affected item on hold for platform exception handling. An expired campaign may be evaluated diagnostically but cannot receive new distribution eligibility. Changes rerun the same checks against a new snapshot.

These checks cannot establish copyright ownership, truth of arbitrary spoken claims, absence of harmful visual meaning, or full platform-policy compliance. A checked rights box is a declaration. Locked disclosure/fact blocks reduce omissions without controlling creative style; their presence in structured fields cannot prove they were rendered or spoken in every exported asset. Local eligibility must state its coverage honestly. Future platform review and confirmed account permission remain separate live gates; no semantic moderation vendor is selected.

#### Acceptance criteria

- [ ] A valid creative reaches eligible without any owner/reviewer click.
- [ ] Same snapshot, policy, and fact version produce the same result and reason codes.
- [ ] Missing rights or required disclosure produces needs_fix with exact reasons.
- [ ] A known rights complaint produces a scoped hold, not a campaign-wide review queue.

#### Verification

- **Command:** `node --test tests/marketplace.test.ts`
- **Pass condition:** Exit 0 with the automatic-eligibility and exception scenarios covered; no routine owner decision is required.
- **Evidence:** Focused test output and evaluation/event fixtures. These new expectations supersede the corresponding legacy manual-review tests; they are not implemented yet.

### REQ-107 - Automatic evaluation and exception history

- **Statement:** A passing creative shall become eligible without organizational sign-off.
- **Rationale:** Remove routine organizational review while retaining objective eligibility and traceability.
- **Depends on:** REQ-106

Legacy alias: **BASE-07**. This version intentionally replaces routine creative sign-off; retained storage/API names are compatibility aliases.

Creation/revision records an evaluation request and immutable input snapshot. Run local deterministic checks in-process; if evaluation is queued, make completion idempotent on snapshot ID plus rule/fact version and reject stale results. Store who submitted, snapshot digest, policy version, evaluated facts, outcome, reasons, and time. UI shows Checking, Eligible, Needs fixes, or On hold; it never says awaiting nonprofit approval.

Human review is exception-only for platform operations: a creator appeal, substantiated complaint, or unresolved evidence conflict. Owner personnel need not process submissions, accept creators individually, or review creative taste. An owner may pause its whole campaign/revoke channel authorization; platform operators can hold a specific item with a recorded reason. Appeals can challenge an incorrect fact or rule application; an operator cannot waive mandatory rights, destination, disclosure, or budget rules through a generic approve button.

Retain legacy status names internally only as an adapter: pending = checking, approved = eligible, changes = needs_fix, rejected = blocked/withdrawn; introduce held for exceptions. Existing stored approval is historical evidence, not a permanent bypass: reevaluate against current required policy before any new distribution. Preserve prior completed financial records. Retire ordinary approve/request-changes/decline controls and reject generic manual-approval mutations. Never let an operator status toggle manufacture a passing rule evaluation.

#### Acceptance criteria

- [ ] Valid content moves from checking to eligible automatically and receives an evaluation audit record.
- [ ] A delayed result for an older revision cannot mark the current revision eligible.
- [ ] An ordinary owner approve request cannot bypass a failed rule.
- [ ] An appeal resolution corrects recorded facts and reruns rules; mandatory failures remain blocking.

#### Verification

- **Command:** `node --test tests/marketplace.test.ts`
- **Pass condition:** Exit 0 with the automatic-eligibility and exception scenarios covered; no routine owner decision is required.
- **Evidence:** Focused test output and evaluation/event fixtures. These new expectations supersede the corresponding legacy manual-review tests; they are not implemented yet.

### REQ-108 - Creative iteration without approval queues

- **Statement:** Every content revision shall receive its own eligibility decision.
- **Rationale:** Remove routine organizational review while retaining objective eligibility and traceability.
- **Depends on:** REQ-107

Legacy alias: **BASE-08**. This version intentionally replaces routine creative sign-off; retained storage/API names are compatibility aliases.

The owning creator/Admin may create a new revision while submissions are open, including after an earlier revision became eligible. Preserve creator identity and use the current positive revision as the optimistic concurrency guard. Nonprofit/campaign owners cannot edit another creator's content. Submitted media and caption snapshots are immutable once evaluated/exported; revision creates a new snapshot rather than rewriting one.

Reevaluate immediately. A successful new snapshot is eligible without a human decision. Existing distributions keep their original snapshot and financial attribution; replacing the content for future distribution creates a new distribution/link. Withdrawal stops new use of the withdrawn snapshot without erasing valid earlier events. A held item cannot be escaped by duplicating the same content under a new revision; carry forward evidence-linked holds and allow a scoped appeal. Shared eligibility drives UI date blockers and server checks.

#### Acceptance criteria

- [ ] A creator revises eligible work and receives an automatic result without losing previous snapshots.
- [ ] A stale revision returns 409; creator ownership cannot be reassigned by payload.
- [ ] An old exported distribution retains its content and attribution after a new revision.
- [ ] Copied content cannot bypass an unresolved hold simply by receiving a new ID.

#### Verification

- **Command:** `node --test tests/marketplace.test.ts`
- **Pass condition:** Exit 0 with the automatic-eligibility and exception scenarios covered; no routine owner decision is required.
- **Evidence:** Focused test output and evaluation/event fixtures. These new expectations supersede the corresponding legacy manual-review tests; they are not implemented yet.

### REQ-109 - Per-project Instagram destination pairing

- **Statement:** Pairing changes shall affect only the selected project.
- **Rationale:** Preserve the working baseline contract identified by legacy BASE-09.
- **Depends on:** REQ-103

Legacy alias: **BASE-09**.

Store zero or one username per project. Multiple projects belonging to one nonprofit can have different destinations. Saving or clearing one project's destination must not change another project. Eligibility can pass before pairing; pairing remains a separate distribution gate.

Accept plain username, leading `@`, or `http(s)://[www.]instagram.com/username/`. Trim input, remove the recognized URL prefix/leading at-sign/trailing slash, and lowercase. Result must be 1–30 letters, digits, underscores, or periods; cannot end with a period or contain consecutive periods. Empty string removes the pairing. Invalid input must not partially mutate the project.

Display Account paired and Live authorization pending rather than Connected or Authorized. Pairing does not prove ownership or permission to post. Record paired/removed activity. Removing the pairing blocks new Instagram handoff without erasing the content evaluation or earlier exports.

#### Acceptance criteria

- [ ] Pairing survives restart and changing project A never changes B.
- [ ] Removing pairing blocks handoff without rewriting prior evaluation history.

#### Verification

- **Command:** `npm test`
- **Pass condition:** Exit 0 with the named parity cases covered; browser cases run both reference viewports.
- **Evidence:** Preserve command output and test report; this revision has not rerun the application suite.

### REQ-110 - Automatic handoff readiness and export

- **Statement:** A passing eligible snapshot shall be exportable without creative sign-off.
- **Rationale:** Remove routine organizational review while retaining objective eligibility and traceability.
- **Depends on:** REQ-107, REQ-109

Legacy alias: **BASE-10**. This version intentionally replaces routine creative sign-off; retained storage/API names are compatibility aliases.

Calculate readiness on the server on every read/export. Baseline Instagram handoff requires a passing evaluated snapshot, passing field/rights checks, local photo/reel format, paired username, and non-archived project. Extended distributions additionally apply REQ-204. No content approval action or reviewer identity is required.

Only Admin and the authorized campaign owner may export content for the organization's destination. A creator may distribute through their own authorized channel under campaign terms; it does not grant access to an organization's account. Return the existing `slander-<post-id>.json` manifest plus separate media download; include snapshot digest, evaluation/policy versions, outcome, reason summary, destination, and original history. JSON alone remains a media reference, not a portable archive. A ZIP export is not required.

Export establishes no external publication or platform approval. A new blocking policy fact, lost destination authorization, or archived project blocks new handoff while preserving prior exports and money records. The existing `/approved` route may be retained internally but is labeled Eligible library in the extended UI.

#### Acceptance criteria

- [ ] An eligible passing photo/reel with pairing exports without any human review action.
- [ ] Missing pairing, a failed evaluation, or a hold blocks export with reasons.
- [ ] Export contains snapshot/evaluation evidence and never sets live publication.

#### Verification

- **Command:** `node --test tests/marketplace.test.ts`
- **Pass condition:** Exit 0 with the automatic-eligibility and exception scenarios covered; no routine owner decision is required.
- **Evidence:** Focused test output and evaluation/event fixtures. These new expectations supersede the corresponding legacy manual-review tests; they are not implemented yet.

### REQ-111 - Eligible creative library and privacy

- **Statement:** The library shall expose only authorized creative projections.
- **Rationale:** Remove routine organizational review while retaining objective eligibility and traceability.
- **Depends on:** REQ-101, REQ-107

Legacy alias: **BASE-11**. This version intentionally replaces routine creative sign-off; retained storage/API names are compatibility aliases.

Retain project/status filters and case-insensitive title/creator/caption/project search. Replace the ordinary review inbox with My creatives/evaluation status for creators and an exception-only platform queue. Owners see campaign summaries and exceptions relevant to their campaign without receiving a required per-submission task list.

The Eligible library contains current eligible snapshots on visible projects. Creators can see the public creative projection of other creators' eligible work; omit private evidence, appeal notes, rights records, and payout details. Owners of a creative can inspect its own evaluation/reason history. Unpublishing the project removes it from public discovery. Keep explicit loading/empty/retry and needs-fix explanations.

#### Acceptance criteria

- [ ] Other creators see only eligible public content and no private evaluation/appeal notes.
- [ ] Owners have no routine approval queue; platform exceptions remain scoped.
- [ ] Unpublishing removes creative discovery without deleting stored content.

#### Verification

- **Command:** `node --test tests/marketplace.test.ts`
- **Pass condition:** Exit 0 with the automatic-eligibility and exception scenarios covered; no routine owner decision is required.
- **Evidence:** Focused test output and evaluation/event fixtures. These new expectations supersede the corresponding legacy manual-review tests; they are not implemented yet.

### REQ-112 - Eligible-count demonstration board

- **Statement:** The demonstration board shall identify its eligible-count basis.
- **Rationale:** Remove routine organizational review while retaining objective eligibility and traceability.
- **Depends on:** REQ-111

Legacy alias: **BASE-12**. This version intentionally replaces routine creative sign-off; retained storage/API names are compatibility aliases.

Replace the approved-count label with Eligible creatives. Group visible current eligible snapshots by stable creator ID; count one current eligible snapshot per logical creative, not every revision. Sort count descending and display name; equal counts share competition ranks such as 1, 1, 3. Filters affect this demonstration board. It is not the four-metric performance grade or a payout formula.

#### Acceptance criteria

- [ ] Revising one creative five times cannot create five eligible-count points.
- [ ] Equal counts share rank and the label does not imply earned money.

#### Verification

- **Command:** `node --test tests/marketplace.test.ts`
- **Pass condition:** Exit 0 with the automatic-eligibility and exception scenarios covered; no routine owner decision is required.
- **Evidence:** Focused test output and evaluation/event fixtures. These new expectations supersede the corresponding legacy manual-review tests; they are not implemented yet.

### REQ-113 - Workspace activity

- **Statement:** The activity feed shall follow organization scope.
- **Rationale:** Preserve the working baseline contract identified by legacy BASE-13.
- **Depends on:** REQ-101

Legacy alias: **BASE-13**.

Admin sees all persisted activity. Nonprofit sees events linked to its visible projects. Creator receives no activity feed. Show project creation/settings changes, account pairing/removal, submitted/resubmitted posts, automatic evaluation results, policy changes, holds, and appeals. Preserve legacy review decisions as historical events. Include event title, detail, timestamp, action icon, and project link where available. Search event title/detail. Empty state explains whether the feed is new or the search has no matches.

#### Acceptance criteria

- [ ] Admin sees all activity; nonprofits only their project events.
- [ ] Creator responses contain no workspace activity.

#### Verification

- **Command:** `npm test`
- **Pass condition:** Exit 0 with the named parity cases covered; browser cases run both reference viewports.
- **Evidence:** Preserve command output and test report; this revision has not rerun the application suite.

### REQ-114 - Persistence and recovery

- **Statement:** Startup shall preserve existing user-created data.
- **Rationale:** Preserve the working baseline contract identified by legacy BASE-14.
- **Depends on:** REQ-103, REQ-105

Legacy alias: **BASE-14**.

Persist identities, projects, posts, check results, review revisions/history, pairings, and activity. Uploaded media must survive refresh and restart. Seed only a newly created database; never overwrite user-created data on startup. Assign missing stable nonprofit/creator IDs when migrating older demo data.

The reference implementation uses SQLite WAL and a single `workspace` row containing the JSON state. Mutations run inside `BEGIN IMMEDIATE`/commit/rollback. Extend the same database under REQ-213; a clean install initializes the same schema without copying old user data.

#### Acceptance criteria

- [ ] Restart preserves records and media; startup never overwrites existing user data.
- [ ] Identity migration can repeat without changing stable ownership IDs.

#### Verification

- **Command:** `npm test`
- **Pass condition:** Exit 0 with the named parity cases covered; browser cases run both reference viewports.
- **Evidence:** Preserve command output and test report; this revision has not rerun the application suite.

### REQ-201 - Campaign ownership across organizations

- **Statement:** The marketplace shall expose eligible campaigns from independent organizations.
- **Rationale:** Apply the external marketplace model to the preserved crowdfunding workflow.
- **Depends on:** REQ-101, REQ-103, REQ-111

Add Organization with stable `id`, `name`, and `type` (`nonprofit` or `business`). A campaign has exactly one `ownerOrganizationId`, one nonprofit `beneficiaryOrganizationId`, and optional business sponsors. A business may administer a cause campaign; sponsorship alone grants no editing rights. General merchant-sale offers are outside this release.

Reuse the existing manager workspace, labeled Campaign Owner for the extended flow. Existing nonprofit IDs become corresponding organization IDs without change; migrated projects default both owner and beneficiary to the original nonprofit. Keep legacy fields/projections for baseline clients. Business-owned campaigns explicitly identify their distinct beneficiary. This extends REQ-101/103 owner scoping; the current nonprofit-only behavior remains its nonprofit subset.

Admin still creates/reassigns projects before opening. Owners manage their campaigns; a beneficiary receives recipient reporting, not implicit edit rights to a separate business owner's private content. Creators browse published offers across owners, with cause, organization, channel, state, and date filters. Demo selection is not live authorization.

#### Acceptance criteria

- [ ] Migrating two nonprofits preserves IDs and isolates management scopes.
- [ ] A business campaign identifies a nonprofit beneficiary; its sponsor cannot edit the campaign.
- [ ] Creators discover eligible campaigns across owners without gaining private management access.

#### Verification

- **Command:** `node --test tests/marketplace.test.ts`
- **Pass condition:** Exit 0 with all named scenarios covered, including refusal cases and unchanged balances on rejected mutations.
- **Evidence:** Focused test output and resulting fixture records; the test is a future implementation deliverable.

### REQ-202 - Immutable campaign terms and rate lock

- **Statement:** Every open offer shall reference immutable participation terms.
- **Rationale:** Apply the external marketplace model to the preserved crowdfunding workflow.
- **Depends on:** REQ-201

Terms include ID/version, owner, beneficiary, USD currency, `creatorCommissionBps = 1000`, effective time, start/end instants, attribution policy/window, permitted channel-placement-paid/organic combinations, budget payer, optional guarantee, app-use allocation, refund/hold policy, and a reference to the frozen grading-v2 configuration for any grading window. Grading configuration completeness gates final grading, not ordinary crowdfunding or earned commission. Creators see terms before consent; simulated donors see beneficiary and compensation disclosures before confirmation.

Instagram, Facebook, TikTok, and YouTube permissions are each `unreviewed`, `allowed`, or `blocked`, with approver/evidence. Defaults are unreviewed. An owner can authorize local simulated examples; that does not certify platform/API approval or provide rights to third-party assets. An unreviewed channel does not block opening an offer, but blocks distribution on that channel.

Opening freezes a version. Later changes create prospective versions and require renewed creator consent for new distributions. Existing gifts retain original terms. Owner/beneficiary changes after opening require a new campaign. Reject any rate other than 1000 basis points. Retire historical variable-rate REQ-013. Tier/winner features cannot change the rate or block opening an otherwise valid offer.

#### Acceptance criteria

- [ ] Missing beneficiary, currency, dates, or terms prevents opening; unused channels may remain unreviewed.
- [ ] A 15% rate or tier-derived override is rejected without mutation.
- [ ] A prospective version leaves prior gift terms and allocations intact.

#### Verification

- **Command:** `node --test tests/marketplace.test.ts`
- **Pass condition:** Exit 0 with all named scenarios covered, including refusal cases and unchanged balances on rejected mutations.
- **Evidence:** Focused test output and resulting fixture records; the test is a future implementation deliverable.

### REQ-203 - Automatic participation after terms acceptance

- **Statement:** An eligible creator shall enter participation automatically after accepting terms.
- **Rationale:** Remove routine organizational review while retaining objective eligibility and traceability.
- **Depends on:** REQ-105, REQ-202

Any selected creator may submit without invitation or owner approval. Check required profile fields, campaign submission window, accepted current terms, and known identity/campaign restrictions using deterministic rules. On pass record accepted participation with creator/campaign/term version/time. This is automatic eligibility, not verified production identity; the local demo remains clearly labeled.

Requested may remain transient while checking. Return needs-fix for missing fields/terms and held for an existing suspension/evidence issue. No campaign owner acceptance click is required. A policy/term version change requires acknowledgment for new distributions but never erases valid accrued commissions. Preserve legacy declined/suspended evidence rather than automatically reinstating an account; platform appeals handle exceptions. Campaign owners choose campaign rules once and retain campaign/channel pause controls.

#### Acceptance criteria

- [ ] A valid creator accepts terms and receives participation without an owner action.
- [ ] Missing consent or a known suspension cannot be bypassed by creative eligibility.
- [ ] Prospective terms changes preserve earlier valid financial liabilities.

#### Verification

- **Command:** `node --test tests/marketplace.test.ts`
- **Pass condition:** Exit 0 with the automatic-eligibility and exception scenarios covered; no routine owner decision is required.
- **Evidence:** Focused test output and evaluation/event fixtures. These new expectations supersede the corresponding legacy manual-review tests; they are not implemented yet.

### REQ-204 - Evaluated snapshots and distribution records

- **Statement:** Every distribution shall identify an immutable eligible creative snapshot.
- **Rationale:** Remove routine organizational review while retaining objective eligibility and traceability.
- **Depends on:** REQ-107, REQ-108, REQ-110, REQ-203

Bind snapshot ID/revision, title, caption, media ID/digest, creator, rights declaration, policy version, evaluated facts, outcome, and reason codes. Preserve current revision concurrency. A successful deterministic evaluation supplies eligibility; no manual signature is required. Legacy records keep historical review evidence and undergo current-policy evaluation before new distributions. Missing older content remains explicitly unavailable.

A distribution references campaign, eligible snapshot, creator, terms/participation, channel, placement, paid/organic, destination, payer, and state. Several distributions can share one snapshot without multiplying gifts. Instagram handoff reuses username normalization/pairing; other destinations remain local unverified records until live capability exists.

New marketplace distribution requires an active project, open in-window offer, accepted terms/participation, passing evaluation without hold, owner campaign-level channel permission, supported local format, and authorized destination. Paid funded execution also needs payer/reserved budget. Campaign authorization is established once by the owner; no creative-level sign-off is added. Pausing blocks new distribution/execution. Platform ad review is an independent future state; `eligible` never means approved by Meta/TikTok/Google. Revoked distributions stop new links and hold ambiguous later outcomes without rewriting earlier valid gifts.

#### Acceptance criteria

- [ ] A passing snapshot distributes without manual content or participant acceptance.
- [ ] Content edits cannot replace the snapshot already referenced by an export.
- [ ] Campaign permission, media budget, and platform live capability remain independent gates.

#### Verification

- **Command:** `node --test tests/marketplace.test.ts`
- **Pass condition:** Exit 0 with the automatic-eligibility and exception scenarios covered; no routine owner decision is required.
- **Evidence:** Focused test output and evaluation/event fixtures. These new expectations supersede the corresponding legacy manual-review tests; they are not implemented yet.

### REQ-205 - One-creative donation attribution

- **Statement:** Each eligible completed gift shall resolve to exactly one creative distribution.
- **Rationale:** Apply the external marketplace model to the preserved crowdfunding workflow.
- **Depends on:** REQ-202, REQ-204

Issue opaque server-stored `/r/:token` links bound to campaign, creator, eligible evaluated revision, distribution, terms, mode, issue time, and optional revocation. UTM fields are descriptive, not authoritative. Never let supplied creator IDs or rate parameters alter a binding. Local links lead only to the local simulated donation page; they are not arbitrary redirect URLs.

Local policy v1 uses the last eligible first-party link click in the same campaign within seven days, capped by campaign end. Direct gifts require explicit eligible creative selection, recorded as `direct_selection` without inventing a click. Freeze that evidence at donation intent creation and revalidate eligibility at completion. Timestamp evidence uses effective event time, not arrival time. A late receipt for an eligible in-window completion can reconcile after close; a new completion after close cannot gain attribution. Pausing blocks new links/activity; existing unrevoked links retain their terms until expiry. Closing/suspending a distribution stops new eligible outcomes.

Ambiguous, expired, or missing attribution retains the money event in visible suspense, outside allocated donation/vote/commission totals. Resolution requires evidence and an appended adjudication. Never silently reassign a paid gift. Shared links retain the bound creative. A recurring installment needs its own eligible attribution event; no indefinite commission is assumed. Publication/account pairing alone cannot establish attribution.

#### Acceptance criteria

- [ ] The last eligible link in one campaign wins; another campaign cannot steal attribution.
- [ ] Forged UTM creator fields cannot change the binding; direct selection records no false click.
- [ ] Ambiguous events remain visible in suspense; an operator resolution is audited.
- [ ] Late-arriving in-window events remain eligible; after-close completions are held.

#### Verification

- **Command:** `node --test tests/marketplace.test.ts`
- **Pass condition:** Exit 0 with all named scenarios covered, including refusal cases and unchanged balances on rejected mutations.
- **Evidence:** Focused test output and resulting fixture records; the test is a future implementation deliverable.

### REQ-206 - Crowdfunding and restricted fund purposes

- **Statement:** Campaign balances shall preserve the purpose of each contribution.
- **Rationale:** Preserve money purpose and the protected compensation rule under real-world failure cases.
- **Depends on:** REQ-201, REQ-202

Maintain separate public-donation, seed-support, and media-support records. Store contributor/source type (public supporter, nonprofit, business), campaign, amount, currency, mode, effective funding state, and original evidence ID. A pledge is not captured cash; captured funding is not settled spendable cash. Only settled eligible funding becomes available; local fixtures explicitly simulate settlement.

Public campaign pages show beneficiary, goal, eligible gross gifts, refunds, net progress, and pending/unallocated gifts separately. Seed/media totals are separate and never inflate charitable donation progress, votes, or donation commission. Preserve individual contributions and the ability of a crowd to support a nonprofit cause.

Record purpose consent with each contribution. Seed allocations identify guarantee reserve and app-use payment; media allocations identify ad budgets. A sponsor funding several purposes has explicit allocations summing to its contribution. No automatic cross-purpose/campaign transfer. Corrections append reversals and authorized new allocations. Unused money remains a visible restricted balance, not an automatic Slander fee or creator bonus. Live return/reallocation policy remains a launch decision.

#### Acceptance criteria

- [ ] Public gifts affect donation progress; seed/media contributions affect only their named pools.
- [ ] A $100 contribution allocated $60 seed/$40 media cannot fund another $10 commitment.
- [ ] Pending/failed support is not spendable; balances retain mode and purpose after restart.

#### Verification

- **Command:** `node --test tests/finance.test.ts`
- **Pass condition:** Exit 0; every financial scenario conserves funds and rejected mutations leave prior state intact.
- **Evidence:** Focused test output and journal/statement fixtures; this test is a future implementation deliverable.

### REQ-207 - Fixed-rate financial journal

- **Statement:** Creator entitlement shall use the protected 10% rate.
- **Rationale:** Preserve money purpose and the protected compensation rule under real-world failure cases.
- **Depends on:** REQ-205, REQ-206

Implement immutable balanced journal transactions in USD cents. An eligible completed captured gift records gross clearing funds and creator/beneficiary liabilities using Business rules and funds. Settlement moves money from clearing to available cash without creating another gift or commission. Store balances as rebuildable projections, never independent editable truth.

Transactions include campaign, mode, currency, source event, terms, attribution, effective/recording times, and any prior/correcting transaction. Debits equal credits for each transaction. Suspense records preserve captured money awaiting attribution. Seed top-ups, app-use fees, media costs, and later real processing charges have distinct entries/accounts.

The creator and nonprofit allocations sum to gross before fees. The defined cent rounding may yield zero creator cents on a very small gift; that gift still counts as one eligible vote. Creating/exporting an ad or recording views/clicks creates no automatic commission. Fees cannot silently lower the gross base used for the 10% calculation.

#### Acceptance criteria

- [ ] $100.00 allocates $10.00/$90.00; $0.05 allocates $0.01/$0.04.
- [ ] Every committed journal transaction balances and references one accepted source event.
- [ ] Changing CTR, tiers, eligible counts, or ad spend cannot alter the 1000-basis-point rule.

#### Verification

- **Command:** `node --test tests/finance.test.ts`
- **Pass condition:** Exit 0; every financial scenario conserves funds and rejected mutations leave prior state intact.
- **Evidence:** Focused test output and journal/statement fixtures; this test is a future implementation deliverable.

### REQ-208 - Replay protection and refund corrections

- **Statement:** A repeated financial event shall have no additional financial effect.
- **Rationale:** Preserve money purpose and the protected compensation rule under real-world failure cases.
- **Depends on:** REQ-207

Normalize fixture/future provider evidence into mode, source, sourceAccountId, sourceEventId, event type, subject ID, effectiveAt, receivedAt, payload digest, and evidence reference. Enforce unique `(mode, source, sourceAccountId, sourceEventId)`. Same ID/digest is acknowledged without another effect; same ID with changed content is held for review, never overwritten.

Validate evidence before writing. Event acceptance, allocation, journal, vote effects, and audit metadata commit atomically. Refunds refer to the original gift and cannot exceed cumulative captured gross. Refund-before-capture events remain unapplied pending prerequisites; bounded reconciliation retries them. Older pending/captured evidence cannot downgrade settled/refunded state. Settlement arriving before capture also waits for its prerequisite. Event dedupe alone is insufficient: enforce one logical donation ID per source-account transaction and apply only validated cumulative capture/settlement/refund deltas. A differently named event describing the same already-applied amount has zero additional money/vote effect. Donation-intent amount and original transaction ID cannot be replaced by replay metadata.

Partial refunds recompute cumulative entitlement using the remaining gross base, reversing the difference. A partially refunded gift retains one vote while eligible net gross is positive; a full refund removes its vote. Multiple capture notifications/installments for one logical gift do not create multiple votes. Disputes hold affected liabilities; confirmed losses append reversals. A reversal after payment creates a recovery balance/hold, not an automatic unauthorized debit.

#### Acceptance criteria

- [ ] Replaying capture/settlement ten times creates one gift, one vote, and one entitlement; a new event ID for the same transaction/amount also adds nothing.
- [ ] A $0.15 gift refunded $0.05 twice ends with entitlement computed on $0.05.
- [ ] Refund-before-capture reconciles later; refund above gross causes no partial mutation.
- [ ] Full refund removes one vote; partial refund never multiplies votes.

#### Verification

- **Command:** `node --test tests/finance.test.ts`
- **Pass condition:** Exit 0; every financial scenario conserves funds and rejected mutations leave prior state intact.
- **Evidence:** Focused test output and journal/statement fixtures; this test is a future implementation deliverable.

### REQ-209 - Bounded media budget

- **Statement:** Paid-media commitments shall remain within their funded allocation.
- **Rationale:** Preserve money purpose and the protected compensation rule under real-world failure cases.
- **Depends on:** REQ-204, REQ-206, REQ-208

Track settled media funding, refunds, reserved commitments, settled spend, and available cents. Require explicit campaign lifetime and distribution caps. Optional daily caps use disclosed UTC resets and never replace the lifetime limit. Reserve capacity atomically before releasing a funded paid execution plan; competing requests cannot consume the same cents.

Spend consumes its reservation and cash; do not subtract capacity twice. Externally evidenced spend above reserve must be retained as a visible overrun/reconciliation deficit that blocks new commitments. Never drop a bill to make the cap appear compliant. Actual ad-platform pacing/overdelivery requires a future adapter capability decision.

Cancellation releases unused reserved capacity only; incurred spend remains. Pause blocks new reservations. Creator-funded plans name that payer and record their costs without fictitious Slander cash. Simulated clicks/views do not auto-charge budgets; explicit spend fixtures do. No ad budget changes creator rates or uses the charitable split by implication.

#### Acceptance criteria

- [ ] Concurrent $60 reservations against $100 media funding cannot both succeed.
- [ ] $60 reserved then $40 spent leaves $20 reserved and $40 available from the original $100.
- [ ] A $70 evidenced bill against $60 reserve is fully recorded with an overrun hold.
- [ ] Cancellation releases only unused reserve without changing gifts or historical spend.

#### Verification

- **Command:** `node --test tests/finance.test.ts`
- **Pass condition:** Exit 0; every financial scenario conserves funds and rejected mutations leave prior state intact.
- **Evidence:** Focused test output and journal/statement fixtures; this test is a future implementation deliverable.

### REQ-210 - Seed-funded minimum payout guarantee

- **Statement:** A creator minimum guarantee shall consume explicitly reserved seed support.
- **Rationale:** Preserve money purpose and the protected compensation rule under real-world failure cases.
- **Depends on:** REQ-206, REQ-207, REQ-209

Preserve guarantees as separate top-ups. New local policy v1 is `topUp = max(0, configuredGuarantee - eligibleBaseCommissionForPeriod)`. Configuration names beneficiaries, amount per creator/period, exact weekly periods, and maximum total liability. Neither guarantee nor app-use amount has an invented default. An app-use allocation specifies an amount, named recipient, and effective charge trigger; when that simulated trigger is accepted, append one seed-funded app-use expense/payable entry using a unique obligation ID. Reserve-to-charge conversion consumes the reservation once; it creates no donation vote or creator commission. Actual payment remains a separate gated transfer. No configured guarantee means no promise; local sample values are labeled fictional.

Reserve the worst-case finite guarantee total plus separately configured app-use allocation from settled seed before opening an offer that promises them. Do not make an unbounded ongoing promise. A reserved seed cent cannot also fund media or another guarantee. If a campaign does not promise a guarantee or app-use payment, its terms explicitly say none rather than presenting missing values as zero-cost promises.

Unsettled/held commission defers top-up computation rather than causing an extra premature payment. After period reconciliation, compare eligible base commission before recovery adjustments with its floor. Statements show commission and seed top-up separately. A $25 floor and $10 commission produce $15 top-up, never a higher rate. Underfunding blocks the promise/settlement with a visible shortfall; unused seed stays restricted pending later return/rollover policy.

#### Acceptance criteria

- [ ] A $25 floor with $10 eligible commission produces a $15 seed top-up while the rate stays 10%.
- [ ] Pending eligibility holds the top-up; insufficient seed cannot silently reduce a promised floor.
- [ ] Opening rejects guarantee/app-use commitments above settled seed funding; an app-use trigger charges its obligation once without donation votes.

#### Verification

- **Command:** `node --test tests/finance.test.ts`
- **Pass condition:** Exit 0; every financial scenario conserves funds and rejected mutations leave prior state intact.
- **Evidence:** Focused test output and journal/statement fixtures; this test is a future implementation deliverable.

### REQ-211 - Weekly settlement and reconciliation

- **Statement:** Settlement shall include only reconciled eligible creator liabilities.
- **Rationale:** Preserve money purpose and the protected compensation rule under real-world failure cases.
- **Depends on:** REQ-208, REQ-210

Use administrator-defined weekly periods with exact UTC boundaries/cutoff; effective event times determine periods. Creator statements show captured accrual, settled eligible commission, held amounts/reasons, recovery, guarantee, prior payments, and payable balance. Weekly previews need no payout service.

Admin approves finance batches. Content reviewers/creators cannot approve payment by manipulating JSON. Reserve batch liabilities atomically to prevent double payment/export allocation. Export deterministic CSV/JSON with batch/idempotency ID, campaign, creator, mode, currency, journal source IDs, cutoff, and amount; exclude donor PII. Re-export the same approved manifest under the same ID.

Export is not paid. Only local fixtures can set `simulated_paid`; live paid requires a verified external transfer and reconciliation through a later adapter. Failed/unknown outcomes retain liabilities; retries preserve the transfer intent. Negative net payable after a refund is an explicit carry-forward recovery hold, not a new debit. Late valid receipts/corrections appear as next-period adjustments linked to the original period, without editing closed batches.

#### Acceptance criteria

- [ ] Captured/unsettled gifts accrue 10% but produce no payable transfer.
- [ ] Repeated batch execution/export never reserves the same liability twice.
- [ ] Editing a downloaded manifest or sending a creator mutation cannot establish real paid status.
- [ ] A refund after simulated payment creates visible recovery and a traceable next-period adjustment.

#### Verification

- **Command:** `node --test tests/finance.test.ts`
- **Pass condition:** Exit 0; every financial scenario conserves funds and rejected mutations leave prior state intact.
- **Evidence:** Focused test output and journal/statement fixtures; this test is a future implementation deliverable.

### REQ-212 - Comparable campaign economics

- **Statement:** Each performance report shall disclose its metric basis.
- **Rationale:** Define observable behavior that can be built with the existing application before provider selection.
- **Depends on:** REQ-205, REQ-209, REQ-211

Define outbound CTR = outbound clicks / impressions; CPC = recorded media spend / outbound clicks; CPM = spend / impressions * 1000; donation conversion rate = eligible completed gifts / measured eligible landing visits; acquisition cost = media spend / eligible gifts. Zero/missing denominator produces N/A. Outbound clicks, all-clicks, and first-party redirect clicks are separate named metrics. Never infer platform impressions, reach, or views from a redirect hit.

Each fact records channel, placement, paid/organic, source, mode, effective period, definition version, coverage, and correction lineage. Keep incompatible video-view definitions separate. Fixture exports remain simulated. Actual costs are distinct from funded/pledged budgets.

Creator reports use credited base commission and creator-borne ad costs; campaign reports show gross gifts, refunds, beneficiary allocation before fees, known fees separately, creator expense, seed/app-use allocations, and campaign-funded media spend. $180 commission minus $300 creator-funded ads is -$120 before other costs. Name the payer; another organization's media cost is not the creator's own expense. Label unknown fees as unknown, not zero. Do not infer causality, incremental lift, or unique reach from attributed donations. Revenue/ad-spend ratios identify whose revenue and whose costs are measured.

#### Acceptance criteria

- [ ] 10,000 impressions/150 outbound clicks yield 1.5% CTR; $300 spend yields $2 CPC.
- [ ] $180 commission and $300 creator-funded media yield -$120 before other costs.
- [ ] Missing impressions produce N/A CTR; unknown real fees are not displayed as verified zero.
- [ ] Platform clicks and first-party clicks remain separately identifiable.

#### Verification

- **Command:** `node --test tests/analytics.test.ts`
- **Pass condition:** Exit 0; named scenarios pass with isolated storage and no external credentials.
- **Evidence:** Focused report, fixture outputs, and browser screenshots where applicable; these tests are future implementation deliverables.

### REQ-213 - Incremental persistence and bounded processing

- **Statement:** The extension shall reuse the existing SQLite transaction boundary.
- **Rationale:** Define observable behavior that can be built with the existing application before provider selection.
- **Depends on:** REQ-114, REQ-207

Retain the current React/Express application and workspace JSON for baseline state. Add versioned migrations and minimum indexed tables for offer versions/participation/distributions, snapshots, tracking/source events, journal transactions/entries, reservations, and settlement manifests. Use the same database/connection and one transaction owner when changing workspace and new rows. No separate finance service, external message bus, replacement ORM, or generic workflow engine is required.

Money arithmetic/eligibility are pure domain functions. Handlers validate/authorize then delegate. Reuse Zod and AppError; keep one authoritative record per domain fact. Activity/readiness/progress are projections, not independent money records. Use unique constraints for event IDs and reservations, foreign identifiers, currency/purpose checks, and transactional cross-row invariants.

New list/report endpoints use stable cursors, default page 50 and maximum 100, and indexed campaign/mode/effective-time/ID lookups. Do not load the full journal/raw event history into `/api/workspace`. Reconciliation processes at most 100 pending events per pass and checkpoints; idle state requires no polling. Record processing timings/work counts for repeatable measurement without inventing performance guarantees.

Back up the full existing data directory before migration. Migration failure rolls back schema/data mutations; reruns preserve IDs, media, and money. Restore checks compare IDs, per-purpose totals, and media references. A reset/reseed is never a migration strategy.

#### Acceptance criteria

- [ ] Failure injected between workspace and journal writes rolls back both.
- [ ] Two migrations of old fictional data preserve IDs, projects, and media.
- [ ] New pages return at most 100 rows; dedupe/journal queries use declared indexes.
- [ ] Backup/restore preserves source IDs and every per-purpose journal total.

#### Verification

- **Command:** `node --test tests/finance.test.ts`
- **Pass condition:** Exit 0; named scenarios pass with isolated storage and no external credentials.
- **Evidence:** Focused report, fixture outputs, and browser screenshots where applicable; these tests are future implementation deliverables.

### REQ-214 - Private media and financial scope

- **Statement:** Server authorization shall protect every restricted resource.
- **Rationale:** Define observable behavior that can be built with the existing application before provider selection.
- **Depends on:** REQ-101, REQ-105, REQ-201, REQ-213

Add media IDs with owner, campaign/snapshot associations, immutable storage path, MIME/signature, bytes, and digest. Samples stay public. Private uploads use scoped retrieval, replacing the unrestricted static upload mount. An eligible public creative may expose its exact evaluated media snapshot through the authorized public projection; that does not grant access to other private revisions or raw upload paths. Creators may reference owned media or explicitly project-shared media; knowing its path is insufficient. Associate legacy uploads using existing submissions; ambiguous/orphaned files are retained for Admin review, not deleted or exposed.

Use stable creator/organization IDs rather than normalized names for new finance/business ownership. The same eligibility function supplies UI disable reasons and server checks, including closed-date revision. Extend the current manager scope to server-resolved organization records. Legacy nonprofit selectors/headers still resolve only actual nonprofits; the new organization selector resolves an explicit allowed organization ID, never arbitrary client claims. The demo controls remain clearly fictional.

Only Admin injects simulated financial/metric fixtures, adjudicates attribution, or approves payout batches. Owners see campaign summaries without donor PII; creators see their own earnings/public campaign summaries. Supporters see only their own contribution confirmation. Public projections omit donor PII, payout IDs, secret tracking credentials, and private review history. Hosted/live use requires verified server sessions/memberships; no identity vendor is selected now.

#### Acceptance criteria

- [ ] Creator B cannot retrieve or reference A private media by guessed path/ID.
- [ ] Legacy media survives migration and public samples still preview.
- [ ] A creator or campaign reviewer cannot inject finance events or approve payouts.
- [ ] Closed-date editing shows the same blocker in UI and direct API.

#### Verification

- **Command:** `node --test tests/marketplace.test.ts`
- **Pass condition:** Exit 0; named scenarios pass with isolated storage and no external credentials.
- **Evidence:** Focused report, fixture outputs, and browser screenshots where applicable; these tests are future implementation deliverables.

### REQ-215 - Official four-metric performance grade

- **Statement:** Every finalized performance grade shall use the official four-metric policy.
- **Rationale:** Reward fundraising results while retaining engagement and reach as required grading inputs.
- **Depends on:** REQ-112, REQ-208, REQ-212

Policy `grading-v2` is the authoritative performance grade, approved by Cooper on October 21, 2026. Its weights are **outbound CTR 15%, views 10%, donation-linked votes 35%, and donation amount 40%**. All four inputs are required. Retire the earlier 40/30/15/15 weights and cohort-maximum normalization for new grading windows; those remain only inside immutable historical snapshots if any exist. Do not run two competing official formulas or relabel an old score as grading-v2. The eligible-count demonstration board remains separately labeled and is never a performance grade.

Before a measurement window begins, publish a versioned configuration with campaign, period, channel/placement, paid-or-organic cohort, view definition, audience/exposure plan, strictly positive targets for the four metrics, CTR prior probability, positive prior strength in impression units, minimum impression/view evidence thresholds, and the financial reconciliation cutoff. Use compatible metric definitions, matching modes, and disclosed comparable funded opportunity. Validate finite values, prior probability between 0 and 1, and positive targets/thresholds before use. No arbitrary default target, prior, sample threshold, or promise of statistically proven weights is invented here. Missing configuration leaves grading unavailable without blocking ordinary campaign participation, crowdfunding, or earned commission.

The official components are:

| Component | Calculation | Weight |
| --- | --- | ---: |
| CTR | `adjustedCTR = (validOutboundClicks + priorStrength * priorCTR) / (validImpressions + priorStrength)`; `CTRscore = min(1, adjustedCTR / CTRTarget)` | 15% |
| Views | `ViewScore = min(1, sqrt(validViews / viewTarget))` | 10% |
| Donation-linked votes | `VoteScore = min(1, sqrt(eligibleSettledGiftCount / voteTarget))` | 35% |
| Donation amount | `AmountScore = min(1, sqrt(netSettledEligibleGrossCents / amountTargetCents))` | 40% |

`Grade = 15 * CTRscore + 10 * ViewScore + 35 * VoteScore + 40 * AmountScore`, yielding 0-100. CTR smoothing is a declared heuristic, not a confidence interval or proof that a small sample is reliable. Aggregate eligible source counts before ratios. Use checked integer money inputs and deterministic versioned arithmetic/precision for derived scores. Fix the numeric precision/rounding contract in the implementation and preserve it in the policy version; display rounding must not break ties in the stored score.

The capped square-root components reduce the influence of extreme volume. Targets, priors, thresholds, cohorts, and policy versions cannot be changed retroactively. Each published result freezes input totals/evidence references, coverage, corrections, configuration, component values, and unrounded score. Identical inputs under the same arithmetic/configuration reproduce the result. Equal stored scores share competition rank; stable ID orders display only. Monthly and final periods must be explicit; empty cohorts have no winner.

A final grade requires all four metrics, positive observed impressions, configured minimum impression/view evidence, comparable exposure, and reconciled eligible donation outcomes at cutoff. Missing evidence means pending/provisional with a reason; zero valid donations can be a known value of zero when evidence is complete. Never turn unknown data into zero or drop/reweight a metric. Do not merge incompatible channel/view definitions, organic/paid opportunities, or simulated/live evidence. Refunds/disputes/invalid-traffic corrections produce linked corrected snapshots; historical snapshots are retained rather than overwritten.

Use evidence to exclude or hold fraudulent/invalid traffic and reversed/disputed gifts. Grading votes remain one eligible settled gift/one vote while its net eligible gross is positive; multiple capture notifications never create votes, and a fully refunded gift contributes zero. Gift splitting remains an abuse risk: before any grade-based bonus obligation is activated, publish the abuse policy and pass adversarial gift-splitting, dominant-donor, tiny-sample, unequal-budget, and refund fixtures. Do not silently redefine genuine repeat gifts as fraud or replace one of the four metrics with a fifth input. Valid small gifts retain their ordinary 10% commission treatment.

**Financial separation:** The official grade never changes, withholds, or reallocates an earned 10% creator commission, the nonprofit's 90% allocation before fees, or a seed-funded minimum guarantee. It does not authorize additional ad spending. A performance bonus is possible only from a separately earmarked, funded pool with published eligibility, allocation/tie rules, period, cutoff, and maximum liability. No bonus amount, spending commitment, or liability is created merely by approving this grading policy. Reserve it separately without consuming protected donation shares, guarantee funds, app-use allocations, or media reservations. Top-20/tier history remains status-only unless a distinct funded award rule exists; it cannot change 10%.

#### Acceptance criteria

- [ ] Every finalized grade uses exactly 15/10/35/40 weights and all four required components; the old weights/cohort-maximum formula cannot be selected for a new grading-v2 window.
- [ ] Component values .6, .5, .9, and .8 produce grade 77.5; all-zero valid components produce 0 and all-one components produce 100.
- [ ] Missing configuration, absent metrics, insufficient evidence, or unequal/unknown exposure returns pending/provisional with reasons, without inventing zeros or blocking earned commission.
- [ ] Configuration changes cannot rewrite a closed window; the same versioned inputs reproduce a score and equal stored scores share rank.
- [ ] Refund/invalid-traffic corrections append linked snapshots; fully refunded gifts contribute zero votes and zero amount to the corrected grade.
- [ ] A high/low grade leaves 1000-basis-point commission and configured seed guarantees unchanged; no bonus can be promised from an unfunded or unconfigured pool.

#### Verification

- **Command:** `node --test tests/analytics.test.ts`
- **Pass condition:** Exit 0; weight/formula boundaries, reproducibility, evidence/configuration gates, abuse fixtures, refund correction, and financial independence scenarios pass.
- **Evidence:** Grading configuration/input/component snapshots and focused test report. This is a future implementation deliverable, not a passing application claim.

### REQ-216 - Provider-free execution boundary

- **Statement:** Local mode shall reject every live-effect operation.
- **Rationale:** Define observable behavior that can be built with the existing application before provider selection.
- **Depends on:** REQ-204, REQ-208, REQ-211, REQ-212

Local fixture inputs use the same domain operations, not a parallel business-rule implementation. Capabilities are `simulate`, `manual_handoff`, `ad_delivery`, `donation_collection`, `creator_transfer`, and `verified_metrics`. Only simulate/manual handoff can be enabled without a later implemented/validated live capability. A flag alone never establishes capability.

Carry `mode = simulated|live` through links, events, metrics, journals, indexes, and exports. Simulated records cannot mutate live balances or produce real tax receipts or paid/live state. Pages/downloads clearly name simulation; no credentials are required to understand or exercise Phase B.

Define narrow future boundaries: distribute a deterministically evaluated eligible snapshot with a bounded budget; ingest verified gift evidence; request transfer from a reconciled manifest; ingest defined metric evidence. Later adapters can store external IDs/references. Select no SDK/webhook shape/provider now and build no plugin-discovery framework. Before live enablement, prove evidence authenticity, idempotency, supported formats, permissions, reconciliation/refunds, retry semantics, and recipient/disclosure responsibilities.

#### Acceptance criteria

- [ ] The local workflow runs without credentials or outbound ad/payment requests.
- [ ] A simulated event cannot enter live balances or mark a real transfer paid.
- [ ] Missing live capability returns its named blocker while local operations continue.

#### Verification

- **Command:** `node --test tests/marketplace.test.ts`
- **Pass condition:** Exit 0; named scenarios pass with isolated storage and no external credentials.
- **Evidence:** Focused report, fixture outputs, and browser screenshots where applicable; these tests are future implementation deliverables.

### REQ-217 - Complete local marketplace walkthrough

- **Statement:** The local UI shall demonstrate an attributable crowdfunding cycle.
- **Rationale:** Define observable behavior that can be built with the existing application before provider selection.
- **Depends on:** REQ-201, REQ-202, REQ-203, REQ-204, REQ-205, REQ-206, REQ-207, REQ-208, REQ-209, REQ-210, REQ-211, REQ-212, REQ-213, REQ-214, REQ-215, REQ-216, REQ-218

Reuse routes/components: Creator `/projects` becomes offer discovery, project detail adds terms/funding/actions, and submissions use evaluation/needs-fix/appeal UI with no routine owner review controls. Add scoped `/funding`, `/performance`, `/settlements`, public `/campaigns/:id/give` for simulated donations, and `/r/:token` tracking. Public pages show eligible public content only. Donor copy explains the beneficiary, compensation, and simulation; ledger/provider identifiers belong in operator views.

Proposed service surface: GET `/api/offers`, POST `/api/projects/:id/terms`, POST `/api/projects/:id/participations`, POST `/api/posts/:id/distributions`, POST `/api/distributions/:id/tracking-links`, POST `/api/demo/events`, POST `/api/distributions/:id/reservations`, POST `/api/projects/:id/settlements`, GET `/api/settlements/:id/export`, and paginated scoped reports. Status/review endpoints follow current conventions. Enforce scope on all referenced IDs, revision checks on mutable records, and idempotency on financial mutations. Preserve baseline read/storage compatibility; retire generic manual creative-approval writes under REQ-107 with an explicit error rather than silently retaining an override.

Walkthrough includes two independent owners, a business sponsor/nonprofit beneficiary, multiple creators, public donations, seed guarantee/app-use allocation, separate media funding, automatic eligibility, deterministic trial selection, tracked local visit, capture/settlement, commission, duplicate event, partial/full refund, and weekly simulated settlement. Show a named live-capability blocker without requiring a provider. Preserve loading/retry/empty/error states, keyboard dialogs, and mobile/desktop layouts.

#### Acceptance criteria

- [ ] A fictional $100 gift yields $10 creator/$90 beneficiary before fixture fees and one vote.
- [ ] Seed/media are separate; duplicate/refund handling reconciles through restart.
- [ ] Two owners/creators cannot operate each other private records or budgets.
- [ ] The browser completes submission, automatic evaluation, trial selection, export, local giving, reporting, and simulated settlement without owner sign-off or credentials.

#### Verification

- **Command:** `npx playwright test tests/browser/marketplace.spec.ts`
- **Pass condition:** Exit 0; named scenarios pass with isolated storage and no external credentials.
- **Evidence:** Focused report, fixture outputs, and browser screenshots where applicable; these tests are future implementation deliverables.

### REQ-218 - Deterministic initial exposure queue

- **Statement:** Eligible creatives shall receive a reproducible initial exposure opportunity.
- **Rationale:** Replace subjective preselection with audience testing while keeping organization workload bounded.
- **Depends on:** REQ-204, REQ-209, REQ-216

Maintain one queue per campaign/channel/placement/paid-or-organic cohort. A scheduling pass considers current eligible snapshots without holds, accepted participation, campaign permission, and required funded capacity. Choose one waiting creative per stable creator ID in round-robin creator order, then the creator's oldest unsampled snapshot by submitted time and server ID. Persist queue cursor and allocation receipts atomically; retries cannot allocate twice. A policy sets maximum active trials per creator and funded trial allocation, without rewarding submission spam.

For first-party campaign discovery this determines a preview order; for paid social it produces a local bounded test plan/reservation only. An equal initial budget allowance is not a promise of equal platform spend, views, or impressions. Record actual delivery later and compare only cohorts with disclosed comparable exposure; unequal/unknown opportunity cannot quietly become a payout-ready grade. No paid trial is promised without reserved funds; otherwise show waiting for funded capacity.

The queue makes no aesthetic prediction and does not require an owner to pick creatives. More variants can wait behind a creator's active trial. On invalidation release only unused reservations and reevaluate the queue; retain prior actual spend and attribution. The official grade in REQ-215 does not automatically enable performance-based spending: scaling still requires a separately configured, funded allocation policy. Queue records are not external impressions or paid media evidence.

#### Acceptance criteria

- [ ] Identical policy, eligible inputs, cursor, and reserved capacity produce identical next assignments.
- [ ] One creator submitting 100 variants cannot take the first 100 trial slots ahead of another eligible creator.
- [ ] Repeating a scheduling request does not duplicate reservations or assignments.
- [ ] Missing funds or live capability leaves a pending local plan and cannot buy ads or fabricate views.

#### Verification

- **Command:** `node --test tests/marketplace.test.ts`
- **Pass condition:** Exit 0; deterministic ordering, creator fairness, retry, budget, and invalidation cases pass.
- **Evidence:** Queue/receipt fixtures and focused test output; no provider calls or impressions are inferred.

## Data and interface contract

| Entity | Canonical relationship and facts |
| --- | --- |
| Organization | Stable owner/sponsor/beneficiary IDs, type; explicit capabilities rather than permissions inferred from funding |
| Project/offer version | Existing project plus owner/beneficiary; immutable term versions with fixed rate, dates, policy, and fund commitments |
| Participation | Creator + campaign + accepted term version and transitions |
| Snapshot/distribution | Immutable evaluated content with policy/digest/result; each channel/placement occurrence has its own ID |
| Tracking/attribution | Opaque link binding, measured click evidence, gift intent, frozen attribution/adjudication |
| Contribution/event | Source type, purpose, currency/cents, effective state, mode, unique evidence identity |
| Journal | Balanced immutable transaction/entries; source event unique; projected balances are rebuildable |
| Media reservation | Fund source, distribution, bounded reserved/consumed/released cents |
| Guarantee | Covered creators/periods, floor, reserved seed liability, independent top-ups |
| Settlement | Reconciled source liabilities, period, mode, immutable approved manifest, transfer evidence/status |
| Metric/ranking snapshot | Source/window/definition/mode, corrected inputs, normalization, fixed weights, eligibility |
| Audit event | Stable actor ID, operation, scope, timestamp, evidence/correlation ID; no secrets in logs |

Dates in baseline project forms remain real `YYYY-MM-DD` calendar dates interpreted inclusively in UTC. Offer versions derive explicit UTC start/end instants from those dates (start at 00:00, expiry at the following day's 00:00, exclusive). Active terms freeze these instants; a later project-date edit cannot rewrite existing link or financial eligibility. Timestamped financial periods use `[start, end)` to prevent an event on a boundary belonging to two periods. A UTC clock can be injected into domain fixtures.

Keep existing API field validation and sanitized JSON errors. Use 400 for invalid input, 403 for denied actions, 404 for unavailable scoped resources, 409 for stale revisions/invalid transitions/budget conflicts, and sanitized 500 for unexpected failures. Preserve no-store API responses, validated media types, and cross-origin-write controls. Existing demo role headers remain local-only; do not confuse a financial API's idempotency key with authorization. Extended demo wire roles are `admin`, `owner`, and `creator`; owner uses `x-demo-organization` and must resolve to an existing organization. Keep legacy `nonprofit` plus `x-demo-nonprofit` as a compatibility alias only for actual nonprofit owners. The UI still has three workspaces, and upgrading a saved nonprofit role to owner requires fresh organization selection. Neither header is production identity.

Routes retained: `/projects`, `/projects/:id`, `/review`, `/posts`, `/approved`, `/activity`. New routes are specified by REQ-217. Direct routes enforce the same scope as navigation. Sidebar labels adapt to Campaign Owner in the extension; empty selection screens show no private data. Existing creator ownership, public eligible projections, and scope-change request cancellation remain mandatory.

Use the current design tokens: primary ink #292d27, muted #797e73, background #fafbf8, border #e6e8df, lime #dced91, forest #344938, default radius 14px, desktop sidebar 239px. Retain DM Sans/Manrope with system fallbacks, outlined icons, local nature/community images with attribution, and the current responsive shell. Required reference viewports are 1440 x 1050 and 390 x 664 CSS pixels. Use labeled semantic controls, visible focus, keyboard/Escape dialog handling, focus containment, error alerts, and no horizontal page overflow. Preview icons and fictional metrics must not appear to be functioning external social features.

## Constraints

- The fixed 1000-basis-point rule and donation/seed/media purpose separation are invariants enforced on the server, in migrations, and in fixture ingestion.
- No ad creation/export/view/click alone creates affiliate compensation. Eligible completed attributed gifts drive the protected share.
- No application of a provider's alternate commission rate, fee, billing threshold, or attribution claim can silently change the internal contract.
- Historical records remain immutable; new facts append corrections with evidence. Every financial mutation is atomic, scoped, mode-specific, and replay-safe.
- Content eligibility, campaign visibility, export, live ad delivery, gift capture, fund settlement, and creator payment are independent states.
- Preserve current working data and stack. Provider selection cannot block Phase A or B or become a reason to replace the application.

## Dependencies and assumptions

The source model is nonprofit donation crowdfunding with businesses as campaign owners/sponsors/funders, not an open retail affiliate store. This is a deliberate retrofit preserving the existing donor-to-creator/nonprofit split. A campaign owner supplies its own offers; integration into an external affiliate network's catalog is outside current scope.

Crowdfunding, seed guarantees, and the 10% share are retained. The old documents do not define the crowd as an investment vehicle or settle the seed amounts/fee/guarantee formula. The local floor/top-up, seven-day attribution, USD rounding, and reservation rules are explicit product choices. The user has also approved the fixed-target four-metric grading policy in REQ-215; all simulation/configuration remains labeled. They are not claims about current provider behavior or prior implemented features.

Only existing libraries/runtime are needed for Phase B. A fresh install uses `npm install`, `npm run dev`, and the existing environment settings: `PORT`, `SLANDER_DATA_DIR`, and `SLANDER_EMPTY`. Node 24+ is required. `SLANDER_EMPTY=1` applies only to a new database and must never erase an existing one. Data paths remain `data/slander.sqlite` and `data/uploads/`; protect and back up both.

## Open questions

No unanswered provider choice prevents designing or implementing Phase B. Required campaign-specific amounts, dates, guarantee coverage, fee allocations, and minimum-view thresholds are runtime configuration with explicit gates, not permission to invent fixed business values.

The following unresolved items apply only before **live launch**. They must not be treated as requirements to install a third-party service now:

| Gate | Evidence/decision needed | Remains usable locally |
| --- | --- | --- |
| L01 Ad delivery | Which channels/placements, verified account/brand permission, supported formats, budget payer, actual cap/overdelivery behavior, API capability and fees | Offer permissions, distribution planning, manual export, media reservations |
| L02 Donation collection | Legal recipient/custodian, verified receipt/capture/settlement/refund semantics, exact attribution fields, authentic evidence, fee payer, donor receipt issuer | Crowdfunding fixtures, suspense, allocation, corrections |
| L03 Creator transfers | Verified recipient/tax onboarding where required, payout rail, hold/reserve and post-payment recovery policy, confirmed transfer outcomes | Reconciled earnings, guarantee calculation, weekly settlement manifests |
| L04 Metrics | Evidence source and definitions for impressions/outbound clicks/views, attribution windows, source completeness and corrections | Labeled simulated analytics and optional standings |
| L05 Hosted identity/media | Verified sessions/memberships, account verification, durable access-controlled media, operational backup/restore | Explicit demo selection and local scope behavior |
| L06 Campaign/recipient rules | Confirm disclosures, fundraising/creator compensation arrangement, return/reallocation of unused restricted funds, applicable receipt and recipient obligations | Fictional scenarios and separately recorded fund purposes |

Do not promise a tax-deductible gift, verified external ad delivery, actual collected cash, or actual creator payment before the relevant gates are satisfied. Earlier crowdfunding-vendor recommendations in `docs/crowdfunding-platform-research.md` remain background research; no recommendation there selects a vendor for this version.

## Incremental build order

1. Preserve the existing core and data while replacing routine manual approval; add migration/rollback scaffolding, pure money/eligibility functions, and the new focused tests. Avoid a new-repository rebuild.
2. Extend ownership, offer terms, creator consent, immutable snapshots, private media associations, and distribution identities.
3. Add purpose-specific funding, the balanced journal, replay-safe source events, refunds, reservations, seed guarantees, and weekly reconciliation. Verify failure/concurrency cases before presenting simulated earnings.
4. Add local tracked donation pages, scoped report projections, economic metrics, and optional standings. Use the same domain functions for fixtures and future adapters.
5. Complete the browser walkthrough, persistence/restore evidence, compatibility suite, accessibility, and documentation of remaining live blockers.
6. Stop at the named live-capability gates. Choose external services later, map their evidence into the established contract, and validate them before enabling effects. No provider is required to understand the local build concept.

## Ralph completion contract

This document revision is complete as a product specification. It is **not Ralph-ready**: the added acceptance test files are not implemented, baseline commands were not rerun for this document-only edit, and the full live launch still has L01-L06 dependencies. No automated loop or application implementation is authorized by this PRD revision itself. Do not mistake a structural documentation audit for passing application behavior.

For a separately authorized Phase A/B implementation, establish the named tests and run these commands from the repository root:

| Order | Requirements proved | Command |
| --- | --- | --- |
| 1 | REQ-101, REQ-102, REQ-103, REQ-104, REQ-105, REQ-106, REQ-107, REQ-108, REQ-109, REQ-110, REQ-111, REQ-112, REQ-113, REQ-114 retained compatibility, intentional eligibility-workflow changes, types, and HTTP regression | `npm run check` |
| 2 | REQ-201, REQ-202, REQ-203, REQ-204, REQ-205, REQ-214, REQ-216, REQ-218 | `node --test tests/marketplace.test.ts` |
| 3 | REQ-206, REQ-207, REQ-208, REQ-209, REQ-210, REQ-211, REQ-213 | `node --test tests/finance.test.ts` |
| 4 | REQ-212, REQ-215 | `node --test tests/analytics.test.ts` |
| 5 | REQ-101, REQ-102, REQ-112, REQ-217 plus baseline browser regression | `npm run test:e2e` including the new `tests/browser/marketplace.spec.ts` |
| 6 | All changed application sources and configured formatting paths | `npm run format:check` |

Each test must actually assert its referenced acceptance criteria; an empty/skipped passing suite is insufficient. Use isolated databases/uploads, never user demo data. Browser tests use both declared viewports. In a fresh machine, install Playwright's Chromium with `npx playwright install chromium` before browser checks. Add fixtures for simultaneous reserves, duplicate/changed events, refund-before-capture, cent boundaries, delayed receipts, late adjustments, missing metrics, cross-scope access, and simulated/live separation.

Completion of Phase A/B requires:

- [ ] Every acceptance criterion in REQ-101 through REQ-114 and REQ-201 through REQ-218 is demonstrated, with no undocumented exceptions.
- [ ] Each listed command is exercised and passes with meaningful assertions; preserve logs, query plans, financial fixture outputs, and browser reports.
- [ ] Existing project/content/media identities survive migration, restart, and backup/restore.
- [ ] Journals reconcile; the creator rate remains 10%; no donation/seed/media cent is allocated twice.
- [ ] All local walkthroughs run with no external credentials and no real ad/payment operations.
- [ ] Live capabilities remain disabled with specific gates displayed. Phase A/B completion does not assert production/live readiness.

## External platform-review boundary

Removing Slander's routine organizational sign-off cannot remove a platform's own review of paid ads. Google reviews ad content/destinations and marks eligible or disapproved; TikTok similarly describes its own ad review. No local deterministic check is a promise of platform approval. Budget authorization and verified account/channel permission also remain necessary independently of creative eligibility.

Sources checked for this revision: [Google ad review](https://support.google.com/google-ads/answer/1722120), [TikTok ad review](https://ads.tiktok.com/resources/help/article/ad-review-faq), [Google invalid traffic](https://support.google.com/google-ads/answer/11182074?hl=en), and [Google experiment allocation](https://support.google.com/google-ads/answer/13826584). The last explains why traffic splits do not guarantee equal spend or impressions. The official grading design in REQ-215 is an approved product policy, not a platform recommendation.

## Research trace and revision record

The second set of companies discussed in this chat were third-party networks/marketplaces. Their relevant shared features inform Slander's offer directory, per-campaign permission/terms, partner participation, tracking, reporting, and payout administration. The earlier fixed-brand shortlist is not the target model. There is no universal network payout per ad; the offer defines its conversion payout, and Slander deliberately preserves the user's fixed rate instead of importing an offer-dependent one.

Reference pages already researched in the conversation (examples only; no account is connected and no vendor is selected):

- [Awin network and program-specific promotion rules](https://www.awin.com/gb/faqs)
- [impact.com marketplace and brand terms](https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/working-with-brands/applying-to-brands/find-and-apply-to-brands)
- [CJ publisher/advertiser model](https://www.cj.com/support)
- [PartnerStack partner marketplace](https://partnerstack.com/partners-and-publishers)
- [ClickBank marketplace and product-specific commission](https://support.clickbank.com/en/articles/10535269-what-is-the-clickbank-marketplace)

Detailed edit rationale, removed duplication, and new requirements are recorded in `outputs/Slander-Rebuild-PRD-Changes.md`. The structural audit of this second PRD is `outputs/Slander-Rebuild-PRD.audit.json`; the original `docs/PRD.audit.json` still describes the historical first PRD and is not a verification report for this version.

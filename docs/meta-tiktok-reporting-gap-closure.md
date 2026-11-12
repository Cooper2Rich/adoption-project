# Meta/TikTok reporting gap closure: documentation delta

Research date: 2026-11-09 (America/Chicago). **O-01 remains OPEN; launch readiness remains Blocked.**

The request's “O-02 reporting” is an alias for this assignment only: the [launch PRD](PRD-adoption-is-launch.md) assigns reporting to **O-01** and Stripe to **O-02**. Preserve both IDs; this report does not investigate Stripe.

This supplements [the existing V01–V20 matrix](o-01-reporting-validation.md), [metric research](meta-tiktok-metrics-research.md) and [provider research](provider-research-adoption-is-launch.md). It adds documentation deltas and execution boundaries, not a second request matrix. M1–M3/T1–T3 below retain that matrix's contract names.

Read repository instructions, issue-tracker/domain guidance, GLOSSARY.md and the above research. No issues, PRs or commits were published. No accounts, credentials, ads, spending, provider contact, runtime changes or product-policy changes were involved.

## Evidence rules

- **D-live:** readable official page inspected in this run.
- **D-index:** indexed text at the exact official URL; direct open supplied no readable body. Weaker retrieval provenance, not account evidence.
- **Closed-documentation:** only the bounded question stated in the ledger is resolved. It does not pass a V case.
- **P:** an accessible authoritative specification or dated provider answer is still needed. Support contact is unnecessary if current documentation supplies it.
- **A:** isolated-account evidence required. **Every account check is NOT RUN.**
- **I:** investigation design/inference; no adopted implementation or scoring choice.

Documentation establishes defined behavior/support; accounts establish behavior observed for recorded configuration. Neither silently replaces the other. Matching observed counts cannot prove semantic equivalence; stable historical snapshots cannot prove permanent finality.

## Gap ledger: what documentation actually closes

The following are narrow additions to the prior note. “Closed” never means O-01 or an entire V case is closed.

| Gap | Exact closed evidence | Actionable delta / remaining boundary | Matrix |
| --- | --- | --- | --- |
| D1: Can a legitimate no-delivery async query omit rows? | **Closed-documentation, D-index:** T3's `dimensions` note says a query with more than `xx_id` and no ads reporting in the range returns an empty list. [S1, Dimensions] | An absent daily row can be consistent with no delivery. The converse is unproven: an empty result does not certify complete zero. Require independent inventory, interval and processing evidence; do not generalize to Meta or T2. | V10/V11/V13 |
| D2: Can an async reference mix arbitrary advertisers or use arbitrary filters? | **Closed-documentation, D-index:** T3 advertisers must belong to the same TikTok for Business user; filters are limited to campaign/ad-group/ad IDs or creation time, at most 20,000 IDs. [S1, Notes/Advertiser IDs] | Prepare advertiser-owner manifests and separate requests when needed; do not reuse every T2 filter in T3. This does not prove enumeration completeness or historical retention. | V01/V12/V13 |
| D3: Is an async country field necessarily a code? | **Closed-documentation, D-index:** T3 lists a known issue returning `country_code` as `country_name`. [S1, Known issue] | If country is used in a diagnostic export, preserve actual headers and values; a mislabeled name must not become a fabricated code. Country is not a new required campaign breakdown. | V11/V13 |
| D4: Can V09 rely on changing a TikTok account's zone? | **Closed-documentation for agency setup only, D-live:** account timezone affects reporting and cannot be changed after registration in Agency Business Center. [S2, Tips] | Use existing isolated accounts with suitable zones for that setup; no timezone-mutation experiment. The account's actual zone, historical DST rules and API bucket behavior still need evidence. Other ownership setups are not certified by this agency guide. | V06–V09 |
| D5: Does “all pages” escape the synchronous cutoff? | **Reconfirmed-documentation, D-index:** T2 truncates ads; its aggregate can also be truncated. Async output/Ads Manager exports are the documented reference pair. [S3, Introduction/Total metrics] | This was already known: no new closure. V12 needs independent ID partition coverage; V13 needs async/reference parity. A clean page manifest or matching truncated total cannot replace either. | V12/V13 |
| D6: Is a deleted-source inventory worth probing? | **Closed-documentation for legacy status taxonomy, D-index:** primary `STATUS_ALL` includes deleted entities; `STATUS_NOT_DELETE` excludes them and is the stated default for legacy BASIC/AUDIENCE/CATALOG sync reports. [S4, Primary status] | Add explicit default-versus-inclusive inventory/report comparison where the selected version supports it. This is a legacy warning, not proof that the same filter exists in v2 or deleted history survives indefinitely. | V05/V10/V12/V14 |

D1–D4 and D6 reduce avoidable ambiguity; D5 prevents overstating prior research as a new discovery. None establishes cross-provider click equivalence, full Chicago coverage or affirmative completeness.

## Unresolved specifications: keep these out of the observation-only bucket

| ID | Exact authoritative clarification still needed | What would close it / cases affected |
| --- | --- | --- |
| P1 | Meta API definitions for `inline_link_clicks` and `outbound_clicks`, destination/format coverage, repeat-click counting, action-array/window/report-time behavior and revisions; TikTok v2 `clicks` definition for intended formats. | Current versioned field/format definitions plus mapping to REQ-114's agreed total link clicks. Equal dashboard/API numbers do not suffice. V03; P questions 1/4 in prior note. |
| P2 | Minimum reporting, inventory and timezone-metadata scopes/roles; app access/review requirements and selected token-flow lifecycle for each provider. | Endpoint-specific permission documentation and applicable ownership/access model. An issued token or broad management example is insufficient. V01/V17; prior questions 2/5. |
| P3 | Meta supported metric/publisher/position/hour combinations, inclusive/exclusive dates, historical timezone/DST rules; TikTok v2 metric/dimension/placement compatibility and repeated-hour rules. | Current combination tables and unambiguous interval rules for the required grain. Enum presence is not combination support. V04/V06–V09; prior questions 3/4. |
| P4 | Canonical T2 HTTP method/encoding; current filtering syntax and timezone-option scope. | Resolve S3's POST/JSON request table versus GET example. Its filter descriptions also retain singular `filter_value` while the field is plural; advertiser text retains an older timezone-option name. A supported corrected example is needed. One successful method is only A evidence. V02/V09; prior question 4. |
| P5 | Both providers' affirmative-zero/complete-source rules, omission/suppression semantics, historical/deleted-source availability, processing-stage evidence and revision limits for the selected contract. | Scope-specific inventory/reporting procedure and complete-period evidence; distinguish retention from query-span limits. D1 supplies only one conditional omission rule. V10–V14; prior questions 3/5/6. |
| P6 | Endpoint-specific capacity budgets, throttle/error/retry guidance and freshness/correction applicability, especially synchronous reads, status/download and inventory. | Current endpoint/account/app rules and selected processing category. Async creation quotas cannot answer synchronous capacity. No new Meta budget or finality SLA was established. V14/V15; prior questions 3/5. |

Official TikTok UI definitions distinguish destination clicks, social-inclusive all clicks and impressions [S5]; the indexed v1.3 table maps `clicks` to destination clicks [S6]. Both were already established. They still do not close P1's v2/Meta equivalence question.

## Isolated-account prerequisites and shared acceptance rules

These are future investigation prerequisites, not authorization to perform operations.

1. Authorized isolated app/principal and advertiser assets; explicit read-only grants and roles, ownership/access mode and app-review status. Inventory/timezone reads must be authorized separately from reporting. Do not add write scopes as a shortcut.
2. Pin supported API versions, source definitions and exact request contracts. Record unresolved P items; exploratory success can be recorded while specification closure remains BLOCKED.
3. Manifest intended formats, destinations and eligible placements, with stable ad/asset-to-competition-entry aliases and effective intervals. Include representative existing approved delivery and no-delivery controls. Unused formats are out of scope.
4. Historical data spanning ordinary Chicago midnight/week boundaries and both DST changes; record actual account zones and zone database version. A newly empty account cannot supply these observations.
5. Reference exports with matching filters, metric names, account zone, attribution/report settings and processing/as-of stage; independent inventory including removed/deleted sources where supported.
6. For each execution retain the prior note's evidence bundle E: secret-free requests, all responses/headers/pages/files and hashes, trace IDs, version/grants/manifest, expected/observed diff and result rationale. Redact token-bearing cursor URLs and personal identifiers.

**PASS** requires applicable authoritative semantics plus the case's observed evidence; it means only the recorded scope passed. **FAIL** records a demonstrated contradiction. **BLOCKED** means required documentation, access, representative delivery, distinguishable reference evidence or supported granularity is missing. No artificial invalid traffic, quota abuse or new paid delivery is needed for this plan. Any later setup, spending, destructive mutation or revocation requires explicit authorization for that isolated operation.

## Account work remaining, mapped to V01–V20

This compact ledger specifies the remaining evidence boundary; execute the full existing matrix for request detail. **All A portions below: NOT RUN.**

| Cases | Isolated-account observation / required evidence | PASS boundary; BLOCK condition |
| --- | --- | --- |
| V01 | Read M1, inventory and M2 separately with minimal candidate scope; T2/T3 and inventory with actual reporting grants. Retain endpoint/grant/role results. | Necessary reads succeed under documented minimum (P2); denied reads or unknown review requirements block. No write operation is required. |
| V02 | Capture both T2 method probes on one historical scope, full response schema/provider codes and current supported example. | Canonical supported contract resolved (P4) and valid returned data; HTTP success alone cannot pass. |
| V03 | Read both Meta click candidates and TikTok candidate fields for each intended destination/format; compare named reference columns. | P1 supports the agreed metric and observed mapping; numerical equality alone or unavailable representative format evidence blocks. |
| V04 | Compare unbroken versus eligible publisher/position/hour combinations for intended Meta/TikTok placements at identical scope/as-of stage. | P3 and observed compatibility separate required sources and explain reconciliation. Unknown publishers or rejected necessary combinations block. |
| V05 | Read actual IDs for synthetic entry mappings, replacement creative and any in-scope Smart+ asset group. | Each fact maps once to one entry/effective interval. An inseparable group spanning entries blocks; display names cannot rescue it. |
| V06 | Read all overlapping source dates around ordinary Chicago midnight and Sunday/Monday; compare independently supported intervals. | Exact inclusive-start/exclusive-end allocation; ambiguous aggregates without stronger bucket/reference evidence block. |
| V07 | Inspect spring-change historical reporting against the prior 23-hour day/167-hour week fixtures. | Documented hour mapping and representative totals agree; no delivery/granularity/reference to distinguish error means BLOCKED. |
| V08 | Inspect fall-change historical reporting against the prior 25-hour day/169-hour week fixtures. | Both repeated hours retained or documented combined bucket preserves counts. Ambiguous labels without supported mapping block. |
| V09 | Compare relevant existing account zones and supported query-zone variants; document selection versus output-bucket effects. | Exact Chicago reconstruction or proven aligned daily boundaries. D4 disallows assuming a zone can be edited; daily proration fails. |
| V10 | Read inventoried no-delivery and impressions-with-zero-click controls at established processing stage, with complete response/export coverage. | Explicit zero or supported no-row rule plus affirmative full-scope evidence for each metric. D1/empty lists alone remain BLOCKED. |
| V11 | Capture naturally available missing/suppressed/omitted responses, if encountered in the required contract. | Observations are labeled by source; no need to provoke rare cases. Fixtures pass parser behavior only and cannot establish actual omission semantics (P5). |
| V12 | Force ordinary pagination via small page size; reconcile all pages/partitions against independent inclusive inventory. Capture warnings if naturally present. | Every expected ID accounted for once with no unresolved truncation. Large-cutoff fixture handling needs documented contract; do not create thousands of ads to exercise it. |
| V13 | Observe T3 task lifecycle, download whole output and reconcile to matched Ads Manager export; apply D1–D3. | Terminal success, intact file, explained per-ID/metric differences and compatible grain. Task acceptance/download URL alone or unexplained mismatches block. |
| V14 | Re-read the same closed periods at the prior checkpoints; inspect oldest needed range and available archived/deleted-source history. | Needed historical reach and explainable revisions/upserts with P5 support. Bounded stability cannot pass a permanent-finality assertion. |
| V15 | Collect normal headers/errors and calculate exact read/backfill demand under P6's budget; controlled throttle only if explicitly authorized. | Documented feasible capacity plus observed normal behavior. Fixtures suffice for rare retry paths; missing synchronous budget stays BLOCKED. |
| V16 | **No isolated account required.** | Application-only; see exclusions below. |
| V17 | One separately authorized isolated token revocation followed by read; capture provider denial and subsequent recovery if authorized. | Denial classified as access loss, never zero. Outage/coverage clocks and recovery deduplication are app tests; not reasons for more provider mutations. |
| V18 | **No new account operation required** beyond reports captured above. | Replay retained snapshots locally to prove deduplication; provider semantics remain governed by P1/P3/P5. |
| V19 | **No isolated account required.** | Application-only certified metric correction authority. |
| V20 | **No isolated account required.** | Application-only completeness/finalization policy. |

No A case was executed, failed, blocked by a live response or passed in this research. Future missing prerequisites should be recorded as BLOCKED rather than a skipped PASS.

## App-only work excluded from the account bucket

- V16: first-import activation persistence, restart and strict greater-than-five-minute incident threshold.
- V19: certified metric correction scope, precedence, conflicts, explicit release and audit history.
- V20: complete/known-zero/missing/certified period readiness, 48-hour behavior and later correction handling.
- V18: snapshot replacement, overlapping imports, duplicate pages and total-versus-components deduplication using captured/labeled fixtures.
- V11/V12/V13/V15: parser omissions, malformed values, failed pages, partial/corrupt downloads, expired/failed tasks, synthetic cutoff/throttle/timeouts and retry/recovery paths. Fixtures establish application behavior only.
- V17: successful unchanged versus successful-but-incomplete imports, failed-operation clock handling and one recovery notification. Only the separately authorized revocation/read observation needs an account.
- V06–V09: local interval arithmetic and boundary fixtures. These cannot establish provider hour identities or event-level allocation from aggregate reports.

Application checks remain NOT RUN here too. No executable verifier, production polling policy or automated completeness rule is introduced by this research.

## Source register and current access limitations

All URLs below were checked on the research date. Citations identify exact owning sources; indexed text is not represented as readable live documentation.

- **S1 — D-index:** [TikTok v2 async creation](https://business-api.tiktok.com/portal/docs/create-an-asynchronous-report-task/v2.0), Notes, Advertiser IDs, Dimensions. Direct open: zero readable lines; targeted search returned the relevant official text. No live task was created.
- **S2 — D-live:** [TikTok Agency Business Center assets](https://ads.tiktok.com/resources/help/article/manage-assets-agency-business-center?lang=en&redirected=2), Tips; page dated May 2024. Its agency-only scope is explicit.
- **S3 — D-index:** [TikTok v2 synchronous reporting](https://business-api.tiktok.com/portal/docs/run-a-synchronous-report/v2.0), Introduction, Request, Example and Response. Direct open: zero readable lines; indexed page exposed the unresolved method/filter/timezone inconsistencies. No live request was sent.
- **S4 — D-index:** [TikTok status/placement enumeration](https://ads.tiktok.com/gateway/docs/index?doc_id=1737174886619138&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH), Primary Status. Indexed legacy defaults are not a v2 filter guarantee.
- **S5 — D-live:** [TikTok basic metric definitions](https://ads.tiktok.com/resources/help/article/basic-data?lang=en), Core metrics; page dated October 2025.
- **S6 — D-index:** [TikTok v1.3 per-dimension metric table](https://business-api.tiktok.com/portal/docs/supported-metrics-for-a-dimension-in-basic-reports/v1.3). Reverified legacy mapping, not new v2 support evidence.
- **M1 — D-live, limited:** [Meta-owned Marketing API Postman collection](https://www.postman.com/meta/facebook-marketing-api/collection/0zr4mes/facebook-marketing-api-mapi), Requirements, Permissions, Pagination. Broad management permissions and pagination examples do not establish the reporting-only minimum; no new Meta semantic closure.
- **M2 — inaccessible:** [Meta Insights overview](https://developers.facebook.com/docs/marketing-api/insights/) returned HTTP 429; [Insights reference](https://developers.facebook.com/docs/marketing-api/reference/ads-insights/) and [ads_read reference](https://developers.facebook.com/docs/permissions/reference/ads_read/) were inaccessible through the research tool.
- **M3 — inaccessible:** [Meta link-click help](https://www.facebook.com/business/help/674769555983979) and [outbound-click help](https://www.facebook.com/business/help/659185130844708) redirected to login/temporary-block content. Unseen definitions are not cited as resolved evidence. Secondary mirrors/search results were excluded.

Targeted official searches did not yield a usable current v2 metric/dimension compatibility table. Navigation titles alone are not evidence of its contents. The prior note's pinned Meta SDK schema remains schema evidence; it was not reclassified as metric definitions or a support guarantee.

## Handoff

Documentation closes the limited D1–D4/D6 questions and reconfirms D5. P1–P6 remain unresolved specifications; all applicable isolated-account observations remain NOT RUN. No total-link-click field choice, zero certification rule or Chicago reconstruction contract is approved.

First resolve P1/P2/P4 and secure representative authorized historical evidence; then execute the existing matrix with the deltas above. P3/P5/P6 must accompany the affected cases before declaring them passed. Keep app-only verification separate in V-01 readiness work.

If comparable fields, separable entry identity or complete Chicago coverage prove unavailable, return that concrete limitation through the PRD's existing product-review process. Do not redefine scoring, missing-data handling, finalization or certified metric correction policy.

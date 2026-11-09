# Meta and TikTok advertising integration: production access evidence

Research date: 2026-11-09. Context: [Establish Meta and TikTok production access and advertising API requirements](https://github.com/Cooper2Rich/adoption-project/issues/10), child of [Plan Meta and TikTok client-owned advertising integrations](https://github.com/Cooper2Rich/adoption-project/issues/9).

## Context and evidence boundary

User decisions: plan only; setup and coding follow later. Clients own advertising accounts. The starting brief specified direct provider payment; the latest map now records a superseding billing decision, described below. Slander must create ads, change campaigns and import performance. adoption.is is first; connections must be reusable for later clients. App authorization grants delegated access, not ownership or permission from the client to spend arbitrary amounts.

Concurrent map update observed at publication (2026-11-09): Slander is now to collect advertising funds, primarily public advertising crowdfunding plus client contributions, and fund/pay the providers through a supported mechanism. This supersedes direct client billing. [Verify supported Meta and TikTok ad-account funding mechanisms](https://github.com/Cooper2Rich/adoption-project/issues/15) and [Choose advertising fund collection and platform payment model](https://github.com/Cooper2Rich/adoption-project/issues/16) cover that separate work. This note researches advertising access and control only; it proves no funding/payment capability. References below to the starting direct-billing arrangement describe the original brief, not the latest map destination.

Inspected local context at repository HEAD `be42c9c029fcceee62e0910af1cadb59b74678af`: `AGENTS.md`, `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, `GLOSSARY.md`, `src/public-demo/ad-platforms.ts`, `src/types.ts`, and the following user-owned untracked files. These files may be absent on this research branch: `docs/PRD-adoption-is-launch.md`, `docs/o-01-approval-wizard.md`, `docs/o-01-reporting-validation.md`, `docs/meta-tiktok-reporting-gap-closure.md`. References here record the local evidence inspected; they do not imply those documents were committed.

The existing PRD explicitly excludes automated advertising writes and a multi-organization launch. This map expands the intended integration scope; the PRD has not been updated. The O-01 wizard records reporting setup metadata and explicitly lacks a real OAuth callback/token service. No approvals, account readiness, production access, tests, billing configuration, credentials or live operations were established here.

Evidence notation: **D-live** = readable first-party page; **D-index** = first-party text exposed by search while direct portal rendering was empty; **S** = first-party generated SDK schema, not endpoint permission/eligibility proof; **P** = unresolved provider documentation; **A** = account-specific observation still required; **R** = research recommendation, not a human decision. All sources were checked on the research date. Search-result indexing can lag current provider behavior.

## Identity and access boundaries

| Identity or resource | Meaning for this plan |
| --- | --- |
| Human login | A real operator/administrator who can consent or manage business assets. Slander application login is separate. |
| Client business | Owner of the client ad accounts and brand assets; payment responsibility is separate and now governed by the funding tickets. |
| Agency business workspace | A possible delegated asset-access container; choosing agency-managed onboarding versus client self-connect remains a human decision. |
| Developer account and app | Registration and application identity under which API permissions/review are evaluated; not the advertiser or organic brand profile. |
| Advertising account | Billing, currency, timezone, role and campaign container; use the provider's actual ID. |
| API grant/principal/token | A particular authorization through an app, constrained by permissions and accessible assets. It can fail independently of business ownership. |
| Advertising identity | Facebook Page/Instagram identity or TikTok account/post permission used by creative; distinct from access to the ad account. |
| Slander campaign / competition entry | Internal records. A platform campaign, ad group/ad set, creative, ad or post is a separate external object. |

These boundaries combine the Meta prerequisites [M1], TikTok asset-role documentation [T1], advertiser consent/errors [T4–T5] and TikTok identity linking [T2]. **R:** preserve existing legitimate human identities and reuse appropriate client-owned accounts rather than inventing one login or advertiser per Slander campaign. Exact onboarding ownership remains [Choose client onboarding and authorization ownership](https://github.com/Cooper2Rich/adoption-project/issues/11).

## Meta: established facts and unresolved production gates

**D-live [M1]:** Meta's own Marketing API collection separates developer account, app, advertising account, permissions and access token. It supports user and system-user token paths. Its permissions section distinguishes Standard Access for one's own account from Advanced Access to `ads_read` and/or `ads_management` for other people's accounts. Client-owned accounts therefore require planning for the third-party path even if only adoption.is launches first. The collection is a broad management example; it does not prove the minimum permission combination for every reporting or asset endpoint.

**P:** the current detailed authorization, access, App Review and business-verification pages could not be read [M2–M6]. Do not infer that partner sharing turns client accounts into app-owned accounts, that adding users as app testers enables production third-party service, or that a system-user token bypasses review. Current App Review submission requirements, business verification, any applicable provider/access assessment, app mode, privacy/deletion obligations and ongoing compliance checks must be confirmed through readable official documentation and the selected app dashboard before rollout. No extra named certification, lead time, automatic exemption or current assessment-retirement date is certified here.

**R:** map each intended operation to an endpoint and least required permission: reporting; account/campaign inventory; Page/Instagram identity discovery; media upload/creative creation; campaign/ad-set/ad creation; pause/resume; budget update. Treat `ads_read` and `ads_management` as documented candidate permission families, not a universal two-scope recipe. Confirm whether business and Page permissions are needed for the chosen discovery and creative path; avoid requesting unrelated finance or organic publishing access.

**S [M7–M8]:** generated creative fields include image references, story references/specifications and Instagram identity. Campaign fields distinguish daily/lifetime budgets, configured/effective status and spend cap. This supports modeling creative and delivery state independently. It does not establish mandatory Page/Instagram relationships for every placement, media dimensions/durations, supported objectives, allowed budget combinations, minimum spend, or permission sufficiency. Those remain **P/A** for the workflows selected in the human decision ticket.

**P/A lifecycle:** do not hardcode a universal expiry or assume a token is irrevocable. M1 gives token examples but its generalized expiration prose is insufficient for the chosen production grant. Confirm the actual token type, expiry/data-access expiry where exposed, principal, granted scopes and assigned assets; document renewal/re-consent, user removal, business asset removal, deauthorization and app-secret rotation behavior. The current source for revocation/deletion callbacks and deadlines must be established before implementation. A locally deleted connection record proves none of these external effects.

## TikTok: established facts and unresolved production gates

**D-index [T3]:** API for Business developer registration precedes app creation. Registration requires a verified company-domain communication email, a relevant company identity and functioning public company website on its owned domain, a developer location and a detailed use-case description. It offers Technology Company, Direct Advertiser and Agency types and states that individual/personal developers cannot currently be onboarded. This is a genuine eligibility gate for Slander's eventual app-owning entity, not evidence the gate has been passed. The registration page's review estimate is not an end-to-end production approval promise.

**P:** developer-app creation and App permissions pages returned no readable content [T6–T7]. Exact Marketing API permission names, review submission evidence, access tier, legal/business verification requirements, allowed third-party use for the selected entity/region and allowlists remain unverified. TikTok's FAQ does document allowlist applications as a separate capability gate [T8]. Do not substitute TikTok for Developers Login Kit/Content Posting approval: its own FAQ routes advertising APIs to TikTok for Business [T9].

**D-live [T1]:** requesting another business's advertising account requires a Business Center administrator and owner approval; disapproved accounts cannot be requested. Analyst can view ads/performance; Operator can create/edit campaigns and view performance, and also includes finance powers. Admin additionally manages account settings/permissions. Thus an Analyst-based O-01 setup is insufficient for writes. Operator is not a bespoke Slander spending or funding policy; do not interpret its provider powers as product authorization or a requirement to transfer client billing to Slander.

**D-index [T4–T5]:** the advertiser authorizes the selected API app and requested permissions; the flow includes identity verification and a callback code exchange through a server endpoint. Permission errors can require reauthorization or restoring the authorizing person's advertiser access. Business Center account access and app consent are separate prerequisites.

**Lifecycle, narrowly scoped [T5]:** the indexed FAQ describes the advertiser token from `/oauth2/access_token/` as non-expiring and explicitly revocable through `/oauth2/revoke_token/`; organic account tokens use a different path and refresh lifecycle. Its table says Marketing authorization codes are one-use and valid one hour, but the same page's error section says ten minutes. **P:** resolve that contradiction before implementing exchange deadlines. T4's localhost allowance also conflicts with T5's public-callback troubleshooting; use a controlled public callback in the future and verify the selected flow. Neither non-expiring text nor successful consent guarantees continuing asset access. No refresh-token lifespan or universal Marketing-token lifetime is asserted for other token families.

**D-index [T10]:** Custom Identity is being phased out; starting January 2026 new campaigns must link to a TikTok account, with listed exceptions for Branded Mission, Sales–TikTok Shop, Smart Creative toggle, manual catalog campaigns and Pangle/Global App Bundle-only placement. **R:** plan the initial ordinary TikTok advertising flow around an actual authorized TikTok identity; do not rely on a fictional display name/avatar. Confirm the chosen API mode and advertiser eligibility, rather than converting an Ads Manager policy into a claim every API parameter is available.

**D-live [T2]:** linking a TikTok account for delivery requires Business Center admin action and approval by the logged-in TikTok account user through a QR code. Permissions distinguish existing posts, publishing/managing new videos, ads-only versus organic-profile visibility, and other capabilities. The linked identity subsequently needs connection to the advertising account. Ad-delivery authorization is not unrestricted account management. Creator posts need their own applicable authorization; uploaded creative does not grant rights to impersonate its creator.

**D-index [T11]:** adding the separate TikTok Accounts scope invokes an Accounts API application form requirement from March 20, 2026. That scope covers organic account functions, including publishing and post ad authorization; it is not automatically required for every Marketing API creative. Decide the actual Spark/brand-post workflow before expanding scopes.

## Capabilities, media, versions, testing and limits

**D-index [T12]:** TikTok's API for Business advertises campaign/ad-group/ad management, creative assets and reporting. **S [M7–M8]:** Meta's SDK exposes creative and campaign budget/status objects. These establish relevant capability families, not every proposed workflow's account eligibility. Creation acceptance, ad review approval and actual delivery are separate states; TikTok explicitly offers review status, rejection reasons and appeal operations [T13].

**D-live [T14]:** TikTok's June 2026 auction in-feed specification distinguishes Spark Pull from Non-Spark: Spark captions come from the organic post and its duration constraints differ. File types, aspect ratio, size, bitrate, safe zones and captions must be checked for the exact selected format. **P/A:** retain a versioned format/placement validation matrix for both platforms after workflow selection. A generic uploaded file, an organic-upload spec or TopView requirements cannot certify an auction-feed creative. Confirm music/likeness/use rights and provider policy eligibility as part of future creative review; no adoption/fundraising policy classification is inferred here.

**R:** express the hierarchy as Meta account → campaign → ad set → ad/creative and TikTok advertiser → campaign → ad group → ad/identity/assets, with provider-specific mappings to a competition entry. Confirm endpoint contracts for the chosen campaign families. Preserve post IDs, creative/media IDs, review status and effective external IDs; names are display values. Smart+/dynamic combinations may aggregate multiple assets and cannot automatically be treated as one competition entry.

**P:** no current production Graph version or retirement schedule was established from the inaccessible Meta pages. TikTok v1.3 campaign-management documentation and v2.0 reporting documentation are separate versioned surfaces [T15–T16]; a v2 reporting guide does not migrate all writes to v2. Record versions per operation, supported schema, deprecation notice and migration owner. Do not select a version merely because an SDK defaults to it.

**P/A limits:** Meta rate-limit documentation was HTTP 429 [M6]; TikTok's global rate-limit page was unreadable [T17]. No generic QPS figure or production capacity promise is certified. Capture app/account/endpoint budgets and response error/header behavior for ordinary reads, writes, uploads, report creation/status/download and inventory separately. The prior O-01 async-report limits are not a write budget. **R:** plan bounded queues, pagination, backoff and capacity reserved for control/reconciliation; reconcile uncertain writes before retrying. Do not claim provider idempotency without an endpoint contract.

**P/A tests:** no current safe sandbox availability or write fidelity was established. TikTok portal navigation labels sandbox accounts as to-be-deprecated [T18]; a navigation label establishes no supported replacement or shutdown date. Confirm official test-account and Meta validation-only support for each intended operation. A paused object in a real ad account is still a live mutation. Future tests need separate authorization, no-delivery controls, representative approved historical reporting data and an explicit spending gate. No tests or mutations were performed here.

## Repository model implications (recommendations for later decisions)

The local demo `Connection` has account ID/name, target ID/name and connectedAt, held per provider inside per-campaign `CampaignAdSetup`. `demoAdAccounts` synthesizes an ID using `ManagedCampaign.ownerOrganizationId`; demo targets are synthesized from a campaign. `connect` checks a fictional selection and disables automation, while `disconnect` deletes that selection. `previewAdSpend` explicitly calls no platform API. These are local facts from the inspected files, not provider evidence.

| Existing assumption | Research implication, not an implemented design |
| --- | --- |
| Organization owns a Slander campaign | Keep `ownerOrganizationId` as an internal ownership boundary; never treat it as a provider business ID, advertiser ID or authorization. |
| One per-campaign connection object | Separate client/provider asset inventory and app authorization from campaign bindings, so several campaigns can reuse an account/grant and revocation has a defined blast radius. |
| One target ID | Model platform campaigns, ad sets/ad groups, ads, creatives and identities separately. Store actual returned IDs and mappings to competition entries with effective intervals. |
| ConnectedAt means connected | Track consent, app approval, accessible assets, token health, identity rights and read/write capabilities independently. Re-check before writes; do not assume a selected account is authorized. |
| Disconnect removes local state | Define queue cancellation, shared-grant impact, provider revocation and recovery separately. Revoking API access is not proof existing delivered ads stop; emergency pause semantics need a human decision. |
| Demo USD cents and percentage allocation | Obtain real account currency/timezone and endpoint budget units/minima. The selected funding/payment arrangement does not make provider budgets hard product spending caps. |
| Rules enabled permits automation | Require a client-approved action/spend policy and auditable intent/result records, with uncertain outcomes reconciled before repetition. |

**R:** future backend credential custody should store secret references rather than tokens in browser-local demo state, validate callback state and client/app binding, redact token-bearing logs and retain grant/revocation evidence. Keep provider permissions distinct from campaign-manager approvals. These recommendations await [Set client consent and spending approval rules](https://github.com/Cooper2Rich/adoption-project/issues/13) and [Choose the production integration architecture and rollout gates](https://github.com/Cooper2Rich/adoption-project/issues/14).

## Unresolved ledger and resolution scope

This note completes a bounded investigation of what accessible first-party evidence establishes. It does **not** resolve the following provider facts or certify implementation readiness:

| Gate | Missing evidence and closure condition |
| --- | --- |
| P-Meta production review | Current official App Review, business verification/other applicable assessment, exact third-party grant path, scopes and endpoint identity requirements. Obtain readable authoritative material; later record selected app approvals. |
| P-TikTok app access | Marketing app-review requirements and precise read/write/asset permission matrix, available app tier and allowlists. Obtain official app/permissions documentation and later inspect approved app configuration. |
| P-lifecycle | Meta selected-token renewal/revocation/deletion contract; TikTok conflicting auth-code duration/callback text and chosen long/short token contract. Resolve with current endpoint docs or provider clarification before implementation. |
| P-formats/version/limits/test | Current supported write families, exact media/identity constraints, version support windows, endpoint quotas and supported isolated test options. Obtain authoritative contracts for the human-selected workflows. |
| A-client eligibility | Actual legal entity, developer registration, business/ad-account status, owner/billing, country, roles, linked brand assets and history. All NOT INSPECTED; later authorized account setup/validation only. |
| Existing reporting P1–P6 and V01–V20 | Local O-01 notes retain unresolved click semantics, minimum read access, dimensions/DST, v2 method contradictions, completeness and quotas. No prior case is marked passed by this advertising research. |

The remaining human decision tickets already cover onboarding, supported workflows, spending rules and architecture. No new precise decision outside them was found, so no new ticket or dependency is introduced. Research closure records this evidence boundary, not resolution of the ledger's unknown facts. Account setup and implementation remain outside this effort.

## First-party source register

- **M1, D-live:** [Meta-owned Marketing API collection](https://www.postman.com/meta/facebook-marketing-api/collection/0zr4mes/facebook-marketing-api-mapi), Requirements, Permissions and token sections. Broad onboarding example; not a complete current production checklist.
- **M2, inaccessible (429):** [Meta authorization](https://developers.facebook.com/docs/marketing-api/get-started/authorization/).
- **M3, inaccessible:** [Meta access](https://developers.facebook.com/docs/marketing-api/access/).
- **M4, inaccessible:** [Meta App Review](https://developers.facebook.com/docs/app-review/).
- **M5, inaccessible (429):** [Meta business verification](https://developers.facebook.com/docs/development/release/business-verification/) and [Advanced Access verification announcement](https://developers.facebook.com/blog/post/2023/02/01/developer-platform-requiring-business-verification-for-advanced-access/). Unread contents are not treated as verified requirements.
- **M6, inaccessible (429):** [Meta rate limits](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting/).
- **M7, S:** [Meta SDK creative schema](https://raw.githubusercontent.com/facebook/facebook-python-business-sdk/main/facebook_business/adobjects/adcreative.py). Mutable main inspected on research date; schema evidence only.
- **M8, S:** [Meta SDK campaign schema](https://raw.githubusercontent.com/facebook/facebook-python-business-sdk/main/facebook_business/adobjects/campaign.py). Same limitation.
- **T1, D-live:** [Request advertiser access](https://ads.tiktok.com/resources/help/article/request-access-to-ad-accounts-in-business-center?lang=en), updated March 2026.
- **T2, D-live:** [Link TikTok identity for ad delivery](https://ads.tiktok.com/resources/help/article/how-to-request-tiktok-account-ad-delivery-permissions-in-business-center), updated April 2026.
- **T3, D-index:** [Register as a developer](https://business-api.tiktok.com/portal/docs/register-as-a-developer/v1.3). Direct open empty; official indexed body readable.
- **T4, D-index:** [Marketing advertiser authorization](https://business-api.tiktok.com/gateway/docs/index?doc_id=1738373141733378&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b).
- **T5, D-index:** [Authorization FAQ and errors](https://business-api.tiktok.com/gateway/docs/index?doc_id=1766037914914818&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b). Bare seed URL inaccessible; indexed full URL supplied substantive text, including contradictions described above.
- **T6, unreadable:** [Create a developer app](https://business-api.tiktok.com/portal/docs/create-a-developer-app/v1.3).
- **T7, unreadable:** [App permissions](https://business-api.tiktok.com/portal/docs/app-permissions/v1.3).
- **T8, D-index:** [API for Business FAQ](https://business-api.tiktok.com/portal/docs/faqs-overview/v1.3), allowlisting section.
- **T9, D-index:** [TikTok for Developers FAQ](https://developers.tiktok.com/docs/en/getting-started-faq), distinction from advertising APIs. Its general Developer app-review rules are not imported as Marketing API requirements.
- **T10, D-index:** [Custom Identity changes](https://ads.tiktok.com/resources/help/article/about-changes-coming-to-custom-identity?lang=en), updated March 2026.
- **T11, D-index:** [Accounts API overview](https://business-api.tiktok.com/portal/docs/accounts-api-overview/v1.3), scope-specific access form and organic functions.
- **T12, D-index:** [API for Business overview](https://business-api.tiktok.com/portal), capability families.
- **T13, D-index:** [Ad Review API](https://business-api.tiktok.com/portal/docs/ad-review/v1.3).
- **T14, D-live:** [Auction in-feed specifications](https://ads.tiktok.com/resources/help/article/tiktok-auction-in-feed-ads?lang=en), updated June 2026; format-specific, not an API eligibility guarantee.
- **T15, D-index:** [v1.3 migration](https://ads.tiktok.com/gateway/docs/index?doc_id=1740591846408194&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH).
- **T16, unreadable:** [v2 API reference](https://business-api.tiktok.com/portal/docs/api-reference/v2.0). Local O-01 evidence described reporting; this open returned zero readable lines and adds no new version guarantee.
- **T17, unreadable:** [API for Business rate limits](https://business-api.tiktok.com/portal/docs/rate-limits/v1.3).
- **T18, D-index, navigation only:** [Portal guide navigation](https://business-api.tiktok.com/gateway/docs/index?doc_id=1740665197662210&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b), sandbox deprecation label. No inferred availability, replacement or deadline.
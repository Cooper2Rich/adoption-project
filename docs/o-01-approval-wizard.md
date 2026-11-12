# O-01 account approval wizard

Prepared 2026-11-09. Run [the seven-stage script](../scripts/setup-o01-approvals.ts) yourself in an interactive terminal with **Node.js 24 or later**. It guides the account-owner tasks for [O-01 validation](o-01-reporting-validation.md); it does not execute reporting tests or establish that the integration is ready.

From the repository folder in PowerShell:

```powershell
node scripts/setup-o01-approvals.ts
```

The same command works in other terminals:

```bash
node scripts/setup-o01-approvals.ts
```

The first stage shows the full plan and destination, asks for approval before writing, and lets you choose both providers, Meta only or TikTok only. Declining stops without creating a setup record. Subsequent approvals apply only to the named account action, not to implementation, validation execution or spending. Rerun to complete pending fields; Enter retains previously saved values. Stop with Ctrl-C at any time; already written values remain saved. To change stage order or scope beyond the provider choice, decline the first gate and revise the script first.

## Stages and captured values

Every captured value below is **non-secret setup metadata**, written only to `%LOCALAPPDATA%\Slander\o-01\setup.env` on Windows, outside this OneDrive repository. On native Linux/macOS the destination is `${XDG_CONFIG_HOME:-$HOME/.config}/slander/o-01/setup.env`. WSL users are directed to Windows Node.js. No current workflow consumes provider credentials, so the wizard writes no GitHub secrets or variables. Nothing is written to the project's `.env`, frontend build variables or application configuration.

| Stage                        | Manual source/action                                                                                                                                      | Values recorded                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Scope and destination     | Review the displayed stages; select providers; approve local metadata writes                                                                              | `O01_PROVIDERS`, `O01_SETUP_STATUS`, `O01_ACCOUNT_VALIDATION`                                                                         |
| 2. Meta app                  | Developer app selector; App settings > Basic where available; current official creation guide if needed                                                   | `O01_META_APP_ID`, `O01_META_APP_SELECTION`                                                                                           |
| 3. Meta account/access       | Ads Manager account selector and settings; Business Settings reporting principal/asset assignment, only through a documented applicable path              | `O01_META_ACCOUNT_ID`, `O01_META_ACCOUNT_ZONE`, `O01_META_ROLE_LABEL`, `O01_META_PERMISSION_LABELS`, `O01_META_ACCESS_REVIEW`         |
| 4. TikTok app                | API for Business > My Apps > selected app > Basic Information                                                                                             | `O01_TIKTOK_APP_ID`, `O01_TIKTOK_APP_SELECTION`                                                                                       |
| 5. TikTok account/role       | Ads Manager account dropdown/settings; Business Center Analyst assignment or request; developer app permissions                                           | `O01_TIKTOK_ADVERTISER_ID`, `O01_TIKTOK_ACCOUNT_ZONE`, `O01_TIKTOK_ROLE_REVIEW`, `O01_TIKTOK_PERMISSION_LABELS`                       |
| 6. TikTok advertiser consent | Selected app's Advertiser authorization URL, only after a controlled callback and secure exchange are ready; explicit consent and provider identity check | `O01_TIKTOK_AUTHORIZATION` (`pending` by default)                                                                                     |
| 7. History and handoff       | Your inspection of available approved delivery, zero controls and boundary history                                                                        | `O01_META_HISTORY_AVAILABLE` / `O01_TIKTOK_HISTORY_AVAILABLE`, `O01_SETUP_RECORDED_AT`; final setup status remains validation pending |

Statuses describe operator confirmations, not API verification. Blank unavailable values remain pending; skipped providers have no new status written. The file can contain prior-run values, so inspect the selected provider and latest timestamp before use. Treat it as data; do not source it as a shell script. Do not paste credentials into metadata fields or publish the file.

## Known boundaries

The repository currently has no reporting OAuth callback, token-exchange service or read-only validation runner. TikTok consent is deferred unless a separate working controlled callback/exchange already exists. The wizard does not invent a redirect URL, ask for an expiring authorization code, collect a token or app secret, or implement the missing exchange. Meta's minimum read scopes and exact current grant path remain unresolved; the script records the actual labels you observe and leaves access pending when the applicable official path cannot be established.

App registration may require account-specific review, verification or terms acceptance. The script opens the official portal, lets you approve that action and records pending status when the available guide/UI cannot establish the next step. It does not supply assumed legal/business details. A reporting-only role such as Analyst does not by itself prove API access. Historical reporting observations still require representative approved delivery; a newly empty account cannot supply that evidence.

No ads are created, payments or billing configured, provider test calls made, tokens revoked, or exports downloaded by this script. All V01-V20 cases remain NOT RUN. Once access/callback prerequisites exist, the next work is the authorized read-only validation runner and evidence ledger. [The gap-closure note](meta-tiktok-reporting-gap-closure.md) preserves the remaining provider specifications and observation boundaries.

## Navigation evidence

Primary sources checked 2026-11-09; these support the stated paths, not account-specific approval or scope sufficiency:

- [Meta's Marketing API collection](https://www.postman.com/meta/facebook-marketing-api/collection/0zr4mes/facebook-marketing-api-mapi) identifies developer, app, token and ad-account prerequisites. [Meta app documentation](https://developers.facebook.com/docs/apps/) returned HTTP 429 during preparation. Current creation/use-case and permission-grant labels could not be verified, so the wizard defers to the live official guide rather than prescribing a guessed path.
- [TikTok authorization](https://business-api.tiktok.com/gateway/docs/index?doc_id=1738373141733378&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b) locates the advertiser authorization link under the selected app's Basic Information and describes consent, identity verification and a server-side code exchange.
- [TikTok Ads Manager setup](https://ads.tiktok.com/help/article/create-tiktok-ads-manager-account?lang=en-GB) identifies the account dropdown and account-status inspection path. The wizard uses these inspection steps, not its billing/account-creation procedure.
- [TikTok Business Center access requests](https://ads.tiktok.com/resources/help/article/request-access-to-ad-accounts-in-business-center?lang=lv-LV) describes the advertiser access request, Analyst role and owner approval path.
- [TikTok v2 API reference](https://business-api.tiktok.com/portal/docs/api-reference/v2.0) lists Consolidated Report permission. The exact app's read grants still need V01 evidence.

## Verification

The copied wizard library is unchanged after normalizing line endings to LF. Seven stage calls match `TOTAL_STAGES=7`. `bash -n` and executable-bit setup are checked locally; ShellCheck is unavailable. The wizard is deliberately not run end to end by the agent because it needs your browser login and explicit decisions. No account setup is claimed complete.

# Run the allocation preview

This is the bounded manager preview confirmed through Q106. It uses actual local Convex records and authorization with synthetic campaign evidence. Saving previews reserves no campaign money or ad slots and activates no operational spending settings.

## Start

From the repository, with Node 24 or newer:

```powershell
npm ci
npm run dev:launch
```

Open `http://127.0.0.1:3210/?workspace=manager` for the manager preview. The root URL opens the account-free public campaign; `?workspace=creator` opens creator access. To choose another port:

```powershell
npm run dev:launch -- --port 3215
```

The runner creates an owned local backend, seeds illustrative records and signs short-lived manager fixture tokens. It needs network access for Convex version resolution/backend downloads, but no Convex account, deploy key, Clerk account or payment/advertising credentials. CLI/SDK version is pinned to `1.49.0`; backend version is pinned to `precompiled-2026-10-22-1447815`.

Each invocation creates a fresh isolated workspace under the user's temporary directory. Records survive restart of that workspace's backend and are shared between authorized browser sessions. Starting a new runner invocation intentionally creates a different workspace; it does not reopen a previous run. State is retained outside this OneDrive repository for diagnosis. Ctrl+C stops the owned frontend/backend processes.

## Try the flow

1. Save the initial draft. Four $15 baselines plus a $20 residual boost pool give two tied leaders $25 each and two other entries $15 each; $20 remains uncommitted.
2. Change the residual boost percentage and save another preview. Open a second browser session to retrieve the saved result and draft settings. Earlier previews remain immutable and selectable in history.
3. Choose **Healthy startup**: only the residual boost pool is shared equally, on top of protected baselines.
4. Choose **Missing new-entry reports**: financially safe baselines remain, boosts are held and a simulated manager/admin incident is recorded. Returning to complete evidence resolves the incident without rewriting the held preview.
5. Choose **Unknown finances** for an explicit blocked result, or **TikTok unavailable** to see held provider shares without redistribution.

Illustrative balance/reserve inputs are editable so the manager can inspect blocked cases. Their provenance is visible; these values are not approved production balances or safety policy. No metric progression, real incident/email, invitation, ad, charge, transfer or refund is dispatched.

## Checks

```powershell
npm run test:launch
npm run build:launch
```

Individual checks:

```powershell
npm run test:launch:planner
npm run test:launch:backend
npm run test:launch:browser
npm test
npm run build
```

The planner suite tests the intended public calculation boundary. The backend suite starts real isolated Convex processes, uses signed identities, restarts the same state and checks concurrent operations. Separate slot/funding controls invoke the intended reservation operation; the manager preview never calls it. The browser suite uses real Convex requests on desktop/mobile, including a fresh session and private-state serving denial. Browser network mocks and browser-local demo persistence are not used.

`build:launch` writes the dedicated frontend bundle to ignored `launch-site/`; it does not publish a website. A static bundle alone cannot supply the isolated session endpoint. The existing public demo and Express workspace retain their existing commands and data.

## Isolation and operational details

- Application auth configuration trusts the configured Clerk issuer, not fixture issuers. Only the copied configuration in an owned local run trusts that run's generated test key. The negative auth test switches back to the exact application configuration with an isolated placeholder issuer and verifies fixture rejection; this does not validate real Clerk invitation/recovery behavior.
- Private signing material stays in runner memory. Backend administrative state is outside the application directory and outside the dev server's filesystem allowlist. Only the generated public dependency cache is served; cross-origin fixture-session requests are rejected.
- Internal seed/revision/revocation helpers are templates copied into the owned test deployment, not application functions or browser assets. CLI mutations verify the selected deployment matches the run's local URL/configuration before execution.
- Windows uses polling for owned Convex/Vite watchers because native watchers aborted on short temporary paths and the dependency junction during verification. Vite cache files live outside OneDrive, and dependency scanning is restricted to the preview entry point.
- If cloud placeholder dependency files become unreadable, `npm ci` restores the locked installed files. No user campaign data is deleted to refresh this feature.

The [build specification](allocation-preview-build-spec.md), [accepted harness design](convex-allocation-preview-harness-review.md) and [verification evidence](allocation-preview-verification.md) describe scope and limits. Real Clerk, Stripe, Meta/TikTok, approved production safety settings and full production journeys remain separate launch gates.

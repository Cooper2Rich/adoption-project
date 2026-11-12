# Campaign setup (T01)

The launch application opens the adoption.is manager workspace through Clerk. Configure `VITE_CLERK_PUBLISHABLE_KEY` and the HTTPS `VITE_CONVEX_URL` for the frontend, and `CLERK_JWT_ISSUER_DOMAIN` on the matching Convex deployment with Clerk's Convex integration (`aud: convex`). The implementation follows the [Convex Clerk integration](https://docs.convex.dev/auth/clerk). No secret key belongs in frontend configuration. Missing or malformed configuration fails closed. Fixture, loopback and reserved test issuer domains are rejected by application auth configuration.

A trusted operator provisions the nonprofit's campaign shell and current membership records separately from manager rule creation. The adoption.is shell has slug `adoption`, name `adoption.is`, its nonprofit ID and no `fixtureRunId` in production. The manager cannot choose or create a different nonprofit, grant membership, or grant administrator status. An active `memberships` record associates the verified Clerk subject with the nonprofit and `manager` role; active `operators` records independently grant platform administrator permission. Real account setup and live Clerk sign-in/session/recovery evidence remain T38; this change does not provision or deploy them.

`campaignSetup:create` atomically creates the immutable version-1 campaign rules and audit record in that scoped shell. All currency amounts are safe integer USD cents; commission uses integer basis points. Independent daily and weekly score targets each contain impressions, total link clicks and fundraising cents. Competition and earning intervals are independent, start-inclusive and end-exclusive canonical instants. The form converts Chicago wall times to instants, rejecting ambiguous/nonexistent DST times. Prizes, replenishment and creator-payment schedules use Chicago wall time. Wednesday 12:00 Chicago batch preparation is separately fixed, regardless of replenishment or payment schedule.

Rules lock immediately, before invitations or terms acceptance. `campaignSetup:update` always rejects a rule amendment. Same-operation/same-content creation retries return the saved record after checking current permissions; changed content conflicts and different creation operations cannot replace it. The saved version and terms-version reference remain available alongside actor, source, creation time and the affected settings ID. Creator invitations and participation acceptance are implemented in T02; see [CREATOR-ACCESS.md](CREATOR-ACCESS.md). Actual approved legal terms and real Clerk evidence remain production gates.

The `campaignResources` projection demonstrates provider/finance reference isolation by both campaign and nonprofit. These references are unvalidated fixtures in local tests and contain no credentials; actual connection provisioning and financial routes remain their later tickets. Allocation preview/reservation fixture operations retain their existing isolated-run restriction and never originate production transactions.

Run `npm run dev:launch` for the explicitly labelled isolated workspace, then choose **Campaign setup**. Only this development command enables local synthetic identities; production builds use Clerk exclusively. The public/creator campaign selector is not introduced. Browser projects own separate actual Convex backends so desktop and mobile each create their own adoption.is rules.

Verification commands:

- `npm run check`
- `npm run build:launch`
- `npm run test:launch:planner`
- `npm run test:launch:backend` — T01 public-operation tests cover invalid/incomplete creation, every locked field, retry/concurrency, second-session/restart durability, revocation and role denials, independent administrator authority, cross-nonprofit provider/finance references and audit. Existing S1 tests retain signature/issuer/audience/expiration denial and production-config fixture rejection.
- `npm run test:launch:browser` — desktop/mobile manager create/failure/locked/reopen journeys, invalid-session denial and compiled production missing-configuration denial, plus S1 regressions.

These are bounded local engineering checks, not real Clerk or other provider capability approval. No provider account provisioning, deployment, live advertising or financial actions are performed.

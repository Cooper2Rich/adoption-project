# Dependency updates and CI

[Dependabot configuration](../.github/dependabot.yml) checks the root npm
manifest and lockfile, and GitHub Actions in `.github/workflows`, every Monday
at 09:00 America/Chicago. GitHub also checks when the configuration first reaches
the default branch (`main`). GitHub currently redirects this repository's former
name, `Cooper2Rich/slander`, to `Cooper2Rich/adoption-project`.

npm updates increase manifest requirements and update `package-lock.json`.
Minor and patch version updates are grouped within each ecosystem; major updates
remain separate PRs. The open version-update PR limits are ten for npm and five
for Actions. Security updates remain enabled independently of the weekly schedule.
Dependabot opens PRs; maintainers review and merge them.

[CI](../.github/workflows/ci.yml) runs for every PR targeting `main` or
`adoption-is`, pushes to those branches, and manual dispatches. It has no path or
actor filters, so dependency-only and Dependabot PRs receive the same checks:

- **Build and unit tests:** clean `npm ci`, TypeScript/Vite build and all Node tests.
- **Browser tests:** clean `npm ci`, Chromium installation, all API-backed
  desktop/mobile journeys, a public build and the public release checks used by
  the main deployment (asset loading, home photos, Our Why and hover playback).

The public checks are the release smoke suite, not every public-browser spec.
Browser failures retain traces, screenshots and an HTML report in the
`browser-test-results` artifact for seven days. Both jobs use Node 24 and only
`contents: read`; checkout does not retain credentials. They need no repository
or Dependabot secrets. The existing publishing workflows remain limited to
branch pushes/manual runs and keep deployment permissions separate from PR CI.

## Repeat the checks

Use a clean checkout with Node 24 and run:

```sh
npm ci
npm run check
npx playwright install --with-deps chromium
npm run test:e2e -- --reporter=list,html
npm run build:public
npx playwright test --config playwright.public.config.ts tests/public-browser/deployment.spec.ts tests/public-browser/home-photos.spec.ts tests/public-browser/home-why.spec.ts tests/public-browser/girl-hover.spec.ts --reporter=list,html
```

Validate all workflow YAML with [actionlint](https://github.com/rhysd/actionlint),
and validate `.github/dependabot.yml` against the
[Dependabot v2 schema](https://json.schemastore.org/dependabot-2.0.json).

## Verify on GitHub

```sh
gh api repos/Cooper2Rich/adoption-project/actions/permissions
gh api repos/Cooper2Rich/adoption-project/actions/permissions/workflow
gh run list --repo Cooper2Rich/adoption-project --workflow ci.yml --limit 10
gh pr list --repo Cooper2Rich/adoption-project --author 'app/dependabot'
gh pr checks PR_NUMBER --repo Cooper2Rich/adoption-project
```

Actions must be enabled and the referenced official actions allowed. Default
workflow write permissions and permission to approve PRs are unnecessary.
Check the **Dependabot Updates** runs in Actions for successful npm and
GitHub Actions update jobs. GitHub's **Insights → Dependency graph → Dependabot**
page shows the last check, logs and **Check for updates** for each ecosystem.
The scheduled job can legitimately produce no PR when all dependencies are current.

For existing Dependabot PRs opened before CI was added, rebasing the PR (or using
GitHub's **Update branch**) emits a synchronization event that starts the new CI.
Opening a new Dependabot PR automatically starts CI.

References: [enabling version updates](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-version-updates),
[Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference),
[Dependabot's read-only workflow token](https://docs.github.com/en/code-security/reference/supply-chain-security/troubleshoot-dependabot/dependabot-on-actions).

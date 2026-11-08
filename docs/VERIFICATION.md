# StudySpace verification record

## Manual verification

Environment: macOS local development environment

Recorded: 2026-11-07

Verifier: project owner

The following checks were manually verified on the project owner's Mac:

- Auth0 sign-in and sign-out
- Saved persistence after signing out and signing back in
- Profile persistence after signing out and signing back in
- Saved and profile data isolation between two accounts
- Bookmark removal remaining removed after refresh
- Layout checks at 390 px and desktop width

These are user-reported manual results. They are intentionally separate from automated test results and are not represented as automated coverage.

## Automated verification

Review, report, and moderation milestone, local PostgreSQL, 2026-11-07:

- Unit tests: 47 passed
- PostgreSQL integration tests: 16 passed
- ESLint: passed
- TypeScript: passed through the production build
- Production build: passed

Automated coverage includes guest and cross-account denial, browser-supplied moderator denial, pending-review visibility, report privacy, valid review/report transitions, immutable review ownership and listing associations, private default privileges for new tables, and moderation audit creation. These results do not replace the manual checks recorded above.

Account identity coverage includes display-name preference, email fallback, invalid-label rejection, legacy sessions without labels, session expiration, and production type checking. Live two-account account-menu verification requires a connected browser and fresh sign-ins after the scope change.

## Remaining release gates

Phase 2 production-readiness changes plus PR #2 hardening, local PostgreSQL and Chromium, 2026-11-07:

- Unit tests: 63 passed
- PostgreSQL integration tests: 20 passed
- ESLint: passed
- TypeScript: passed (`next typegen` and `tsc --noEmit`)
- Production build: passed
- Public Playwright tests: 3 passed in Chromium
- Dependency audit: 0 known vulnerabilities

Automated Phase 2 coverage includes atomic cross-instance rate-limit enforcement and reset, public-role denial for private counters, HTTP 429/503 behavior, mutation denial before writes, trusted Vercel-header parsing, spoofable-header rejection, unsupported-ingress failure, bounded cleanup behavior and maintenance privileges, production CSP and HSTS configuration, public navigation, directory search, listing details, recoverable invalid-filter and 404 states, and horizontal overflow checks at 390 px and 1440 px. The connected browser list was empty; the repository's local Playwright Chromium runner supplied the public browser results above.

Two authenticated Playwright cases are configured and discoverable: keyboard operation of the native `details`/`summary` Account disclosure with Profile navigation, and the Sign out link's server logout target. They were not executed because no `PLAYWRIGHT_AUTH_STATE`, live Auth0 credentials, or connected browser session was available. Successful Auth0 Profile and logout behavior remains pending rather than being counted as automated coverage.

The following checks still require a production-like deployment, provider configuration, or live Auth0 accounts and are not satisfied by local or pull-request CI:

- Provisioning decisions for paid plan, region, custom domain, backup retention, and recovery objectives; no service has been purchased or deployed
- Live HTTPS redirect, HSTS, CSP violation, Vercel forwarding-header behavior, connection-pool, and rate-limit threshold/load verification on the final origin
- Provider-level volumetric and Auth0 login-abuse protections, monitoring, alerting, and deployment of the documented rate-limit maintenance schedule
- Account-menu and Profile testing with two live Auth0 accounts plus a signed-out session
- Authenticated Playwright execution with an ignored environment-local storage state
- End-to-end moderator testing with live moderator and non-moderator accounts, covering approve, reject, hide, report resolution, and audit records
- A rehearsed application rollback and isolated point-in-time database restore

## Phase 3 staging preparation

Local verification, 2026-11-07:

- ESLint: passed
- TypeScript: passed (`next typegen` and `tsc --noEmit`)
- Unit tests: 63 passed
- PostgreSQL integration tests: 20 passed against the existing local PostgreSQL 17 test database
- Production build: passed
- Public Playwright tests: 4 passed in local Chromium, including signed-out private pages and responsive checks at 390 px and 1440 px
- Dependency audit: 0 known vulnerabilities
- Staging verifier: JavaScript syntax and `--help` path passed; no deployed HTTPS staging origin exists, so live checks were not run
- Authenticated Playwright discovery: 5 real-session cases listed successfully when placeholder ignored paths were supplied; none were executed or counted as passed

The first sandboxed integration attempt was denied loopback access with `EPERM`; the identical suite passed after local PostgreSQL access was allowed. No test or migration was run against Neon. No Vercel project or Auth0 setting was changed. The connected browser list was empty, so live Auth0 session testing remains pending.

PR #3 GitHub Actions run #6 passed on commit `39366a5402fbe64a4144d539176d096ef298f944`. The job used the official PostgreSQL 18 image, whose service log reported PostgreSQL 18.6. It passed the server-major and least-privilege membership assertions, all committed migrations and grants, 63 unit tests, 20 PostgreSQL integration tests, ESLint, TypeScript, the production build, 4 public Chromium tests, the dependency audit, and staging-verifier syntax. Run #5 had already passed every PostgreSQL 18/database step but failed the new signed-out browser case because CI intentionally has no Auth0 configuration; the test was corrected to cover both Auth0-configured signed-out and Auth0-disabled installations before run #6.

The full live-cloud evidence requirements are tracked in `docs/STAGING_CHECKLIST.md`. In particular, Neon PostgreSQL 18.6 catalog/role/RLS validation, the public HTTPS verifier, Vercel forwarded-header behavior, real-session two-account/moderator workflows, backup restore, connection load, cleanup scheduling, monitoring, and rollback remain `NOT RUN`.

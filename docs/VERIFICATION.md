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
- Staging verifier: JavaScript syntax and `--help` path passed; at the time of this 2026-11-07 local run, no deployed HTTPS staging origin existed, so live checks were not run
- Authenticated Playwright discovery: 5 real-session cases listed successfully when placeholder ignored paths were supplied; none were executed or counted as passed

During that 2026-11-07 preparation run, the first sandboxed integration attempt was denied loopback access with `EPERM`; the identical suite passed after local PostgreSQL access was allowed. No test or migration was run against Neon, and no Vercel project or Auth0 setting was changed during that run. The connected browser list was empty, so live Auth0 session testing was not counted there.

PR #3 GitHub Actions run #6 passed on commit `39366a5402fbe64a4144d539176d096ef298f944`. The job used the official PostgreSQL 18 image, whose service log reported PostgreSQL 18.6. It passed the server-major and least-privilege membership assertions, all committed migrations and grants, 63 unit tests, 20 PostgreSQL integration tests, ESLint, TypeScript, the production build, 4 public Chromium tests, the dependency audit, and staging-verifier syntax. Run #5 had already passed every PostgreSQL 18/database step but failed the new signed-out browser case because CI intentionally has no Auth0 configuration; the test was corrected to cover both Auth0-configured signed-out and Auth0-disabled installations before run #6.

## 2026-11-10 — Phase 17A local account-lifecycle foundation

The three forward-only Phase 17A migrations were applied only to the isolated local `studyspace_test` database on PostgreSQL 17.11. A separate disposable local database was loaded with legacy Profile, Favorite, Review, report, moderation, and unmapped-session rows; the foundation migration preserved all deterministic ownership associations as generation-one identity links, preserved the unmapped session for fail-closed lazy linking, and the disposable database was removed. The local PostgreSQL integration suite passed 24 tests, including cross-account RLS, public approved-review retention, every non-public review status, finite holds, report/audit unlinking, idempotency, cross-account closure denial, re-registration blocking, fresh assessment after review-text edits, and a concurrent write/account-closure row-lock race. The unit suite passed 87 tests; ESLint and TypeScript passed. The supported `next build --webpack` production fallback passed with the existing Auth0 dynamic-dependency warnings. A final default Turbopack build attempt could not start its CSS worker because this execution environment denied the worker's local port; that environmental failure remains unverified in the final pass.

This evidence does not include PostgreSQL 18, Neon, Auth0 Management API behavior, provider deletion, linked live identities, backup restoration, retention scheduling, or a deployed lifecycle credential. No Phase 17A migration or deletion was executed against Neon or Vercel, and no user-facing deletion workflow exists.

## 2026-11-10 — Phase 17C lifecycle security repair

The three unpublished lifecycle migrations were rewritten as a backward-compatible expand release and applied from scratch to a disposable local PostgreSQL 17.11 cluster. A second disposable database was loaded at the pre-Phase-17 schema with Profile, Favorite, Review, report, moderation, and unmapped-session rows; all ownership associations survived the three migrations, legacy compatibility columns remained intact, and the unmapped session remained unassigned. No existing local StudySpace database was modified.

The local integration suite passed 29 tests. Coverage includes old-write/new-schema dual writing, passive versus fresh identity resolution, subject/account binding, post-closure approval denial, moderator/finalizer lock serialization, report-detail removal, reviewer-unlink evidence, restrictive actor references, concurrent first review submissions, RLS, and cross-account closure denial. The unit suite passed 89 tests; Prisma validation, ESLint, and TypeScript passed. The webpack production build passed with the existing Auth0 dynamic-dependency warnings. The default Turbopack build again failed because its CSS worker could not bind a local port in this execution environment, including outside the normal filesystem sandbox.

PostgreSQL 18/Neon rehearsal, Auth0 reauthentication and provider deletion, linked live identities, the dedicated lifecycle role, retention scheduling, backup replay, and the future destructive contract migration remain unverified and unapproved. No cloud migration, credential, deployment, or deletion was performed.

## 2026-11-10 — Phase 17 authorization hardening and rehearsal closeout

The final local suite used only the explicitly selected `studyspace_test_recovery` database. It passed 33 PostgreSQL integration tests and 106 unit tests, plus Prisma validation, ESLint, TypeScript, and the webpack production build. The integration suite verifies the committed migration names and checksums against `_prisma_migrations`, the public Review six-column restriction, account and session isolation, moderator denial without a grant, activation with a valid grant, denial after revocation, denial for a mismatched account/identity pair, and denial for an inactive account. The application still requires the Auth0 subject allowlist before it requests moderator database context.

Legacy **read compatibility** is locally verified for owner-scoped Profile, Favorite, and Review access; approved public review projection; and moderator reads of Review, report, and moderation-audit records. Legacy **write compatibility** is locally verified for Profile insert/update, Favorite insert/delete, Review submission/edit/approval, report submission/resolution, moderation-audit insertion, and account-ID dual writing. These tests execute the legacy transaction settings against the expanded schema; they do not make those mutable settings authenticated identity evidence.

Static checks and recorded disposable-Neon evidence verify migration/grant presence, legacy columns, ownership mappings, RLS policy installation, public/Saved permissions, account isolation, and denial of the retired UUID/boolean context function. They do **not** prove that the baseline application binary or a live Vercel deployment executed successfully against the expanded Neon schema. Positive, revoked, cross-account, and inactive-account moderator-grant cases were executed with synthetic local data, not on Neon. The parent Neon staging branch was not queried or modified during this closeout.

The recorded disposable Neon branch rehearsal used branch `rehearsal-account-lifecycle` (`br-cold-king-beer2yusy`), database `studyspace_staging`. All 14 migrations and runtime grants were previously applied there; public/Saved permissions, two-account isolation, legacy mappings, verified-context policies, legacy-compatibility policies, no-grant moderator denial, and denial of the retired context function passed. Live Auth0 reauthentication/provider deletion, a deployed lifecycle credential, retention scheduling, backup replay, a real moderator workflow, full baseline-application execution, and the future contract migration remain unverified and unapproved.

## 2026-11-10 — Phase 17 staging-rollout preparation

Release preparation added a fail-closed local rollout guard without connecting to Neon or Vercel. Its unit coverage verifies the exact project/branch assertions, direct non-pooled owner endpoint, database, TLS mode, approved commit, fresh recovery attestation, ten-migration baseline, four-migration Phase 17 set, checksum/completion enforcement, and safe resume from only a committed prefix of that set. The runtime database security verifier now also requires every legacy owner column and dual-write trigger needed by the deployed application and code rollback. Moderator eligibility/grant commands remain separately and deliberately invoked; migration rollout never grants moderator access.

Local verification passed 122 unit tests and 33 PostgreSQL integration tests using only the explicitly selected `studyspace_test_recovery` database. ESLint, TypeScript, Prisma validation, rollout-script syntax, and the webpack production build passed. The build retained the previously recorded Auth0 SDK dynamic-dependency warnings. No existing migration was edited, no account-deletion route or control was added, and no cloud database, Auth0, Vercel, secret, or local `.env` file was changed or printed by the rollout preparation.

The guard itself has not been executed against the parent Neon branch. Parent project/branch labels and recovery availability require dashboard evidence because PostgreSQL cannot attest those provider-level facts. Migration application, moderator provisioning, Vercel promotion, authenticated smoke tests, and rollback execution remain `NOT RUN` pending explicit external approval.

The full live-cloud evidence requirements are tracked in `docs/STAGING_CHECKLIST.md`. The 2026-11-08 evidence below supersedes the earlier `NOT RUN` statements only for the specific checks it completed; Neon catalog/RLS validation, the public HTTPS verifier, Vercel forwarded-header behavior, authenticated Playwright, moderator workflows, connection load, monitoring, alerting, full restore integrity, and executed rollback remain incomplete.

## Staging live verification

Environment: Vercel staging deployment, its configured Auth0 integration, and the Neon staging project

Recorded: 2026-11-08

Verifier: project owner using provider status records and manual application checks

### Verified staging evidence

- Vercel reports the staging deployment of commit `70e2bf4` as Ready.
- Auth0 login and logout, separate accounts, Profile preferences, the public directory, Favorites, review submission and withdrawal, and report submission were manually exercised through the staging application.
- Profile and Favorites remained isolated between two accounts through the application UI.
- A pending review from one account was not visible to the second account.
- GitHub Actions staging rate-limit cleanup run `42527692806` succeeded. It deleted zero expired buckets from one bounded batch with a limit of 1,000.
- A Neon manual snapshot was restored into a separate branch. Both published library listings were verified in the restored branch, and the temporary branch was subsequently deleted.
- Vercel reports previous deployment `b508b79` as Ready and exposes Instant Rollback for it.

These are provider-reported and manual staging results. They are separate from automated local/CI results and do not count as authenticated Playwright coverage.

### Incomplete staging checks and production blockers

- Vercel still reports a Node.js version override warning.
- Auth0 still reports a development-key warning.
- Neon's available recovery history is limited to six hours, and scheduled snapshots are unavailable on the current plan.
- The snapshot exercise verified two public listings only; full table counts, private data, RLS behavior, referential integrity, and application cutover were not verified.
- Instant Rollback availability was confirmed, but no deployment rollback was executed.
- Live authenticated Playwright tests and moderator approval/rejection remain unverified.
- Production ingress-header trust, realistic load testing, monitoring, and alerting remain unverified.

The staging deployment has meaningful functional and operational smoke evidence, but it is not evidence of commercial production readiness. Production still requires isolated production services and credentials, an approved recovery window and backup plan, full restore and rollback rehearsals, production ingress verification, realistic load testing, monitoring and alerting, and completed authenticated/moderator automation.

# StudySpace public v1 release runbook

Status: operator runbook; no cloud mutation, deployment, moderator grant, registration activation, or merge is authorized by this document

This is the single ordered release procedure for public v1. Detailed rationale remains in `DEPLOYMENT.md`, the exact database assertions remain in `STAGING.md`, Auth0/Google settings remain in `AUTHENTICATION_RELEASE.md`, and manual privacy requests remain in `DATA_REQUESTS.md`. Record redacted PASS/FAIL evidence in `STAGING_CHECKLIST.md`; never paste a connection URL, password, cookie, token, or authenticated browser state into a transcript.

## Stop conditions

Stop the release if the reviewed commit or CI changes, the worktree is dirty, database identity differs, recovery is not available, an unreviewed migration is pending, any grant/RLS check fails, the previous Vercel deployment is unavailable, live authentication uses Auth0 development keys, no operational moderator is available while reviews/reports are enabled, or public-account policy/retention gates remain unapproved. The Neon branch named `production` is the parent branch of the staging project; it is not evidence of a public production environment.

## 1. Freeze and approve the artifact

1. Record the full commit hash on `feat/account-lifecycle-foundation`, the draft PR, and the successful CI run for that exact hash.
2. Confirm all 15 migration names and checksums match the reviewed source, no account-deletion route or control is exposed, and authenticated enrollment remains disabled until its separate gate is approved.
3. Confirm the previous immutable Vercel deployment is Ready and the Server Actions encryption key will remain stable across rollback.
4. Record named owners for deployment, incident response, privacy requests, moderation, and cleanup monitoring.

## 2. Rehearse only migration 15 on the disposable Neon branch

The disposable target is project `curly-paper-15884428`, branch `rehearsal-account-lifecycle` (`br-cold-king-beer2yusy`), direct endpoint `ep-solitary-butterfly-be2qqvk8.c-9.us-east-2.aws.neon.tech`, database `studyspace_staging`, owner `neondb_owner`. Have the approved secret manager inject `DIRECT_URL`; do not source `.env` and do not put the URL in command arguments or files.

Set these non-secret assertions for the reviewed clean commit:

```sh
export STUDYSPACE_NEON_PROJECT_ID=curly-paper-15884428
export STUDYSPACE_NEON_BRANCH_ID=br-cold-king-beer2yusy
export STUDYSPACE_NEON_BRANCH_NAME=rehearsal-account-lifecycle
export STUDYSPACE_APPROVED_COMMIT=<full-reviewed-commit-sha>
node scripts/staging/rehearse-retention-migration.mjs check
```

`check` must report the exact endpoint, PostgreSQL 18, verified TLS, all first 14 checksums, and only `20261110190000_add_lifecycle_retention_cleanup` pending. After separate approval, set a fresh UTC timestamp and run mutation mode:

```sh
export STUDYSPACE_REHEARSAL_APPROVED=yes
export STUDYSPACE_REHEARSAL_CONFIRMED_AT=<current-ISO-8601-UTC-time>
node scripts/staging/rehearse-retention-migration.mjs apply
```

`apply` runs Prisma, reapplies runtime grants, runs the full database security verifier, checks all 15 checksums, and verifies the cleanup function's owner, fixed search path, and maintenance-only execution grant. It does not call the cleanup function or touch the parent branch. A database catalog cannot prove the Neon project/branch label; the script requires the operator-supplied dashboard identifiers and exact known endpoint as a second boundary.

## 3. Configure the production-owned services

These are dashboard actions and require the owner. Do not copy staging credentials.

- In Google Cloud, configure the final homepage, `/privacy`, `/terms`, verified domain, support email, `openid profile email` only, and an owner-controlled web OAuth client. Confirm publishing/verification requirements for the planned external audience.
- In Auth0, create or select the production Regular Web Application and production Google connection. Remove Auth0 development keys. Set only the final callback, logout, web-origin, and reviewed back-channel URLs documented in `AUTHENTICATION_RELEASE.md`.
- In Vercel, select Node.js 24, configure the exact HTTPS `APP_BASE_URL`, independent stable secrets, pooled public/Saved database login URLs, pool limits, and the reviewed Auth0 application. Keep the migration-owner and maintenance URLs out of runtime. Keep Preview isolated from production Auth0 and PostgreSQL.
- Set `TRUSTED_CLIENT_IP_SOURCE=vercel` only after the final-origin forwarding-header test proves the trusted header is overwritten by Vercel.

## 4. Apply the parent staging migrations before application code

This step mutates the parent staging branch and requires separate approval.

1. In Neon, record project `curly-paper-15884428`, branch label `production`, its current non-rehearsal branch ID, exact direct non-pooled endpoint, `studyspace_staging`, PostgreSQL 18, and a usable recovery point created or confirmed within 30 minutes.
2. Inject the protected owner `DIRECT_URL` and the non-secret assertions from `STAGING.md`. Set `STUDYSPACE_APPROVED_COMMIT` to the exact green commit.
3. Run `node scripts/staging/phase17-rollout.mjs check`. Stop unless it reports the exact reviewed pending set and every preflight PASS.
4. With explicit rollout approval and a fresh recovery timestamp, run `node scripts/staging/phase17-rollout.mjs apply`.
5. Retain redacted evidence that Prisma applied the reviewed chain, runtime grants were reapplied, all 15 checksums match, public Review reads remain six-column only, cleanup is maintenance-only, RLS is enabled, and legacy columns/triggers required for rollback remain present.

Do not deploy application code until the database step passes. Do not reverse forward-only expand migrations. If migration execution fails, leave the old application serving, inspect the failed migration, repair forward, and resume only if the guard accepts the exact checksum-valid prefix.

## 5. Provision a moderator separately

Public reviews and reports require an operational moderator. Never choose an account from a name or email.

1. In Auth0, verify the exact immutable subject for the intended person and confirm the person controls the account.
2. Owner-read the subject's exact current active `AccountIdentity` generation and random account UUID. Confirm the account is active, the identity is linked and current, and no existing or revoked grant exists.
3. Put that exact subject in the server-only `AUTH0_MODERATOR_SUBJECTS` value for the intended Vercel environment.
4. Run `node scripts/staging/phase17-rollout.mjs moderator-check` with the attestation variables documented in `STAGING.md`.
5. Only after separate approval, set the fresh grant confirmation and run `node scripts/staging/phase17-rollout.mjs moderator-grant`. Record the account UUID and subject digest reference privately—not the subject in public logs.
6. Verify through the deployed application that this account can moderate and a distinct non-allowlisted/non-granted account cannot. Either the allowlist or database grant alone must be insufficient.

## 6. Promote and verify the application

Deploy the same reviewed commit to an immutable Vercel deployment, inspect it privately, then promote only with separate approval. Verify public navigation, search, listing details, error states, responsive layouts, `/privacy`, `/terms`, and contact before enabling accounts.

For authenticated release evidence, use three real, ignored Playwright storage states and the exact HTTPS origin:

```sh
export STAGING_BASE_URL=https://<exact-origin>
export PLAYWRIGHT_USER_A_STATE=<ignored-or-outside-repository-path>
export PLAYWRIGHT_USER_B_STATE=<ignored-or-outside-repository-path>
export PLAYWRIGHT_MODERATOR_STATE=<ignored-or-outside-repository-path>
npm run verify:release
```

Also perform one fresh interactive login/logout and verify: cookie flags and expiry; Account menu; Profile/Favorite persistence and two-account isolation; review submit/edit/withdraw and pending privacy; private report submission/resolution; moderator allow and denial; back-channel/session invalidation; CSRF rejection; trusted-ingress spoof resistance; shared rate limiting and 429/503 behavior. The command intentionally reports interactive login, ingress/load behavior, executed rollback, and restored-data integrity as `NOT VERIFIED`; record those separately.

## 7. Activate and monitor retention

1. Configure the GitHub `staging` environment secret `MAINTENANCE_DATABASE_URL` with only the direct restricted maintenance login. Never use the owner, application, or Saved login.
2. Manually dispatch **Staging maintenance cleanup** once. It must verify identity, TLS, role membership, direct-table denial, and function execution before one atomic batch of at most 1,000 per category.
3. Confirm the job summary reports four numeric counts, then allow the hourly schedule. Alert on failures, missed runs, rows past deadline, invalid/expired holds, and two consecutive full batches.
4. Keep the manual data-request channel monitored. Do not claim an account deletion is complete until local records, sessions, Auth0 identities, holds, restored-backup replay, and completion evidence are all verified under `DATA_REQUESTS.md`.

## 8. Recovery and rollback

- **Application defect:** promote the previous immutable Vercel deployment. Keep the expanded database schema and stable secrets; verify old-session, Profile, Favorite, Review, Report, and moderation behavior. No contract migration is included, so the legacy columns and dual-write triggers remain the rollback bridge.
- **Migration interruption:** do not edit migration history or reverse SQL. Keep old code live, diagnose, repair forward, and resume through the guarded script only.
- **Data corruption:** stop writes, restore the chosen recovery point into an isolated database, verify migration checksums, counts, private-data RLS/grants, and completed account-closure replay, then switch both runtime URLs together. Rotate affected credentials after an incident.
- **Release abort:** leave registration disabled and the prior deployment active. Database expansion may remain because it is backward compatible; document the abort and monitoring state.

## 9. Final decision record

Public accounts are GO only when the disposable rehearsal, parent migration, production-owned Auth0/Google setup, live two-account and moderator tests, operational cleanup, monitoring, recovery objectives, manual request responsibilities, and owner/legal approval of the public drafts all have dated evidence. Publishing source under MIT and enabling public browsing do not by themselves authorize public registration.

Record decisions for every provisional policy assumption before that GO:

- owner confirmation that StudySpace is operated personally by an individual and that `Sidharth Bajoji` is the intended public MIT copyright attribution;
- qualified review, where appropriate, of the initial United States-only, age-18 account rule, the absence of technical age/residency verification, and applicable federal and state law;
- the public operator/legal notice identity and address, governing law, disputes, warranties, liability, suspension/appeal, acceptable-use, and user-review display-license terms;
- privacy-request response deadlines, private case-record retention, authorized-agent/inaccessible-account verification, export format, deletion exceptions, and complaint/appeal process;
- Auth0, Google, Vercel, and Neon production entities, regions, provider-log retention, subprocessors, contracts, backup retention, RPO/RTO, and closure replay;
- confirmation that no advertising, analytics, payment, or subscription processing is active at launch and a change process before any monetization or new tracking is introduced.

The repository records these as engineering assumptions, not legal conclusions or legal approval.

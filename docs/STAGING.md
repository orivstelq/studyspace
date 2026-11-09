# Staging deployment preparation

Status: the isolated staging application is deployed from commit `70e2bf4`, and Vercel reports it Ready. Database roles, migrations, grants, and the scheduled cleanup are provisioned. Verified evidence and incomplete release gates are recorded in `docs/VERIFICATION.md` and `docs/STAGING_CHECKLIST.md`; staging readiness does not imply commercial production readiness.

## Fixed environment boundary

The staging database is the existing Neon project `studyspace-staging` (`curly-paper-15884428`) in AWS US East 2, database `studyspace_staging`, PostgreSQL 18.6. Its Neon branch is named `production` only because that is the provider default; it is not an application production environment and must never receive production credentials or data.

The staging deployment must remain isolated from eventual production services. The eventual production application must use a different Neon project, Vercel project, Auth0 application, secrets, and domain. Preview deployments must not inherit staging database or Auth0 secrets unless a preview-specific isolation design is approved.

Vercel's Node.js 24 runtime is the target for Next.js 16.4 and Prisma 7.10. The application must remain a Node.js deployment, not a static export or Edge runtime: Auth0 sessions, the PostgreSQL adapters, Server Actions, and route handlers all require the server runtime. No `vercel.json` is needed for the current first-party Next.js deployment.

## Database identities and ownership

`neondb_owner` is the Neon-managed migration and administration identity. It is not treated as a PostgreSQL superuser: provisioning uses only capabilities confirmed by the read-only preflight and fails if Neon restricts an operation. It owns Prisma-created objects and is used only through the direct Neon endpoint for approved migration, grant, and verification operations. It is never configured in Vercel.

The existing permission roles remain group roles and are not recreated:

| Permission role | Login | Inherit | Purpose |
| --- | --- | --- | --- |
| `studyspace_app` | no | no | Published listings and approved public review reads |
| `studyspace_saved` | no | no | Session, owner-scoped private data, community mutations, and shared rate limits |
| `studyspace_maintenance` | no | no | Execute the bounded rate-limit cleanup function only |

After explicit approval, create exactly three environment-specific login identities:

| Login identity | Inherited permission role | Runtime secret |
| --- | --- | --- |
| `studyspace_staging_app_login` | `studyspace_app` | Pooled `DATABASE_URL` |
| `studyspace_staging_saved_login` | `studyspace_saved` | Pooled `FAVORITES_DATABASE_URL` |
| `studyspace_staging_maintenance_login` | `studyspace_maintenance` | Direct `MAINTENANCE_DATABASE_URL`, held only by the eventual scheduler/operator |

Each login is `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`. PostgreSQL 18 membership is granted with `INHERIT TRUE`, `SET FALSE`, and `ADMIN FALSE` for exactly one permission role. The global `NOINHERIT` default makes an accidental future membership inert unless its inheritance is reviewed explicitly. `SET FALSE` prevents changing identity to the group role, and `ADMIN FALSE` prevents delegating membership. Permission roles own no SQL objects; runtime logins own no SQL objects and are never members of `neondb_owner` or a Neon administrative role.

This layout matters for RLS. The migration owner bypasses policies as table owner, while the runtime login does not own tables, has no `BYPASSRLS`, and reaches privileges only through its reviewed permission role. The application still must set the verified owner/moderator transaction context; RLS is defense in depth, not authentication.

## Exact provisioning sequence

Treat the sequence below as the reviewed procedure for a new environment; the existing staging database has already completed the database steps. Every future mutation requires explicit approval and credentials supplied through the operator's local environment. Never paste a credential or URL into a command transcript, issue, or pull request. Run one step at a time and retain redacted output as release evidence.

1. Confirm the Neon console metadata: project ID, region, branch, database, PostgreSQL 18.6, restore window, and the three existing NOLOGIN permission roles. Confirm the connection widget shows both pooled and direct endpoints.
2. Have the secret manager inject the direct owner connection through libpq environment variables. Run the read-only preflight without a credential-bearing command-line argument:

   ```sh
   psql -X --set=ON_ERROR_STOP=1 --file=scripts/staging/preflight.sql
   ```

3. For a new environment only, have the approved secret manager inject the direct owner connection as standard libpq variables: `PGHOST`, optional `PGPORT`, `PGDATABASE=studyspace_staging`, `PGUSER=neondb_owner`, `PGPASSWORD`, and `PGSSLMODE=verify-full`. Do not put the owner password or a credential-bearing URL in the command line. Generate three unique passwords of 32–128 characters using the alphabet documented by the provisioning prompt, then run from an interactive terminal:

   ```sh
   scripts/staging/provision-login-identities.sh
   ```

   The wrapper first runs `create-login-identities.sql`, which creates or reuses only correctly constrained `NOLOGIN` identities over verified TLS. It then reads each password twice with terminal echo disabled. The values exist in local process memory and a private pipe, not command-line arguments, shell history, committed SQL, or emitted diagnostics. In one transaction it verifies the role preconditions, sends three `ALTER ROLE ... PASSWORD` statements, and then applies all three `LOGIN` changes. `LOGIN` is committed only after Neon accepts every password statement; independent authentication is then checked with each runtime connection in step 6. Neon requires the plaintext values and receives them over verified TLS for password processing; the values may therefore be exposed to Neon's database processing and provider-side logging controls. This workflow does not claim zero server-side exposure.

   A prompt, network, SQL, or client failure before `COMMIT` leaves all identities `NOLOGIN` and rolls back every password change; after confirming the exact inert attributes and absence of memberships, rerun the wrapper. An existing `LOGIN`, elevated attribute, or membership makes the workflow abort before prompting or changing credentials. The currently provisioned staging roles are already `LOGIN` with verified credentials and memberships, so **do not run this workflow against them**. Rotation requires a separate approved maintenance procedure and deliberate interruption plan.
4. Apply the fixed membership options:

   ```sh
   psql -X --set=ON_ERROR_STOP=1 --file=scripts/staging/configure-role-memberships.sql
   ```

5. Check `_prisma_migrations` and schema emptiness. On the first provisioning only, have the secret manager inject the direct owner URL as `DIRECT_URL`, apply every committed migration in order, then restore the owner libpq variables and apply explicit/default runtime grants:

   ```sh
   npx prisma migrate deploy
   psql -X --set=ON_ERROR_STOP=1 --file=scripts/grant-runtime-roles.sql
   ```

   Never use `prisma migrate dev`, reset, a shadow database, or migration rewriting against staging. The grant script revokes `PUBLIC` database temporary/connect access and schema creation, then grants database connection, schema usage, and reviewed object privileges to the permission roles.

6. Run `scripts/staging/verify-database-security.sql` as the owner. Then connect separately with each runtime URL and verify `session_user`, `current_user`, `pg_has_role`, object privileges, and denial cases. The application login must fail to read `Favorite`, `UserProfile`, `AuthSession`, `UserReport`, `ModerationAction`, and `RateLimitBucket`. The private login must be unable to cross account owner context, reassign a review, or obtain moderator access without the server-controlled setting. The maintenance login must execute only the bounded cleanup function and must not read or delete the table directly.

   For the deliberate Favorite RLS check, have the secret manager inject `STAGING_OWNER_PGHOST`, `STAGING_OWNER_PGPASSWORD`, `STAGING_SAVED_PGHOST`, and `STAGING_SAVED_PGPASSWORD`; the matching `STAGING_OWNER_PGPORT` and `STAGING_SAVED_PGPORT` are optional. Do not supply a connection URL or put a password in the command. Run only the guarded wrapper:

   ```sh
   scripts/staging/verify-favorite-rls-live.sh
   ```

   The wrapper fixes `PGSSLMODE=verify-full` and `PGSSLROOTCERT=system` for both libpq connections, so libpq uses the operating system certificate store to verify encryption, the server certificate, and the hostname before SQL runs. This avoids depending on `~/.postgresql/root.crt`, which was absent from the verified macOS PostgreSQL 17.11 client. Before applying those fixed values, the wrapper removes inherited service-file, password-file, host-address, certificate, key, CRL, SSL-mode/protocol, channel-binding, peer, GSS-encryption, and session-option overrides. It deliberately does not use `pg_stat_ssl`: Neon reported `ssl = false` there for a connection independently confirmed as TLS 1.3, so that server-side view is not accepted as client TLS evidence.

   Because the saved login cannot create listings and staging may be empty, the wrapper first uses the direct owner connection to commit one uniquely identified `DRAFT`/`DEVELOPMENT_FIXTURE` listing. The fixture is never public. It then switches to the saved login, verifies the database, exact login attributes, sole membership, RLS ownership, and each required Favorite privilege independently. In one saved-login transaction it creates two random fictional owner keys, proves each can insert/read/delete its exact Favorite while bidirectional cross-owner insert/read/delete fails, explicitly removes both rows, and executes `ROLLBACK`. A SQL error or disconnected saved connection rolls back every Favorite mutation.

   An exit/signal trap always reconnects as the owner with `PGSSLMODE=verify-full` and `PGSSLROOTCERT=system`, deletes only the exact UUID-marked draft fixture, verifies that neither it nor related Favorites remain, and makes cleanup failure fail the command. Uncatchable termination or a simultaneous network outage cannot be given an absolute immediate-cleanup guarantee for a fixture that must be committed across two connections. The wrapper prints the non-secret fixture UUID before creation so recovery is deterministic. After restoring the owner libpq environment with those same TLS settings, use the printed UUID with the idempotent recovery command and retain its successful output:

   ```sh
   psql -X --set=ON_ERROR_STOP=1 \
     --set=fixture_id=PRINTED_FIXTURE_UUID \
     --file=scripts/staging/cleanup-favorite-rls-fixture.sql
   ```

   The verifier is never called by tests, CI, migrations, builds, or deployments. Its unit coverage only inspects these scripts statically.
7. Load only reviewed, non-sensitive staging listing data. Do not copy local account/session/community tables or eventual production data.
8. Configure a dedicated Vercel staging project only after separate approval. Use pooled runtime URLs and omit `DIRECT_URL` and `MAINTENANCE_DATABASE_URL` from all application build/runtime environments.
9. Configure a dedicated Auth0 staging application with exact HTTPS callback, logout, and back-channel logout URLs. Add only dedicated test subjects to `AUTH0_MODERATOR_SUBJECTS`.
10. Deploy only after a second approval, then execute the release checklist and retain evidence.

## Environment variables

Configure these directly in the staging project's encrypted settings. Do not use a checked-in environment file and do not copy the local `.env`.

| Variable | Staging requirement |
| --- | --- |
| `APP_BASE_URL` | Exact dedicated HTTPS staging origin |
| `DATABASE_URL` | Pooled endpoint using `studyspace_staging_app_login` |
| `FAVORITES_DATABASE_URL` | Pooled endpoint using `studyspace_staging_saved_login` |
| `DATABASE_POOL_MAX` | Start at 2 per instance; tune from Neon metrics |
| `PRIVATE_DATABASE_POOL_MAX` | Start at 2 per instance; tune from Neon metrics |
| `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` | Dedicated staging Auth0 application only |
| `AUTH0_SECRET` | Independent staging session secret, 32 bytes or longer |
| `AUTH0_MODERATOR_SUBJECTS` | Exact dedicated staging test subjects only |
| `RATE_LIMIT_SECRET` | Independent staging HMAC secret, 32 bytes or longer |
| `TRUSTED_CLIENT_IP_SOURCE` | `vercel`, only after deployed ingress verification |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Stable staging value shared across builds/instances and rollback |

`DIRECT_URL` is release-operator input, not a Vercel application variable. `MAINTENANCE_DATABASE_URL` belongs only to an approved scheduler/operator. Do not define secret values with a `NEXT_PUBLIC_` prefix.

## Pooling, migrations, and rollback

The two runtime URLs use Neon pooled endpoints. Each warm Vercel instance can open both application pools, so the approximate application ceiling is `(DATABASE_POOL_MAX + PRIVATE_DATABASE_POOL_MAX) × concurrent instances`; validate queueing and connections under live staging load. The direct endpoint is reserved for migrations and short administrative checks. Neon can support Prisma migrations through its current pooler, but a direct owner endpoint keeps ownership and long-running DDL separate from runtime traffic.

Run migrations once before promoting application code. Migrations are forward-only and must be backward compatible. Roll back application code by promoting the prior immutable Vercel deployment with the same Server Action encryption key. Never automatically reverse a schema migration. For data recovery, restore to an isolated Neon branch/project, validate counts and security policies, and change both runtime URLs together only after approval.

Before production release, choose and record backup retention, recovery-point objective, and recovery-time objective. A staging manual snapshot was restored into a separate branch on 2026-11-08, both published library listings were verified, and the branch was deleted; this did not verify full database integrity or application cutover. Recovery history is currently limited to six hours, and scheduled snapshots are unavailable on the current Neon plan.

The restricted hourly GitHub Actions cleanup is active for staging. Run `42527692806` succeeded on 2026-11-08 with zero deletions from a maximum batch of 1,000. Monitoring and alerting for function errors, p95 latency, 429/503 rates, connection saturation, storage, branch health, Auth0 failures, and repeated full cleanup batches remain production blockers.

## Browser verification

Public Playwright tests run in CI without identity. Live authentication uses real Auth0 sessions only:

```sh
PLAYWRIGHT_USER_A_STATE=/ignored/path/user-a.json \
PLAYWRIGHT_USER_B_STATE=/ignored/path/user-b.json \
PLAYWRIGHT_MODERATOR_STATE=/ignored/path/moderator.json \
PLAYWRIGHT_BASE_URL=https://staging.example.invalid \
npm run test:e2e -- --project=chromium-authenticated
```

`PLAYWRIGHT_BASE_URL` accepts only an origin-only HTTPS URL and suppresses the local web server; omit it to retain local `127.0.0.1:3100` behavior. All state files must be under an ignored local path such as `playwright/.auth/`, must be created from dedicated staging test accounts, and must never be printed or uploaded as artifacts. The live suite changes Saved/Profile/review/report data, cleans up the favorite/profile, withdraws the test review, and signs out user A. Use disposable test accounts and run it serially. A configured project without these real sessions does not count as live end-to-end verification.

After deployment, run the public, GET-only verifier:

```sh
STAGING_BASE_URL="https://staging.example.invalid" npm run verify:staging
```

The verifier rejects non-HTTPS origins and credential-bearing URLs, sends no cookies or tokens, makes no mutation request, and does not print the origin or response bodies. It checks public pages, JSON response shapes, error status codes, cache behavior, HSTS, CSP, and baseline security headers.

## Known live-cloud gates

- PostgreSQL 18.6 on the actual Neon compute, including all migrations, role membership flags, owner checks, RLS denials, review immutability, moderator setting isolation, and bounded cleanup
- Vercel's actual `x-vercel-forwarded-for` overwrite behavior under conflicting browser-supplied forwarding headers
- HTTPS redirect, HSTS, CSP console behavior, cookie flags, callbacks, logout, and back-channel invalidation on the final staging domain
- Connection-pool behavior under concurrency and cold starts
- Full restore integrity, private-data/RLS validation, and application cutover; the limited manual snapshot exercise verified only two published listings
- Monitoring and alerts; the approved cleanup schedule has one successful recorded run
- The live three-session Playwright suite, moderator approval/rejection, and a manual keyboard/mobile pass
- An executed Vercel rollback; deployment `b508b79` is Ready and Instant Rollback is available, but neither was exercised
- Resolution of the Vercel Node.js version override warning and Auth0 development-key warning

The CSP intentionally retains `script-src 'unsafe-inline'` and inline styles for the current Next.js Cache Components/partial-prerendering architecture. It blocks external script sources and inline event attributes, but it is not nonce-level protection and cannot stop every inline-script injection. That residual risk remains a production gate.

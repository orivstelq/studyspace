# Staging deployment preparation

Status: prepared, not provisioned or deployed. This document does not authorize a Neon mutation, Vercel connection, Auth0 change, or service purchase.

## Fixed environment boundary

The staging database is the existing Neon project `studyspace-staging` (`curly-paper-15884428`) in AWS US East 2, database `studyspace_staging`, PostgreSQL 18.6. Its Neon branch is named `production` only because that is the provider default; it is not an application production environment and must never receive production credentials or data.

Create a separate Vercel project and a separate Auth0 Regular Web Application for staging when deployment is approved. The eventual production application must use a different Neon project, Vercel project, Auth0 application, secrets, and domain. Preview deployments must not inherit staging database or Auth0 secrets unless a preview-specific isolation design is approved.

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

Each login is `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`. PostgreSQL 18 membership is granted with `INHERIT TRUE`, `SET FALSE`, and `ADMIN FALSE` for exactly one permission role. The global `NOINHERIT` default makes an accidental future membership inert unless its inheritance is reviewed explicitly. `SET FALSE` prevents changing identity to the group role, and `ADMIN FALSE` prevents delegating membership. Permission roles own no SQL objects; runtime logins own no SQL objects and are never members of `neondb_owner` or a Neon administrative role.

This layout matters for RLS. The migration owner bypasses policies as table owner, while the runtime login does not own tables, has no `BYPASSRLS`, and reaches privileges only through its reviewed permission role. The application still must set the verified owner/moderator transaction context; RLS is defense in depth, not authentication.

## Exact provisioning sequence

Every command below is pending approval and requires a direct owner URL supplied in the operator's local environment. Never paste a URL into a command transcript, issue, or pull request. Run one step at a time and retain redacted command output as release evidence.

1. Confirm the Neon console metadata: project ID, region, branch, database, PostgreSQL 18.6, restore window, and the three existing NOLOGIN permission roles. Confirm the connection widget shows both pooled and direct endpoints.
2. Set `STAGING_DIRECT_URL` only in the operator's current secret-capable shell or password manager integration. Run the read-only preflight:

   ```sh
   psql "$STAGING_DIRECT_URL" -f scripts/staging/preflight.sql
   ```

3. With explicit approval to create credentials, generate three independent high-entropy passwords in the approved secret manager. Run `scripts/staging/create-login-identities.sql`; it prompts without echo and aborts if any fixed login already exists. Store each resulting connection URL only in its intended secret store.
4. Apply the fixed membership options:

   ```sh
   psql "$STAGING_DIRECT_URL" -f scripts/staging/configure-role-memberships.sql
   ```

5. Check `_prisma_migrations` and schema emptiness. On the first provisioning only, apply every committed migration in order with the direct owner URL, then apply explicit/default runtime grants as the same owner:

   ```sh
   DIRECT_URL="$STAGING_DIRECT_URL" npx prisma migrate deploy
   psql "$STAGING_DIRECT_URL" -f scripts/grant-runtime-roles.sql
   ```

   Never use `prisma migrate dev`, reset, a shadow database, or migration rewriting against staging. The grant script revokes `PUBLIC` database temporary/connect access and schema creation, then grants database connection, schema usage, and reviewed object privileges to the permission roles.

6. Run `scripts/staging/verify-database-security.sql` as the owner. Then connect separately with each runtime URL and verify `session_user`, `current_user`, `pg_has_role`, object privileges, and denial cases. The application login must fail to read `Favorite`, `UserProfile`, `AuthSession`, `UserReport`, `ModerationAction`, and `RateLimitBucket`. The private login must be unable to cross account owner context, reassign a review, or obtain moderator access without the server-controlled setting. The maintenance login must execute only the bounded cleanup function and must not read or delete the table directly.
7. Load only reviewed, non-sensitive staging listing data. Do not copy local account/session/community tables or eventual production data.
8. Configure a dedicated Vercel staging project only after separate approval. Use pooled runtime URLs and omit `DIRECT_URL` and `MAINTENANCE_DATABASE_URL` from all application build/runtime environments.
9. Configure a dedicated Auth0 staging application with exact HTTPS callback, logout, and back-channel logout URLs. Add only dedicated test subjects to `AUTH0_MODERATOR_SUBJECTS`.
10. Deploy only after a second approval, then execute the release checklist and retain evidence.

## Environment variables

Configure these directly in the future staging project's encrypted settings. Do not use a checked-in environment file and do not copy the local `.env`.

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

Before release, choose and record backup retention, recovery-point objective, and recovery-time objective. Rehearse a restore without overwriting staging. Monitor function errors, p95 latency, 429/503 rates, database connection saturation, storage, branch health, Auth0 failures, and cleanup backlog. No monitoring vendor or scheduler is selected by this milestone.

## Browser verification

Public Playwright tests run in CI without identity. Live authentication uses real Auth0 sessions only:

```sh
PLAYWRIGHT_USER_A_STATE=/ignored/path/user-a.json \
PLAYWRIGHT_USER_B_STATE=/ignored/path/user-b.json \
PLAYWRIGHT_MODERATOR_STATE=/ignored/path/moderator.json \
npm run test:e2e -- --project=chromium-authenticated
```

All state files must be under an ignored local path such as `playwright/.auth/`, must be created from dedicated staging test accounts, and must never be uploaded as artifacts. The live suite changes Saved/Profile/review/report data, cleans up the favorite/profile, withdraws the test review, and signs out user A. Use disposable test accounts and run it serially. A configured project without these real sessions does not count as live end-to-end verification.

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
- Provider backups and an isolated restore rehearsal
- Monitoring alerts and an approved cleanup schedule
- The live three-session Playwright suite and a manual keyboard/mobile pass

The CSP intentionally retains `script-src 'unsafe-inline'` and inline styles for the current Next.js Cache Components/partial-prerendering architecture. It blocks external script sources and inline event attributes, but it is not nonce-level protection and cannot stop every inline-script injection. That residual risk remains a production gate.

# Production deployment architecture

Status: proposed for Phase 2. Nothing in this document authorizes a deployment or service purchase.

## Decision

Use Vercel for the Next.js 16 application and Neon PostgreSQL in the same region. This is the smallest operational surface that preserves the framework runtime, managed TLS, preview deployments, PostgreSQL 18, connection pooling, backups, and horizontal application scaling. The existing Phase 3 staging design is specified separately in `docs/STAGING.md`.

- Vercel is the first-party Next.js host and supplies immutable deployments, managed HTTPS, health-based rollout, and rollback. Its Hobby plan is for personal/non-commercial use; a commercial production launch must budget for an eligible plan.
- Neon supplies pooled and direct PostgreSQL endpoints, scale-to-zero development branches, and point-in-time restore. Production must use a paid retention window chosen from the business recovery requirements; the free tier is suitable for evaluation, not an assumed backup policy.
- Render is the leading single-vendor alternative if predictable always-on Node processes are preferable. It reduces serverless connection churn but has a higher idle floor and less direct Next.js integration. A container/VPS was rejected for the first launch because patching, TLS, failover, and database operations would become project responsibilities.

Keep the application and database in the same supported region. Block direct access to the application origin so that Vercel, which overwrites the trusted forwarding headers, remains the only source of client addresses used by public-search rate limits.

## Runtime and build

- Node.js 24, Next.js 16, Prisma 7, PostgreSQL 18.
- Build: `npm ci`, `npx prisma generate`, `npm run build`.
- Runtime: the platform-provided Next.js server. Do not expose Prisma or database URLs to browser bundles.
- Health/smoke checks: `/`, `/explore`, one known published listing, and `/api/spaces`.
- Use one immutable build artifact across instances. Keep `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` stable across instances and rollbacks.

## Environment

All values are server-only unless explicitly documented otherwise. Production secrets belong in platform secret storage, never Git or a copied local `.env`.

| Variable | Purpose |
| --- | --- |
| `APP_BASE_URL` | One exact public HTTPS origin; controls redirects, origin checks, Secure cookies, HSTS, and CSP upgrades. |
| `DATABASE_URL` | Pooled PostgreSQL URL for the read-only `studyspace_app` role. |
| `FAVORITES_DATABASE_URL` | Pooled URL for the private `studyspace_saved` role. |
| `DIRECT_URL` | Direct migration-owner URL, available only to the release job. Never provide it to application instances. |
| `MAINTENANCE_DATABASE_URL` | Direct URL for the restricted maintenance login, stored only in the scheduler's protected environment. |
| `DATABASE_POOL_MAX` | Optional per-instance public pool cap; defaults to 5. Start at 2 for serverless and raise only from database metrics. |
| `PRIVATE_DATABASE_POOL_MAX` | Optional per-instance private pool cap; defaults to 5. Start at 2 for serverless. |
| `RATE_LIMIT_SECRET` | Independent random 32-byte-or-longer secret used to HMAC rate-limit subjects. |
| `TRUSTED_CLIENT_IP_SOURCE` | Required in production. Use `vercel` only for direct Vercel ingress; `shared` intentionally puts all requests in one fail-safe bucket. |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Stable build/runtime key shared by all instances, per Next.js deployment guidance. |
| `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` | Existing Auth0 web application and encrypted session configuration. |
| `AUTH0_MODERATOR_SUBJECTS` | Comma-separated exact Auth0 subjects assigned through the trusted server environment. |

Register only the exact HTTPS callback, logout, and back-channel logout URLs for the production origin. Preview deployments should use a separate Auth0 application and database branch, or keep authentication disabled; wildcard callbacks are not acceptable.

## Connections and migrations

Use Neon's pooled endpoints for both runtime URLs and its direct endpoint for `DIRECT_URL`. Each running instance can open both configured pools, so the upper bound is approximately `(public pool + private pool) × active instances`, plus release and administrative connections. Set initial serverless pools to 2 and verify database connection and queue metrics under load.

Run schema changes once from a protected release job before promoting code that requires them:

```sh
npx prisma migrate deploy
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/grant-runtime-roles.sql
```

The grant script must run as the same owner that creates tables. Migrations must be backward-compatible with the currently deployed application: expand first, deploy compatible code, backfill separately, then contract in a later release. Never run migrations concurrently from application instances or automatically undo a migration during application rollback.

The Phase 17 staging release uses the stricter guarded procedure in `docs/STAGING.md` and `scripts/staging/phase17-rollout.mjs`. That procedure verifies the exact reviewed pending set and recovery attestation, applies migrations before code, reapplies grants, and stops before Vercel promotion. It is environment-specific staging tooling, not a general production deployment command.

## Shared rate limits

`RateLimitBucket` provides atomic fixed-window counters through the private runtime connection, so limits apply across all application instances. Raw account identifiers and client addresses are not stored; keys are scoped HMAC digests. Current limits are:

| Operation | Limit |
| --- | --- |
| Public directory search | 60 per client address per minute |
| Review submission/edit | 5 per account per 10 minutes |
| Report submission | 5 per account per hour |
| Moderation mutation | 60 per moderator per 10 minutes |

The API returns `429`, `Retry-After`, and rate-limit metadata when exhausted and `503` if shared enforcement is unavailable. Server actions return a neutral retry message. These application limits complement, rather than replace, platform denial-of-service controls.

### Trusted client address

Production refuses an unset or unsupported `TRUSTED_CLIENT_IP_SOURCE`. The selected direct-Vercel architecture uses `vercel` and reads only `x-vercel-forwarded-for`. It never falls back to browser-supplied `x-forwarded-for` or `x-real-ip`. Vercel documents `x-vercel-forwarded-for` as identical to its observed client address while preserving it when an upstream proxy can overwrite `x-forwarded-for`: <https://vercel.com/docs/headers/request-headers>. Missing, chained, or malformed values share one fail-safe bucket instead of producing attacker-selected keys.

This trust applies only to requests reaching the function through Vercel's managed ingress. A custom proxy requires Vercel Verified/Trusted Proxy configuration and a separate review; do not switch to a custom header based only on proxy documentation. Non-Vercel hosting must use `shared` until its ingress is proven to strip and overwrite a dedicated header and a reviewed adapter is implemented. Before launch, verify the deployed headers with conflicting client-supplied forwarding headers; that live Vercel check is still pending.

### Bounded cleanup

Provision the group role before migrations using a database administrator, then give a separately named automation login membership. Generate and store its password directly in the eventual scheduler's secret store:

```sql
CREATE ROLE studyspace_maintenance NOLOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE studyspace_cleanup LOGIN PASSWORD '<generated-secret>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT studyspace_maintenance TO studyspace_cleanup WITH INHERIT TRUE;
GRANT studyspace_maintenance TO studyspace_cleanup WITH SET FALSE;
GRANT studyspace_maintenance TO studyspace_cleanup WITH ADMIN FALSE;
```

The maintenance role has schema usage and execution of the bounded rate-limit and lifecycle cleanup functions only. It cannot directly read or mutate rate-limit, session, report, or moderation tables. The security-definer functions use fixed search paths, ordered `SKIP LOCKED` batches, and validated limits. Lifecycle cleanup makes expired sessions eligible immediately, resolved reports eligible at 89 days, and moderation actions eligible at 179 days unless an active finite audit hold applies.

The committed `.github/workflows/rate-limit-cleanup.yml` scheduler runs hourly at minute 17 and supports controlled manual dispatch. It permits only one non-cancelled run at a time and invokes exactly one 1,000-row batch per category using the maintenance login—not either runtime role or the migration owner:

```sh
psql "$MAINTENANCE_DATABASE_URL" -f scripts/staging/verify-maintenance-connection.sql -f scripts/cleanup-maintenance.sql
```

The script applies a 30-second statement timeout and two-second lock timeout. Before any deletion, the workflow fails unless the connection is the exact `studyspace_staging_maintenance_login` on `studyspace_staging`, has only the reviewed PostgreSQL 18 membership, retains no elevated attributes or direct cleanup-table privileges, and can execute both bounded functions. The same `psql` process performs verification and the atomic cleanup over TLS with hostname and system-CA verification.

For each new staging environment, manually create a GitHub environment named `staging` and add one environment secret named `MAINTENANCE_DATABASE_URL`. Its value must be the direct connection URL for `studyspace_staging_maintenance_login`, without URL-level service, GSS-encryption, `sslmode`, or `sslrootcert` overrides; never use the migration owner, `DATABASE_URL`, or `FAVORITES_DATABASE_URL`. Staging completed this setup: workflow run `42527692806` succeeded on 2026-11-08 with zero deletions from a maximum batch of 1,000.

Every run writes all four deletion counts to the GitHub Actions job summary. A failed preflight, connection, timeout, lock, or SQL command fails the job visibly. Any count of 1,000 adds a warning annotation; inspect recent summaries and treat two or more consecutive full hourly batches as backlog. Check database load and incoming traffic before manually dispatching another batch or changing cadence; do not add an unbounded loop or increase the batch size. Configure repository Actions failure notifications for the responsible operator.

## HTTPS, headers, and authentication

Vercel terminates TLS and redirects HTTP to HTTPS. When the build uses an HTTPS `APP_BASE_URL`, the app emits HSTS for one year with `includeSubDomains`; `preload` is intentionally omitted until every subdomain has been inventoried. Verify the header on the final custom domain before launch.

The production CSP restricts content to the application origin, blocks objects, frames, inline event handlers, and `eval`, and allows no browser connection to Auth0 because authentication uses server redirects. It currently retains `script-src 'unsafe-inline'` and inline styles for the Next.js bootstrap and Tailwind output. This is not nonce-level protection: an attacker who finds a markup-injection path capable of creating an inline script can execute it despite this policy. The remaining directives still reduce external loading and framing risk, but they do not mitigate that inline-script case. Next.js nonce CSP forces dynamic rendering and is incompatible with the current partial prerendering setup; experimental SRI was not selected for a production gate. Revisit nonces when the rendering/caching tradeoff is approved or stable hash support is available.

Auth0 sessions are server-verified, backed by PostgreSQL, non-rolling, and expire after eight hours. The SDK always marks the session cookie HttpOnly; the app explicitly uses SameSite=Lax and enables Secure for HTTPS origins. Next.js validates Server Action origins, and each application mutation also compares `Origin` to `APP_BASE_URL`. Moderator authority is recomputed from the server-only subject allowlist and never accepted from a browser field or public claim.

## Backups, restore, and rollback

- Enable a production point-in-time restore window that meets the agreed RPO/RTO, with alerts for failed backups and storage/connection pressure.
- Before high-risk data migrations, create a provider restore point or logical backup and test restoration into an isolated project at least quarterly.
- Roll back application code by promoting the previous immutable Vercel deployment. Because migrations are forward-only and compatible, do not reverse schema changes as part of that action.
- For data corruption, stop writes, restore to an isolated database at the chosen timestamp, validate counts and private-data policies, then switch both runtime URLs together. Rotate database credentials after an incident.

## Public v1 migration-first release sequence

The concise operator sequence is consolidated in `docs/RELEASE_RUNBOOK.md`. This section records its architecture rationale. `docs/STAGING.md` and `scripts/staging/phase17-rollout.mjs` provide the exact guarded staging commands; no document authorizes a cloud mutation by itself.

1. **Freeze the artifact.** Record the reviewed commit, require green pull-request CI, and confirm the build contains no account-deletion route or control.
2. **Verify the target.** From the provider dashboard, record the exact project, branch ID and label, direct non-pooled hostname, database, PostgreSQL major version, and owner login. The branch label `production` in the staging project is only a provider default.
3. **Confirm recovery.** Record a fresh provider recovery point or snapshot and its usable window. Stop if recovery cannot be independently confirmed.
4. **Preflight migration history.** Run the rollout guard in check mode with the protected direct owner URL. It must find the reviewed baseline and only the exact Phase 17 migration set pending; any extra, edited, failed, or partially ordered migration is a stop condition.
5. **Apply database changes first.** Run the guarded migration command once. Reapply `scripts/grant-runtime-roles.sql` as the migration owner, then run `scripts/staging/verify-database-security.sql`. Do not put the owner URL in the Vercel runtime.
6. **Provision moderators separately.** For each intended moderator, verify the exact Auth0 subject, its current active identity generation, the corresponding random account UUID, and membership in the server-side allowlist. Run the owner-only eligibility and grant commands; never select by email or display name. No moderator is required for a browse-only launch, but reviews/reports must not be enabled without an operational moderator.
7. **Promote the application.** Deploy the same reviewed commit with pooled public/private runtime URLs, stable server-action and rate-limit secrets, exact Auth0 origins, and bounded pool sizes. Existing sessions remain compatible because the expand migrations preserve legacy columns and dual-write behavior.
8. **Smoke test.** Verify `/`, `/explore`, a known listing, privacy/terms/contact, 400/404 API behavior, HTTPS/HSTS/CSP, no `X-Powered-By`, signed-out behavior, and rate-limit responses. If accounts are enabled, additionally verify login/logout, two-account Profile/Favorite isolation, review/report flows, moderator denial and approval/rejection, session invalidation, and the exact account menu.
9. **Observe before widening access.** Check application errors, database connections, rate-limit cleanup, Auth0 failures, and moderation queues. Do not treat one successful request as load or alerting verification.

Application rollback promotes the previous compatible immutable Vercel deployment. Do not reverse the forward-only expand migrations. If the new schema or grants are wrong, stop writes and use the documented forward-recovery path; use provider restoration only for confirmed data corruption and validate it in isolation before cutover.

Run `npm run verify:release` with the exact HTTPS origin and three ignored real-session storage-state files for the consolidated public/authenticated automation. It deliberately reports fresh interactive login, trusted-ingress spoof resistance, realistic rate limiting, executed rollback, and restored-data integrity as `NOT VERIFIED`; those require controlled live operator evidence.

### Public launch gates

- **Browse-only:** may proceed after the sequence above, final-origin ingress/header verification, monitoring and alert ownership, and a rehearsed deployment rollback. Leave Auth0 variables unset so the UI does not advertise unavailable account features.
- **Authenticated accounts:** additionally require production Auth0 social credentials, finalized public privacy/terms decisions, an operational retention schedule, a reviewed manual data-request process while self-service deletion is deferred, and live two-account plus moderator testing.
- **Commercial production:** additionally requires an eligible hosting/database plan, approved backup retention and recovery objectives, a full private-data restore integrity test, and the owner's legal/licensing decisions.

## Release checklist

1. Choose paid-plan, region, backup retention, recovery objectives, and a custom domain.
2. Provision separate production roles and apply all committed migrations and grants.
3. Configure secrets directly in the providers and verify no preview environment can reach production data.
4. Verify TLS redirect, HSTS, CSP violation-free navigation, cookies, Auth0 callbacks, and forwarding-header trust on the real domain.
5. Run CI, public Playwright tests, live two-account identity tests, and moderator/non-moderator workflow tests.
6. Exercise application rollback and isolated database restore before accepting production traffic.

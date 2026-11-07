# Production deployment architecture

Status: proposed for Phase 2. Nothing in this document authorizes a deployment or service purchase.

## Decision

Use Vercel for the Next.js 16 application and Neon PostgreSQL in the same region. This is the smallest operational surface that preserves the framework runtime, managed TLS, preview deployments, PostgreSQL 17, connection pooling, backups, and horizontal application scaling.

- Vercel is the first-party Next.js host and supplies immutable deployments, managed HTTPS, health-based rollout, and rollback. Its Hobby plan is for personal/non-commercial use; a commercial production launch must budget for an eligible plan.
- Neon supplies pooled and direct PostgreSQL endpoints, scale-to-zero development branches, and point-in-time restore. Production must use a paid retention window chosen from the business recovery requirements; the free tier is suitable for evaluation, not an assumed backup policy.
- Render is the leading single-vendor alternative if predictable always-on Node processes are preferable. It reduces serverless connection churn but has a higher idle floor and less direct Next.js integration. A container/VPS was rejected for the first launch because patching, TLS, failover, and database operations would become project responsibilities.

Keep the application and database in the same supported region. Block direct access to the application origin so that Vercel, which overwrites the trusted forwarding headers, remains the only source of client addresses used by public-search rate limits.

## Runtime and build

- Node.js 24, Next.js 16, Prisma 7, PostgreSQL 17.
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
  NOSUPERUSER NOCREATEDB NOCREATEROLE IN ROLE studyspace_maintenance;
```

The maintenance role has schema usage and execution of `cleanup_expired_rate_limit_buckets(integer)` only. It cannot select, insert, update, or directly delete rate-limit rows. The security-definer function removes only buckets whose reset time is more than one day old, orders work by expiry, uses `SKIP LOCKED`, and rejects batch sizes outside 1–10,000.

When an approved scheduler is selected, run at most one 1,000-row batch per invocation using the maintenance login—not either runtime role or the migration owner:

```sh
psql "$MAINTENANCE_DATABASE_URL" -f scripts/cleanup-rate-limit-buckets.sql
```

The script applies a 30-second statement timeout and two-second lock timeout. Record the returned count; repeated full batches indicate backlog and should alert an operator before increasing frequency or batch size. No scheduler, credential, or paid service is created by this milestone.

## HTTPS, headers, and authentication

Vercel terminates TLS and redirects HTTP to HTTPS. When the build uses an HTTPS `APP_BASE_URL`, the app emits HSTS for one year with `includeSubDomains`; `preload` is intentionally omitted until every subdomain has been inventoried. Verify the header on the final custom domain before launch.

The production CSP restricts content to the application origin, blocks objects, frames, inline event handlers, and `eval`, and allows no browser connection to Auth0 because authentication uses server redirects. It currently retains `script-src 'unsafe-inline'` and inline styles for the Next.js bootstrap and Tailwind output. This is not nonce-level protection: an attacker who finds a markup-injection path capable of creating an inline script can execute it despite this policy. The remaining directives still reduce external loading and framing risk, but they do not mitigate that inline-script case. Next.js nonce CSP forces dynamic rendering and is incompatible with the current partial prerendering setup; experimental SRI was not selected for a production gate. Revisit nonces when the rendering/caching tradeoff is approved or stable hash support is available.

Auth0 sessions are server-verified, backed by PostgreSQL, non-rolling, and expire after eight hours. The SDK always marks the session cookie HttpOnly; the app explicitly uses SameSite=Lax and enables Secure for HTTPS origins. Next.js validates Server Action origins, and each application mutation also compares `Origin` to `APP_BASE_URL`. Moderator authority is recomputed from the server-only subject allowlist and never accepted from a browser field or public claim.

## Backups, restore, and rollback

- Enable a production point-in-time restore window that meets the agreed RPO/RTO, with alerts for failed backups and storage/connection pressure.
- Before high-risk data migrations, create a provider restore point or logical backup and test restoration into an isolated project at least quarterly.
- Roll back application code by promoting the previous immutable Vercel deployment. Because migrations are forward-only and compatible, do not reverse schema changes as part of that action.
- For data corruption, stop writes, restore to an isolated database at the chosen timestamp, validate counts and private-data policies, then switch both runtime URLs together. Rotate database credentials after an incident.

## Release checklist

1. Choose paid-plan, region, backup retention, recovery objectives, and a custom domain.
2. Provision separate production roles and apply all committed migrations and grants.
3. Configure secrets directly in the providers and verify no preview environment can reach production data.
4. Verify TLS redirect, HSTS, CSP violation-free navigation, cookies, Auth0 callbacks, and forwarding-header trust on the real domain.
5. Run CI, public Playwright tests, live two-account identity tests, and moderator/non-moderator workflow tests.
6. Exercise application rollback and isolated database restore before accepting production traffic.

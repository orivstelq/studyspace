# StudySpace

[![CI](https://github.com/orivstelq/studyspace/actions/workflows/ci.yml/badge.svg)](https://github.com/orivstelq/studyspace/actions/workflows/ci.yml)

StudySpace is a full-stack directory for finding study-friendly places. It combines public search and verified listing provenance with private Saved collections, study preferences, recommendations, reviews, reports, and moderator workflows.

[View the staging site](https://studyspace-staging.vercel.app) · [Architecture](docs/ARCHITECTURE.md) · [Security](SECURITY.md) · [Deployment](docs/DEPLOYMENT.md)

## Project status

StudySpace is an independently operated portfolio project preparing for its first public release. Public browsing is suitable for a limited launch after the documented staging migration and smoke checks. Public account enrollment remains gated on owner/legal review of the provisional US age-18 audience, operational retention enforcement, production Auth0 social credentials, and live two-account and moderator testing.

Account-wide deletion is not currently offered and is not advertised as a released feature. The database foundation and remaining approval gates are documented in [Account lifecycle](docs/ACCOUNT_LIFECYCLE.md).

## Features

- Responsive public directory with search, category and amenity filters
- Published listing details with source and verification information
- Auth0 sign-in, sign-out, revocable server-side sessions, and account identity display
- Account-isolated Saved listings and study preferences
- Explainable, deterministic recommendations
- One review per account and listing, with approval required before publication
- Private reports and an allowlisted, database-granted moderator interface
- Shared PostgreSQL rate limits, security headers, origin checks, and production-safe error responses
- Public privacy, terms, and contact information that distinguishes current behavior from unresolved policy

## Stack

- Next.js 16, React 19, and TypeScript
- Prisma 7 with PostgreSQL 18
- Auth0 for authentication
- Vercel and Neon in the reviewed deployment architecture
- Vitest and Playwright

The application uses separate database identities for public reads, private account data, migrations, and bounded maintenance. PostgreSQL row-level security and server-side ownership checks protect Profiles, Favorites, Reviews, Reports, and moderation data. See [Security](docs/SECURITY.md) for the trust boundaries and known limitations.

## Run locally

Use Node.js 24 and PostgreSQL 17 or 18. Pull-request CI runs the committed migration chain on PostgreSQL 18.

```sh
npm ci
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/grant-runtime-roles.sql
npm run dev
```

Create separate `studyspace_dev` and `studyspace_test` databases. `DIRECT_URL` must use the migration owner. `DATABASE_URL` and `FAVORITES_DATABASE_URL` must use separate non-owner runtime logins inheriting only `studyspace_app` and `studyspace_saved`, respectively. Keep all real credentials in the ignored local `.env`; the committed example contains placeholders only.

The directory starts empty. [LISTINGS.md](docs/LISTINGS.md) explains how to load the two reviewed San Marcos listings.

### Authentication

Public browsing works without Auth0. To enable account features, configure an Auth0 Regular Web Application and set the server-only variables described in [.env.example](.env.example). StudySpace requests only `openid profile email`, stores a bounded account label, and does not persist provider access or refresh tokens.

Use exact callback and logout origins. Assign moderators with both an exact subject in `AUTH0_MODERATOR_SUBJECTS` and an owner-provisioned active `ModeratorGrant`; neither browser fields nor display names establish moderator authority.

### Rate limiting

Production requires an independent `RATE_LIMIT_SECRET` of at least 32 bytes and an explicitly reviewed `TRUSTED_CLIENT_IP_SOURCE`. The selected direct-Vercel architecture uses `vercel`; local development uses `shared`. The bounded maintenance cleanup procedure is documented in [Deployment](docs/DEPLOYMENT.md).

## Verify

Apply migrations and runtime grants to a clean local test database first, then run:

```sh
DIRECT_URL="$TEST_OWNER_URL" npx prisma migrate deploy
psql "$TEST_OWNER_URL" -v ON_ERROR_STOP=1 -f scripts/grant-runtime-roles.sql
npm test
npm run test:integration
npm run lint
npx next typegen
npx tsc --noEmit
npx prisma validate
npm run build
npm run test:e2e
npm audit
```

Integration tests refuse remote hosts and databases outside the local allowlist. Public Playwright tests need no account. Authenticated tests accept ignored, environment-local storage-state files created from dedicated Auth0 test accounts; never commit, print, or upload those files.

## Public API

`GET /api/spaces` accepts `q`, `category`, `amenity`, and `page`, returning at most 20 published listings per page. `GET /api/spaces/[slug]` returns one published listing or a generic 404. Both endpoints expose only public listing fields.

## Deployment

Deployments are migration-first: verify the exact database and recovery point, apply only the reviewed pending migrations, reapply runtime grants, verify database security, then promote the compatible application build. Application rollback promotes the previous immutable deployment without reversing forward-only migrations.

The guarded Phase 17 staging procedure and moderator-grant checks are in [STAGING.md](docs/STAGING.md). The final operator sequence is in [RELEASE_RUNBOOK.md](docs/RELEASE_RUNBOOK.md), with architecture detail in [DEPLOYMENT.md](docs/DEPLOYMENT.md). Auth0/Google dashboard preparation is in [AUTHENTICATION_RELEASE.md](docs/AUTHENTICATION_RELEASE.md), and the manual account-data request procedure is in [DATA_REQUESTS.md](docs/DATA_REQUESTS.md).

## Privacy and support

The public privacy and terms routes describe implemented behavior and clearly label unresolved decisions. For support, moderation, privacy, or account-data questions, contact [sidstelq11@gmail.com](mailto:sidstelq11@gmail.com).

Please report security issues privately using [SECURITY.md](SECURITY.md), not in a public issue.

## Documentation

[Product requirements](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Data model](docs/DATA_MODEL.md) · [Security specification](docs/SECURITY.md) · [Authentication release](docs/AUTHENTICATION_RELEASE.md) · [Data requests](docs/DATA_REQUESTS.md) · [Release runbook](docs/RELEASE_RUNBOOK.md) · [Deployment](docs/DEPLOYMENT.md) · [Staging](docs/STAGING.md) · [Verification record](docs/VERIFICATION.md)

## License

StudySpace is available under the [MIT License](LICENSE).

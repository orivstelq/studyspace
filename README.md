# StudySpace

StudySpace helps students find places for individual or group study. The directory searches PostgreSQL, shows where listing information came from, and keeps Saved collections and study preferences private to each signed-in account.

## Run locally

Use Node.js 24 and PostgreSQL 17 or 18. Pull-request CI validates the committed migrations and integration suite on PostgreSQL 18. From the project root:

```sh
npm ci
cp .env.example .env
```

Create separate development and test databases named `studyspace_dev` and `studyspace_test`. Use a migration owner with permission to create the schema, two non-owner login roles named `studyspace_app` and `studyspace_saved`, and a no-login `studyspace_maintenance` role. Give runtime logins separate passwords. Keep them out of Git and put the development connection URLs in `.env`. Runtime and maintenance roles must be non-superusers without `BYPASSRLS` or membership in the migration owner role.

Generate the client, migrate the development database, and apply the runtime grants. Replace the shell variables below with URLs supplied securely to your shell. Prisma reads `DIRECT_URL` from `.env` if it is unset in the shell.

```sh
npx prisma generate
npx prisma migrate deploy
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/grant-runtime-roles.sql
npm run dev
```

Set `RATE_LIMIT_SECRET` to an independent random secret in production. Local development can fall back to `AUTH0_SECRET`, or to a development-only constant when authentication is not configured. Production intentionally fails closed without the dedicated value. Set `TRUSTED_CLIENT_IP_SOURCE=shared` locally; the reviewed direct-Vercel deployment uses `vercel` and requires a live header check before launch.

Run the grant script as the same migration owner that creates application tables. It removes default runtime access to future tables; grant public or private access explicitly after reviewing each new table.

Open [StudySpace locally](http://localhost:3000). The directory starts empty. The [listing review guide](docs/LISTINGS.md) explains how to import the two reviewed San Marcos listings.

## Enable sign-in and private features

1. Create an Auth0 Regular Web Application and enable a login connection. Keep one issuer per StudySpace environment. StudySpace requests `openid profile email` and stores only the resolved display name—or email fallback—needed by the account UI.
2. Set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `APP_BASE_URL`, and `FAVORITES_DATABASE_URL` in the server environment. Use a single fixed base URL. Generate `AUTH0_SECRET` with `openssl rand -hex 32` and store it securely.
3. Assign moderators through the server-only `AUTH0_MODERATOR_SUBJECTS` variable as a comma-separated list of exact Auth0 subject IDs. Never accept roles from forms, query parameters, or unverified claims.
4. Register `http://localhost:3000/auth/callback` as the local callback and `http://localhost:3000` as the local logout URL. In production, use the exact HTTPS equivalents. If supported by the tenant, register `/auth/backchannel-logout` at the deployed origin for provider-initiated revocation.
5. Sign in from Saved, save a listing from its detail page, and verify the listing appears in Saved. Remove it from either page. Visit Profile, save preferences, and review the explained recommendation scores. Listing pages also allow review submission and private reports; configured moderators use `/admin`.

Browse and search work without Auth0 configuration. Authentication sessions are revocable server-side and expire after at most eight hours. The application stores the identity and session identifiers it needs, plus one optional account display label; it does not persist provider tokens or separate profile fields. Schedule deletion of expired `AuthSession` rows through a maintenance account. Changing the issuer requires an explicit account migration to preserve saved items.

Sessions created before account labels were introduced remain valid and display a neutral Account label. Sign out and back in once to populate the label from the newly requested claims.

## Verify

Apply migrations and runtime grants to a clean local `studyspace_test` database using its migration-owner URL:

```sh
DIRECT_URL="$TEST_OWNER_URL" npx prisma migrate deploy
psql "$TEST_OWNER_URL" -v ON_ERROR_STOP=1 -f scripts/grant-runtime-roles.sql
npm test
npm run test:integration
npm run lint
npm run build
npm run test:e2e
npm audit
```

Integration tests read development URLs from `.env` and switch to `studyspace_test`. They refuse non-loopback hosts and other database names. The test database should contain no starter listings.

Playwright runs against a production build and expects the reviewed San Marcos fixture in the development database. Public browser tests need no account. Optional account-menu coverage reads `PLAYWRIGHT_USER_A_STATE` (or the legacy `PLAYWRIGHT_AUTH_STATE`) from an ignored environment-local file. The live community suite additionally uses `PLAYWRIGHT_USER_B_STATE` and `PLAYWRIGHT_MODERATOR_STATE`; these must be real Auth0 sessions for dedicated test accounts. Never commit or upload a storage-state file or real credential. See the [staging guide](docs/STAGING.md) for prerequisites and the [deployment guide](docs/DEPLOYMENT.md) for production checks.

`GET /api/spaces` accepts `q`, `category`, `amenity`, and `page`. It returns up to 20 published listings per page, the number of listings on the current page, and a `hasNext` flag. Search matches a literal, case-insensitive substring of the name, description, city, or region. Page order uses name and a stable tie-breaker. If listings change between requests, offset pagination can shift the results. `GET /api/spaces/[slug]` returns a single published listing or a generic 404.

Each signed-in account may keep one review per published listing. New reviews and edits are pending until approved; editing an approved review temporarily removes it from public view rather than preserving the previous version. Withdrawal also removes a review from public view. Reports are readable only by configured moderators. Moderation transitions are enforced server-side and recorded in an append-only audit table.

[Product requirements](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Deployment](docs/DEPLOYMENT.md) · [Staging](docs/STAGING.md) · [Staging checklist](docs/STAGING_CHECKLIST.md) · [Data model](docs/DATA_MODEL.md) · [Security](docs/SECURITY.md) · [Verification record](docs/VERIFICATION.md)

# StudySpace

StudySpace helps students find places for individual or group study. The directory searches PostgreSQL, shows where listing information came from, and keeps Saved collections private to each signed-in account.

## Run locally

Use Node.js 24 and PostgreSQL 17. From the project root:

```sh
npm ci
cp .env.example .env
```

Create separate development and test databases named `studyspace_dev` and `studyspace_test`. Use a migration owner with permission to create the schema and two non-owner login roles named `studyspace_app` and `studyspace_saved`. Give the roles separate passwords. Keep them out of Git and put the development connection URLs in `.env`. Both runtime roles must be non-superusers without `BYPASSRLS` or membership in the migration owner role.

Generate the client, migrate the development database, and apply the runtime grants. Replace the shell variables below with URLs supplied securely to your shell. Prisma reads `DIRECT_URL` from `.env` if it is unset in the shell.

```sh
npx prisma generate
npx prisma migrate deploy
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/grant-runtime-roles.sql
npm run dev
```

Open [StudySpace locally](http://localhost:3000). The directory starts empty. The [listing review guide](docs/LISTINGS.md) explains how to import the two reviewed San Marcos listings.

## Enable sign-in and Saved

1. Create an Auth0 Regular Web Application and enable a login connection. Keep one issuer per StudySpace environment.
2. Set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `APP_BASE_URL`, and `FAVORITES_DATABASE_URL` in the server environment. Use a single fixed base URL. Generate `AUTH0_SECRET` with `openssl rand -hex 32` and store it securely.
3. Register `http://localhost:3000/auth/callback` as the local callback and `http://localhost:3000` as the local logout URL. In production, use the exact HTTPS equivalents. If supported by the tenant, register `/auth/backchannel-logout` at the deployed origin for provider-initiated revocation.
4. Sign in from Saved, save a listing from its detail page, and verify the listing appears in Saved. Remove it from either page.

Browse and search work without Auth0 configuration. Authentication sessions are revocable server-side and expire after at most eight hours. The application stores the identity and session identifiers it needs, without provider tokens or email. Schedule deletion of expired `AuthSession` rows through a maintenance account. Changing the issuer requires an explicit account migration to preserve saved items.

## Verify

Apply migrations and runtime grants to a clean local `studyspace_test` database using its migration-owner URL:

```sh
DIRECT_URL="$TEST_OWNER_URL" npx prisma migrate deploy
psql "$TEST_OWNER_URL" -v ON_ERROR_STOP=1 -f scripts/grant-runtime-roles.sql
npm test
npm run test:integration
npm run lint
npm run build
npm audit
```

Integration tests read development URLs from `.env` and switch to `studyspace_test`. They refuse non-loopback hosts and other database names. The test database should contain no starter listings.

`GET /api/spaces` accepts `q`, `category`, `amenity`, and `page`. It returns up to 20 published listings per page, the number of listings on the current page, and a `hasNext` flag. Search matches a literal, case-insensitive substring of the name, description, city, or region. Page order uses name and a stable tie-breaker. If listings change between requests, offset pagination can shift the results. `GET /api/spaces/[slug]` returns a single published listing or a generic 404.

[Product requirements](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Data model](docs/DATA_MODEL.md) · [Security](docs/SECURITY.md)

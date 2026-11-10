
# StudySpace — Technical Architecture

Status: Draft v0.1

## 1. Architectural Style

StudySpace uses a modular monolith built with
Next.js, React, TypeScript, and PostgreSQL.

The application starts as one deployable service.
Modules are separated by responsibility.

Do not introduce microservices without a demonstrated
scaling or operational requirement.

## 2. Technology Decisions

Frontend:
- Next.js App Router
- React
- TypeScript
- Tailwind CSS

Backend:
- Next.js server-side functionality
- Route Handlers for HTTP APIs
- Application services for business rules
- Dedicated Data Access Layer

Persistence:
- PostgreSQL
- Prisma ORM
- Version-controlled database migrations

Validation:
- Explicit allowlists and bounds at server entry points
- PostgreSQL constraints for stored invariants

Authentication:
- Auth0 OpenID Connect
- Server-verified sessions
- No custom password cryptography

Testing:
- Vitest for unit tests
- Integration tests for database/API behavior
- Playwright for production-build end-to-end testing

## 3. Responsibilities

### Presentation

Responsible for rendering interfaces,
navigation, forms, and user feedback.

Never directly accesses database credentials.

### Server Entry Points

Route Handlers and Server Actions receive requests.

They validate inputs, invoke application services,
and return appropriately shaped responses.

Server Actions are not assumed to be secure merely
because they are invoked from the UI.

### Application Services

Responsible for use-case logic such as:

- Searching study spaces
- Filtering available records
- Managing saved locations
- Processing user-submitted reports
- Calculating recommendation scores

Services should be independently testable.

### Data Access Layer

Responsible for:

- Database reads and writes
- Record-level authorization
- Limiting returned fields
- Safe query construction
- Transaction boundaries

Authorization must not depend solely on
client-side navigation or hidden buttons.

## 4. Proposed Repository Structure

src/
  app/
    page.tsx
    explore/
    spaces/
      [slug]/
    saved/
    sign-in/
    profile/
    admin/
    api/
  components/
    layout/
    ui/
    spaces/
  features/
    discovery/
    favorites/
    reviews/
    recommendations/
  lib/
    auth/
    db/
    security/
    validation/
  styles/

docs/
  PRD.md
  ARCHITECTURE.md
  SECURITY.md

prisma/
  schema.prisma

tests/
  integration/
  e2e/

Note: This is the target structure. Do not create
unused files and folders prematurely.

## 5. Initial Domain Model

StudySpace:
- id
- slug
- name
- description
- category
- address
- latitude
- longitude
- published
- verifiedAt
- createdAt
- updatedAt

Amenity:
- id
- name

StudySpaceAmenity:
- studySpaceId
- amenityId

Future entities:
- User
- Review
- UserReport
- ModerationAction

The database schema will be designed and reviewed
before persistence is implemented.

## 6. Public Read Operations

Initial public operations:

GET /api/spaces
GET /api/spaces/[slug]

Requirements:
- Return published records only
- Validate query parameters
- Limit page sizes
- Return consistent error responses
- Avoid exposing internal database fields

## 7. Private Operations

Favorites, profiles, reports, and moderation
require authentication and authorization.

Every protected operation verifies user identity
and resource ownership on the server.

Administrative access requires explicit role checks.

## 8. Data Integrity

- Enforce uniqueness for space slugs
- Use foreign keys for relationships
- Use database constraints where practical
- Treat client input as untrusted
- Do not manufacture missing information
- Track provenance and verification timestamps

## 9. Recommendation Engine

Start with deterministic scoring.

Example factors:
- Noise suitability
- Amenity match
- Study preference match
- Distance, if location permission is granted
- Data reliability and freshness

Unknown information must not be treated as
a confirmed positive attribute.

Scores must be explainable and testable.

## 10. Observability

Log application failures and relevant operational
events without exposing credentials or sensitive data.

Avoid storing unnecessary personal information.

## 11. Development Quality Gates

Before merging changes:

- ESLint passes
- TypeScript passes
- Production build succeeds
- Relevant tests pass
- Dependency audit reviewed
- Security implications reviewed
- Git working tree understood

## 12. Deployment

The proposed production platform is Vercel for the Next.js runtime and Neon for managed PostgreSQL. See `docs/DEPLOYMENT.md` for alternatives, cost constraints, pooling, migration, backup, and rollback decisions. Phase 3 established the isolated staging architecture in `docs/STAGING.md`; current staging evidence and remaining production gates are recorded in `docs/VERIFICATION.md` and `docs/STAGING_CHECKLIST.md`.

Require:
- HTTPS
- Environment separation
- Secure secret management
- Database backups
- Migration process
- Monitoring and error reporting

## Implemented directory, private, and community flows

Explore and the public list API share validation and a bounded, parameterized Prisma query. Detail reads share the published-only predicate and an explicit public field selection. Source URLs must be HTTPS and a listing needs a review timestamp before displaying a source-check badge.

Saved uses Auth0 OpenID Connect and a PostgreSQL session store. Server actions validate the request origin and resolve the owner from the verified session. Favorites and sessions use a dedicated runtime connection. Public reads retain their separate read-only role. See the README for setup and the listing review guide for the starter dataset.

The header account menu is a streamed server component inside `Suspense`, so session access does not block the shared shell or enter a shared cache. Auth0 supplies `name` and `email` through the `profile` and `email` scopes; the session store keeps only one resolved display label, preferring name. Account identity is never added to public review DTOs.

Profile stores an optional preferred category and a bounded set of known amenity codes. The same private runtime role and transaction-local owner context protect profile reads and writes with PostgreSQL row-level security. A bounded recommendation query scores published spaces deterministically: category matches receive two points, confirmed amenity matches receive one each, and a checked source receives one. The profile UI shows every reason; unknown facts receive no credit. Public directory order remains unchanged.

Reviews use a one-row-per-owner-and-listing lifecycle, with a database trigger preventing owner or listing reassignment. Owner edits return the same row to `PENDING`, temporarily removing an approved review from public view; the MVP does not retain a separate published version. Public reads select only `APPROVED` reviews and explicit public fields. Reports target either a published listing or an approved review and are invisible to their submitter after insertion. `/admin` reads bounded pending, published, and report queues only after the verified Auth0 subject matches the server-only moderator allowlist. Every moderator transition is checked in the DAL, constrained by the current status, protected by PostgreSQL policies, and written to `ModerationAction` in the same transaction.

Rate limits use an atomic PostgreSQL fixed-window table through the private runtime role. This provides cross-instance enforcement without a separate cache service and stores only HMAC-pseudonymized subjects. Public API exhaustion returns HTTP 429; all protected mutations fail closed when shared enforcement is unavailable. Playwright exercises public navigation, search, detail, responsive, and recoverable error flows against the production server. Authenticated Playwright coverage accepts only an ignored environment-local storage state.

`/privacy` and `/terms` are static Server Component pages linked from the shared footer. They describe verified behavior and visibly remain owner-review drafts while retention, deletion, and legal decisions are unresolved. The approved public support and privacy address is defined once in `src/lib/public-contact.ts`; the pages and footer render it directly without reading session, database, or environment data. Account-wide deletion is not implemented; `docs/ACCOUNT_LIFECYCLE.md` defines the trust boundaries, open disposition decisions, transaction requirements, provider coordination, and tests required before destructive work begins.

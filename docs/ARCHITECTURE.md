
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
- Prisma ORM (planned)
- Version-controlled database migrations

Validation:
- Zod for request and domain schemas (planned)

Authentication:
- Established authentication provider (TBD)
- Server-verified sessions
- No custom password cryptography

Testing:
- Vitest for unit tests (planned)
- Integration tests for database/API behavior
- Playwright for end-to-end testing (planned)

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
- Favorite
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

Deployment platform: TBD.

Require:
- HTTPS
- Environment separation
- Secure secret management
- Database backups
- Migration process
- Monitoring and error reporting

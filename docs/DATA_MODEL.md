
# StudySpace — Database Design

Status: Draft v0.1
Database: PostgreSQL
ORM: Prisma

## 1. Purpose

Store reliable study-space information independently
of the frontend.

The database will support published listings,
amenities, provenance, and future community features.

## 2. StudySpace

Fields:

- id: UUID, primary key
- slug: string, unique, required
- name: string, required
- description: text, required
- category: enum, required
- address: string, optional
- city: string, required
- region: string, required
- latitude: decimal, optional
- longitude: decimal, optional
- status: enum, required
- sourceType: enum, required
- sourceUrl: string, optional
- verifiedAt: timestamp, optional
- createdAt: timestamp
- updatedAt: timestamp

Categories:
- LIBRARY
- CAFE
- CAMPUS
- COWORKING

Publication statuses:
- DRAFT
- PUBLISHED
- ARCHIVED

Source types:
- OFFICIAL
- FIRST_PARTY
- COMMUNITY
- DEVELOPMENT_FIXTURE

## 3. Amenity

Fields:

- id: UUID, primary key
- code: string, unique, required
- name: string, required

Initial amenity codes:

- wifi
- outlets
- quiet
- group-friendly
- accessible

## 4. StudySpaceAmenity

Fields:

- studySpaceId: foreign key
- amenityId: foreign key

Use a composite primary key to prevent
duplicate relationships.

Deleting a study space should remove its
amenity associations.

## 5. Integrity Rules

- Slugs must be unique.
- Foreign keys must be enforced.
- Latitude must be between -90 and 90.
- Longitude must be between -180 and 180.
- Coordinates must either both exist or both be null.
- Published listings require a defined provenance.
- Unverified facts must not be presented as verified.
- Development fixtures must never be published
  as real locations.
- Unknown amenities must not imply confirmed absence.

Some invariants require explicit PostgreSQL CHECK
constraints or transactional application rules,
not just ORM field types.

## 6. Public Read Rules

Public queries may return only PUBLISHED records.

Return explicitly selected public fields.

Never expose internal moderation metadata,
database credentials, or private user information.

All listing queries must use bounded pagination.

## 7. Source Provenance

Store source type, optional source URL,
and verification timestamp.

A source URL alone does not mean the
information has been independently verified.

Before publishing real listings, define
a review workflow and evidence requirements.

## 8. Initial Database Operations

- List published study spaces
- Filter by category and amenities
- Search by name
- Retrieve a published space by slug

No public write endpoints in the first release.

## 9. Community Entities

`Review` is unique by non-null account generation and listing. Ratings are 1–5 and review text is 20–2,000 characters. Status transitions control public visibility; only approved rows have a publication timestamp. During the Phase 17 expand window, compatibility triggers keep legacy actor keys and account IDs synchronized; a later separately reviewed contract migration will remove the legacy columns.

`UserReport` targets exactly one published listing or visible review. Open-report partial unique indexes limit an account to one active report per target. Reports and resolution data are moderator-private. Account closure clears free-form report details before unlinking a retained reporter association.

`ModerationAction` records the optional random moderator account, immutable target reference, action, and timestamp. Application roles may insert moderator-authorized audit rows but cannot update or delete them.

## 10. Migration Strategy

Use version-controlled Prisma migrations.

Never change production database schemas
through ad hoc manual edits.

Review generated SQL before applying migrations
to production.

Use separate development and production databases.

## 11. Acceptance Criteria

- Database schema validates
- Initial migration applies successfully
- Unique constraints are enforced
- Foreign keys are enforced
- Unpublished records are excluded from public reads
- Invalid records are rejected
- Integration tests exercise real PostgreSQL behavior
- Application builds without client-side database secrets

## Implemented private tables

`Account` is a random UUID generation with `ACTIVE`, `CLOSING`, or `CLOSED` state. `AccountIdentity` maps a deterministic issuer/subject digest to a numbered generation and enforces one active mapping. `AccountClosure` enforces one idempotent closure record per generation. These tables use RLS with no direct runtime table grants.

`Favorite` is keyed by random account UUID and study space UUID. The composite key makes repeated saves idempotent. Deleting a study space cascades to favorites. Archived spaces are hidden from Saved while their bookmarks remain stored. PostgreSQL row-level security matches the account against a transaction-local UUID after locking an `ACTIVE` account row.

`AuthSession` stores the SDK session identifier, provider subject, provider session identifier, creation time, expiry, optional account UUID, and one optional display label. The label is the provider display name or email fallback used by the private account UI. Pre-Phase-17 rows may keep the account UUID null until their next verified read. The data supports expiry enforcement, sign-out, account-state invalidation, and provider-initiated revocation without persisting provider tokens or a broader profile.

`UserProfile` is keyed by random account UUID. It stores an optional preferred category and up to five known amenity codes. A database check rejects unsupported or oversized preference sets, and row-level security prevents cross-account reads and writes.

`Review`, `UserReport`, and `ModerationAction` use role-specific PostgreSQL policies. The public role can read only approved reviews for published non-fixture listings and only six public columns. Review account and listing keys are immutable after insertion except for migration-owner closure unlinking from a non-null account to `NULL`; relinking is prohibited. Reporters and moderation actors can likewise be unlinked while independent target UUIDs preserve the minimum target reference. `RetentionHold` stores a finite case reference, reason, approver, review time, and expiry for a review or audit action; it has no runtime table grant. `ModeratorGrant` is a private, owner-provisioned allowlist keyed to one account generation; runtime roles can neither read nor change it.

Verified transactions bind the random account UUID to its matching active identity digest. Moderator context additionally requires both the server-side Auth0 subject allowlist and an unrevoked `ModeratorGrant`; the old UUID/boolean function is denied to runtime roles. Transaction settings still transport the result and are not independently authenticated database identities. The private runtime credential and server process remain part of the trust boundary, and the expand-release legacy policy branches remain until a later contract migration removes rollback compatibility.

`RateLimitBucket` stores one atomic fixed-window counter per scoped HMAC key. It contains no raw account subject or client address. Only the private runtime role can read or mutate counters; the public directory role has no table privilege. A security-definer cleanup function deletes bounded, ordered batches more than one day after reset. Its maintenance role can execute the function but has no table access.

## Staging ownership invariants

On Neon staging, `neondb_owner` applies every committed migration and owns all application relations and functions. Runtime access is granted to three NOLOGIN permission roles. Separate environment-specific LOGIN identities inherit exactly one permission role and cannot use `SET ROLE`, delegate membership, bypass RLS, create databases/roles, or own application objects. The public database connection cannot read account, session, report, moderation, or rate-limit storage. See `docs/STAGING.md` for the catalog assertions and provisioning order.

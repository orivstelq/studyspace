
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

`Review` is unique by owner and listing. Ratings are 1–5 and review text is 20–2,000 characters. Status transitions control public visibility; only approved rows have a publication timestamp.

`UserReport` targets exactly one published listing or visible review. Open-report partial unique indexes limit an account to one active report per target. Reports and resolution data are moderator-private.

`ModerationAction` records the hashed moderator identity, action, target, and timestamp. Application roles may insert moderator-authorized audit rows but cannot update or delete them.

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

`Favorite` is keyed by a hash of the configured issuer domain and authenticated subject, together with the study space UUID. The composite key makes repeated saves idempotent. Deleting a study space cascades to favorites. Archived spaces are hidden from Saved while their bookmarks remain stored. PostgreSQL row-level security matches the owner against a transaction-local setting.

`AuthSession` stores the SDK session identifier, provider subject, provider session identifier, creation time, expiry, and one optional display label. The label is the provider display name or email fallback used by the private account UI. Existing rows may keep it null. The data supports expiry enforcement, sign-out, and provider-initiated revocation without persisting provider tokens or a broader profile. Runtime grants are applied separately from Prisma migrations.

`UserProfile` is keyed by the same issuer-scoped owner hash as favorites. It stores an optional preferred category and up to five known amenity codes. A database check rejects unsupported or oversized preference sets, and row-level security prevents cross-owner reads and writes.

`Review`, `UserReport`, and `ModerationAction` use role-specific PostgreSQL policies. The public role can read only approved reviews for published non-fixture listings. Review owner and listing keys are immutable after insertion. Owners can read and edit only their own review, can insert reports without reading them back, and cannot use moderator policies through browser input. Editing an approved review returns the single stored row to pending and removes it from public reads until reapproved.

The transaction-local moderator flag is set only after trusted server-side role assignment, but it remains an application-controlled database setting rather than an independently authenticated database role. The private runtime credential and server process are therefore part of the moderator trust boundary.

`RateLimitBucket` stores one atomic fixed-window counter per scoped HMAC key. It contains no raw account subject or client address. Only the private runtime role can read or mutate counters; the public directory role has no table privilege. Expired buckets may be deleted by scheduled maintenance after their reset time.

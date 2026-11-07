
# StudySpace — Database Design

Status: Draft v0.1
Database: PostgreSQL
ORM: Prisma (planned)

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

## 9. Future Entities

Not implemented in the initial migration:

- User
- Favorite
- Review
- UserReport
- ModerationAction

These require separate authentication,
authorization, privacy, and abuse-prevention design.

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

`AuthSession` stores the SDK session identifier, provider subject, provider session identifier, creation time, and expiry. The data supports expiry enforcement, sign-out, and provider-initiated revocation without persisting provider tokens. Runtime grants are applied separately from Prisma migrations.


-- StudySpace Initial Database Migration
-- PostgreSQL 17
-- Includes database-level integrity constraints.

-- Create enums
CREATE TYPE "SpaceCategory" AS ENUM (
    'LIBRARY',
    'CAFE',
    'CAMPUS',
    'COWORKING'
);

CREATE TYPE "PublicationStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED'
);

CREATE TYPE "SourceType" AS ENUM (
    'OFFICIAL',
    'FIRST_PARTY',
    'COMMUNITY',
    'DEVELOPMENT_FIXTURE'
);

-- Create study spaces
CREATE TABLE "StudySpace" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "category" "SpaceCategory" NOT NULL,

    "address" VARCHAR(300),
    "city" VARCHAR(120) NOT NULL,
    "region" VARCHAR(120) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),

    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceType" "SourceType" NOT NULL,
    "sourceUrl" TEXT,
    "verifiedAt" TIMESTAMP(3),

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudySpace_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "StudySpace_latitude_range_check"
        CHECK (
            "latitude" IS NULL
            OR "latitude" BETWEEN -90 AND 90
        ),

    CONSTRAINT "StudySpace_longitude_range_check"
        CHECK (
            "longitude" IS NULL
            OR "longitude" BETWEEN -180 AND 180
        ),

    CONSTRAINT "StudySpace_coordinates_pair_check"
        CHECK (
            ("latitude" IS NULL AND "longitude" IS NULL)
            OR
            ("latitude" IS NOT NULL AND "longitude" IS NOT NULL)
        ),

    CONSTRAINT "StudySpace_no_published_fixtures_check"
        CHECK (
            "sourceType" <> 'DEVELOPMENT_FIXTURE'
            OR "status" <> 'PUBLISHED'
        )
);

-- Create amenities
CREATE TABLE "Amenity" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,

    CONSTRAINT "Amenity_pkey"
        PRIMARY KEY ("id")
);

-- Create study-space / amenity relationship
CREATE TABLE "StudySpaceAmenity" (
    "studySpaceId" UUID NOT NULL,
    "amenityId" UUID NOT NULL,

    CONSTRAINT "StudySpaceAmenity_pkey"
        PRIMARY KEY ("studySpaceId", "amenityId")
);

-- Create indexes
CREATE UNIQUE INDEX "StudySpace_slug_key"
    ON "StudySpace"("slug");

CREATE INDEX "StudySpace_status_category_idx"
    ON "StudySpace"("status", "category");

CREATE INDEX "StudySpace_city_idx"
    ON "StudySpace"("city");

CREATE UNIQUE INDEX "Amenity_code_key"
    ON "Amenity"("code");

-- Add foreign keys
ALTER TABLE "StudySpaceAmenity"
    ADD CONSTRAINT "StudySpaceAmenity_studySpaceId_fkey"
    FOREIGN KEY ("studySpaceId")
    REFERENCES "StudySpace"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "StudySpaceAmenity"
    ADD CONSTRAINT "StudySpaceAmenity_amenityId_fkey"
    FOREIGN KEY ("amenityId")
    REFERENCES "Amenity"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

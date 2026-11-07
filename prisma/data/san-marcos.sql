-- Import intentionally. Review docs/LISTINGS.md first.
-- Only assign amenities to rows inserted by this run, preserving existing records.
BEGIN;

INSERT INTO "Amenity" ("id", "code", "name")
VALUES
    (gen_random_uuid(), 'quiet', 'Quiet study area'),
    (gen_random_uuid(), 'group-friendly', 'Group study')
ON CONFLICT ("code") DO NOTHING;

WITH added AS (
    INSERT INTO "StudySpace" (
        "id", "slug", "name", "description", "category", "address", "city", "region",
        "status", "sourceType", "sourceUrl", "verifiedAt", "updatedAt"
    )
    VALUES
        (gen_random_uuid(), 'alkek-library', 'Albert B. Alkek Library',
         'Texas State University designates the fifth floor for quiet study. The library also offers reservable group study rooms.',
         'LIBRARY', '701 N Guadalupe St', 'San Marcos', 'TX', 'PUBLISHED', 'OFFICIAL',
         'https://www.library.txst.edu/spaces-and-technology/reserve-a-space/alkek-library-spaces/quietstudy-floors.html',
         '2026-11-06', CURRENT_TIMESTAMP),
        (gen_random_uuid(), 'san-marcos-public-library', 'San Marcos Public Library',
         'The city library offers study rooms for individual and small-group work. Check the library policy for reservation requirements.',
         'LIBRARY', '625 E Hopkins St', 'San Marcos', 'TX', 'PUBLISHED', 'OFFICIAL',
         'https://www.sanmarcostx.gov/598/Library-Policies',
         '2026-11-06', CURRENT_TIMESTAMP)
    ON CONFLICT ("slug") DO NOTHING
    RETURNING "id", "slug"
)
INSERT INTO "StudySpaceAmenity" ("studySpaceId", "amenityId")
SELECT added."id", amenity."id"
FROM added
JOIN "Amenity" AS amenity ON amenity."code" = 'group-friendly'
    OR (added."slug" = 'alkek-library' AND amenity."code" = 'quiet');

COMMIT;

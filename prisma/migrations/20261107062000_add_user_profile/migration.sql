CREATE TABLE "UserProfile" (
    "ownerKey" VARCHAR(64) NOT NULL,
    "preferredCategory" "SpaceCategory",
    "preferredAmenities" VARCHAR(60)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(60)[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("ownerKey"),
    CONSTRAINT "UserProfile_amenities_check" CHECK (
        cardinality("preferredAmenities") <= 5
        AND "preferredAmenities" <@ ARRAY[
            'wifi', 'outlets', 'quiet', 'group-friendly', 'accessible'
        ]::VARCHAR(60)[]
    )
);

ALTER TABLE "UserProfile" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "UserProfile_owner_access" ON "UserProfile"
    USING ("ownerKey" = current_setting('studyspace.favorite_owner', true))
    WITH CHECK ("ownerKey" = current_setting('studyspace.favorite_owner', true));

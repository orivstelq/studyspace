DROP POLICY "Review_owner_update" ON "Review";

CREATE POLICY "Review_owner_update" ON "Review" FOR UPDATE TO studyspace_saved
    USING ("ownerKey" = current_setting('studyspace.favorite_owner', true))
    WITH CHECK (
        "ownerKey" = current_setting('studyspace.favorite_owner', true)
        AND "status" IN ('PENDING', 'WITHDRAWN') AND "publishedAt" IS NULL
        AND EXISTS (
            SELECT 1 FROM "StudySpace" AS space
            WHERE space."id" = "Review"."studySpaceId"
                AND space."status" = 'PUBLISHED'
                AND space."sourceType" <> 'DEVELOPMENT_FIXTURE'
        )
    );

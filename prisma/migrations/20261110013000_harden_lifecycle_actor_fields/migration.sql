BEGIN;

-- Safe while the legacy application is live; compatibility columns and policies remain.

DROP TRIGGER "Review_identity_immutable" ON "Review";
CREATE OR REPLACE FUNCTION "prevent_review_reassignment"() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog
AS $$
DECLARE
    table_owner name;
    lifecycle_operation boolean;
BEGIN
    SELECT pg_get_userbyid(relowner) INTO table_owner
    FROM pg_class WHERE oid = TG_RELID;
    lifecycle_operation := session_user = table_owner
        AND current_setting('studyspace.lifecycle_operation', true) = 'true';

    IF NEW."studySpaceId" IS DISTINCT FROM OLD."studySpaceId" THEN
        RAISE EXCEPTION 'Review study space is immutable' USING ERRCODE = '23514';
    END IF;

    IF (NEW."ownerKey", NEW."ownerAccountId") IS DISTINCT FROM (OLD."ownerKey", OLD."ownerAccountId")
       AND NOT (
           lifecycle_operation
           AND OLD."ownerKey" IS NOT NULL
           AND NEW."ownerKey" IS NULL
           AND OLD."ownerAccountId" IS NOT NULL
           AND NEW."ownerAccountId" IS NULL
       ) THEN
        RAISE EXCEPTION 'Review owner is immutable except for account closure unlinking'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."status" = 'APPROVED' AND OLD."status" IS DISTINCT FROM 'APPROVED'
       AND (NEW."ownerAccountId" IS NULL OR NOT EXISTS (
           SELECT 1 FROM public."Account" account
           WHERE account."id" = NEW."ownerAccountId" AND account."state" = 'ACTIVE'
       )) THEN
        RAISE EXCEPTION 'An unlinked or inactive account review cannot be approved'
            USING ERRCODE = '23514';
    END IF;

    IF (NEW."retentionDecision", NEW."retentionReviewedAt", NEW."retentionReviewerAccountId", NEW."retentionReviewerUnlinkedAt")
       IS DISTINCT FROM
       (OLD."retentionDecision", OLD."retentionReviewedAt", OLD."retentionReviewerAccountId", OLD."retentionReviewerUnlinkedAt")
       AND NOT lifecycle_operation THEN
        RAISE EXCEPTION 'Review retention assessment requires lifecycle authority'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "prevent_review_reassignment"() FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;

CREATE TRIGGER "Review_identity_immutable"
    BEFORE UPDATE OF "ownerKey", "ownerAccountId", "studySpaceId", "status", "retentionDecision", "retentionReviewedAt", "retentionReviewerAccountId", "retentionReviewerUnlinkedAt" ON "Review"
    FOR EACH ROW EXECUTE FUNCTION "prevent_review_reassignment"();

CREATE FUNCTION "prevent_report_reassignment"() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog
AS $$
DECLARE
    table_owner name;
    lifecycle_operation boolean;
BEGIN
    SELECT pg_get_userbyid(relowner) INTO table_owner
    FROM pg_class WHERE oid = TG_RELID;
    lifecycle_operation := current_user = table_owner
        AND current_setting('studyspace.lifecycle_operation', true) = 'true';

    IF NEW."targetType" IS DISTINCT FROM OLD."targetType"
       OR NEW."listingId" IS DISTINCT FROM OLD."listingId"
       OR NEW."targetReferenceId" IS DISTINCT FROM OLD."targetReferenceId" THEN
        RAISE EXCEPTION 'Report target is immutable' USING ERRCODE = '23514';
    END IF;

    IF NEW."reviewId" IS DISTINCT FROM OLD."reviewId"
       AND NOT (lifecycle_operation AND OLD."reviewId" IS NOT NULL AND NEW."reviewId" IS NULL) THEN
        RAISE EXCEPTION 'Report review target is immutable except for lifecycle unlinking'
            USING ERRCODE = '23514';
    END IF;

    IF (NEW."reporterKey", NEW."reporterAccountId") IS DISTINCT FROM (OLD."reporterKey", OLD."reporterAccountId")
       AND NOT (
           lifecycle_operation
           AND OLD."reporterKey" IS NOT NULL
           AND NEW."reporterKey" IS NULL
           AND OLD."reporterAccountId" IS NOT NULL
           AND NEW."reporterAccountId" IS NULL
       ) THEN
        RAISE EXCEPTION 'Report reporter is immutable except for account closure unlinking'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "prevent_report_reassignment"() FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;

CREATE TRIGGER "UserReport_identity_immutable"
    BEFORE UPDATE OF "reporterKey", "reporterAccountId", "targetType", "listingId", "reviewId", "targetReferenceId" ON "UserReport"
    FOR EACH ROW EXECUTE FUNCTION "prevent_report_reassignment"();

DROP POLICY "Review_owner_insert" ON "Review";
CREATE POLICY "Review_owner_insert" ON "Review" FOR INSERT TO studyspace_saved
    WITH CHECK (
        ("ownerAccountId" = NULLIF(current_setting('studyspace.account_id', true), '')::UUID
            OR "ownerKey" = current_setting('studyspace.favorite_owner', true))
        AND "ownerUnlinkedAt" IS NULL
        AND "retentionDecision" IS NULL
        AND "retentionReviewedAt" IS NULL
        AND "retentionReviewerAccountId" IS NULL
        AND "retentionReviewerUnlinkedAt" IS NULL
        AND "status" = 'PENDING' AND "publishedAt" IS NULL
        AND EXISTS (
            SELECT 1 FROM "StudySpace" AS space
            WHERE space."id" = "Review"."studySpaceId" AND space."status" = 'PUBLISHED'
                AND space."sourceType" <> 'DEVELOPMENT_FIXTURE'
        )
    );

DROP POLICY "Review_moderator_update" ON "Review";
CREATE POLICY "Review_moderator_update" ON "Review" FOR UPDATE TO studyspace_saved
    USING (current_setting('studyspace.is_moderator', true) = 'true')
    WITH CHECK (
        current_setting('studyspace.is_moderator', true) = 'true'
        AND ("status" <> 'APPROVED' OR "ownerAccountId" IS NOT NULL)
    );

COMMIT;

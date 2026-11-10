BEGIN;

-- Final expand hardening; this migration intentionally performs no legacy-column contract.

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

    IF NEW."body" IS DISTINCT FROM OLD."body" THEN
        NEW."retentionDecision" := NULL;
        NEW."retentionReviewedAt" := NULL;
        NEW."retentionReviewerAccountId" := NULL;
        NEW."retentionReviewerUnlinkedAt" := NULL;
    ELSIF (NEW."retentionDecision", NEW."retentionReviewedAt", NEW."retentionReviewerAccountId", NEW."retentionReviewerUnlinkedAt")
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
    BEFORE UPDATE OF "ownerKey", "ownerAccountId", "studySpaceId", "status", "body", "retentionDecision", "retentionReviewedAt", "retentionReviewerAccountId", "retentionReviewerUnlinkedAt" ON "Review"
    FOR EACH ROW EXECUTE FUNCTION "prevent_review_reassignment"();

COMMIT;

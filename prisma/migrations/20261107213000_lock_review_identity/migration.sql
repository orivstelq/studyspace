CREATE FUNCTION "prevent_review_reassignment"() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog
AS $$
BEGIN
    IF NEW."ownerKey" IS DISTINCT FROM OLD."ownerKey"
        OR NEW."studySpaceId" IS DISTINCT FROM OLD."studySpaceId" THEN
        RAISE EXCEPTION 'Review owner and study space are immutable'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "prevent_review_reassignment"() FROM PUBLIC, studyspace_app, studyspace_saved;

CREATE TRIGGER "Review_identity_immutable"
    BEFORE UPDATE OF "ownerKey", "studySpaceId" ON "Review"
    FOR EACH ROW EXECUTE FUNCTION "prevent_review_reassignment"();

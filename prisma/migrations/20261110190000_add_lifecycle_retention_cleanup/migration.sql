-- Bounded cleanup for the approved account-lifecycle retention limits. The
-- maintenance caller receives EXECUTE only; direct table access stays denied.
CREATE FUNCTION public.cleanup_expired_lifecycle_records(batch_size INTEGER)
RETURNS TABLE (
    expired_sessions_deleted INTEGER,
    resolved_reports_deleted INTEGER,
    moderation_actions_deleted INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    cutoff_time TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF batch_size IS NULL OR batch_size < 1 OR batch_size > 1000 THEN
        RAISE EXCEPTION 'batch_size must be between 1 and 1000'
            USING ERRCODE = '22023';
    END IF;

    WITH candidates AS (
        SELECT session."id"
        FROM public."AuthSession" AS session
        WHERE session."expiresAt" <= cutoff_time
        ORDER BY session."expiresAt", session."id"
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED
    ), deleted AS (
        DELETE FROM public."AuthSession" AS session
        USING candidates
        WHERE session."id" = candidates."id"
        RETURNING 1
    )
    SELECT count(*)::INTEGER INTO expired_sessions_deleted FROM deleted;

    WITH candidates AS (
        SELECT report."id"
        FROM public."UserReport" AS report
        WHERE report."status" = 'RESOLVED'
          AND report."resolvedAt" <= cutoff_time - INTERVAL '89 days'
        ORDER BY report."resolvedAt", report."id"
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED
    ), deleted AS (
        DELETE FROM public."UserReport" AS report
        USING candidates
        WHERE report."id" = candidates."id"
        RETURNING 1
    )
    SELECT count(*)::INTEGER INTO resolved_reports_deleted FROM deleted;

    WITH candidates AS (
        SELECT action."id"
        FROM public."ModerationAction" AS action
        WHERE action."createdAt" <= cutoff_time - INTERVAL '179 days'
          AND NOT EXISTS (
              SELECT 1
              FROM public."RetentionHold" AS hold
              WHERE hold."moderationActionId" = action."id"
                AND hold."expiresAt" > cutoff_time
          )
        ORDER BY action."createdAt", action."id"
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED
    ), deleted AS (
        DELETE FROM public."ModerationAction" AS action
        USING candidates
        WHERE action."id" = candidates."id"
        RETURNING 1
    )
    SELECT count(*)::INTEGER INTO moderation_actions_deleted FROM deleted;

    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_lifecycle_records(INTEGER)
    FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_lifecycle_records(INTEGER)
    TO studyspace_maintenance;

-- Bounded cleanup for expired rate-limit buckets. The maintenance caller receives
-- EXECUTE only; table access stays inside this migration-owner function.
CREATE FUNCTION public.cleanup_expired_rate_limit_buckets(batch_size INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    IF batch_size IS NULL OR batch_size < 1 OR batch_size > 10000 THEN
        RAISE EXCEPTION 'batch_size must be between 1 and 10000'
            USING ERRCODE = '22023';
    END IF;

    WITH expired AS (
        SELECT bucket."key"
        FROM public."RateLimitBucket" AS bucket
        WHERE bucket."resetAt" < CURRENT_TIMESTAMP - INTERVAL '1 day'
        ORDER BY bucket."resetAt", bucket."key"
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED
    ), deleted AS (
        DELETE FROM public."RateLimitBucket" AS bucket
        USING expired
        WHERE bucket."key" = expired."key"
        RETURNING 1
    )
    SELECT count(*)::INTEGER INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_rate_limit_buckets(INTEGER)
    FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limit_buckets(INTEGER)
    TO studyspace_maintenance;

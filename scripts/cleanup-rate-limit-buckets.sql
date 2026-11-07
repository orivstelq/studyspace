\set ON_ERROR_STOP on

-- One bounded batch per invocation. Re-run only after checking database load.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '2s';
SELECT public.cleanup_expired_rate_limit_buckets(1000) AS deleted_count;
COMMIT;

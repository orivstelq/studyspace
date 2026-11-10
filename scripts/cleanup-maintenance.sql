\set ON_ERROR_STOP on

-- One bounded batch per category. The caller must first run the reviewed
-- maintenance-identity verification in the same psql session.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '2s';
SELECT rate.deleted_count,
       lifecycle.expired_sessions_deleted,
       lifecycle.resolved_reports_deleted,
       lifecycle.moderation_actions_deleted
FROM (SELECT public.cleanup_expired_rate_limit_buckets(1000) AS deleted_count) AS rate
CROSS JOIN LATERAL public.cleanup_expired_lifecycle_records(1000) AS lifecycle;
COMMIT;

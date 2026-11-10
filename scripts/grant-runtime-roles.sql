-- Run as the migration owner after schema migrations, in each database.
BEGIN;
SELECT pg_catalog.current_database() AS database_name \gset
REVOKE CONNECT, TEMPORARY ON DATABASE :"database_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name" TO studyspace_app, studyspace_saved, studyspace_maintenance;
-- Run this as the same migration owner that creates application tables.
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO studyspace_app, studyspace_saved, studyspace_maintenance;
REVOKE ALL ON TABLE "Favorite", "AuthSession", "UserProfile", "Review", "UserReport", "ModerationAction", "RateLimitBucket" FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
REVOKE ALL ON TABLE "StudySpace", "Amenity", "StudySpaceAmenity" FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
GRANT SELECT ON TABLE "StudySpace", "Amenity", "StudySpaceAmenity" TO studyspace_app, studyspace_saved;
REVOKE SELECT ("id", "ownerKey", "studySpaceId", "rating", "body", "status", "createdAt", "updatedAt", "publishedAt") ON TABLE "Review" FROM studyspace_app;
GRANT SELECT ("id", "studySpaceId", "rating", "body", "status", "publishedAt") ON TABLE "Review" TO studyspace_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "Review", "UserReport" TO studyspace_saved;
GRANT SELECT, INSERT ON TABLE "ModerationAction" TO studyspace_saved;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Favorite", "AuthSession", "UserProfile" TO studyspace_saved;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RateLimitBucket" TO studyspace_saved;
REVOKE ALL ON FUNCTION public.cleanup_expired_rate_limit_buckets(INTEGER) FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limit_buckets(INTEGER) TO studyspace_maintenance;
COMMIT;

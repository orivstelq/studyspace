\set ON_ERROR_STOP on
\set VERBOSITY terse

-- Invoked only by verify-favorite-rls-live.sh as neondb_owner.
BEGIN;

DO $prefixture$
BEGIN
    IF current_database() <> 'studyspace_staging'
       OR session_user <> 'neondb_owner'
       OR current_user <> 'neondb_owner' THEN
        RAISE EXCEPTION 'expected studyspace_staging as neondb_owner';
    END IF;
    IF current_setting('server_version_num')::integer < 180000
       OR current_setting('server_version_num')::integer >= 190000 THEN
        RAISE EXCEPTION 'expected PostgreSQL 18.x';
    END IF;
END
$prefixture$;

INSERT INTO public."StudySpace" (
    id, slug, name, description, category, city, region,
    status, "sourceType", "updatedAt"
) VALUES (
    :'fixture_id'::uuid,
    'staging-rls-probe-' || :'fixture_id'::uuid::text,
    'Disposable Favorite RLS probe',
    'Fictional non-public row created only for staging RLS verification.',
    'LIBRARY',
    'Fictional',
    'Staging',
    'DRAFT',
    'DEVELOPMENT_FIXTURE',
    CURRENT_TIMESTAMP
);

COMMIT;

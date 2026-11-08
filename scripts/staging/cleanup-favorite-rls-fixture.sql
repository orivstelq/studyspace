\set ON_ERROR_STOP on
\set VERBOSITY terse

-- Idempotent recovery cleanup for the exact fictional fixture UUID.
BEGIN;
SET LOCAL studyspace.rls_fixture_id = :'fixture_id';

DO $cleanup_fixture$
DECLARE
    fixture_id uuid := current_setting('studyspace.rls_fixture_id')::uuid;
BEGIN
    IF current_database() <> 'studyspace_staging'
       OR session_user <> 'neondb_owner'
       OR current_user <> 'neondb_owner' THEN
        RAISE EXCEPTION 'expected studyspace_staging as neondb_owner';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public."StudySpace"
        WHERE id = fixture_id
          AND (
              slug <> 'staging-rls-probe-' || fixture_id::text
              OR status <> 'DRAFT'
              OR "sourceType" <> 'DEVELOPMENT_FIXTURE'
          )
    ) THEN
        RAISE EXCEPTION 'refusing to delete a row that is not the exact disposable fixture';
    END IF;

    DELETE FROM public."StudySpace"
    WHERE id = fixture_id
      AND slug = 'staging-rls-probe-' || fixture_id::text
      AND status = 'DRAFT'
      AND "sourceType" = 'DEVELOPMENT_FIXTURE';

    IF EXISTS (SELECT 1 FROM public."StudySpace" WHERE id = fixture_id)
       OR EXISTS (SELECT 1 FROM public."Favorite" WHERE "studySpaceId" = fixture_id) THEN
        RAISE EXCEPTION 'fixture cleanup verification failed';
    END IF;
END
$cleanup_fixture$;

COMMIT;

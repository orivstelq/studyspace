\set ON_ERROR_STOP on

-- This script does not create roles or credentials. Run it as neondb_owner only
-- after the three fixed LOGIN roles have been created through an approved,
-- secret-safe process.
BEGIN;

DO $validate_login_roles$
DECLARE
    role_name text;
    role_record record;
BEGIN
    IF current_database() <> 'studyspace_staging' THEN
        RAISE EXCEPTION 'expected database studyspace_staging, connected to %', current_database();
    END IF;

    IF current_setting('server_version_num')::integer < 180000
       OR current_setting('server_version_num')::integer >= 190000 THEN
        RAISE EXCEPTION 'expected PostgreSQL 18.x, found %', current_setting('server_version');
    END IF;

    FOREACH role_name IN ARRAY ARRAY[
        'studyspace_staging_app_login',
        'studyspace_staging_saved_login',
        'studyspace_staging_maintenance_login'
    ] LOOP
        SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
        INTO role_record
        FROM pg_catalog.pg_roles
        WHERE rolname = role_name;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'approved staging login role % does not exist', role_name;
        END IF;

        IF NOT role_record.rolcanlogin
           OR role_record.rolsuper
           OR role_record.rolcreatedb
           OR role_record.rolcreaterole
           OR role_record.rolinherit
           OR role_record.rolbypassrls THEN
            RAISE EXCEPTION 'login role % does not have the required least-privilege attributes', role_name;
        END IF;
    END LOOP;
END
$validate_login_roles$;

GRANT studyspace_app TO studyspace_staging_app_login WITH INHERIT TRUE;
GRANT studyspace_app TO studyspace_staging_app_login WITH SET FALSE;
GRANT studyspace_app TO studyspace_staging_app_login WITH ADMIN FALSE;

GRANT studyspace_saved TO studyspace_staging_saved_login WITH INHERIT TRUE;
GRANT studyspace_saved TO studyspace_staging_saved_login WITH SET FALSE;
GRANT studyspace_saved TO studyspace_staging_saved_login WITH ADMIN FALSE;

GRANT studyspace_maintenance TO studyspace_staging_maintenance_login WITH INHERIT TRUE;
GRANT studyspace_maintenance TO studyspace_staging_maintenance_login WITH SET FALSE;
GRANT studyspace_maintenance TO studyspace_staging_maintenance_login WITH ADMIN FALSE;

COMMIT;

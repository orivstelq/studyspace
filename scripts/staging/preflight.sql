\set ON_ERROR_STOP on

-- Read-only staging preflight. Run with the direct neondb_owner connection
-- before any migration or role-membership change.
DO $preflight$
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
        'studyspace_app',
        'studyspace_saved',
        'studyspace_maintenance'
    ] LOOP
        SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
        INTO role_record
        FROM pg_catalog.pg_roles
        WHERE rolname = role_name;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'required permission role % does not exist', role_name;
        END IF;

        IF role_record.rolcanlogin
           OR role_record.rolsuper
           OR role_record.rolcreatedb
           OR role_record.rolcreaterole
           OR role_record.rolinherit
           OR role_record.rolbypassrls THEN
            RAISE EXCEPTION 'permission role % has unexpected elevated attributes', role_name;
        END IF;
    END LOOP;
END
$preflight$;

SELECT current_database() AS database_name,
       current_setting('server_version') AS server_version,
       session_user AS connected_as;

SELECT rolname,
       rolcanlogin,
       rolsuper,
       rolcreatedb,
       rolcreaterole,
       rolinherit,
       rolbypassrls
FROM pg_catalog.pg_roles
WHERE rolname IN ('studyspace_app', 'studyspace_saved', 'studyspace_maintenance')
ORDER BY rolname;

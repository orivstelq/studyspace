\set ON_ERROR_STOP on

-- Creates inert identities only. provision-login-identities.sh supplies the
-- passwords and enables LOGIN atomically after this preflight succeeds.
BEGIN;

DO $precreate$
BEGIN
    IF current_database() <> 'studyspace_staging' THEN
        RAISE EXCEPTION 'expected database studyspace_staging, connected to %', current_database();
    END IF;
    IF session_user <> 'neondb_owner' OR current_user <> 'neondb_owner' THEN
        RAISE EXCEPTION 'expected the neondb_owner administrative identity';
    END IF;
    IF current_setting('server_version_num')::integer < 180000
       OR current_setting('server_version_num')::integer >= 190000 THEN
        RAISE EXCEPTION 'expected PostgreSQL 18.x, found %', current_setting('server_version');
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles
        WHERE rolname IN (
            'studyspace_staging_app_login',
            'studyspace_staging_saved_login',
            'studyspace_staging_maintenance_login'
        )
          AND (
              rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
              OR rolinherit OR rolreplication OR rolbypassrls
          )
    ) THEN
        RAISE EXCEPTION 'an existing staging login role is usable or has unexpected attributes; no changes made';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
        WHERE member_role.rolname IN (
            'studyspace_staging_app_login',
            'studyspace_staging_saved_login',
            'studyspace_staging_maintenance_login'
        )
    ) THEN
        RAISE EXCEPTION 'an existing staging login role already has membership; no changes made';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'studyspace_staging_app_login') THEN
        CREATE ROLE studyspace_staging_app_login NOLOGIN PASSWORD NULL
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'studyspace_staging_saved_login') THEN
        CREATE ROLE studyspace_staging_saved_login NOLOGIN PASSWORD NULL
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'studyspace_staging_maintenance_login') THEN
        CREATE ROLE studyspace_staging_maintenance_login NOLOGIN PASSWORD NULL
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    END IF;
END
$precreate$;

COMMIT;

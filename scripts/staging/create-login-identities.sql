\set ON_ERROR_STOP on

-- Inert until an operator runs it with the direct neondb_owner connection.
-- psql reads passwords without echoing them. Generate three independent values
-- in an approved secret-handling environment; do not save them in this repository.
\prompt -s 'Application login password: ' app_password
\prompt -s 'Private-data login password: ' saved_password
\prompt -s 'Maintenance login password: ' maintenance_password

BEGIN;

DO $precreate$
BEGIN
    IF current_database() <> 'studyspace_staging' THEN
        RAISE EXCEPTION 'expected database studyspace_staging, connected to %', current_database();
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
    ) THEN
        RAISE EXCEPTION 'one or more fixed staging login roles already exist; inspect them instead of recreating';
    END IF;
END
$precreate$;

CREATE ROLE studyspace_staging_app_login LOGIN PASSWORD :'app_password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE studyspace_staging_saved_login LOGIN PASSWORD :'saved_password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE studyspace_staging_maintenance_login LOGIN PASSWORD :'maintenance_password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

COMMIT;

\unset app_password
\unset saved_password
\unset maintenance_password

\set ON_ERROR_STOP on
\set VERBOSITY terse

-- Invoked only by verify-favorite-rls-live.sh after libpq has enforced
-- sslmode=verify-full with system certificate trust. Run as the saved login.
BEGIN;
SET LOCAL studyspace.rls_fixture_id = :'fixture_id';

DO $verify_favorite_rls$
DECLARE
    owner_a text;
    owner_b text;
    space_id uuid;
    affected integer;
BEGIN
    IF current_database() <> 'studyspace_staging' THEN
        RAISE EXCEPTION 'expected database studyspace_staging';
    END IF;
    IF session_user <> 'studyspace_staging_saved_login'
       OR current_user <> 'studyspace_staging_saved_login' THEN
        RAISE EXCEPTION 'expected the restricted staging saved login';
    END IF;
    IF current_setting('server_version_num')::integer < 180000
       OR current_setting('server_version_num')::integer >= 190000 THEN
        RAISE EXCEPTION 'expected PostgreSQL 18.x';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = session_user
          AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)
    ) OR (
        SELECT count(*)
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
        JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
        WHERE member.rolname = session_user
          AND granted.rolname = 'studyspace_saved'
          AND membership.inherit_option
          AND NOT membership.set_option
          AND NOT membership.admin_option
    ) <> 1 OR (
        SELECT count(*)
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
        WHERE member.rolname = session_user
    ) <> 1 THEN
        RAISE EXCEPTION 'saved login attributes or membership are not least-privileged';
    END IF;
    IF NOT has_table_privilege(session_user, 'public."Favorite"', 'SELECT')
       OR NOT has_table_privilege(session_user, 'public."Favorite"', 'INSERT')
       OR NOT has_table_privilege(session_user, 'public."Favorite"', 'DELETE')
       OR NOT EXISTS (
           SELECT 1
           FROM pg_catalog.pg_class AS relation
           JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
           JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = relation.relowner
           WHERE namespace.nspname = 'public'
             AND relation.relname = 'Favorite'
             AND relation.relrowsecurity
             AND owner_role.rolname <> session_user
       ) THEN
        RAISE EXCEPTION 'Favorite grants, ownership, or RLS are not safe for this probe';
    END IF;

    space_id := current_setting('studyspace.rls_fixture_id')::uuid;
    IF NOT EXISTS (
        SELECT 1
        FROM public."StudySpace"
        WHERE id = space_id
          AND slug = 'staging-rls-probe-' || space_id::text
          AND status = 'DRAFT'
          AND "sourceType" = 'DEVELOPMENT_FIXTURE'
    ) THEN
        RAISE EXCEPTION 'the exact disposable RLS fixture is missing or unsafe';
    END IF;

    owner_a := 'staging-rls-a-' || md5(random()::text || clock_timestamp()::text || pg_backend_pid()::text);
    owner_b := 'staging-rls-b-' || md5(random()::text || clock_timestamp()::text || pg_backend_pid()::text);
    IF owner_a = owner_b THEN
        RAISE EXCEPTION 'fictional probe identities collided';
    END IF;

    PERFORM set_config('studyspace.favorite_owner', owner_a, true);
    IF EXISTS (SELECT 1 FROM public."Favorite" WHERE "ownerKey" = owner_a AND "studySpaceId" = space_id) THEN
        RAISE EXCEPTION 'fictional owner A unexpectedly already exists';
    END IF;
    INSERT INTO public."Favorite" ("ownerKey", "studySpaceId") VALUES (owner_a, space_id);
    IF NOT EXISTS (SELECT 1 FROM public."Favorite" WHERE "ownerKey" = owner_a AND "studySpaceId" = space_id) THEN
        RAISE EXCEPTION 'owner A cannot read its inserted Favorite';
    END IF;
    BEGIN
        INSERT INTO public."Favorite" ("ownerKey", "studySpaceId") VALUES (owner_b, space_id);
        RAISE EXCEPTION 'owner A inserted owner B data';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    PERFORM set_config('studyspace.favorite_owner', owner_b, true);
    IF EXISTS (SELECT 1 FROM public."Favorite" WHERE "ownerKey" = owner_a AND "studySpaceId" = space_id) THEN
        RAISE EXCEPTION 'owner B can read owner A data';
    END IF;
    INSERT INTO public."Favorite" ("ownerKey", "studySpaceId") VALUES (owner_b, space_id);
    IF NOT EXISTS (SELECT 1 FROM public."Favorite" WHERE "ownerKey" = owner_b AND "studySpaceId" = space_id) THEN
        RAISE EXCEPTION 'owner B cannot read its inserted Favorite';
    END IF;
    DELETE FROM public."Favorite" WHERE "ownerKey" = owner_a AND "studySpaceId" = space_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN
        RAISE EXCEPTION 'owner B deleted owner A data';
    END IF;

    PERFORM set_config('studyspace.favorite_owner', owner_a, true);
    IF NOT EXISTS (SELECT 1 FROM public."Favorite" WHERE "ownerKey" = owner_a AND "studySpaceId" = space_id) THEN
        RAISE EXCEPTION 'owner A data changed across owner contexts';
    END IF;
    IF EXISTS (SELECT 1 FROM public."Favorite" WHERE "ownerKey" = owner_b AND "studySpaceId" = space_id) THEN
        RAISE EXCEPTION 'owner A can read owner B data';
    END IF;
    DELETE FROM public."Favorite" WHERE "ownerKey" = owner_b AND "studySpaceId" = space_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN
        RAISE EXCEPTION 'owner A deleted owner B data';
    END IF;
    DELETE FROM public."Favorite" WHERE "ownerKey" = owner_a AND "studySpaceId" = space_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 OR EXISTS (
        SELECT 1 FROM public."Favorite" WHERE "ownerKey" = owner_a AND "studySpaceId" = space_id
    ) THEN
        RAISE EXCEPTION 'owner A cleanup failed';
    END IF;

    PERFORM set_config('studyspace.favorite_owner', owner_b, true);
    DELETE FROM public."Favorite" WHERE "ownerKey" = owner_b AND "studySpaceId" = space_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 OR EXISTS (
        SELECT 1 FROM public."Favorite" WHERE "ownerKey" = owner_b AND "studySpaceId" = space_id
    ) THEN
        RAISE EXCEPTION 'owner B cleanup failed';
    END IF;

    RAISE NOTICE 'Favorite RLS verification passed; probe rows removed and transaction will roll back';
END
$verify_favorite_rls$;

ROLLBACK;

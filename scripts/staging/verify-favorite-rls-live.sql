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
    account_a uuid;
    account_b uuid;
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
       OR NOT has_function_privilege(session_user, 'public.resolve_account_identity(text)', 'EXECUTE')
       OR NOT has_function_privilege(session_user, 'public.lookup_active_account_identity(text)', 'EXECUTE')
       OR NOT has_function_privilege(session_user, 'public.set_active_account_context(uuid,boolean)', 'EXECUTE')
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

    owner_a := md5('a' || random()::text || clock_timestamp()::text || pg_backend_pid()::text)
        || md5('a2' || random()::text || clock_timestamp()::text);
    owner_b := md5('b' || random()::text || clock_timestamp()::text || pg_backend_pid()::text)
        || md5('b2' || random()::text || clock_timestamp()::text);
    IF owner_a = owner_b THEN
        RAISE EXCEPTION 'fictional probe identities collided';
    END IF;

    account_a := public.resolve_account_identity(owner_a);
    account_b := public.resolve_account_identity(owner_b);
    IF account_a IS NULL OR account_b IS NULL OR account_a = account_b THEN
        RAISE EXCEPTION 'fictional probe accounts were not isolated';
    END IF;

    IF NOT public.set_active_account_context(account_a, false) THEN
        RAISE EXCEPTION 'owner A account context was rejected';
    END IF;
    IF EXISTS (SELECT 1 FROM public."Favorite" WHERE "accountId" = account_a AND "studySpaceId" = space_id) THEN
        RAISE EXCEPTION 'fictional owner A unexpectedly already exists';
    END IF;
    INSERT INTO public."Favorite" ("accountId", "studySpaceId") VALUES (account_a, space_id);
    IF NOT EXISTS (SELECT 1 FROM public."Favorite" WHERE "accountId" = account_a AND "studySpaceId" = space_id) THEN
        RAISE EXCEPTION 'owner A cannot read its inserted Favorite';
    END IF;
    BEGIN
        INSERT INTO public."Favorite" ("accountId", "studySpaceId") VALUES (account_b, space_id);
        RAISE EXCEPTION 'owner A inserted owner B data';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    IF NOT public.set_active_account_context(account_b, false) THEN
        RAISE EXCEPTION 'owner B account context was rejected';
    END IF;
    IF EXISTS (SELECT 1 FROM public."Favorite" WHERE "accountId" = account_a AND "studySpaceId" = space_id) THEN
        RAISE EXCEPTION 'owner B can read owner A data';
    END IF;
    INSERT INTO public."Favorite" ("accountId", "studySpaceId") VALUES (account_b, space_id);
    IF NOT EXISTS (SELECT 1 FROM public."Favorite" WHERE "accountId" = account_b AND "studySpaceId" = space_id) THEN
        RAISE EXCEPTION 'owner B cannot read its inserted Favorite';
    END IF;
    DELETE FROM public."Favorite" WHERE "accountId" = account_a AND "studySpaceId" = space_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN
        RAISE EXCEPTION 'owner B deleted owner A data';
    END IF;

    IF NOT public.set_active_account_context(account_a, false) THEN
        RAISE EXCEPTION 'owner A account context was rejected on retry';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public."Favorite" WHERE "accountId" = account_a AND "studySpaceId" = space_id) THEN
        RAISE EXCEPTION 'owner A data changed across owner contexts';
    END IF;
    IF EXISTS (SELECT 1 FROM public."Favorite" WHERE "accountId" = account_b AND "studySpaceId" = space_id) THEN
        RAISE EXCEPTION 'owner A can read owner B data';
    END IF;
    DELETE FROM public."Favorite" WHERE "accountId" = account_b AND "studySpaceId" = space_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN
        RAISE EXCEPTION 'owner A deleted owner B data';
    END IF;
    DELETE FROM public."Favorite" WHERE "accountId" = account_a AND "studySpaceId" = space_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 OR EXISTS (
        SELECT 1 FROM public."Favorite" WHERE "accountId" = account_a AND "studySpaceId" = space_id
    ) THEN
        RAISE EXCEPTION 'owner A cleanup failed';
    END IF;

    IF NOT public.set_active_account_context(account_b, false) THEN
        RAISE EXCEPTION 'owner B account context was rejected on cleanup';
    END IF;
    DELETE FROM public."Favorite" WHERE "accountId" = account_b AND "studySpaceId" = space_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 OR EXISTS (
        SELECT 1 FROM public."Favorite" WHERE "accountId" = account_b AND "studySpaceId" = space_id
    ) THEN
        RAISE EXCEPTION 'owner B cleanup failed';
    END IF;

    RAISE NOTICE 'Favorite RLS verification passed; probe rows removed and transaction will roll back';
END
$verify_favorite_rls$;

ROLLBACK;

\set ON_ERROR_STOP on

-- Read-only post-provisioning assertions. This deliberately fails closed when
-- role, ownership, RLS, or grant assumptions drift.
DO $verify$
DECLARE
    bad_count integer;
BEGIN
    IF current_database() <> 'studyspace_staging' THEN
        RAISE EXCEPTION 'expected database studyspace_staging, connected to %', current_database();
    END IF;

    IF current_setting('server_version_num')::integer < 180000
       OR current_setting('server_version_num')::integer >= 190000 THEN
        RAISE EXCEPTION 'expected PostgreSQL 18.x, found %', current_setting('server_version');
    END IF;

    SELECT count(*) INTO bad_count
    FROM (VALUES
        ('studyspace_app', 'studyspace_staging_app_login'),
        ('studyspace_saved', 'studyspace_staging_saved_login'),
        ('studyspace_maintenance', 'studyspace_staging_maintenance_login')
    ) AS expected(granted_role, member_role)
    LEFT JOIN pg_catalog.pg_roles granted ON granted.rolname = expected.granted_role
    LEFT JOIN pg_catalog.pg_roles member ON member.rolname = expected.member_role
    LEFT JOIN pg_catalog.pg_auth_members membership
      ON membership.roleid = granted.oid AND membership.member = member.oid
    WHERE granted.oid IS NULL
       OR member.oid IS NULL
       OR NOT member.rolcanlogin
       OR member.rolsuper
       OR member.rolcreatedb
       OR member.rolcreaterole
       OR member.rolinherit
       OR member.rolbypassrls
       OR membership.roleid IS NULL
       OR NOT membership.inherit_option
       OR membership.set_option
       OR membership.admin_option;

    IF bad_count <> 0 THEN
        RAISE EXCEPTION 'staging login membership or attributes failed verification';
    END IF;

    SELECT count(*) INTO bad_count
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    WHERE member.rolname LIKE 'studyspace_staging_%_login'
      AND (granted.rolname, member.rolname) NOT IN (
        ('studyspace_app', 'studyspace_staging_app_login'),
        ('studyspace_saved', 'studyspace_staging_saved_login'),
        ('studyspace_maintenance', 'studyspace_staging_maintenance_login')
      );

    IF bad_count <> 0 THEN
        RAISE EXCEPTION 'a staging login has an unexpected role membership';
    END IF;

    SELECT count(*) INTO bad_count
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')
      AND owner_role.rolname <> 'neondb_owner';

    IF bad_count <> 0 THEN
        RAISE EXCEPTION 'public schema contains objects not owned by neondb_owner';
    END IF;

    SELECT count(*) INTO bad_count
    FROM pg_catalog.pg_proc function
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function.pronamespace
    JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = function.proowner
    WHERE namespace.nspname = 'public'
      AND owner_role.rolname <> 'neondb_owner';

    IF bad_count <> 0 THEN
        RAISE EXCEPTION 'public schema contains functions not owned by neondb_owner';
    END IF;

    SELECT count(*) INTO bad_count
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = relation.relowner
    WHERE owner_role.rolname IN (
        'studyspace_app',
        'studyspace_saved',
        'studyspace_maintenance',
        'studyspace_staging_app_login',
        'studyspace_staging_saved_login',
        'studyspace_staging_maintenance_login'
    );

    IF bad_count <> 0 THEN
        RAISE EXCEPTION 'a runtime permission or login role owns a database object';
    END IF;

    SELECT count(*) INTO bad_count
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('Account', 'AccountIdentity', 'AccountClosure', 'RetentionHold', 'ModeratorGrant', 'Favorite', 'UserProfile', 'Review', 'UserReport', 'ModerationAction');

    IF bad_count <> 10 THEN
        RAISE EXCEPTION 'one or more private RLS tables are missing';
    END IF;

    SELECT count(*) INTO bad_count
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('Account', 'AccountIdentity', 'AccountClosure', 'RetentionHold', 'ModeratorGrant', 'Favorite', 'UserProfile', 'Review', 'UserReport', 'ModerationAction')
      AND (NOT relation.relrowsecurity OR relation.relforcerowsecurity);

    IF bad_count <> 0 THEN
        RAISE EXCEPTION 'expected runtime-owned private tables to use RLS without FORCE RLS';
    END IF;

    SELECT count(*) INTO bad_count
    FROM (VALUES
        ('Favorite', 'ownerKey'),
        ('UserProfile', 'ownerKey'),
        ('Review', 'ownerKey'),
        ('UserReport', 'reporterKey'),
        ('ModerationAction', 'moderatorKey')
    ) AS legacy(table_name, column_name)
    LEFT JOIN pg_catalog.pg_attribute attribute
      ON attribute.attrelid = pg_catalog.to_regclass(pg_catalog.format('public.%I', legacy.table_name))
     AND attribute.attname = legacy.column_name
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    WHERE attribute.attnum IS NULL;

    IF bad_count <> 0 THEN
        RAISE EXCEPTION 'legacy ownership columns required for application rollback are missing';
    END IF;

    SELECT count(*) INTO bad_count
    FROM (VALUES
        ('Favorite', 'Favorite_account_compatibility'),
        ('UserProfile', 'UserProfile_account_compatibility'),
        ('Review', 'Review_account_compatibility'),
        ('UserReport', 'UserReport_account_compatibility'),
        ('ModerationAction', 'ModerationAction_account_compatibility')
    ) AS expected(table_name, trigger_name)
    LEFT JOIN pg_catalog.pg_trigger trigger
      ON trigger.tgrelid = pg_catalog.to_regclass(pg_catalog.format('public.%I', expected.table_name))
     AND trigger.tgname = expected.trigger_name
     AND NOT trigger.tgisinternal
    WHERE trigger.oid IS NULL;

    IF bad_count <> 0 THEN
        RAISE EXCEPTION 'legacy dual-write triggers required for application rollback are missing';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace namespace,
             LATERAL pg_catalog.aclexplode(
                 COALESCE(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))
             ) privilege
        WHERE namespace.nspname = 'public'
          AND privilege.grantee = 0
          AND privilege.privilege_type = 'CREATE'
    ) THEN
        RAISE EXCEPTION 'PUBLIC must not have CREATE on schema public';
    END IF;

    IF has_table_privilege('studyspace_app', 'public."Favorite"', 'SELECT')
       OR has_table_privilege('studyspace_app', 'public."Account"', 'SELECT')
       OR has_table_privilege('studyspace_app', 'public."AccountIdentity"', 'SELECT')
       OR has_table_privilege('studyspace_app', 'public."AccountClosure"', 'SELECT')
       OR has_table_privilege('studyspace_app', 'public."RetentionHold"', 'SELECT')
       OR has_table_privilege('studyspace_app', 'public."ModeratorGrant"', 'SELECT')
       OR has_table_privilege('studyspace_app', 'public."UserProfile"', 'SELECT')
       OR has_table_privilege('studyspace_app', 'public."UserReport"', 'SELECT')
       OR has_table_privilege('studyspace_app', 'public."ModerationAction"', 'SELECT') THEN
        RAISE EXCEPTION 'public application role can read private account or moderation tables';
    END IF;

    IF has_table_privilege('studyspace_saved', 'public."Account"', 'SELECT')
       OR has_table_privilege('studyspace_saved', 'public."AccountIdentity"', 'SELECT')
       OR has_table_privilege('studyspace_saved', 'public."AccountClosure"', 'SELECT')
       OR has_table_privilege('studyspace_saved', 'public."RetentionHold"', 'SELECT')
       OR has_table_privilege('studyspace_saved', 'public."ModeratorGrant"', 'SELECT')
       OR NOT has_function_privilege('studyspace_saved', 'public.resolve_account_identity(text)', 'EXECUTE')
       OR NOT has_function_privilege('studyspace_saved', 'public.lookup_active_account_identity(text)', 'EXECUTE')
       OR NOT has_function_privilege('studyspace_saved', 'public.set_active_account_context(uuid,text)', 'EXECUTE')
       OR NOT has_function_privilege('studyspace_saved', 'public.set_moderator_account_context(uuid,text)', 'EXECUTE')
       OR NOT has_function_privilege('studyspace_saved', 'public.has_verified_account_context(uuid)', 'EXECUTE')
       OR NOT has_function_privilege('studyspace_saved', 'public.has_verified_moderator_context()', 'EXECUTE')
       OR has_function_privilege('studyspace_saved', 'public.set_active_account_context(uuid,boolean)', 'EXECUTE')
       OR has_function_privilege('studyspace_app', 'public.resolve_account_identity(text)', 'EXECUTE')
       OR has_function_privilege('studyspace_app', 'public.lookup_active_account_identity(text)', 'EXECUTE')
       OR has_function_privilege('studyspace_app', 'public.set_active_account_context(uuid,boolean)', 'EXECUTE')
       OR has_function_privilege('studyspace_app', 'public.set_active_account_context(uuid,text)', 'EXECUTE')
       OR has_function_privilege('studyspace_app', 'public.set_moderator_account_context(uuid,text)', 'EXECUTE')
       OR has_function_privilege('studyspace_maintenance', 'public.resolve_account_identity(text)', 'EXECUTE')
       OR has_function_privilege('studyspace_maintenance', 'public.lookup_active_account_identity(text)', 'EXECUTE')
       OR has_function_privilege('studyspace_maintenance', 'public.set_active_account_context(uuid,boolean)', 'EXECUTE')
       OR has_function_privilege('studyspace_maintenance', 'public.set_active_account_context(uuid,text)', 'EXECUTE')
       OR has_function_privilege('studyspace_maintenance', 'public.set_moderator_account_context(uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'account lifecycle table or function grants are incorrect';
    END IF;

    IF NOT has_table_privilege('studyspace_app', 'public."StudySpace"', 'SELECT') THEN
        RAISE EXCEPTION 'public application role is missing required listing read privileges';
    END IF;

    IF has_table_privilege('studyspace_app', 'public."Review"', 'SELECT') THEN
        RAISE EXCEPTION 'public application role has table-wide Review read privileges';
    END IF;

    IF NOT has_column_privilege('studyspace_app', 'public."Review"', 'id', 'SELECT')
       OR NOT has_column_privilege('studyspace_app', 'public."Review"', 'studySpaceId', 'SELECT')
       OR NOT has_column_privilege('studyspace_app', 'public."Review"', 'rating', 'SELECT')
       OR NOT has_column_privilege('studyspace_app', 'public."Review"', 'body', 'SELECT')
       OR NOT has_column_privilege('studyspace_app', 'public."Review"', 'status', 'SELECT')
       OR NOT has_column_privilege('studyspace_app', 'public."Review"', 'publishedAt', 'SELECT') THEN
        RAISE EXCEPTION 'public application role is missing required public Review columns';
    END IF;

    SELECT count(*) INTO bad_count
    FROM pg_catalog.pg_attribute attribute
    WHERE attribute.attrelid = 'public."Review"'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND has_column_privilege('studyspace_app', 'public."Review"', attribute.attname, 'SELECT')
      AND attribute.attname NOT IN ('id', 'studySpaceId', 'rating', 'body', 'status', 'publishedAt');

    IF bad_count <> 0 THEN
        RAISE EXCEPTION 'public application role can read non-public Review columns';
    END IF;

    IF has_function_privilege('studyspace_app', 'public.cleanup_expired_rate_limit_buckets(integer)', 'EXECUTE')
       OR has_function_privilege('studyspace_saved', 'public.cleanup_expired_rate_limit_buckets(integer)', 'EXECUTE')
       OR NOT has_function_privilege('studyspace_maintenance', 'public.cleanup_expired_rate_limit_buckets(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'rate-limit cleanup function grants are incorrect';
    END IF;

    IF has_function_privilege('studyspace_app', 'public.cleanup_expired_lifecycle_records(integer)', 'EXECUTE')
       OR has_function_privilege('studyspace_saved', 'public.cleanup_expired_lifecycle_records(integer)', 'EXECUTE')
       OR NOT has_function_privilege('studyspace_maintenance', 'public.cleanup_expired_lifecycle_records(integer)', 'EXECUTE')
       OR has_table_privilege('studyspace_maintenance', 'public."AuthSession"', 'SELECT')
       OR has_table_privilege('studyspace_maintenance', 'public."AuthSession"', 'DELETE')
       OR has_table_privilege('studyspace_maintenance', 'public."UserReport"', 'SELECT')
       OR has_table_privilege('studyspace_maintenance', 'public."UserReport"', 'DELETE')
       OR has_table_privilege('studyspace_maintenance', 'public."ModerationAction"', 'SELECT')
       OR has_table_privilege('studyspace_maintenance', 'public."ModerationAction"', 'DELETE') THEN
        RAISE EXCEPTION 'account-lifecycle cleanup function grants are incorrect';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_trigger trigger
        JOIN pg_catalog.pg_class relation ON relation.oid = trigger.tgrelid
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'Review'
          AND trigger.tgname = 'Review_identity_immutable'
          AND NOT trigger.tgisinternal
    ) THEN
        RAISE EXCEPTION 'review identity immutability trigger is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_trigger trigger
        JOIN pg_catalog.pg_class relation ON relation.oid = trigger.tgrelid
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'UserReport'
          AND trigger.tgname = 'UserReport_identity_immutable'
          AND NOT trigger.tgisinternal
    ) THEN
        RAISE EXCEPTION 'report identity immutability trigger is missing';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc function
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function.pronamespace
        WHERE namespace.nspname = 'public'
          AND function.proname IN (
              'resolve_account_identity',
              'lookup_active_account_identity',
              'set_active_account_context',
              'set_moderator_account_context',
              'has_verified_account_context',
              'has_verified_moderator_context'
          )
          AND (NOT function.prosecdef OR array_to_string(function.proconfig, ',') NOT LIKE '%search_path=pg_catalog, public%')
    ) THEN
        RAISE EXCEPTION 'account lifecycle runtime functions are not fixed-search-path security definers';
    END IF;
END
$verify$;

SELECT granted.rolname AS permission_role,
       member.rolname AS login_role,
       membership.admin_option,
       membership.inherit_option,
       membership.set_option
FROM pg_catalog.pg_auth_members membership
JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
JOIN pg_catalog.pg_roles member ON member.oid = membership.member
WHERE member.rolname LIKE 'studyspace_staging_%_login'
ORDER BY member.rolname, granted.rolname;

SELECT namespace.nspname AS schema_name,
       relation.relname AS object_name,
       owner_role.rolname AS owner,
       relation.relrowsecurity AS rls_enabled,
       relation.relforcerowsecurity AS force_rls
FROM pg_catalog.pg_class relation
JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = relation.relowner
WHERE namespace.nspname = 'public'
  AND relation.relkind IN ('r', 'p')
ORDER BY relation.relname;

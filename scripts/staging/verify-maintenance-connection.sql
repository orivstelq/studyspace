\set ON_ERROR_STOP on

-- Read-only, fail-closed checks run as the maintenance login immediately before cleanup.
DO $verify$
DECLARE
    login_attributes record;
BEGIN
    IF current_database() <> 'studyspace_staging' THEN
        RAISE EXCEPTION 'expected database studyspace_staging, connected to %', current_database();
    END IF;
    IF session_user <> 'studyspace_staging_maintenance_login'
       OR current_user <> session_user THEN
        RAISE EXCEPTION 'expected the restricted staging maintenance login';
    END IF;

    SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit,
           rolreplication, rolbypassrls
    INTO login_attributes
    FROM pg_catalog.pg_roles
    WHERE rolname = session_user;

    IF NOT FOUND
       OR NOT login_attributes.rolcanlogin
       OR login_attributes.rolsuper
       OR login_attributes.rolcreatedb
       OR login_attributes.rolcreaterole
       OR login_attributes.rolinherit
       OR login_attributes.rolreplication
       OR login_attributes.rolbypassrls THEN
        RAISE EXCEPTION 'maintenance login attributes are not least-privileged';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_auth_members membership
        JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
        JOIN pg_catalog.pg_roles member ON member.oid = membership.member
        WHERE granted.rolname = 'studyspace_maintenance'
          AND member.rolname = session_user
          AND membership.inherit_option
          AND NOT membership.set_option
          AND NOT membership.admin_option
    ) OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_auth_members membership
        JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
        JOIN pg_catalog.pg_roles member ON member.oid = membership.member
        WHERE member.rolname = session_user
          AND granted.rolname <> 'studyspace_maintenance'
    ) THEN
        RAISE EXCEPTION 'maintenance login membership is not least-privileged';
    END IF;

    IF NOT has_function_privilege(
        session_user,
        'public.cleanup_expired_rate_limit_buckets(integer)',
        'EXECUTE'
    ) OR has_table_privilege(session_user, 'public."RateLimitBucket"', 'SELECT')
       OR has_table_privilege(session_user, 'public."RateLimitBucket"', 'INSERT')
       OR has_table_privilege(session_user, 'public."RateLimitBucket"', 'UPDATE')
       OR has_table_privilege(session_user, 'public."RateLimitBucket"', 'DELETE') THEN
        RAISE EXCEPTION 'maintenance cleanup privileges are incorrect';
    END IF;
END
$verify$;

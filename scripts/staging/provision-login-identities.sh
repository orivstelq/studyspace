#!/usr/bin/env bash
set -euo pipefail
set +x

required=(PGHOST PGDATABASE PGUSER PGPASSWORD PGSSLMODE)
for name in "${required[@]}"; do
    if [[ -z "${!name:-}" ]]; then
        echo "Missing required libpq environment variable: $name" >&2
        exit 1
    fi
done

if [[ "$PGDATABASE" != "studyspace_staging" || "$PGUSER" != "neondb_owner" ]]; then
    echo "Refusing credentials outside studyspace_staging as neondb_owner." >&2
    exit 1
fi
if [[ "$PGSSLMODE" != "verify-full" ]]; then
    echo "PGSSLMODE must be verify-full." >&2
    exit 1
fi
if [[ "$PGHOST" == *-pooler.* ]]; then
    echo "Use the direct Neon host for administrative provisioning." >&2
    exit 1
fi
if [[ ! -t 0 ]]; then
    echo "Run this script from an interactive terminal." >&2
    exit 1
fi

app_password=
saved_password=
maintenance_password=
cleanup() {
    unset app_password saved_password maintenance_password first confirmation
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

read_password() {
    local label=$1
    local destination=$2
    local first confirmation
    read -r -s -p "$label password: " first
    printf '\n' >&2
    read -r -s -p "Confirm $label password: " confirmation
    printf '\n' >&2
    if [[ "$first" != "$confirmation" ]]; then
        echo "Passwords did not match; no credential changes made." >&2
        exit 1
    fi
    if (( ${#first} < 32 || ${#first} > 128 )) || [[ ! "$first" =~ ^[A-Za-z0-9_+=.,:@%/-]+$ ]]; then
        echo "Use 32-128 characters from the documented generated-password alphabet." >&2
        exit 1
    fi
    printf -v "$destination" '%s' "$first"
}

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

# Existing LOGIN roles make this stop before password input, so this is not a
# credential-rotation path.
psql -X --set=ON_ERROR_STOP=1 --file="$script_dir/create-login-identities.sql"

read_password "application login" app_password
read_password "private-data login" saved_password
read_password "maintenance login" maintenance_password
if [[ "$app_password" == "$saved_password" || "$app_password" == "$maintenance_password" || "$saved_password" == "$maintenance_password" ]]; then
    echo "All three passwords must be unique; no credential changes made." >&2
    exit 1
fi

# Plaintext exists only in this process and the pipe. PostgreSQL receives each
# password over verified TLS; output is suppressed so an error cannot echo it.
if ! {
    printf '%s\n' '\set ON_ERROR_STOP on' '\set VERBOSITY terse' 'BEGIN;'
    cat <<'SQL'
DO $precredential$
BEGIN
    IF current_database() <> 'studyspace_staging'
       OR session_user <> 'neondb_owner'
       OR current_user <> 'neondb_owner' THEN
        RAISE EXCEPTION 'staging owner identity check failed';
    END IF;
    IF current_setting('server_version_num')::integer < 180000
       OR current_setting('server_version_num')::integer >= 190000 THEN
        RAISE EXCEPTION 'PostgreSQL 18 is required';
    END IF;
    IF current_setting('standard_conforming_strings') <> 'on' THEN
        RAISE EXCEPTION 'standard_conforming_strings must be on';
    END IF;
    IF (
        SELECT count(*) FROM pg_catalog.pg_roles
        WHERE rolname IN (
            'studyspace_staging_app_login',
            'studyspace_staging_saved_login',
            'studyspace_staging_maintenance_login'
        )
          AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb
          AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication
          AND NOT rolbypassrls
    ) <> 3 THEN
        RAISE EXCEPTION 'staging login role precondition failed';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
        WHERE member_role.rolname LIKE 'studyspace_staging_%_login'
    ) THEN
        RAISE EXCEPTION 'staging login roles must not have membership yet';
    END IF;
END
$precredential$;
SQL
    printf "ALTER ROLE studyspace_staging_app_login PASSWORD '%s';\n" "$app_password"
    printf "ALTER ROLE studyspace_staging_saved_login PASSWORD '%s';\n" "$saved_password"
    printf "ALTER ROLE studyspace_staging_maintenance_login PASSWORD '%s';\n" "$maintenance_password"
    printf '%s\n' \
        'ALTER ROLE studyspace_staging_app_login LOGIN;' \
        'ALTER ROLE studyspace_staging_saved_login LOGIN;' \
        'ALTER ROLE studyspace_staging_maintenance_login LOGIN;' \
        'COMMIT;'
} | psql -X --quiet >/dev/null 2>/dev/null; then
    echo "Credential provisioning failed; the transaction rolled back without emitting password-bearing diagnostics." >&2
    exit 1
fi

echo "All three staging login credentials were configured and LOGIN was enabled atomically."

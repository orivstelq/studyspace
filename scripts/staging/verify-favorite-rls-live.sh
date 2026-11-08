#!/usr/bin/env bash
set -euo pipefail
set +x

required=(
    STAGING_OWNER_PGHOST STAGING_OWNER_PGPASSWORD
    STAGING_SAVED_PGHOST STAGING_SAVED_PGPASSWORD
)
for name in "${required[@]}"; do
    if [[ -z "${!name:-}" ]]; then
        echo "Missing required secret-manager variable: $name" >&2
        exit 1
    fi
done
owner_host=$STAGING_OWNER_PGHOST
owner_port=${STAGING_OWNER_PGPORT:-5432}
owner_password=$STAGING_OWNER_PGPASSWORD
saved_host=$STAGING_SAVED_PGHOST
saved_port=${STAGING_SAVED_PGPORT:-5432}
saved_password=$STAGING_SAVED_PGPASSWORD
unset STAGING_OWNER_PGHOST STAGING_OWNER_PGPORT STAGING_OWNER_PGPASSWORD
unset STAGING_SAVED_PGHOST STAGING_SAVED_PGPORT STAGING_SAVED_PGPASSWORD

if [[ "$owner_host" == *-pooler.* ]]; then
    echo "The fixture owner must use the direct Neon host." >&2
    exit 1
fi
if [[ "$owner_host" != *.neon.tech || "$saved_host" != *.neon.tech ]]; then
    echo "Both connections must use explicit Neon DNS hostnames." >&2
    exit 1
fi
if [[ ! "$owner_port" =~ ^[0-9]+$ || ! "$saved_port" =~ ^[0-9]+$ ]]; then
    echo "PostgreSQL ports must be numeric." >&2
    exit 1
fi
if [[ ! -t 0 ]]; then
    echo "Run this live verifier deliberately from an interactive terminal." >&2
    exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
fixture_id=$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')
fixture_may_exist=0
fixture_committed=0

clear_libpq_overrides() {
    unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS
    unset PGREQUIRESSL PGSSLCOMPRESSION PGSSLCERT PGSSLCERTMODE PGSSLKEY PGSSLPASSWORD
    unset PGSSLROOTCERT PGSSLCRL PGSSLCRLDIR PGSSLMODE PGSSLSNI
    unset PGSSLMINPROTOCOLVERSION PGSSLMAXPROTOCOLVERSION PGSSLNEGOTIATION
    unset PGREQUIREPEER PGCHANNELBINDING PGGSSENCMODE
}

use_owner_connection() {
    clear_libpq_overrides
    export PGHOST="$owner_host"
    export PGPORT="$owner_port"
    export PGDATABASE=studyspace_staging
    export PGUSER=neondb_owner
    export PGPASSWORD="$owner_password"
    export PGSSLMODE=verify-full
    export PGSSLROOTCERT=system
    export PGSSLCERTMODE=disable
    export PGGSSENCMODE=disable
}

use_saved_connection() {
    clear_libpq_overrides
    export PGHOST="$saved_host"
    export PGPORT="$saved_port"
    export PGDATABASE=studyspace_staging
    export PGUSER=studyspace_staging_saved_login
    export PGPASSWORD="$saved_password"
    export PGSSLMODE=verify-full
    export PGSSLROOTCERT=system
    export PGSSLCERTMODE=disable
    export PGGSSENCMODE=disable
}

cleanup_fixture() {
    use_owner_connection
    psql -X --quiet --set=ON_ERROR_STOP=1 --set=fixture_id="$fixture_id" \
        --file="$script_dir/cleanup-favorite-rls-fixture.sql"
}

on_exit() {
    local status=$?
    trap - EXIT
    if (( fixture_may_exist )); then
        if cleanup_fixture; then
            if (( fixture_committed )); then
                echo "Disposable RLS fixture cleanup verified."
            fi
        else
            echo "Fixture cleanup failed for id $fixture_id; use the reviewed recovery command in docs/STAGING.md." >&2
            status=1
        fi
    fi
    unset PGPASSWORD owner_password saved_password
    exit "$status"
}
trap on_exit EXIT
trap 'exit 130' HUP INT TERM

echo "Disposable RLS fixture id: $fixture_id"
use_owner_connection
fixture_may_exist=1
psql -X --quiet --set=ON_ERROR_STOP=1 --set=fixture_id="$fixture_id" \
    --file="$script_dir/create-favorite-rls-fixture.sql"
fixture_committed=1

use_saved_connection
psql -X --quiet --set=ON_ERROR_STOP=1 --set=fixture_id="$fixture_id" \
    --file="$script_dir/verify-favorite-rls-live.sql"

echo "Favorite owner-isolation verification passed; cleaning up the disposable fixture."

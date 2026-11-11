#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { readLocalMigrations, verifyMigrationHistory } from "./phase17-rollout.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const expectedProjectId = "curly-paper-15884428";
const expectedBranchId = "br-cold-king-beer2yusy";
const expectedBranchName = "rehearsal-account-lifecycle";
const expectedHost = "ep-solitary-butterfly-be2qqvk8.c-9.us-east-2.aws.neon.tech";
const expectedDatabase = "studyspace_staging";
const expectedOwner = "neondb_owner";
const retentionMigration = "20261110190000_add_lifecycle_retention_cleanup";

function required(environment, name) {
    const value = environment[name];
    if (!value) throw new Error(`missing ${name}`);
    return value;
}

function freshConfirmation(value, now = Date.now()) {
    const confirmedAt = Date.parse(value);
    if (!Number.isFinite(confirmedAt) || confirmedAt > now + 60_000 || now - confirmedAt > 30 * 60_000) {
        throw new Error("rehearsal approval must be an ISO timestamp from the last 30 minutes");
    }
}

export function readRehearsalConfiguration(environment, { apply = false, now = Date.now() } = {}) {
    if (environment.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
        throw new Error("NODE_TLS_REJECT_UNAUTHORIZED must not disable certificate verification");
    }
    if (required(environment, "STUDYSPACE_NEON_PROJECT_ID") !== expectedProjectId) {
        throw new Error("unexpected Neon project ID");
    }
    if (required(environment, "STUDYSPACE_NEON_BRANCH_ID") !== expectedBranchId) {
        throw new Error("unexpected disposable Neon branch ID");
    }
    if (required(environment, "STUDYSPACE_NEON_BRANCH_NAME") !== expectedBranchName) {
        throw new Error("unexpected disposable Neon branch name");
    }

    let directUrl;
    try {
        directUrl = new URL(required(environment, "DIRECT_URL"));
    } catch {
        throw new Error("DIRECT_URL must be a valid PostgreSQL URL");
    }
    const blockedParameters = [
        "hostaddr", "service", "servicefile", "passfile", "sslcert", "sslkey",
        "ssl", "sslpassword", "sslrootcert", "gssencmode", "options",
    ];
    if (
        !["postgres:", "postgresql:"].includes(directUrl.protocol)
        || directUrl.hostname !== expectedHost
        || directUrl.hostname.includes("-pooler.")
        || directUrl.pathname !== `/${expectedDatabase}`
        || decodeURIComponent(directUrl.username) !== expectedOwner
        || !directUrl.password
        || blockedParameters.some((parameter) => directUrl.searchParams.has(parameter))
    ) {
        throw new Error("DIRECT_URL is not the approved disposable rehearsal owner endpoint");
    }
    directUrl.searchParams.set("sslmode", "verify-full");

    const approvedCommit = required(environment, "STUDYSPACE_APPROVED_COMMIT");
    if (!/^[0-9a-f]{40}$/.test(approvedCommit)) throw new Error("STUDYSPACE_APPROVED_COMMIT must be a full commit hash");
    if (apply) {
        if (environment.STUDYSPACE_REHEARSAL_APPROVED !== "yes") throw new Error("rehearsal approval is missing");
        freshConfirmation(required(environment, "STUDYSPACE_REHEARSAL_CONFIRMED_AT"), now);
    }
    return { approvedCommit, directUrl };
}

function sanitizedOutput(output, secrets) {
    return secrets.passwords.reduce(
        (value, password) => value.replaceAll(password, "[REDACTED]"),
        String(output ?? "").replaceAll(secrets.url, "[REDACTED]"),
    );
}

function run(command, args, { environment, label, secrets }) {
    const result = spawnSync(command, args, {
        cwd: projectRoot,
        env: environment,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
    });
    process.stdout.write(sanitizedOutput(result.stdout, secrets));
    process.stderr.write(sanitizedOutput(result.stderr, secrets));
    if (result.status !== 0) throw new Error(`${label} failed`);
    return result.stdout.trim();
}

function commandEnvironment(configuration) {
    const clean = Object.fromEntries(
        Object.entries(process.env).filter(([name]) => !name.startsWith("PG") && ![
            "DATABASE_URL", "FAVORITES_DATABASE_URL", "MAINTENANCE_DATABASE_URL", "DIRECT_URL",
            "DEBUG", "NODE_DEBUG", "PRISMA_LOG_LEVEL", "RUST_LOG", "RUST_BACKTRACE",
        ].includes(name)),
    );
    const url = configuration.directUrl;
    return {
        base: clean,
        prisma: { ...clean, DIRECT_URL: url.toString() },
        psql: {
            ...clean,
            PGHOST: url.hostname,
            PGPORT: url.port || "5432",
            PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
            PGUSER: decodeURIComponent(url.username),
            PGPASSWORD: decodeURIComponent(url.password),
            PGSSLMODE: "verify-full",
            PGSSLROOTCERT: "system",
            PGSSLCERTMODE: "disable",
            PGGSSENCMODE: "disable",
            PGCONNECT_TIMEOUT: "15",
        },
    };
}

function verifyRepository(configuration, environments, secrets) {
    const head = run("git", ["rev-parse", "HEAD"], { environment: environments.base, label: "commit check", secrets });
    const branch = run("git", ["branch", "--show-current"], { environment: environments.base, label: "branch check", secrets });
    const status = run("git", ["status", "--porcelain"], { environment: environments.base, label: "worktree check", secrets });
    if (head !== configuration.approvedCommit) throw new Error("HEAD is not the approved commit");
    if (branch !== "feat/account-lifecycle-foundation") throw new Error("unexpected release branch");
    if (status) throw new Error("worktree must be clean");
    console.log("PASS repository commit, branch, and clean-worktree checks");
}

async function databaseState(configuration) {
    const client = new Client({ connectionString: configuration.directUrl.toString() });
    try {
        await client.connect();
        const socket = client.connection.stream;
        if (!socket.encrypted || !socket.authorized || socket.servername !== expectedHost) {
            throw new Error("client TLS hostname verification failed");
        }
        await client.query("BEGIN READ ONLY");
        const identity = await client.query(`
            SELECT current_database() AS database,
                   session_user AS session_user,
                   current_user AS current_user,
                   current_setting('server_version_num')::integer AS version
        `);
        const row = identity.rows[0];
        if (
            row?.database !== expectedDatabase
            || row.session_user !== expectedOwner
            || row.current_user !== expectedOwner
            || row.version < 180000
            || row.version >= 190000
        ) {
            throw new Error("database identity, owner, or PostgreSQL version is unexpected");
        }
        const migrations = await client.query(`
            SELECT migration_name, checksum,
                   finished_at IS NOT NULL AS finished,
                   rolled_back_at IS NOT NULL AS rolled_back
            FROM public._prisma_migrations
            ORDER BY migration_name
        `);
        await client.query("ROLLBACK");
        return migrations.rows;
    } catch (error) {
        if (error instanceof Error && (
            error.message.startsWith("client TLS") || error.message.startsWith("database identity")
        )) throw error;
        throw new Error("database connection or migration-history query failed");
    } finally {
        await client.end().catch(() => undefined);
    }
}

async function verifyRetentionBoundary(configuration) {
    const client = new Client({ connectionString: configuration.directUrl.toString() });
    try {
        await client.connect();
        await client.query("BEGIN READ ONLY");
        const result = await client.query(`
            SELECT routine.prosecdef AS security_definer,
                   owner.rolname AS owner,
                   routine.proconfig @> ARRAY['search_path=pg_catalog']::text[] AS fixed_search_path,
                   has_function_privilege('studyspace_maintenance', routine.oid, 'EXECUTE') AS maintenance_execute,
                   has_function_privilege('studyspace_app', routine.oid, 'EXECUTE') AS app_execute,
                   has_function_privilege('studyspace_saved', routine.oid, 'EXECUTE') AS saved_execute,
                   EXISTS (
                       SELECT 1
                       FROM pg_catalog.aclexplode(
                           COALESCE(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
                       ) AS privilege
                       WHERE privilege.grantee = 0
                         AND privilege.privilege_type = 'EXECUTE'
                   ) AS public_execute,
                   has_table_privilege('studyspace_maintenance', 'public."AuthSession"', 'SELECT') AS session_select,
                   has_table_privilege('studyspace_maintenance', 'public."AuthSession"', 'DELETE') AS session_delete,
                   has_table_privilege('studyspace_maintenance', 'public."UserReport"', 'SELECT') AS report_select,
                   has_table_privilege('studyspace_maintenance', 'public."UserReport"', 'DELETE') AS report_delete,
                   has_table_privilege('studyspace_maintenance', 'public."ModerationAction"', 'SELECT') AS audit_select,
                   has_table_privilege('studyspace_maintenance', 'public."ModerationAction"', 'DELETE') AS audit_delete
            FROM pg_catalog.pg_proc routine
            JOIN pg_catalog.pg_namespace namespace ON namespace.oid = routine.pronamespace
            JOIN pg_catalog.pg_roles owner ON owner.oid = routine.proowner
            WHERE namespace.nspname = 'public'
              AND routine.oid = 'public.cleanup_expired_lifecycle_records(integer)'::regprocedure
        `);
        const row = result.rows[0];
        if (
            result.rowCount !== 1 || !row.security_definer || row.owner !== expectedOwner || !row.fixed_search_path
            || !row.maintenance_execute || row.app_execute || row.saved_execute || row.public_execute
            || row.session_select || row.session_delete || row.report_select || row.report_delete
            || row.audit_select || row.audit_delete
        ) {
            throw new Error("retention cleanup ownership or grants are incorrect");
        }
        await client.query("ROLLBACK");
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("retention cleanup")) throw error;
        throw new Error("retention cleanup catalog verification failed");
    } finally {
        await client.end().catch(() => undefined);
    }
    console.log("PASS retention cleanup ownership, fixed search path, and least-privilege grants");
    console.log("NOT VERIFIED cleanup execution; no rehearsal data was deleted");
}

async function main() {
    const command = process.argv[2] ?? "check";
    if (!["check", "apply"].includes(command)) {
        throw new Error("usage: rehearse-retention-migration.mjs check|apply");
    }
    const apply = command === "apply";
    const configuration = readRehearsalConfiguration(process.env, { apply });
    const environments = commandEnvironment(configuration);
    const secrets = {
        url: configuration.directUrl.toString(),
        passwords: [...new Set([configuration.directUrl.password, decodeURIComponent(configuration.directUrl.password)])],
    };
    verifyRepository(configuration, environments, secrets);

    const localMigrations = readLocalMigrations();
    const pending = verifyMigrationHistory(localMigrations, await databaseState(configuration), "resume");
    if (pending.length !== 1 || pending[0] !== retentionMigration) {
        throw new Error("the retention cleanup migration is not the only pending migration");
    }
    console.log("PASS exact disposable endpoint, PostgreSQL 18, TLS, and 14-migration baseline");
    if (!apply) {
        console.log(`PASS read-only rehearsal check; only ${retentionMigration} is pending`);
        return;
    }

    run("npx", ["--no-install", "prisma", "migrate", "deploy"], {
        environment: environments.prisma, label: "Prisma migration deploy", secrets,
    });
    run("psql", ["-X", "--set=ON_ERROR_STOP=1", "--file=scripts/grant-runtime-roles.sql"], {
        environment: environments.psql, label: "runtime grants", secrets,
    });
    run("psql", ["-X", "--set=ON_ERROR_STOP=1", "--file=scripts/staging/verify-database-security.sql"], {
        environment: environments.psql, label: "database security verification", secrets,
    });
    verifyMigrationHistory(localMigrations, await databaseState(configuration), "after");
    await verifyRetentionBoundary(configuration);
    console.log("PASS disposable rehearsal migration, runtime grants, rollback bridge, and all 15 checksums");
    console.log("PASS rehearsal complete; parent staging remains a separate prohibited target");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main().catch((error) => {
        console.error(`FAIL ${error instanceof Error ? error.message : "unexpected rehearsal error"}`);
        process.exitCode = 1;
    });
}

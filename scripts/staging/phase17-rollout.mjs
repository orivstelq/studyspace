#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const expectedProjectId = "curly-paper-15884428";
const expectedBranchName = "production";
const rehearsalBranchId = "br-cold-king-beer2yusy";
const expectedDatabase = "studyspace_staging";
const expectedOwner = "neondb_owner";
const phase17Migrations = [
    "20261110010000_add_account_lifecycle_foundation",
    "20261110013000_harden_lifecycle_actor_fields",
    "20261110014500_invalidate_review_retention_assessment",
    "20261110170000_harden_account_context_authorization",
    "20261110190000_add_lifecycle_retention_cleanup",
];

function required(environment, name) {
    const value = environment[name];
    if (!value) throw new Error(`missing ${name}`);
    return value;
}

function freshConfirmation(value, now = Date.now()) {
    const confirmedAt = Date.parse(value);
    if (!Number.isFinite(confirmedAt) || confirmedAt > now + 60_000 || now - confirmedAt > 30 * 60_000) {
        throw new Error("recovery confirmation must be an ISO timestamp from the last 30 minutes");
    }
}

export function readRolloutConfiguration(environment, { requireRecovery = false, now = Date.now() } = {}) {
    if (required(environment, "STUDYSPACE_NEON_PROJECT_ID") !== expectedProjectId) {
        throw new Error("unexpected Neon project ID");
    }
    if (required(environment, "STUDYSPACE_NEON_BRANCH_NAME") !== expectedBranchName) {
        throw new Error("unexpected Neon branch name");
    }
    const branchId = required(environment, "STUDYSPACE_NEON_BRANCH_ID");
    if (branchId === rehearsalBranchId || !/^br-[a-z0-9-]+$/.test(branchId)) {
        throw new Error("unexpected or disposable Neon branch ID");
    }

    let directUrl;
    try {
        directUrl = new URL(required(environment, "DIRECT_URL"));
    } catch {
        throw new Error("DIRECT_URL must be a valid PostgreSQL URL");
    }
    const expectedHost = required(environment, "STUDYSPACE_STAGING_HOST");
    const blockedParameters = [
        "hostaddr", "service", "servicefile", "passfile", "sslcert", "sslkey",
        "sslpassword", "sslrootcert", "gssencmode", "options",
    ];
    if (
        !["postgres:", "postgresql:"].includes(directUrl.protocol)
        || directUrl.hostname !== expectedHost
        || !expectedHost.endsWith(".neon.tech")
        || expectedHost.includes("-pooler.")
        || expectedHost === "ep-solitary-butterfly-be2qqvk8.c-9.us-east-2.aws.neon.tech"
        || directUrl.pathname !== `/${expectedDatabase}`
        || decodeURIComponent(directUrl.username) !== expectedOwner
        || !directUrl.password
        || blockedParameters.some((parameter) => directUrl.searchParams.has(parameter))
    ) {
        throw new Error("DIRECT_URL is not the approved direct staging-owner endpoint");
    }
    directUrl.searchParams.set("sslmode", "verify-full");

    const approvedCommit = required(environment, "STUDYSPACE_APPROVED_COMMIT");
    if (!/^[0-9a-f]{40}$/.test(approvedCommit)) throw new Error("STUDYSPACE_APPROVED_COMMIT must be a full commit hash");
    if (requireRecovery) {
        if (environment.STUDYSPACE_ROLLOUT_APPROVED !== "yes") throw new Error("staging rollout approval is missing");
        freshConfirmation(required(environment, "STUDYSPACE_RECOVERY_CONFIRMED_AT"), now);
    }

    return { approvedCommit, branchId, directUrl };
}

export function readLocalMigrations(root = projectRoot) {
    const migrationsRoot = resolve(root, "prisma/migrations");
    return readdirSync(migrationsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
            name: entry.name,
            checksum: createHash("sha256")
                .update(readFileSync(resolve(migrationsRoot, entry.name, "migration.sql")))
                .digest("hex"),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
}

export function verifyMigrationHistory(localMigrations, appliedMigrations, stage = "before") {
    const localNames = localMigrations.map(({ name }) => name);
    if (localMigrations.length !== 15 || !phase17Migrations.every((name) => localNames.includes(name))) {
        throw new Error("local migration set is not the reviewed 15-migration chain");
    }
    const baselineCount = localMigrations.length - phase17Migrations.length;
    const expectedAppliedCount = stage === "before"
        ? baselineCount
        : stage === "resume"
            ? appliedMigrations.length
            : localMigrations.length;
    if (
        appliedMigrations.length !== expectedAppliedCount
        || expectedAppliedCount < baselineCount
        || expectedAppliedCount > localMigrations.length
    ) {
        throw new Error("unexpected number of applied migrations");
    }
    const expectedApplied = localMigrations.slice(0, expectedAppliedCount);
    for (const [index, expected] of expectedApplied.entries()) {
        const actual = appliedMigrations[index];
        if (
            actual?.migration_name !== expected.name
            || actual.checksum !== expected.checksum
            || !actual.finished
            || actual.rolled_back
        ) {
            throw new Error("migration history, checksum, or completion state is unexpected");
        }
    }
    return localMigrations.slice(expectedAppliedCount).map(({ name }) => name);
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
    const environment = Object.fromEntries(
        Object.entries(process.env).filter(([name]) => !name.startsWith("PG") && ![
            "DATABASE_URL", "FAVORITES_DATABASE_URL", "MAINTENANCE_DATABASE_URL", "DIRECT_URL",
            "DEBUG", "NODE_DEBUG", "PRISMA_LOG_LEVEL", "RUST_LOG", "RUST_BACKTRACE",
        ].includes(name)),
    );
    const url = configuration.directUrl;
    return {
        base: environment,
        prisma: { ...environment, DIRECT_URL: url.toString() },
        psql: {
            ...environment,
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
    const head = run("git", ["rev-parse", "HEAD"], {
        environment: environments.base, label: "commit check", secrets,
    });
    const branch = run("git", ["branch", "--show-current"], {
        environment: environments.base, label: "branch check", secrets,
    });
    const status = run("git", ["status", "--porcelain"], {
        environment: environments.base, label: "worktree check", secrets,
    });
    if (head !== configuration.approvedCommit) throw new Error("HEAD is not the approved commit");
    if (branch !== "feat/account-lifecycle-foundation") throw new Error("unexpected release branch");
    if (status) throw new Error("worktree must be clean");
    console.log("PASS repository commit, branch, and clean-worktree checks");
}

async function databaseState(configuration) {
    const client = new Client({ connectionString: configuration.directUrl.toString() });
    try {
        await client.connect();
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
        return migrations.rows;
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("database identity")) throw error;
        throw new Error("database connection or migration-history query failed");
    } finally {
        await client.end().catch(() => undefined);
    }
}

async function verifyModerator(configuration, apply) {
    const subject = required(process.env, "STUDYSPACE_MODERATOR_SUBJECT");
    const issuer = required(process.env, "AUTH0_DOMAIN");
    const accountId = required(process.env, "STUDYSPACE_MODERATOR_ACCOUNT_ID");
    const allowlist = required(process.env, "AUTH0_MODERATOR_SUBJECTS").split(",").map((value) => value.trim());
    if (!allowlist.includes(subject)) throw new Error("moderator subject is not in the exact server allowlist");
    if (process.env.STUDYSPACE_MODERATOR_SUBJECT_VERIFIED !== "yes") {
        throw new Error("Auth0 subject verification attestation is missing");
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) {
        throw new Error("moderator account ID is invalid");
    }
    if (apply) {
        if (process.env.STUDYSPACE_MODERATOR_GRANT_APPROVED !== "yes") throw new Error("moderator grant approval is missing");
        freshConfirmation(required(process.env, "STUDYSPACE_MODERATOR_GRANT_CONFIRMED_AT"));
    }
    const identityKey = createHash("sha256").update(JSON.stringify([issuer, subject])).digest("hex");
    const client = new Client({ connectionString: configuration.directUrl.toString() });
    try {
        await client.connect();
        if (apply) await client.query("BEGIN");
        const identity = await client.query(`
            SELECT account."id"
            FROM public."Account" account
            JOIN public."AccountIdentity" identity ON identity."accountId" = account."id"
            WHERE account."id" = $1::uuid
              AND account."state" = 'ACTIVE'
              AND identity."identityKey" = $2
              AND identity."unlinkedAt" IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM public."AccountIdentity" newer
                  WHERE newer."identityKey" = identity."identityKey"
                    AND newer."generation" > identity."generation"
              )
            ${apply ? "FOR UPDATE OF account" : ""}
        `, [accountId, identityKey]);
        if (identity.rowCount !== 1) throw new Error("subject does not match the active current account generation");
        const existing = await client.query(`
            SELECT "revokedAt" FROM public."ModeratorGrant" WHERE "accountId" = $1::uuid
        `, [accountId]);
        if (existing.rowCount) throw new Error("moderator grant already exists; reactivation is a separate procedure");
        if (apply) {
            await client.query(`INSERT INTO public."ModeratorGrant" ("accountId") VALUES ($1::uuid)`, [accountId]);
            await client.query("COMMIT");
        }
    } catch (error) {
        if (apply) await client.query("ROLLBACK").catch(() => undefined);
        if (error instanceof Error && (
            error.message.startsWith("subject does not") || error.message.startsWith("moderator grant")
        )) throw error;
        throw new Error("moderator eligibility check failed");
    } finally {
        await client.end().catch(() => undefined);
    }
    console.log(`PASS moderator ${apply ? "grant provisioned" : "eligibility verified"}`);
}

async function main() {
    const command = process.argv[2] ?? "check";
    if (!["check", "apply", "moderator-check", "moderator-grant"].includes(command)) {
        throw new Error("usage: phase17-rollout.mjs check|apply|moderator-check|moderator-grant");
    }
    const applyRollout = command === "apply";
    const configuration = readRolloutConfiguration(process.env, { requireRecovery: applyRollout });
    const environments = commandEnvironment(configuration);
    const secrets = {
        url: configuration.directUrl.toString(),
        passwords: [...new Set([
            configuration.directUrl.password,
            decodeURIComponent(configuration.directUrl.password),
        ])],
    };
    verifyRepository(configuration, environments, secrets);

    const localMigrations = readLocalMigrations();
    const appliedMigrations = await databaseState(configuration);
    const stage = command.startsWith("moderator-") ? "after" : applyRollout ? "resume" : "before";
    const pending = verifyMigrationHistory(localMigrations, appliedMigrations, stage);
    const migrationState = stage === "before"
        ? "exact Phase 17 pending set"
        : stage === "resume"
            ? "reviewed migration prefix"
            : "complete migration history";
    console.log(`PASS database identity and ${migrationState}`);

    if (command.startsWith("moderator-")) {
        await verifyModerator(configuration, command === "moderator-grant");
        return;
    }

    run("psql", ["-X", "--set=ON_ERROR_STOP=1", "--file=scripts/staging/preflight.sql"], {
        environment: environments.psql, label: "staging preflight", secrets,
    });
    console.log("PASS staging owner, PostgreSQL 18, and permission-role preflight");
    if (!applyRollout) {
        console.log(`PASS read-only rollout check; ${pending.length} reviewed migrations are pending`);
        return;
    }

    console.log("PASS fresh recovery and rollout approvals recorded");
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
    console.log(`PASS all ${localMigrations.length} migrations, runtime grants, ownership, RLS, and security checks`);
    console.log("PASS database rollout complete; application deployment remains a separate approved action");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main().catch((error) => {
        console.error(`FAIL ${error instanceof Error ? error.message : "unexpected rollout error"}`);
        process.exitCode = 1;
    });
}

import { describe, expect, it } from "vitest";
import {
    readLocalMigrations,
    readRolloutConfiguration,
    verifyMigrationHistory,
} from "../../scripts/staging/phase17-rollout.mjs";

const approvedCommit = "a".repeat(40);
const parentHost = "ep-parent-staging.us-east-2.aws.neon.tech";

function connectionUrl({
    host = parentHost,
    database = "studyspace_staging",
    username = "neondb_owner",
    service = false,
} = {}) {
    const directUrl = new URL(`postgresql://${username}@${host}/${database}`);
    directUrl.password = "test-only-password";
    if (service) directUrl.searchParams.set("service", "unsafe");
    return directUrl.toString();
}

function environment(overrides: Record<string, string | undefined> = {}) {
    return {
        DIRECT_URL: connectionUrl(),
        STUDYSPACE_APPROVED_COMMIT: approvedCommit,
        STUDYSPACE_NEON_PROJECT_ID: "curly-paper-15884428",
        STUDYSPACE_NEON_BRANCH_NAME: "production",
        STUDYSPACE_NEON_BRANCH_ID: "br-parent-staging-example",
        STUDYSPACE_STAGING_HOST: parentHost,
        ...overrides,
    };
}

describe("Phase 17 staging rollout guard", () => {
    it("accepts only the exact direct staging-owner boundary and enforces TLS", () => {
        const configuration = readRolloutConfiguration(environment());
        expect(configuration.approvedCommit).toBe(approvedCommit);
        expect(configuration.directUrl.hostname).toBe(parentHost);
        expect(configuration.directUrl.searchParams.get("sslmode")).toBe("verify-full");
    });

    it.each([
        { STUDYSPACE_NEON_PROJECT_ID: "other-project" },
        { STUDYSPACE_NEON_BRANCH_NAME: "rehearsal-account-lifecycle" },
        { STUDYSPACE_NEON_BRANCH_ID: "br-cold-king-beer2yusy" },
        {
            STUDYSPACE_STAGING_HOST: "ep-parent-staging-pooler.us-east-2.aws.neon.tech",
            DIRECT_URL: connectionUrl({ host: "ep-parent-staging-pooler.us-east-2.aws.neon.tech" }),
        },
        {
            STUDYSPACE_STAGING_HOST: "ep-solitary-butterfly-be2qqvk8.c-9.us-east-2.aws.neon.tech",
            DIRECT_URL: connectionUrl({ host: "ep-solitary-butterfly-be2qqvk8.c-9.us-east-2.aws.neon.tech" }),
        },
        { STUDYSPACE_STAGING_HOST: "example.com", DIRECT_URL: connectionUrl({ host: "example.com" }) },
        { DIRECT_URL: connectionUrl({ database: "other_database" }) },
        { DIRECT_URL: connectionUrl({ username: "other" }) },
        { DIRECT_URL: connectionUrl({ service: true }) },
        { STUDYSPACE_APPROVED_COMMIT: "short" },
    ])("rejects an unsafe boundary %#", (override) => {
        expect(() => readRolloutConfiguration(environment(override))).toThrow();
    });

    it("requires fresh recovery evidence and explicit approval before apply", () => {
        const now = Date.parse("2026-11-10T22:00:00Z");
        expect(() => readRolloutConfiguration(environment(), { requireRecovery: true, now })).toThrow(/approval/);
        expect(() => readRolloutConfiguration(environment({
            STUDYSPACE_ROLLOUT_APPROVED: "yes",
            STUDYSPACE_RECOVERY_CONFIRMED_AT: "2026-11-10T21:00:00Z",
        }), { requireRecovery: true, now })).toThrow(/last 30 minutes/);
        expect(readRolloutConfiguration(environment({
            STUDYSPACE_ROLLOUT_APPROVED: "yes",
            STUDYSPACE_RECOVERY_CONFIRMED_AT: "2026-11-10T21:45:00Z",
        }), { requireRecovery: true, now }).approvedCommit).toBe(approvedCommit);
    });

    it("permits exactly the four reviewed Phase 17 migrations before rollout", () => {
        const local = readLocalMigrations();
        const applied = local.slice(0, 10).map((migration) => ({
            migration_name: migration.name,
            checksum: migration.checksum,
            finished: true,
            rolled_back: false,
        }));
        expect(verifyMigrationHistory(local, applied, "before")).toEqual(local.slice(10).map(({ name }) => name));
        expect(verifyMigrationHistory(local, local.map((migration) => ({
            migration_name: migration.name,
            checksum: migration.checksum,
            finished: true,
            rolled_back: false,
        })), "after")).toEqual([]);
    });

    it("rejects failed, reordered, extra, or checksum-mismatched histories", () => {
        const local = readLocalMigrations();
        const baseline = local.slice(0, 10).map((migration) => ({
            migration_name: migration.name,
            checksum: migration.checksum,
            finished: true,
            rolled_back: false,
        }));
        expect(() => verifyMigrationHistory(local, baseline.slice(0, -1), "before")).toThrow();
        expect(() => verifyMigrationHistory(local, [...baseline, baseline[0]], "before")).toThrow();
        expect(() => verifyMigrationHistory(local, baseline.map((row, index) => (
            index === 0 ? { ...row, checksum: "wrong" } : row
        )), "before")).toThrow();
        expect(() => verifyMigrationHistory(local, baseline.map((row, index) => (
            index === 0 ? { ...row, finished: false } : row
        )), "before")).toThrow();
    });

    it("resumes only from a checksum-valid prefix of the reviewed Phase 17 set", () => {
        const local = readLocalMigrations();
        const applied = local.slice(0, 12).map((migration) => ({
            migration_name: migration.name,
            checksum: migration.checksum,
            finished: true,
            rolled_back: false,
        }));
        expect(verifyMigrationHistory(local, applied, "resume")).toEqual(local.slice(12).map(({ name }) => name));
        expect(() => verifyMigrationHistory(local, [
            ...applied.slice(0, 11),
            { ...applied[11], migration_name: local[13].name },
        ], "resume")).toThrow();
        expect(() => verifyMigrationHistory(local, applied.slice(0, 9), "resume")).toThrow();
    });
});

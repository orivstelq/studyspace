import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readRehearsalConfiguration } from "../../scripts/staging/rehearse-retention-migration.mjs";

const approvedCommit = "a".repeat(40);
const rehearsalHost = "ep-solitary-butterfly-be2qqvk8.c-9.us-east-2.aws.neon.tech";

function connectionUrl({
    host = rehearsalHost,
    database = "studyspace_staging",
    username = "neondb_owner",
    parameter,
}: {
    host?: string;
    database?: string;
    username?: string;
    parameter?: string;
} = {}) {
    const directUrl = new URL(`postgresql://${username}@${host}/${database}`);
    directUrl.password = "test-only-password";
    if (parameter) directUrl.searchParams.set(parameter, "unsafe");
    return directUrl.toString();
}

function environment(overrides: Record<string, string | undefined> = {}) {
    return {
        DIRECT_URL: connectionUrl(),
        STUDYSPACE_APPROVED_COMMIT: approvedCommit,
        STUDYSPACE_NEON_PROJECT_ID: "curly-paper-15884428",
        STUDYSPACE_NEON_BRANCH_ID: "br-cold-king-beer2yusy",
        STUDYSPACE_NEON_BRANCH_NAME: "rehearsal-account-lifecycle",
        ...overrides,
    };
}

describe("retention migration rehearsal guard", () => {
    it("accepts only the exact disposable owner endpoint and forces hostname-verified TLS", () => {
        const configuration = readRehearsalConfiguration(environment());

        expect(configuration.approvedCommit).toBe(approvedCommit);
        expect(configuration.directUrl.hostname).toBe(rehearsalHost);
        expect(configuration.directUrl.searchParams.get("sslmode")).toBe("verify-full");
    });

    it.each([
        { STUDYSPACE_NEON_PROJECT_ID: "other-project" },
        { STUDYSPACE_NEON_BRANCH_ID: "br-parent-staging" },
        { STUDYSPACE_NEON_BRANCH_NAME: "production" },
        { DIRECT_URL: connectionUrl({ host: `ep-parent.${rehearsalHost.split(".").slice(1).join(".")}` }) },
        { DIRECT_URL: connectionUrl({ host: rehearsalHost.replace(".c-9.", "-pooler.c-9.") }) },
        { DIRECT_URL: connectionUrl({ database: "other_database" }) },
        { DIRECT_URL: connectionUrl({ username: "studyspace_staging_app_login" }) },
        { DIRECT_URL: connectionUrl({ parameter: "service" }) },
        { DIRECT_URL: connectionUrl({ parameter: "ssl" }) },
        { DIRECT_URL: connectionUrl({ parameter: "sslrootcert" }) },
        { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
        { STUDYSPACE_APPROVED_COMMIT: "short" },
    ])("rejects a mismatched or overrideable rehearsal boundary %#", (override) => {
        expect(() => readRehearsalConfiguration(environment(override))).toThrow();
    });

    it("requires explicit, recent approval only for mutation mode", () => {
        const now = Date.parse("2026-11-10T22:00:00Z");

        expect(readRehearsalConfiguration(environment(), { now }).approvedCommit).toBe(approvedCommit);
        expect(() => readRehearsalConfiguration(environment(), { apply: true, now })).toThrow(/approval/);
        expect(() => readRehearsalConfiguration(environment({
            STUDYSPACE_REHEARSAL_APPROVED: "yes",
            STUDYSPACE_REHEARSAL_CONFIRMED_AT: "2026-11-10T21:00:00Z",
        }), { apply: true, now })).toThrow(/last 30 minutes/);
        expect(readRehearsalConfiguration(environment({
            STUDYSPACE_REHEARSAL_APPROVED: "yes",
            STUDYSPACE_REHEARSAL_CONFIRMED_AT: "2026-11-10T21:45:00Z",
        }), { apply: true, now }).approvedCommit).toBe(approvedCommit);
    });

    it("keeps secrets out of arguments and separates read-only check from apply", () => {
        const script = readFileSync("scripts/staging/rehearse-retention-migration.mjs", "utf8");

        expect(script).not.toContain('import "dotenv/config"');
        expect(script).toContain('PGSSLMODE: "verify-full"');
        expect(script).toContain('PGSSLROOTCERT: "system"');
        expect(script).toContain("client.connection.stream");
        expect(script.match(/BEGIN READ ONLY/g)).toHaveLength(2);
        expect(script).toContain('configuration.directUrl.password');
        expect(script).not.toContain("console.log(configuration.directUrl");
        expect(script).toContain('pending[0] !== retentionMigration');
        for (const table of ["AuthSession", "UserReport", "ModerationAction"]) {
            for (const privilege of ["SELECT", "DELETE"]) {
                expect(script).toContain(`has_table_privilege('studyspace_maintenance', 'public."${table}"', '${privilege}')`);
            }
        }
        expect(script.indexOf("if (!apply)")).toBeLessThan(script.indexOf('"prisma", "migrate", "deploy"'));
        expect(script).toContain("NOT VERIFIED cleanup execution; no rehearsal data was deleted");
    });
});

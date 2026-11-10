import { describe, expect, it } from "vitest";
import {
    getTestDatabaseName,
    getTestDatabaseUrl,
    type TestDatabaseEnvironment,
    type TestDatabaseUrlKey,
} from "../helpers/test-database";

const connections = {
    DIRECT_URL: "postgresql://owner@localhost:5432/studyspace_dev",
    DATABASE_URL: "postgresql://app@127.0.0.1:5432/studyspace_dev",
    FAVORITES_DATABASE_URL: "postgres://saved@localhost:5432/studyspace_dev",
} satisfies TestDatabaseEnvironment;

function environment(overrides: TestDatabaseEnvironment = {}): TestDatabaseEnvironment {
    return { ...connections, ...overrides };
}

describe("integration test database selection", () => {
    it("defaults to studyspace_test only when no override is present", () => {
        const env = environment();
        expect(getTestDatabaseName(env)).toBe("studyspace_test");
        expect(new URL(getTestDatabaseUrl("DIRECT_URL", env)).pathname).toBe("/studyspace_test");
    });

    it("accepts an explicit studyspace_test selection", () => {
        expect(getTestDatabaseName(environment({
            STUDYSPACE_TEST_DATABASE: "studyspace_test",
        }))).toBe("studyspace_test");
    });

    it("routes every database role to the explicitly selected recovery database", () => {
        const env = environment({ STUDYSPACE_TEST_DATABASE: "studyspace_test_recovery" });
        for (const key of Object.keys(connections) as TestDatabaseUrlKey[]) {
            const url = new URL(getTestDatabaseUrl(key, env));
            expect(url.pathname).toBe("/studyspace_test_recovery");
            expect(url.search).toBe("");
            expect(url.hash).toBe("");
        }
    });

    it.each([
        "",
        " ",
        "studyspace_staging",
        "studyspace_dev",
        "studyspace_test_recovery ",
        "studyspace_test/other",
    ])("rejects unsafe database selection %j", (database) => {
        expect(() => getTestDatabaseName(environment({
            STUDYSPACE_TEST_DATABASE: database,
        }))).toThrow(/STUDYSPACE_TEST_DATABASE/);
    });

    it.each([
        "postgresql://owner@example.com:5432/studyspace_dev",
        "postgresql://owner@localhost.evil:5432/studyspace_dev",
        "postgresql://owner@localhost:5432/studyspace_staging",
        "postgresql://owner@localhost:5432/studyspace_test_recovery",
        "https://localhost:5432/studyspace_dev",
        "not-a-url",
    ])("rejects unsafe source URL %j", (value) => {
        expect(() => getTestDatabaseUrl("DIRECT_URL", environment({ DIRECT_URL: value })))
            .toThrow(/local studyspace_dev PostgreSQL URL/);
    });

    it("rejects a missing role connection", () => {
        expect(() => getTestDatabaseUrl("FAVORITES_DATABASE_URL", environment({
            FAVORITES_DATABASE_URL: undefined,
        }))).toThrow("FAVORITES_DATABASE_URL is missing");
    });
});

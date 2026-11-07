import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOCAL_PLAYWRIGHT_BASE_URL, resolvePlaywrightBaseUrl } from "../../../playwright-origin";

describe("staging preparation", () => {
    it("uses localhost by default and accepts only an explicit HTTPS origin", () => {
        expect(resolvePlaywrightBaseUrl(undefined)).toBe(LOCAL_PLAYWRIGHT_BASE_URL);
        expect(resolvePlaywrightBaseUrl("https://staging.example.test/")).toBe("https://staging.example.test");
        for (const value of [
            "http://staging.example.test",
            "https://user:secret@staging.example.test",
            "https://staging.example.test/path",
            "https://staging.example.test?debug=1",
        ]) {
            expect(() => resolvePlaywrightBaseUrl(value)).toThrow("origin-only HTTPS URL");
        }
    });

    it("keeps every staging identity NOLOGIN until supported password prompts finish", () => {
        const script = readFileSync("scripts/staging/create-login-identities.sql", "utf8");
        expect(script).not.toContain("\\prompt");
        const firstPassword = script.indexOf("\\password studyspace_staging_app_login");
        const lastPassword = script.indexOf("\\password studyspace_staging_maintenance_login");
        const enableLogin = script.indexOf("ALTER ROLE studyspace_staging_app_login LOGIN");
        expect(script).not.toMatch(/CREATE ROLE studyspace_staging_\w+_login LOGIN/);
        expect(script).toContain("NOINHERIT NOREPLICATION NOBYPASSRLS");
        expect(script).toContain("pg_catalog.pg_auth_members");
        expect(firstPassword).toBeGreaterThan(script.indexOf("NOLOGIN PASSWORD NULL"));
        expect(enableLogin).toBeGreaterThan(lastPassword);
        expect(script.indexOf("BEGIN;", lastPassword)).toBeLessThan(enableLogin);
        expect(script.indexOf("COMMIT;", enableLogin)).toBeGreaterThan(enableLogin);
        expect(script.match(/\\password studyspace_staging_\w+_login/g)).toHaveLength(3);
        expect(script.match(/ALTER ROLE studyspace_staging_\w+_login LOGIN/g)).toHaveLength(3);
    });
});

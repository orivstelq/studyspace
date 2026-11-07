import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./headers";

describe("production security headers", () => {
    it("uses a restrictive production CSP without eval, wildcards, or browser Auth0 access", () => {
        const policy = contentSecurityPolicy({ development: false, appBaseUrl: "https://studyspace.example" });
        expect(policy).toContain("default-src 'self'");
        expect(policy).toContain("script-src-attr 'none'");
        expect(policy).toContain("frame-ancestors 'none'");
        expect(policy).toContain("upgrade-insecure-requests");
        expect(policy).not.toContain("'unsafe-eval'");
        expect(policy).not.toContain("*");
        expect(policy).not.toContain("auth0.com");
    });

    it("adds HSTS only for an HTTPS production origin", () => {
        const production = securityHeaders({ development: false, appBaseUrl: "https://studyspace.example" });
        expect(production).toContainEqual({
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
        });
        expect(securityHeaders({ development: false, appBaseUrl: "http://localhost:3000" }))
            .not.toContainEqual(expect.objectContaining({ key: "Strict-Transport-Security" }));
        expect(securityHeaders({ development: true, appBaseUrl: "https://studyspace.example" }))
            .not.toContainEqual(expect.objectContaining({ key: "Strict-Transport-Security" }));
    });

    it("allows eval only for the Next.js development runtime", () => {
        expect(contentSecurityPolicy({ development: true, appBaseUrl: "http://localhost:3000" }))
            .toContain("'unsafe-eval'");
    });
});

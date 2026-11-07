import { afterEach, describe, expect, it, vi } from "vitest";
import {
    clientAddress, enforceRateLimit, rateLimitHeaders, rateLimitKey, RATE_LIMITS,
} from "./rate-limit";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/private-client", () => ({ privateDatabase: vi.fn() }));

afterEach(() => vi.unstubAllEnvs());

describe("rate limiting", () => {
    it("trusts only Vercel's preserved address header in Vercel mode", () => {
        vi.stubEnv("TRUSTED_CLIENT_IP_SOURCE", "vercel");
        expect(clientAddress(new Headers({
            "x-vercel-forwarded-for": "203.0.113.8",
            "x-forwarded-for": "198.51.100.2, 10.0.0.1",
            "x-real-ip": "198.51.100.3",
        }))).toBe("203.0.113.8");
        expect(clientAddress(new Headers({
            "x-vercel-forwarded-for": "2001:db8::8",
        }))).toBe("2001:db8::8");
    });

    it("uses one fail-safe bucket for missing or malformed trusted addresses", () => {
        vi.stubEnv("TRUSTED_CLIENT_IP_SOURCE", "vercel");
        expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.8" })))
            .toBe("shared-unidentified-vercel-client");
        expect(clientAddress(new Headers({ "x-vercel-forwarded-for": "203.0.113.8, 10.0.0.1" })))
            .toBe("shared-unidentified-vercel-client");
        expect(clientAddress(new Headers({ "x-vercel-forwarded-for": "not-an-ip" })))
            .toBe("shared-unidentified-vercel-client");
    });

    it("fails closed for missing or unsupported production ingress configuration", () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("TRUSTED_CLIENT_IP_SOURCE", "");
        expect(() => clientAddress(new Headers({ "x-forwarded-for": "203.0.113.8" })))
            .toThrow(/must be 'vercel' or 'shared'/);
        vi.stubEnv("TRUSTED_CLIENT_IP_SOURCE", "x-forwarded-for");
        expect(() => clientAddress(new Headers({ "x-forwarded-for": "203.0.113.8" })))
            .toThrow(/must be 'vercel' or 'shared'/);
    });

    it("defaults non-production environments to one shared bucket", () => {
        expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.8" })))
            .toBe("shared-untrusted-ingress");
    });

    it("pseudonymizes subjects with a scoped HMAC", () => {
        vi.stubEnv("RATE_LIMIT_SECRET", "unit-test-rate-limit-secret-that-is-not-production");
        const first = rateLimitKey(RATE_LIMITS.publicSearch, "203.0.113.8");
        expect(first).toMatch(/^[a-f0-9]{64}$/);
        expect(first).not.toContain("203.0.113.8");
        expect(rateLimitKey(RATE_LIMITS.publicSearch, "203.0.113.8")).toBe(first);
        expect(rateLimitKey(RATE_LIMITS.reportSubmission, "203.0.113.8")).not.toBe(first);
    });

    it("rejects missing or weak production pseudonymization secrets", () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("RATE_LIMIT_SECRET", "short");
        expect(() => rateLimitKey(RATE_LIMITS.publicSearch, "subject")).toThrow(/32 bytes/);
        vi.stubEnv("RATE_LIMIT_SECRET", "");
        expect(() => rateLimitKey(RATE_LIMITS.publicSearch, "subject")).toThrow(/required/);
    });

    it("returns standard limit metadata from the atomic counter", async () => {
        vi.stubEnv("RATE_LIMIT_SECRET", "unit-test-rate-limit-secret-that-is-not-production");
        const resetAt = new Date(Date.now() + 30_000);
        const database = { $queryRaw: vi.fn().mockResolvedValue([{ count: 61, resetAt }]) };
        const result = await enforceRateLimit(RATE_LIMITS.publicSearch, "subject", database as never);
        expect(result).toMatchObject({ allowed: false, limit: 60, remaining: 0 });
        expect(result.retryAfter).toBeGreaterThan(0);
        expect(rateLimitHeaders(result)).toMatchObject({
            "RateLimit-Limit": "60",
            "RateLimit-Remaining": "0",
            "Retry-After": expect.any(String),
        });
    });
});

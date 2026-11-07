import { afterEach, describe, expect, it, vi } from "vitest";
import {
    clientAddress, enforceRateLimit, rateLimitHeaders, rateLimitKey, RATE_LIMITS,
} from "./rate-limit";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/private-client", () => ({ privateDatabase: vi.fn() }));

afterEach(() => vi.unstubAllEnvs());

describe("rate limiting", () => {
    it("prefers the first proxy address and has a safe fallback", () => {
        expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.8, 10.0.0.1" }))).toBe("203.0.113.8");
        expect(clientAddress(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
        expect(clientAddress(new Headers())).toBe("unknown");
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

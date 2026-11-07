import { afterEach, describe, expect, it, vi } from "vitest";
import { configuredPoolSize } from "./pool";

afterEach(() => vi.unstubAllEnvs());

describe("database pool configuration", () => {
    it("uses a bounded configurable pool size", () => {
        expect(configuredPoolSize("DATABASE_POOL_MAX")).toBe(5);
        vi.stubEnv("DATABASE_POOL_MAX", "2");
        expect(configuredPoolSize("DATABASE_POOL_MAX")).toBe(2);
        vi.stubEnv("DATABASE_POOL_MAX", "100");
        expect(() => configuredPoolSize("DATABASE_POOL_MAX")).toThrow(/1 to 20/);
    });
});

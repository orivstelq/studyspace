import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Explore rendering", () => {
    it.each(["src/app/explore/page.tsx", "src/app/api/spaces/route.ts"])(
        "%s waits for a request before invoking the shared rate limiter",
        (path) => {
            const source = readFileSync(path, "utf8");
            const runtimeBoundary = source.indexOf("await connection()");
            const rateLimit = source.indexOf("await enforceRateLimit");

            expect(runtimeBoundary).toBeGreaterThan(-1);
            expect(rateLimit).toBeGreaterThan(runtimeBoundary);
        },
    );
});

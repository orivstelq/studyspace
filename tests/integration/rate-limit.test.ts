import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { enforceRateLimit, rateLimitKey } from "../../src/lib/security/rate-limit";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/private-client", () => ({ privateDatabase: vi.fn() }));

function testClient(key: "DIRECT_URL" | "FAVORITES_DATABASE_URL" | "DATABASE_URL") {
    const url = new URL(process.env[key] ?? "");
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/studyspace_dev") {
        throw new Error(`Unsafe ${key}: expected a local studyspace_dev URL`);
    }
    url.pathname = "/studyspace_test";
    url.search = "";
    url.hash = "";
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 8 }) });
}

describe("shared PostgreSQL rate limiting", () => {
    const admin = testClient("DIRECT_URL");
    const saved = testClient("FAVORITES_DATABASE_URL");
    const discovery = testClient("DATABASE_URL");
    const subject = randomUUID();
    const policy = { scope: `integration-${randomUUID()}`, limit: 5, windowMs: 60_000 } as const;

    afterAll(async () => {
        await admin.rateLimitBucket.deleteMany({ where: { key: rateLimitKey(policy, subject) } });
        await Promise.all([admin.$disconnect(), saved.$disconnect(), discovery.$disconnect()]);
    });

    it("atomically enforces one shared limit across concurrent callers", async () => {
        const results = await Promise.all(
            Array.from({ length: 8 }, () => enforceRateLimit(policy, subject, saved)),
        );
        expect(results.filter(({ allowed }) => allowed)).toHaveLength(5);
        expect(results.filter(({ allowed }) => !allowed)).toHaveLength(3);
        expect(await admin.rateLimitBucket.findUnique({
            where: { key: rateLimitKey(policy, subject) },
            select: { count: true },
        })).toEqual({ count: 8 });
    });

    it("keeps rate-limit storage inaccessible to the public application role", async () => {
        await expect(discovery.rateLimitBucket.findMany()).rejects.toThrow();
    });

    it("starts a fresh window after the stored reset time", async () => {
        await admin.rateLimitBucket.update({
            where: { key: rateLimitKey(policy, subject) },
            data: { resetAt: new Date("2000-01-01T00:00:00.000Z") },
        });
        await expect(enforceRateLimit(policy, subject, saved)).resolves.toMatchObject({
            allowed: true,
            remaining: 4,
        });
    });
});

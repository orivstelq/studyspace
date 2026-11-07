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
    const cleanupKeys = [0, 1, 2, 3].map(() => randomUUID().replaceAll("-", ""));

    afterAll(async () => {
        await admin.rateLimitBucket.deleteMany({ where: { key: rateLimitKey(policy, subject) } });
        await admin.rateLimitBucket.deleteMany({ where: { key: { in: cleanupKeys } } });
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

    it("gives maintenance only bounded cleanup execution", async () => {
        const privileges = await admin.$queryRaw<Array<{
            tableRead: boolean; tableDelete: boolean; cleanup: boolean;
            appCleanup: boolean; savedCleanup: boolean;
        }>>`
            SELECT
                has_table_privilege('studyspace_maintenance', 'public."RateLimitBucket"', 'SELECT') AS "tableRead",
                has_table_privilege('studyspace_maintenance', 'public."RateLimitBucket"', 'DELETE') AS "tableDelete",
                has_function_privilege(
                    'studyspace_maintenance',
                    'public.cleanup_expired_rate_limit_buckets(integer)',
                    'EXECUTE'
                ) AS cleanup,
                has_function_privilege(
                    'studyspace_app',
                    'public.cleanup_expired_rate_limit_buckets(integer)',
                    'EXECUTE'
                ) AS "appCleanup",
                has_function_privilege(
                    'studyspace_saved',
                    'public.cleanup_expired_rate_limit_buckets(integer)',
                    'EXECUTE'
                ) AS "savedCleanup"
        `;
        expect(privileges[0]).toEqual({
            tableRead: false, tableDelete: false, cleanup: true,
            appCleanup: false, savedCleanup: false,
        });

        await admin.rateLimitBucket.createMany({ data: cleanupKeys.map((key, index) => ({
            key,
            count: 1,
            resetAt: index < 3 ? new Date("2000-01-01T00:00:00.000Z") : new Date("2100-01-01T00:00:00.000Z"),
        })) });
        const first = await admin.$queryRaw<Array<{ deleted: number }>>`
            SELECT public.cleanup_expired_rate_limit_buckets(2) AS deleted
        `;
        expect(first).toEqual([{ deleted: 2 }]);
        expect(await admin.rateLimitBucket.count({ where: { key: { in: cleanupKeys } } })).toBe(2);
        const second = await admin.$queryRaw<Array<{ deleted: number }>>`
            SELECT public.cleanup_expired_rate_limit_buckets(2) AS deleted
        `;
        expect(second).toEqual([{ deleted: 1 }]);
        expect(await admin.rateLimitBucket.findMany({
            where: { key: { in: cleanupKeys } }, select: { key: true },
        })).toEqual([{ key: cleanupKeys[3] }]);
    });
});

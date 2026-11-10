import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { enforceRateLimit, rateLimitKey } from "../../src/lib/security/rate-limit";
import { getTestDatabaseUrl, type TestDatabaseUrlKey } from "../helpers/test-database";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/private-client", () => ({ privateDatabase: vi.fn() }));

function testClient(key: TestDatabaseUrlKey) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: getTestDatabaseUrl(key), max: 8 }) });
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
            lifecycleCleanup: boolean; lifecycleTableRead: boolean; lifecycleTableDelete: boolean;
            appCleanup: boolean; savedCleanup: boolean; appLifecycleCleanup: boolean; savedLifecycleCleanup: boolean;
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
                    'studyspace_maintenance',
                    'public.cleanup_expired_lifecycle_records(integer)',
                    'EXECUTE'
                ) AS "lifecycleCleanup",
                has_table_privilege('studyspace_maintenance', 'public."AuthSession"', 'SELECT')
                    OR has_table_privilege('studyspace_maintenance', 'public."UserReport"', 'SELECT')
                    OR has_table_privilege('studyspace_maintenance', 'public."ModerationAction"', 'SELECT')
                    AS "lifecycleTableRead",
                has_table_privilege('studyspace_maintenance', 'public."AuthSession"', 'DELETE')
                    OR has_table_privilege('studyspace_maintenance', 'public."UserReport"', 'DELETE')
                    OR has_table_privilege('studyspace_maintenance', 'public."ModerationAction"', 'DELETE')
                    AS "lifecycleTableDelete",
                has_function_privilege(
                    'studyspace_app',
                    'public.cleanup_expired_rate_limit_buckets(integer)',
                    'EXECUTE'
                ) AS "appCleanup",
                has_function_privilege(
                    'studyspace_saved',
                    'public.cleanup_expired_rate_limit_buckets(integer)',
                    'EXECUTE'
                ) AS "savedCleanup",
                has_function_privilege(
                    'studyspace_app',
                    'public.cleanup_expired_lifecycle_records(integer)',
                    'EXECUTE'
                ) AS "appLifecycleCleanup",
                has_function_privilege(
                    'studyspace_saved',
                    'public.cleanup_expired_lifecycle_records(integer)',
                    'EXECUTE'
                ) AS "savedLifecycleCleanup"
        `;
        expect(privileges[0]).toEqual({
            tableRead: false, tableDelete: false, cleanup: true,
            lifecycleCleanup: true, lifecycleTableRead: false, lifecycleTableDelete: false,
            appCleanup: false, savedCleanup: false, appLifecycleCleanup: false, savedLifecycleCleanup: false,
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

    it("removes only lifecycle rows past approved limits and honors active audit holds", async () => {
        const rollback = new Error("ROLLBACK LIFECYCLE CLEANUP FIXTURES");
        await expect(admin.$transaction(async (tx) => {
            const now = new Date();
            const old = new Date("2000-01-01T00:00:00.000Z");
            const listing = await tx.studySpace.create({ data: {
                slug: `retention-${randomUUID()}`,
                name: "Retention cleanup fixture",
                description: "Rolled-back lifecycle cleanup verification fixture.",
                category: "LIBRARY",
                city: "Test",
                region: "TX",
                status: "DRAFT",
                sourceType: "DEVELOPMENT_FIXTURE",
            } });
            const expiredSessionId = randomUUID().replaceAll("-", "");
            const activeSessionId = randomUUID().replaceAll("-", "");
            await tx.authSession.createMany({ data: [
                {
                    id: expiredSessionId,
                    subject: "cleanup|expired",
                    providerSessionId: `cleanup-${randomUUID()}`,
                    createdAt: 0,
                    expiresAt: old,
                },
                {
                    id: activeSessionId,
                    subject: "cleanup|active",
                    providerSessionId: `cleanup-${randomUUID()}`,
                    createdAt: Math.floor(now.getTime() / 1000),
                    expiresAt: new Date(now.getTime() + 60_000),
                },
            ] });
            const expiredReport = await tx.userReport.create({ data: {
                targetType: "LISTING",
                listingId: listing.id,
                targetReferenceId: listing.id,
                reason: "OTHER",
                status: "RESOLVED",
                resolvedAt: old,
                reporterUnlinkedAt: old,
            } });
            const recentReport = await tx.userReport.create({ data: {
                targetType: "LISTING",
                listingId: listing.id,
                targetReferenceId: listing.id,
                reason: "OTHER",
                status: "RESOLVED",
                resolvedAt: now,
                reporterUnlinkedAt: now,
            } });
            const openReport = await tx.userReport.create({ data: {
                targetType: "LISTING",
                listingId: listing.id,
                targetReferenceId: listing.id,
                reason: "OTHER",
                reporterUnlinkedAt: now,
            } });
            const expiredAction = await tx.moderationAction.create({ data: {
                action: "REPORT_RESOLVED",
                targetReferenceId: randomUUID(),
                createdAt: old,
                moderatorUnlinkedAt: old,
            } });
            const heldAction = await tx.moderationAction.create({ data: {
                action: "REPORT_RESOLVED",
                targetReferenceId: randomUUID(),
                createdAt: old,
                moderatorUnlinkedAt: old,
            } });
            const recentAction = await tx.moderationAction.create({ data: {
                action: "REPORT_RESOLVED",
                targetReferenceId: randomUUID(),
                createdAt: now,
                moderatorUnlinkedAt: now,
            } });
            await tx.retentionHold.create({ data: {
                moderationActionId: heldAction.id,
                caseReference: "cleanup-integration-hold",
                reason: "Verify an active, finite hold blocks cleanup.",
                approvedBy: "integration-test",
                reviewAt: now,
                expiresAt: new Date(now.getTime() + 60_000),
            } });

            const result = await tx.$queryRaw<Array<{
                expiredSessionsDeleted: number;
                resolvedReportsDeleted: number;
                moderationActionsDeleted: number;
            }>>`
                SELECT expired_sessions_deleted AS "expiredSessionsDeleted",
                       resolved_reports_deleted AS "resolvedReportsDeleted",
                       moderation_actions_deleted AS "moderationActionsDeleted"
                FROM public.cleanup_expired_lifecycle_records(1000)
            `;
            expect(result[0].expiredSessionsDeleted).toBeGreaterThanOrEqual(1);
            expect(result[0].resolvedReportsDeleted).toBeGreaterThanOrEqual(1);
            expect(result[0].moderationActionsDeleted).toBeGreaterThanOrEqual(1);
            expect(await tx.authSession.findUnique({ where: { id: expiredSessionId } })).toBeNull();
            expect(await tx.authSession.findUnique({ where: { id: activeSessionId } })).not.toBeNull();
            expect(await tx.userReport.findUnique({ where: { id: expiredReport.id } })).toBeNull();
            expect(await tx.userReport.findUnique({ where: { id: recentReport.id } })).not.toBeNull();
            expect(await tx.userReport.findUnique({ where: { id: openReport.id } })).not.toBeNull();
            expect(await tx.moderationAction.findUnique({ where: { id: expiredAction.id } })).toBeNull();
            expect(await tx.moderationAction.findUnique({ where: { id: heldAction.id } })).not.toBeNull();
            expect(await tx.moderationAction.findUnique({ where: { id: recentAction.id } })).not.toBeNull();
            throw rollback;
        })).rejects.toThrow(rollback.message);
    });
});

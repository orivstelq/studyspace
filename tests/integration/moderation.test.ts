import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { withPrivateContext } from "../../src/lib/db/private-context";
import { resolveAccountIdentity } from "../../src/features/account-lifecycle/repository";
import {
    getOwnReview, listApprovedReviews, listModerationQueue, moderateReview,
    resolveReport, saveOwnReview, submitContentReport, withdrawOwnReview,
} from "../../src/features/reviews/query";
import { getTestDatabaseUrl, type TestDatabaseUrlKey } from "../helpers/test-database";

function testClient(key: TestDatabaseUrlKey) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: getTestDatabaseUrl(key), max: 3 }) });
}

describe("reviews, reports, and moderation", () => {
    const admin = testClient("DIRECT_URL");
    const saved = testClient("FAVORITES_DATABASE_URL");
    const discovery = testClient("DATABASE_URL");
    const ownerKey = randomBytes(32).toString("hex");
    const strangerKey = randomBytes(32).toString("hex");
    const moderatorKey = randomBytes(32).toString("hex");
    let owner: string;
    let stranger: string;
    let ownerIdentity: { accountId: string; ownerKey: string };
    let strangerIdentity: { accountId: string; ownerKey: string };
    let moderator: { accountId: string; ownerKey: string; isModerator: true };
    let nonModerator: { accountId: string; ownerKey: string; isModerator: false };
    const spaces = [0, 1, 2, 3].map(() => ({ id: randomUUID(), slug: `test-${randomUUID()}` }));

    beforeAll(async () => {
        owner = (await resolveAccountIdentity(saved, ownerKey))!;
        stranger = (await resolveAccountIdentity(saved, strangerKey))!;
        ownerIdentity = { accountId: owner, ownerKey };
        strangerIdentity = { accountId: stranger, ownerKey: strangerKey };
        moderator = { accountId: (await resolveAccountIdentity(saved, moderatorKey))!, ownerKey: moderatorKey, isModerator: true };
        nonModerator = { accountId: owner, ownerKey, isModerator: false };
        await admin.moderatorGrant.create({ data: { accountId: moderator.accountId } });
        for (const [index, space] of spaces.entries()) {
            await admin.studySpace.create({ data: {
                ...space, name: "Moderation test", description: "Temporary test listing",
                category: "LIBRARY", city: "Test", region: "TX", status: index === 3 ? "DRAFT" : "PUBLISHED", sourceType: "OFFICIAL",
            } });
        }
    });

    afterAll(async () => {
        try {
            await admin.moderationAction.deleteMany({ where: { OR: [{ review: { studySpaceId: { in: spaces.map(({ id }) => id) } } }, { report: { OR: [{ listingId: { in: spaces.map(({ id }) => id) } }, { review: { studySpaceId: { in: spaces.map(({ id }) => id) } } }] } }] } });
            await admin.userReport.deleteMany({ where: { OR: [{ listingId: { in: spaces.map(({ id }) => id) } }, { review: { studySpaceId: { in: spaces.map(({ id }) => id) } } }] } });
            await admin.review.deleteMany({ where: { studySpaceId: { in: spaces.map(({ id }) => id) } } });
            await admin.studySpace.deleteMany({ where: { id: { in: spaces.map(({ id }) => id) } } });
            const accountIds = [owner, stranger, moderator.accountId];
            await admin.moderatorGrant.deleteMany({ where: { accountId: { in: accountIds } } });
            await admin.accountIdentity.deleteMany({ where: { accountId: { in: accountIds } } });
            await admin.account.deleteMany({ where: { id: { in: accountIds } } });
        } finally {
            await Promise.all([admin.$disconnect(), saved.$disconnect(), discovery.$disconnect()]);
        }
    });

    it("keeps pending reviews private and blocks guests and other accounts", async () => {
        const created = await saveOwnReview(saved, ownerIdentity, spaces[0].slug, 4, "This pending review contains enough useful detail.");
        expect(created).not.toBeNull();
        await saveOwnReview(saved, ownerIdentity, spaces[0].slug, 5, "This permitted edit keeps the original review identity.");
        expect(await getOwnReview(saved, ownerIdentity, spaces[0].id)).toMatchObject({
            id: created!.id, rating: 5, body: "This permitted edit keeps the original review identity.", status: "PENDING",
        });
        expect(await listApprovedReviews(discovery, spaces[0].id)).toEqual([]);
        expect(await getOwnReview(saved, strangerIdentity, spaces[0].id)).toBeNull();
        const changed = await withPrivateContext(saved, strangerIdentity, false, (tx) => tx.review.updateMany({
            where: { id: created!.id, ownerAccountId: owner }, data: { body: "Cross-account change with enough characters." },
        }));
        expect(changed.count).toBe(0);
        await expect(withPrivateContext(saved, ownerIdentity, false, (tx) => tx.review.updateMany({
            where: { id: created!.id }, data: { studySpaceId: spaces[2].id },
        }))).rejects.toThrow();
        await expect(withPrivateContext(saved, ownerIdentity, false, (tx) => tx.review.updateMany({
            where: { id: created!.id }, data: { studySpaceId: spaces[3].id },
        }))).rejects.toThrow();
        await expect(admin.review.update({
            where: { id: created!.id }, data: { ownerAccountId: stranger },
        })).rejects.toThrow();
        await expect(discovery.review.create({ data: {
            ownerAccountId: owner, studySpaceId: spaces[0].id, rating: 5, body: "Guest insertion should never be accepted.",
        } })).rejects.toThrow();
    });

    it("binds context to the active identity and an independent moderator grant", async () => {
        await expect(withPrivateContext(saved, {
            accountId: owner,
            ownerKey: strangerKey,
        }, false, (tx) => tx.favorite.findMany())).rejects.toThrow(/not active/i);

        await expect(withPrivateContext(saved, {
            accountId: owner,
            ownerKey,
        }, true, (tx) => tx.userReport.findMany())).rejects.toThrow(/not active/i);

        await expect(withPrivateContext(saved, {
            accountId: moderator.accountId,
            ownerKey,
        }, true, (tx) => tx.userReport.findMany())).rejects.toThrow(/not active/i);
        await expect(withPrivateContext(saved, {
            accountId: owner,
            ownerKey: moderator.ownerKey,
        }, true, (tx) => tx.userReport.findMany())).rejects.toThrow(/not active/i);
        expect(await listModerationQueue(saved, moderator)).not.toBeNull();

        expect(await submitContentReport(
            saved,
            ownerIdentity,
            { type: "LISTING", slug: spaces[0].slug },
            "INACCURATE",
            "A private fixture proves raw moderator settings cannot reveal reports.",
        )).toBe(true);
        expect(await admin.userReport.count({ where: { listingId: spaces[0].id } })).toBe(1);

        await saved.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT set_config('studyspace.account_id', ${owner}::text, true)`;
            await tx.$queryRaw`SELECT set_config('studyspace.favorite_owner', ${ownerKey}, true)`;
            await tx.$queryRaw`SELECT set_config('studyspace.context_verified', 'true', true)`;
            await tx.$queryRaw`SELECT set_config('studyspace.is_moderator', 'true', true)`;
            expect(await tx.userReport.findMany({ where: { listingId: spaces[0].id } })).toEqual([]);
        });

        await expect(saved.$queryRaw`
            SELECT public.set_active_account_context(${owner}::uuid, true)
        `).rejects.toThrow();
        await expect(saved.$executeRaw`
            INSERT INTO public."ModeratorGrant" ("accountId") VALUES (${owner}::uuid)
        `).rejects.toThrow();

        await admin.moderatorGrant.update({
            where: { accountId: moderator.accountId },
            data: { revokedAt: new Date() },
        });
        try {
            await expect(listModerationQueue(saved, moderator)).rejects.toThrow(/not active/i);
        } finally {
            await admin.moderatorGrant.update({
                where: { accountId: moderator.accountId },
                data: { revokedAt: null },
            });
        }
    });

    it("rejects an inactive account before private access", async () => {
        const key = randomBytes(32).toString("hex");
        const accountId = (await resolveAccountIdentity(saved, key))!;
        await admin.moderatorGrant.create({ data: { accountId } });
        await admin.account.update({
            where: { id: accountId },
            data: { state: "CLOSING", closingAt: new Date() },
        });
        try {
            await expect(withPrivateContext(saved, { accountId, ownerKey: key }, false, (tx) => (
                tx.favorite.findMany()
            ))).rejects.toThrow(/not active/i);
            await expect(withPrivateContext(saved, { accountId, ownerKey: key }, true, (tx) => (
                tx.userReport.findMany()
            ))).rejects.toThrow(/not active/i);
        } finally {
            await admin.moderatorGrant.delete({ where: { accountId } });
            await admin.accountIdentity.deleteMany({ where: { accountId } });
            await admin.account.delete({ where: { id: accountId } });
        }
    });

    it("enforces moderator access and valid review transitions with audit rows", async () => {
        const review = await getOwnReview(saved, ownerIdentity, spaces[0].id);
        expect(review).not.toBeNull();
        expect(await moderateReview(saved, nonModerator, review!.id, "approve")).toBe(false);
        expect(await listModerationQueue(saved, nonModerator)).toBeNull();
        expect(await moderateReview(saved, moderator, review!.id, "approve")).toBe(true);
        await expect(withPrivateContext(saved, moderator, true, (tx) => tx.review.update({
            where: { id: review!.id },
            data: { retentionDecision: "RETAIN", retentionReviewedAt: new Date() },
        }))).rejects.toThrow();
        expect(await moderateReview(saved, moderator, review!.id, "reject")).toBe(false);
        expect(await listApprovedReviews(discovery, spaces[0].id)).toHaveLength(1);

        await saveOwnReview(saved, ownerIdentity, spaces[0].slug, 4, "Editing an approved review temporarily removes it from public view.");
        expect((await getOwnReview(saved, ownerIdentity, spaces[0].id))?.status).toBe("PENDING");
        expect(await listApprovedReviews(discovery, spaces[0].id)).toEqual([]);
        expect(await moderateReview(saved, moderator, review!.id, "approve")).toBe(true);
        expect(await moderateReview(saved, moderator, review!.id, "hide")).toBe(true);
        expect(await listApprovedReviews(discovery, spaces[0].id)).toEqual([]);

        await saveOwnReview(saved, ownerIdentity, spaces[0].slug, 3, "An edited review returns to the pending queue.");
        expect(await moderateReview(saved, moderator, review!.id, "reject")).toBe(true);
        expect(await withdrawOwnReview(saved, ownerIdentity, spaces[0].slug)).toBe(true);
        expect((await getOwnReview(saved, ownerIdentity, spaces[0].id))?.status).toBe("WITHDRAWN");

        const queue = await listModerationQueue(saved, moderator);
        expect(queue).not.toBeNull();
        const audit = await withPrivateContext(saved, moderator, true, (tx) => tx.moderationAction.findMany({ where: { reviewId: review!.id } }));
        expect(audit.map(({ action }) => action).sort()).toEqual([
            "REVIEW_APPROVED",
            "REVIEW_APPROVED",
            "REVIEW_HIDDEN",
            "REVIEW_REJECTED",
        ]);
    });

    it("keeps concurrent initial submissions to one review row", async () => {
        const listing = spaces[2];
        const [first, second] = await Promise.all([
            saveOwnReview(saved, ownerIdentity, listing.slug, 4, "First concurrent submission."),
            saveOwnReview(saved, ownerIdentity, listing.slug, 5, "Second concurrent submission."),
        ]);
        expect(first?.id).toBe(second?.id);
        expect(await admin.review.count({ where: { ownerAccountId: owner, studySpaceId: listing.id } })).toBe(1);
    });

    it("keeps reports private and restricts resolution to moderators", async () => {
        const review = await saveOwnReview(saved, strangerIdentity, spaces[1].slug, 5, "A visible review for private report testing.");
        expect(review).not.toBeNull();
        expect(await moderateReview(saved, moderator, review!.id, "approve")).toBe(true);
        expect(await submitContentReport(saved, ownerIdentity, { type: "LISTING", slug: spaces[1].slug }, "INACCURATE", "Listing details need another source check.")).toBe(true);
        expect(await submitContentReport(saved, ownerIdentity, { type: "REVIEW", reviewId: review!.id }, "INAPPROPRIATE", null)).toBe(true);
        expect(await withPrivateContext(saved, ownerIdentity, false, (tx) => tx.userReport.findMany())).toEqual([]);
        expect(await withPrivateContext(saved, strangerIdentity, false, (tx) => tx.userReport.findMany())).toEqual([]);

        const queue = await listModerationQueue(saved, moderator);
        const fixtureReports = queue!.reports.filter((report) =>
            report.listing?.slug === spaces[1].slug || report.review?.studySpace.slug === spaces[1].slug,
        );
        expect(fixtureReports).toHaveLength(2);
        const reportId = fixtureReports[0].id;
        await expect(withPrivateContext(saved, moderator, true, (tx) => tx.userReport.update({
            where: { id: reportId },
            data: { reporterAccountId: stranger },
        }))).rejects.toThrow();
        expect(await resolveReport(saved, nonModerator, reportId)).toBe(false);
        expect(await resolveReport(saved, moderator, reportId)).toBe(true);
        expect(await resolveReport(saved, moderator, reportId)).toBe(false);
        const action = await withPrivateContext(saved, moderator, true, (tx) => tx.moderationAction.findFirst({ where: { reportId } }));
        expect(action).toMatchObject({ moderatorAccountId: moderator.accountId, action: "REPORT_RESOLVED" });
    });
});

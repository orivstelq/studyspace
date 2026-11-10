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

function testClient(key: "DIRECT_URL" | "FAVORITES_DATABASE_URL" | "DATABASE_URL") {
    const url = new URL(process.env[key] ?? "");
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/studyspace_dev") {
        throw new Error(`Unsafe ${key}: expected a local studyspace_dev URL`);
    }
    url.pathname = "/studyspace_test";
    url.search = "";
    url.hash = "";
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 3 }) });
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
    let moderator: { accountId: string; ownerKey: string; isModerator: true };
    let nonModerator: { accountId: string; ownerKey: string; isModerator: false };
    const spaces = [0, 1, 2, 3].map(() => ({ id: randomUUID(), slug: `test-${randomUUID()}` }));

    beforeAll(async () => {
        owner = (await resolveAccountIdentity(saved, ownerKey))!;
        stranger = (await resolveAccountIdentity(saved, strangerKey))!;
        moderator = { accountId: (await resolveAccountIdentity(saved, moderatorKey))!, ownerKey: moderatorKey, isModerator: true };
        nonModerator = { accountId: owner, ownerKey, isModerator: false };
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
            await admin.accountIdentity.deleteMany({ where: { accountId: { in: accountIds } } });
            await admin.account.deleteMany({ where: { id: { in: accountIds } } });
        } finally {
            await Promise.all([admin.$disconnect(), saved.$disconnect(), discovery.$disconnect()]);
        }
    });

    it("keeps pending reviews private and blocks guests and other accounts", async () => {
        const created = await saveOwnReview(saved, owner, spaces[0].slug, 4, "This pending review contains enough useful detail.");
        expect(created).not.toBeNull();
        await saveOwnReview(saved, owner, spaces[0].slug, 5, "This permitted edit keeps the original review identity.");
        expect(await getOwnReview(saved, owner, spaces[0].id)).toMatchObject({
            id: created!.id, rating: 5, body: "This permitted edit keeps the original review identity.", status: "PENDING",
        });
        expect(await listApprovedReviews(discovery, spaces[0].id)).toEqual([]);
        expect(await getOwnReview(saved, stranger, spaces[0].id)).toBeNull();
        const changed = await withPrivateContext(saved, stranger, false, (tx) => tx.review.updateMany({
            where: { id: created!.id, ownerAccountId: owner }, data: { body: "Cross-account change with enough characters." },
        }));
        expect(changed.count).toBe(0);
        await expect(withPrivateContext(saved, owner, false, (tx) => tx.review.updateMany({
            where: { id: created!.id }, data: { studySpaceId: spaces[2].id },
        }))).rejects.toThrow();
        await expect(withPrivateContext(saved, owner, false, (tx) => tx.review.updateMany({
            where: { id: created!.id }, data: { studySpaceId: spaces[3].id },
        }))).rejects.toThrow();
        await expect(admin.review.update({
            where: { id: created!.id }, data: { ownerAccountId: stranger },
        })).rejects.toThrow();
        await expect(discovery.review.create({ data: {
            ownerAccountId: owner, studySpaceId: spaces[0].id, rating: 5, body: "Guest insertion should never be accepted.",
        } })).rejects.toThrow();
    });

    it("enforces moderator access and valid review transitions with audit rows", async () => {
        const review = await getOwnReview(saved, owner, spaces[0].id);
        expect(review).not.toBeNull();
        expect(await moderateReview(saved, nonModerator, review!.id, "approve")).toBe(false);
        expect(await listModerationQueue(saved, nonModerator)).toBeNull();
        expect(await moderateReview(saved, moderator, review!.id, "approve")).toBe(true);
        await expect(withPrivateContext(saved, moderator.accountId, true, (tx) => tx.review.update({
            where: { id: review!.id },
            data: { retentionDecision: "RETAIN", retentionReviewedAt: new Date() },
        }))).rejects.toThrow();
        expect(await moderateReview(saved, moderator, review!.id, "reject")).toBe(false);
        expect(await listApprovedReviews(discovery, spaces[0].id)).toHaveLength(1);

        await saveOwnReview(saved, owner, spaces[0].slug, 4, "Editing an approved review temporarily removes it from public view.");
        expect((await getOwnReview(saved, owner, spaces[0].id))?.status).toBe("PENDING");
        expect(await listApprovedReviews(discovery, spaces[0].id)).toEqual([]);
        expect(await moderateReview(saved, moderator, review!.id, "approve")).toBe(true);
        expect(await moderateReview(saved, moderator, review!.id, "hide")).toBe(true);
        expect(await listApprovedReviews(discovery, spaces[0].id)).toEqual([]);

        await saveOwnReview(saved, owner, spaces[0].slug, 3, "An edited review returns to the pending queue.");
        expect(await moderateReview(saved, moderator, review!.id, "reject")).toBe(true);
        expect(await withdrawOwnReview(saved, owner, spaces[0].slug)).toBe(true);
        expect((await getOwnReview(saved, owner, spaces[0].id))?.status).toBe("WITHDRAWN");

        const queue = await listModerationQueue(saved, moderator);
        expect(queue).not.toBeNull();
        const audit = await withPrivateContext(saved, moderator.accountId, true, (tx) => tx.moderationAction.findMany({ where: { reviewId: review!.id } }));
        expect(audit.map(({ action }) => action)).toEqual(["REVIEW_APPROVED", "REVIEW_APPROVED", "REVIEW_HIDDEN", "REVIEW_REJECTED"]);
    });

    it("keeps concurrent initial submissions to one review row", async () => {
        const listing = spaces[2];
        const [first, second] = await Promise.all([
            saveOwnReview(saved, owner, listing.slug, 4, "First concurrent submission."),
            saveOwnReview(saved, owner, listing.slug, 5, "Second concurrent submission."),
        ]);
        expect(first?.id).toBe(second?.id);
        expect(await admin.review.count({ where: { ownerAccountId: owner, studySpaceId: listing.id } })).toBe(1);
    });

    it("keeps reports private and restricts resolution to moderators", async () => {
        const review = await saveOwnReview(saved, stranger, spaces[1].slug, 5, "A visible review for private report testing.");
        expect(review).not.toBeNull();
        expect(await moderateReview(saved, moderator, review!.id, "approve")).toBe(true);
        expect(await submitContentReport(saved, owner, { type: "LISTING", slug: spaces[1].slug }, "INACCURATE", "Listing details need another source check.")).toBe(true);
        expect(await submitContentReport(saved, owner, { type: "REVIEW", reviewId: review!.id }, "INAPPROPRIATE", null)).toBe(true);
        expect(await withPrivateContext(saved, owner, false, (tx) => tx.userReport.findMany())).toEqual([]);
        expect(await withPrivateContext(saved, stranger, false, (tx) => tx.userReport.findMany())).toEqual([]);

        const queue = await listModerationQueue(saved, moderator);
        const fixtureReports = queue!.reports.filter((report) =>
            report.listing?.slug === spaces[1].slug || report.review?.studySpace.slug === spaces[1].slug,
        );
        expect(fixtureReports).toHaveLength(2);
        const reportId = fixtureReports[0].id;
        await expect(withPrivateContext(saved, moderator.accountId, true, (tx) => tx.userReport.update({
            where: { id: reportId },
            data: { reporterAccountId: stranger },
        }))).rejects.toThrow();
        expect(await resolveReport(saved, nonModerator, reportId)).toBe(false);
        expect(await resolveReport(saved, moderator, reportId)).toBe(true);
        expect(await resolveReport(saved, moderator, reportId)).toBe(false);
        const action = await withPrivateContext(saved, moderator.accountId, true, (tx) => tx.moderationAction.findFirst({ where: { reportId } }));
        expect(action).toMatchObject({ moderatorAccountId: moderator.accountId, action: "REPORT_RESOLVED" });
    });
});

import "dotenv/config";

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
    beginAccountClosure,
    finalizeLocalAccountClosure,
    lookupActiveAccountIdentity,
    resolveAccountIdentity,
} from "../../src/features/account-lifecycle/repository";
import { changeFavorite } from "../../src/features/favorites/query";
import { saveProfile } from "../../src/features/profile/query";
import {
    listApprovedReviews,
    listModerationQueue,
    moderateReview,
    saveOwnReview,
    submitContentReport,
    withdrawOwnReview,
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

const identityKey = () => randomBytes(32).toString("hex");

describe("account lifecycle database foundation", () => {
    const admin = testClient("DIRECT_URL");
    const saved = testClient("FAVORITES_DATABASE_URL");
    const discovery = testClient("DATABASE_URL");
    const fixturePrefix = `lifecycle-${randomUUID()}`;

    afterAll(async () => {
        try {
            const spaces = await admin.studySpace.findMany({
                where: { slug: { startsWith: fixturePrefix } },
                select: { id: true },
            });
            const spaceIds = spaces.map(({ id }) => id);
            const identities = await admin.accountIdentity.findMany({
                where: { identityKey: { in: [...testIdentityKeys] } },
                select: { accountId: true },
            });
            const testAccounts = identities.map(({ accountId }) => accountId);
            const reviews = await admin.review.findMany({ where: { studySpaceId: { in: spaceIds } }, select: { id: true } });
            const reviewIds = reviews.map(({ id }) => id);
            const reports = await admin.userReport.findMany({
                where: { OR: [{ listingId: { in: spaceIds } }, { targetReferenceId: { in: reviewIds } }] },
                select: { id: true },
            });
            const reportIds = reports.map(({ id }) => id);
            await admin.retentionHold.deleteMany({ where: {
                OR: [{ reviewId: { in: reviewIds } }, { moderationAction: { targetReferenceId: { in: [...reviewIds, ...reportIds] } } }],
            } });
            await admin.moderationAction.deleteMany({
                where: { OR: [
                    { targetReferenceId: { in: [...reviewIds, ...reportIds] } },
                    { moderatorAccountId: { in: testAccounts } },
                ] },
            });
            await admin.userReport.deleteMany({
                where: { OR: [{ id: { in: reportIds } }, { reporterAccountId: { in: testAccounts } }] },
            });
            await admin.review.deleteMany({ where: { studySpaceId: { in: spaceIds } } });
            await admin.favorite.deleteMany({ where: { studySpaceId: { in: spaceIds } } });
            await admin.studySpace.deleteMany({ where: { id: { in: spaceIds } } });

            await admin.authSession.deleteMany({ where: { accountId: { in: testAccounts } } });
            await admin.userProfile.deleteMany({ where: { accountId: { in: testAccounts } } });
            await admin.favorite.deleteMany({ where: { accountId: { in: testAccounts } } });
            await admin.accountClosure.deleteMany({ where: { accountId: { in: testAccounts } } });
            await admin.accountIdentity.deleteMany({ where: { accountId: { in: testAccounts } } });
            await admin.account.deleteMany({ where: { id: { in: testAccounts } } });
        } finally {
            await Promise.all([admin.$disconnect(), saved.$disconnect(), discovery.$disconnect()]);
        }
    });

    const testIdentityKeys = new Set<string>();

    async function account() {
        const key = identityKey();
        testIdentityKeys.add(key);
        return { key, id: (await resolveAccountIdentity(saved, key))! };
    }

    async function space(suffix: string) {
        return admin.studySpace.create({ data: {
            slug: `${fixturePrefix}-${suffix}`,
            name: "Lifecycle fixture",
            description: "Temporary account lifecycle integration fixture",
            category: "LIBRARY",
            city: "Test",
            region: "TX",
            status: "PUBLISHED",
            sourceType: "OFFICIAL",
        } });
    }

    it("closes one account idempotently without touching another account", async () => {
        const owner = await account();
        const stranger = await account();
        const moderator = await account();
        const approvedSpace = await space("approved");
        const pendingSpace = await space("pending");
        const rejectedSpace = await space("rejected");
        const withdrawnSpace = await space("withdrawn");
        const hiddenSpace = await space("hidden-report");
        const unheldHiddenSpace = await space("hidden-no-hold");
        const heldSpace = await space("held-pending");

        await saveProfile(saved, owner.id, { category: "library", amenities: ["quiet"] });
        await changeFavorite(saved, owner.id, approvedSpace.slug, true);
        await saveProfile(saved, stranger.id, { category: "cafe", amenities: ["wifi"] });
        await admin.authSession.create({ data: {
            id: randomBytes(16).toString("hex"),
            subject: "fixture|owner",
            providerSessionId: `fixture-${randomUUID()}`,
            createdAt: Math.floor(Date.now() / 1000),
            expiresAt: new Date(Date.now() + 60_000),
            accountId: owner.id,
        } });

        const moderatorIdentity = { accountId: moderator.id, ownerKey: moderator.key, isModerator: true } as const;
        const approved = (await saveOwnReview(saved, owner.id, approvedSpace.slug, 5, "A retained public review with no identifying details."))!;
        const pending = (await saveOwnReview(saved, owner.id, pendingSpace.slug, 4, "A pending review that should be removed on closure."))!;
        const rejected = (await saveOwnReview(saved, owner.id, rejectedSpace.slug, 2, "A rejected review that should be removed on closure."))!;
        const withdrawn = (await saveOwnReview(saved, owner.id, withdrawnSpace.slug, 3, "A withdrawn review that should be removed on closure."))!;
        const hidden = (await saveOwnReview(saved, owner.id, hiddenSpace.slug, 3, "A hidden review retained while its report remains open."))!;
        const unheldHidden = (await saveOwnReview(saved, owner.id, unheldHiddenSpace.slug, 3, "A hidden review without evidence should be removed."))!;
        const held = (await saveOwnReview(saved, owner.id, heldSpace.slug, 4, "A pending review retained by a finite approved evidence hold."))!;
        expect(await moderateReview(saved, moderatorIdentity, approved.id, "approve")).toBe(true);
        expect(await moderateReview(saved, moderatorIdentity, rejected.id, "reject")).toBe(true);
        expect(await withdrawOwnReview(saved, owner.id, withdrawnSpace.slug)).toBe(true);
        expect(await moderateReview(saved, moderatorIdentity, hidden.id, "approve")).toBe(true);
        expect(await submitContentReport(saved, stranger.id, { type: "REVIEW", reviewId: hidden.id }, "INAPPROPRIATE", null)).toBe(true);
        expect(await moderateReview(saved, moderatorIdentity, hidden.id, "hide")).toBe(true);
        expect(await moderateReview(saved, moderatorIdentity, unheldHidden.id, "approve")).toBe(true);
        expect(await moderateReview(saved, moderatorIdentity, unheldHidden.id, "hide")).toBe(true);
        await admin.retentionHold.create({ data: {
            reviewId: held.id,
            caseReference: "integration-case",
            reason: "Temporary evidence preservation test",
            approvedBy: "integration-operator",
            reviewAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        } });

        await admin.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT set_config('studyspace.lifecycle_operation', 'true', true)`;
            await tx.review.update({
                where: { id: approved.id },
                data: {
                    retentionDecision: "RETAIN",
                    retentionReviewedAt: new Date(),
                    retentionReviewerAccountId: moderator.id,
                },
            });
        });
        await admin.userReport.create({ data: {
            reporterAccountId: owner.id,
            targetType: "LISTING",
            listingId: approvedSpace.id,
            targetReferenceId: approvedSpace.id,
            reason: "OTHER",
            details: "A private report retained without its reporter association.",
        } });
        await admin.moderationAction.create({ data: {
            moderatorAccountId: owner.id,
            action: "REVIEW_APPROVED",
            reviewId: approved.id,
            targetReferenceId: approved.id,
        } });

        const started = await beginAccountClosure(admin, owner.key);
        expect(started.status).toBe("READY");
        expect(started.revokedSessionCount).toBe(1);
        expect(await beginAccountClosure(admin, owner.key)).toEqual(started);
        await expect(changeFavorite(saved, owner.id, approvedSpace.slug, true)).rejects.toThrow(/not active/i);
        await expect(finalizeLocalAccountClosure(admin, stranger.key, started.id)).rejects.toThrow(/not active/i);

        const completed = await finalizeLocalAccountClosure(admin, owner.key, started.id);
        expect(completed).toMatchObject({
            status: "PROVIDER_PENDING",
            deletedProfileCount: 1,
            deletedFavoriteCount: 1,
            revokedSessionCount: 1,
            deletedReviewCount: 4,
            retainedReviewCount: 3,
            unlinkedReportCount: 1,
        });
        expect(await finalizeLocalAccountClosure(admin, owner.key, started.id)).toEqual(completed);

        expect(await admin.account.findUnique({ where: { id: owner.id }, select: { state: true } })).toEqual({ state: "CLOSED" });
        expect(await admin.userProfile.findUnique({ where: { accountId: owner.id } })).toBeNull();
        expect(await admin.favorite.count({ where: { accountId: owner.id } })).toBe(0);
        expect(await admin.authSession.count({ where: { accountId: owner.id } })).toBe(0);
        expect(await admin.review.findUnique({ where: { id: pending.id } })).toBeNull();
        expect(await admin.review.findUnique({ where: { id: rejected.id } })).toBeNull();
        expect(await admin.review.findUnique({ where: { id: withdrawn.id } })).toBeNull();
        expect(await admin.review.findUnique({ where: { id: unheldHidden.id } })).toBeNull();
        expect(await admin.review.findUnique({ where: { id: approved.id } })).toMatchObject({ ownerAccountId: null, status: "APPROVED" });
        expect(await admin.review.findUnique({ where: { id: hidden.id } })).toMatchObject({ ownerAccountId: null, status: "HIDDEN" });
        expect(await admin.review.findUnique({ where: { id: held.id } })).toMatchObject({ ownerAccountId: null, status: "PENDING" });
        expect(await listApprovedReviews(discovery, approvedSpace.id)).toHaveLength(1);
        expect(await admin.userReport.findFirst({ where: { targetReferenceId: approvedSpace.id } })).toMatchObject({ reporterAccountId: null });
        expect(await admin.userReport.findFirst({ where: { targetReferenceId: approvedSpace.id } })).toMatchObject({ details: null });
        expect(await admin.moderationAction.findFirst({ where: { targetReferenceId: approved.id, moderatorAccountId: null } })).not.toBeNull();
        expect(await moderateReview(saved, moderatorIdentity, held.id, "approve")).toBe(false);
        expect((await listModerationQueue(saved, moderatorIdentity))?.reviews.some(({ id }) => id === held.id)).toBe(false);
        expect(await resolveAccountIdentity(saved, owner.key)).toBeNull();
        expect(await admin.userProfile.findUnique({ where: { accountId: stranger.id } })).not.toBeNull();

        const moderatorClosure = await beginAccountClosure(admin, moderator.key);
        await finalizeLocalAccountClosure(admin, moderator.key, moderatorClosure.id);
        expect(await admin.review.findUnique({ where: { id: approved.id } })).toMatchObject({
            retentionReviewerAccountId: null,
            retentionReviewerUnlinkedAt: expect.any(Date),
        });
    });

    it("blocks local completion until every approved review has a human retention assessment", async () => {
        const owner = await account();
        const moderator = await account();
        const listing = await space("assessment-block");
        const review = await admin.review.create({ data: {
            ownerAccountId: owner.id,
            studySpaceId: listing.id,
            rating: 5,
            body: "Approved review text still awaiting a human identity check.",
            status: "APPROVED",
            publishedAt: new Date(),
        } });
        await expect(admin.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT set_config('studyspace.lifecycle_operation', 'true', true)`;
            await tx.review.update({
                where: { id: review.id },
                data: { retentionDecision: "RETAIN", retentionReviewedAt: new Date() },
            });
        })).rejects.toThrow();
        await admin.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT set_config('studyspace.lifecycle_operation', 'true', true)`;
            await tx.review.update({
                where: { id: review.id },
                data: {
                    retentionDecision: "RETAIN",
                    retentionReviewedAt: new Date(),
                    retentionReviewerAccountId: moderator.id,
                },
            });
        });
        await saveOwnReview(saved, owner.id, listing.slug, 4, "Edited approved text requires a fresh human identity assessment.");
        expect(await moderateReview(saved, {
            accountId: moderator.id,
            ownerKey: moderator.key,
            isModerator: true,
        }, review.id, "approve")).toBe(true);
        expect(await admin.review.findUnique({ where: { id: review.id } })).toMatchObject({
            retentionDecision: null,
            retentionReviewedAt: null,
            retentionReviewerAccountId: null,
        });
        const closure = await beginAccountClosure(admin, owner.key);
        expect(closure.status).toBe("AWAITING_REVIEW");
        await expect(finalizeLocalAccountClosure(admin, owner.key, closure.id)).rejects.toThrow(/assessment is required/i);
        expect(await admin.review.findUnique({ where: { id: review.id } })).toMatchObject({ ownerAccountId: owner.id });
        expect(await admin.account.findUnique({ where: { id: owner.id } })).toMatchObject({ state: "CLOSING" });
    });

    it("serializes private writes behind the account-state lock", async () => {
        const owner = await account();
        const listing = await space("concurrency");
        let releaseLock!: () => void;
        let lockAcquired!: () => void;
        const held = new Promise<void>((resolve) => { releaseLock = resolve; });
        const acquired = new Promise<void>((resolve) => { lockAcquired = resolve; });

        const closing = admin.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM public."Account" WHERE "id" = ${owner.id}::uuid FOR UPDATE`;
            lockAcquired();
            await held;
            await tx.account.update({
                where: { id: owner.id },
                data: { state: "CLOSING", closingAt: new Date() },
            });
        });
        await acquired;

        let writeSettled = false;
        const write = changeFavorite(saved, owner.id, listing.slug, true)
            .finally(() => { writeSettled = true; });
        await new Promise((resolve) => setTimeout(resolve, 75));
        expect(writeSettled).toBe(false);

        releaseLock();
        await closing;
        await expect(write).rejects.toThrow(/not active/i);
        expect(await admin.favorite.count({ where: { accountId: owner.id } })).toBe(0);
    });

    it("serializes moderator approval with finalization and rechecks retention assessment", async () => {
        const owner = await account();
        const moderator = await account();
        const listing = await space("moderator-race");
        const review = (await saveOwnReview(saved, owner.id, listing.slug, 5, "Approval races with closure."))!;
        let releaseApproval!: () => void;
        let approvalLocked!: () => void;
        const held = new Promise<void>((resolve) => { releaseApproval = resolve; });
        const acquired = new Promise<void>((resolve) => { approvalLocked = resolve; });

        const approval = saved.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT public.set_active_account_context(${moderator.id}::uuid, true)`;
            await tx.$executeRaw`
                UPDATE public."Review" SET "status" = 'APPROVED', "publishedAt" = now()
                WHERE "id" = ${review.id}::uuid AND "status" = 'PENDING'
            `;
            approvalLocked();
            await held;
            await tx.moderationAction.create({ data: {
                moderatorAccountId: moderator.id,
                action: "REVIEW_APPROVED",
                reviewId: review.id,
                targetReferenceId: review.id,
            } });
        });
        await acquired;
        const closure = await beginAccountClosure(admin, owner.key);

        let finalizerSettled = false;
        const finalizer = finalizeLocalAccountClosure(admin, owner.key, closure.id)
            .finally(() => { finalizerSettled = true; });
        await new Promise((resolve) => setTimeout(resolve, 75));
        expect(finalizerSettled).toBe(false);

        releaseApproval();
        await approval;
        await expect(finalizer).rejects.toThrow(/assessment is required/i);
        expect(await admin.review.findUnique({ where: { id: review.id } })).toMatchObject({
            ownerAccountId: owner.id,
            status: "APPROVED",
            retentionDecision: null,
        });
    });

    it("uses passive lookup for stale sessions and creates a generation only for a fresh login", async () => {
        const owner = await account();
        const closure = await beginAccountClosure(admin, owner.key);
        await finalizeLocalAccountClosure(admin, owner.key, closure.id);
        expect(await lookupActiveAccountIdentity(saved, owner.key)).toBeNull();

        await admin.accountClosure.update({
            where: { id: closure.id },
            data: { status: "COMPLETE", providerCompletedAt: new Date() },
        });
        expect(await lookupActiveAccountIdentity(saved, owner.key)).toBeNull();
        const nextGeneration = await resolveAccountIdentity(saved, owner.key);
        expect(nextGeneration).not.toBeNull();
        expect(nextGeneration).not.toBe(owner.id);
    });

    it("keeps legacy and account ownership compatible during the expand rollout", async () => {
        const key = identityKey();
        testIdentityKeys.add(key);
        const listing = await space("expand-compatibility");
        const compatibility = await saved.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT set_config('studyspace.favorite_owner', ${key}, true)`;
            await tx.$queryRaw`SELECT set_config('studyspace.is_moderator', 'true', true)`;
            const [favorite] = await tx.$queryRaw<{ accountId: string }[]>`
                INSERT INTO public."Favorite" ("ownerKey", "studySpaceId")
                VALUES (${key}, ${listing.id}::uuid)
                RETURNING "accountId" AS "accountId"
            `;
            const [profile] = await tx.$queryRaw<{ accountId: string }[]>`
                INSERT INTO public."UserProfile" ("ownerKey", "preferredCategory", "preferredAmenities", "updatedAt")
                VALUES (${key}, 'LIBRARY', ARRAY['quiet']::varchar(60)[], now())
                RETURNING "accountId" AS "accountId"
            `;
            const [review] = await tx.$queryRaw<{ id: string; ownerAccountId: string }[]>`
                INSERT INTO public."Review" ("ownerKey", "studySpaceId", "rating", "body", "updatedAt")
                VALUES (${key}, ${listing.id}::uuid, 5, 'Legacy review write remains compatible.', now())
                RETURNING "id", "ownerAccountId" AS "ownerAccountId"
            `;
            await tx.$executeRaw`
                UPDATE public."Review" SET "status" = 'APPROVED', "publishedAt" = now()
                WHERE "id" = ${review!.id}::uuid
            `;
            const [action] = await tx.$queryRaw<{ moderatorAccountId: string; targetReferenceId: string }[]>`
                INSERT INTO public."ModerationAction" ("moderatorKey", "action", "reviewId")
                VALUES (${key}, 'REVIEW_APPROVED', ${review!.id}::uuid)
                RETURNING "moderatorAccountId" AS "moderatorAccountId", "targetReferenceId" AS "targetReferenceId"
            `;
            const [report] = await tx.$queryRaw<{ reporterAccountId: string; targetReferenceId: string }[]>`
                INSERT INTO public."UserReport" ("reporterKey", "targetType", "listingId", "reason")
                VALUES (${key}, 'LISTING', ${listing.id}::uuid, 'OTHER')
                RETURNING "reporterAccountId" AS "reporterAccountId", "targetReferenceId" AS "targetReferenceId"
            `;
            return { favorite, profile, review, action, report };
        });
        expect(compatibility.favorite?.accountId).toBeTruthy();
        expect(compatibility.profile?.accountId).toBe(compatibility.favorite?.accountId);
        expect(compatibility.review?.ownerAccountId).toBe(compatibility.favorite?.accountId);
        expect(compatibility.action).toMatchObject({
            moderatorAccountId: compatibility.favorite?.accountId,
            targetReferenceId: compatibility.review?.id,
        });
        expect(compatibility.report).toMatchObject({
            reporterAccountId: compatibility.favorite?.accountId,
            targetReferenceId: listing.id,
        });

        const [stored] = await admin.$queryRaw<{ ownerKey: string }[]>`
            SELECT "ownerKey" AS "ownerKey" FROM public."UserProfile"
            WHERE "accountId" = ${compatibility.favorite!.accountId}::uuid
        `;
        expect(stored?.ownerKey).toBe(key);
    });

    it("rejects direct Account deletion while actor references remain", async () => {
        const owner = await account();
        const listing = await space("account-delete-restrict");
        await saveOwnReview(saved, owner.id, listing.slug, 4, "The account relation must be restrictive.");
        await admin.accountIdentity.deleteMany({ where: { accountId: owner.id } });
        await expect(admin.account.delete({ where: { id: owner.id } })).rejects.toThrow();
        expect(await admin.account.findUnique({ where: { id: owner.id } })).not.toBeNull();
        await admin.accountIdentity.create({ data: { accountId: owner.id, identityKey: owner.key, generation: 1 } });
    });
});

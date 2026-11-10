import type { PrismaClient } from "@/generated/prisma/client";
import { withPrivateContext } from "../../lib/db/private-context";
import { publishedSpaceWhere } from "../discovery/query";

type PublicDatabase = Pick<PrismaClient, "review">;
type PrivateDatabase = Pick<PrismaClient, "$transaction">;

export interface PrivateIdentity {
    accountId: string;
    ownerKey: string;
    isModerator: boolean;
}

export function listApprovedReviews(db: PublicDatabase, studySpaceId: string) {
    return db.review.findMany({
        where: { studySpaceId, status: "APPROVED", studySpace: publishedSpaceWhere },
        select: { id: true, rating: true, body: true, publishedAt: true },
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
        take: 50,
    });
}

export function getOwnReview(db: PrivateDatabase, accountId: string, studySpaceId: string) {
    return withPrivateContext(db, accountId, false, (tx) => tx.review.findFirst({
        where: { ownerAccountId: accountId, studySpaceId },
        select: { id: true, rating: true, body: true, status: true, updatedAt: true },
    }));
}

export function saveOwnReview(
    db: PrivateDatabase,
    accountId: string,
    slug: string,
    rating: number,
    body: string,
) {
    return withPrivateContext(db, accountId, false, async (tx) => {
        const space = await tx.studySpace.findFirst({
            where: { ...publishedSpaceWhere, slug },
            select: { id: true },
        });
        if (!space) return null;

        const existing = await tx.review.findFirst({
            where: { ownerAccountId: accountId, studySpaceId: space.id },
            select: { id: true },
        });
        if (existing) {
            return tx.review.update({
                where: { id: existing.id },
                data: { rating, body, status: "PENDING", publishedAt: null },
                select: { id: true },
            });
        }
        const inserted = await tx.review.createMany({
            data: { ownerAccountId: accountId, studySpaceId: space.id, rating, body, status: "PENDING" },
            skipDuplicates: true,
        });
        const review = await tx.review.findFirstOrThrow({
            where: { ownerAccountId: accountId, studySpaceId: space.id },
            select: { id: true },
        });
        if (!inserted.count) {
            await tx.review.update({
                where: { id: review.id },
                data: { rating, body, status: "PENDING", publishedAt: null },
            });
        }
        return review;
    });
}

export function withdrawOwnReview(db: PrivateDatabase, accountId: string, slug: string) {
    return withPrivateContext(db, accountId, false, async (tx) => {
        const result = await tx.review.updateMany({
            where: { ownerAccountId: accountId, studySpace: { slug }, status: { not: "WITHDRAWN" } },
            data: { status: "WITHDRAWN", publishedAt: null },
        });
        return result.count > 0;
    });
}

export function submitContentReport(
    db: PrivateDatabase,
    accountId: string,
    target: { type: "LISTING"; slug: string } | { type: "REVIEW"; reviewId: string },
    reason: "INACCURATE" | "CLOSED" | "INAPPROPRIATE" | "OTHER",
    details: string | null,
) {
    return withPrivateContext(db, accountId, false, async (tx) => {
        if (target.type === "LISTING") {
            const listing = await tx.studySpace.findFirst({
                where: { ...publishedSpaceWhere, slug: target.slug },
                select: { id: true },
            });
            if (!listing) return false;
            await tx.userReport.createMany({
                data: [{ reporterAccountId: accountId, targetType: "LISTING", listingId: listing.id, targetReferenceId: listing.id, reason, details }],
            });
            return true;
        }

        const review = await tx.review.findFirst({
            where: { id: target.reviewId, status: "APPROVED", studySpace: publishedSpaceWhere },
            select: { id: true },
        });
        if (!review) return false;
        await tx.userReport.createMany({
            data: [{ reporterAccountId: accountId, targetType: "REVIEW", reviewId: review.id, targetReferenceId: review.id, reason, details }],
        });
        return true;
    });
}

export function listModerationQueue(db: PrivateDatabase, identity: PrivateIdentity) {
    return withPrivateContext(db, identity.accountId, identity.isModerator, async (tx) => {
        if (!identity.isModerator) return null;
        const [reviews, publishedReviews, reports] = await Promise.all([
            tx.review.findMany({
                where: { status: "PENDING", ownerAccountId: { not: null } },
                select: {
                    id: true, rating: true, body: true, updatedAt: true,
                    studySpace: { select: { name: true, slug: true } },
                },
                orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
                take: 100,
            }),
            tx.review.findMany({
                where: { status: "APPROVED" },
                select: {
                    id: true, rating: true, body: true, publishedAt: true,
                    studySpace: { select: { name: true, slug: true } },
                },
                orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
                take: 100,
            }),
            tx.userReport.findMany({
                where: { status: "OPEN" },
                select: {
                    id: true, targetType: true, reason: true, details: true, createdAt: true,
                    listing: { select: { name: true, slug: true } },
                    review: { select: { body: true, studySpace: { select: { name: true, slug: true } } } },
                },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: 100,
            }),
        ]);
        return { reviews, publishedReviews, reports };
    });
}

export function moderateReview(
    db: PrivateDatabase,
    identity: PrivateIdentity,
    reviewId: string,
    decision: "approve" | "reject" | "hide",
) {
    return withPrivateContext(db, identity.accountId, identity.isModerator, async (tx) => {
        if (!identity.isModerator) return false;
        const transition = decision === "approve"
            ? { from: "PENDING" as const, to: "APPROVED" as const, action: "REVIEW_APPROVED" as const, publishedAt: new Date() }
            : decision === "reject"
                ? { from: "PENDING" as const, to: "REJECTED" as const, action: "REVIEW_REJECTED" as const, publishedAt: null }
                : { from: "APPROVED" as const, to: "HIDDEN" as const, action: "REVIEW_HIDDEN" as const, publishedAt: null };
        const updated = await tx.review.updateMany({
            where: {
                id: reviewId,
                status: transition.from,
                ...(decision === "approve" ? { ownerAccountId: { not: null } } : {}),
            },
            data: { status: transition.to, publishedAt: transition.publishedAt },
        });
        if (!updated.count) return false;
        await tx.moderationAction.create({
            data: { moderatorAccountId: identity.accountId, action: transition.action, reviewId, targetReferenceId: reviewId },
            select: { id: true },
        });
        return true;
    });
}

export function resolveReport(db: PrivateDatabase, identity: PrivateIdentity, reportId: string) {
    return withPrivateContext(db, identity.accountId, identity.isModerator, async (tx) => {
        if (!identity.isModerator) return false;
        const updated = await tx.userReport.updateMany({
            where: { id: reportId, status: "OPEN" },
            data: { status: "RESOLVED", resolvedAt: new Date() },
        });
        if (!updated.count) return false;
        await tx.moderationAction.create({
            data: { moderatorAccountId: identity.accountId, action: "REPORT_RESOLVED", reportId, targetReferenceId: reportId },
            select: { id: true },
        });
        return true;
    });
}

import type { Prisma, PrismaClient } from "@/generated/prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const REPORT_RETENTION_MS = 90 * DAY_MS;
const AUDIT_RETENTION_MS = 180 * DAY_MS;

type Database = Pick<PrismaClient, "$transaction">;

export interface AccountContext {
    accountId: string;
    ownerKey: string;
}

export class InactiveAccountError extends Error {
    constructor() {
        super("Account is not active.");
    }
}

export async function resolveAccountIdentityInTransaction(tx: Prisma.TransactionClient, identityKey: string) {
    const [row] = await tx.$queryRaw<{ accountId: string | null }[]>`
        SELECT public.resolve_account_identity(${identityKey}) AS "accountId"
    `;
    return row?.accountId ?? null;
}

export async function lookupActiveAccountIdentityInTransaction(tx: Prisma.TransactionClient, identityKey: string) {
    const [row] = await tx.$queryRaw<{ accountId: string | null }[]>`
        SELECT public.lookup_active_account_identity(${identityKey}) AS "accountId"
    `;
    return row?.accountId ?? null;
}

export async function setActiveAccountContextInTransaction(
    tx: Prisma.TransactionClient,
    identity: AccountContext,
    isModerator: boolean,
) {
    const [row] = isModerator
        ? await tx.$queryRaw<{ active: boolean }[]>`
            SELECT public.set_moderator_account_context(
                ${identity.accountId}::uuid,
                ${identity.ownerKey}
            ) AS active
        `
        : await tx.$queryRaw<{ active: boolean }[]>`
            SELECT public.set_active_account_context(
                ${identity.accountId}::uuid,
                ${identity.ownerKey}
            ) AS active
        `;
    return row?.active === true;
}

export function resolveAccountIdentity(db: Database, identityKey: string) {
    return db.$transaction((tx) => resolveAccountIdentityInTransaction(tx, identityKey));
}

export function lookupActiveAccountIdentity(db: Database, identityKey: string) {
    return db.$transaction((tx) => lookupActiveAccountIdentityInTransaction(tx, identityKey));
}

export interface ClosureResult {
    id: string;
    status: "AWAITING_REVIEW" | "READY" | "PROVIDER_PENDING" | "COMPLETE";
    deletedProfileCount: number;
    deletedFavoriteCount: number;
    revokedSessionCount: number;
    deletedReviewCount: number;
    retainedReviewCount: number;
    unlinkedReportCount: number;
    unlinkedModerationCount: number;
}

const closureSelect = {
    id: true,
    status: true,
    deletedProfileCount: true,
    deletedFavoriteCount: true,
    revokedSessionCount: true,
    deletedReviewCount: true,
    retainedReviewCount: true,
    unlinkedReportCount: true,
    unlinkedModerationCount: true,
} as const;

/** Owner-only foundation. A future user action must pass a key derived from the verified session. */
export function beginAccountClosure(db: Database, identityKey: string, now = new Date()) {
    return db.$transaction(async (tx) => {
        const [identity] = await tx.$queryRaw<{ accountId: string; state: "ACTIVE" | "CLOSING" | "CLOSED" }[]>`
            SELECT account."id" AS "accountId", account."state"
            FROM public."AccountIdentity" identity
            JOIN public."Account" account ON account."id" = identity."accountId"
            WHERE identity."identityKey" = ${identityKey}
              AND identity."unlinkedAt" IS NULL
            ORDER BY identity."generation" DESC
            LIMIT 1
            FOR UPDATE OF account
        `;

        if (!identity) {
            const existing = await tx.accountClosure.findFirst({
                where: { account: { identities: { some: { identityKey } } } },
                orderBy: { requestedAt: "desc" },
                select: closureSelect,
            });
            if (existing) return existing;
            throw new InactiveAccountError();
        }

        const existing = await tx.accountClosure.findUnique({
            where: { accountId: identity.accountId },
            select: closureSelect,
        });
        if (existing) return existing;
        if (identity.state !== "ACTIVE") throw new InactiveAccountError();

        await tx.account.update({
            where: { id: identity.accountId },
            data: { state: "CLOSING", closingAt: now },
        });
        await tx.moderatorGrant.updateMany({
            where: { accountId: identity.accountId, revokedAt: null },
            data: { revokedAt: now },
        });
        const revoked = await tx.authSession.deleteMany({ where: { accountId: identity.accountId } });
        const unassessedPublishedReviews = await tx.review.count({
            where: {
                ownerAccountId: identity.accountId,
                status: "APPROVED",
                OR: [
                    { retentionDecision: { not: "RETAIN" } },
                    { retentionReviewedAt: null },
                    { AND: [{ retentionReviewerAccountId: null }, { retentionReviewerUnlinkedAt: null }] },
                ],
            },
        });

        return tx.accountClosure.create({
            data: {
                accountId: identity.accountId,
                status: unassessedPublishedReviews > 0 ? "AWAITING_REVIEW" : "READY",
                requestedAt: now,
                revokedSessionCount: revoked.count,
            },
            select: closureSelect,
        });
    });
}

/**
 * Owner-only local finalizer. It deliberately stops at PROVIDER_PENDING; Auth0 completion
 * and re-registration activation require a separately approved provider workflow.
 */
export function finalizeLocalAccountClosure(
    db: Database,
    identityKey: string,
    closureId: string,
    now = new Date(),
) {
    return db.$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<{ accountId: string; state: "ACTIVE" | "CLOSING" | "CLOSED" }[]>`
            SELECT account."id" AS "accountId", account."state"
            FROM public."AccountClosure" closure
            JOIN public."Account" account ON account."id" = closure."accountId"
            WHERE closure."id" = ${closureId}::uuid
              AND EXISTS (
                  SELECT 1 FROM public."AccountIdentity" identity
                  WHERE identity."accountId" = account."id"
                    AND identity."identityKey" = ${identityKey}
              )
            FOR UPDATE OF account, closure
        `;
        if (!locked) throw new InactiveAccountError();

        const closure = await tx.accountClosure.findUniqueOrThrow({
            where: { id: closureId },
            select: closureSelect,
        });
        if (closure.status === "PROVIDER_PENDING" || closure.status === "COMPLETE") return closure;
        if (locked.state !== "CLOSING") throw new InactiveAccountError();

        await tx.$queryRaw`
            SELECT review."id"
            FROM public."Review" review
            WHERE review."ownerAccountId" = ${locked.accountId}::uuid
            ORDER BY review."id"
            FOR UPDATE
        `;

        const unassessedPublishedReviews = await tx.review.count({
            where: {
                ownerAccountId: locked.accountId,
                status: "APPROVED",
                OR: [
                    { retentionDecision: { not: "RETAIN" } },
                    { retentionReviewedAt: null },
                    { AND: [{ retentionReviewerAccountId: null }, { retentionReviewerUnlinkedAt: null }] },
                ],
            },
        });
        if (unassessedPublishedReviews > 0) {
            throw new Error("Approved review retention assessment is required before local closure.");
        }

        await tx.$queryRaw`SELECT set_config('studyspace.lifecycle_operation', 'true', true)`;
        const reportCutoff = new Date(now.getTime() - REPORT_RETENTION_MS);
        const auditCutoff = new Date(now.getTime() - AUDIT_RETENTION_MS);

        await tx.userReport.deleteMany({
            where: {
                status: "RESOLVED",
                resolvedAt: { lte: reportCutoff },
                OR: [
                    { reporterAccountId: locked.accountId },
                    { review: { ownerAccountId: locked.accountId } },
                ],
            },
        });

        await tx.moderationAction.deleteMany({
            where: {
                moderatorAccountId: locked.accountId,
                createdAt: { lte: auditCutoff },
                retentionHolds: { none: { expiresAt: { gt: now } } },
            },
        });

        const retainedReviewCount = await tx.$executeRaw`
            UPDATE public."Review" review
            SET "ownerAccountId" = NULL, "ownerUnlinkedAt" = ${now}
            WHERE review."ownerAccountId" = ${locked.accountId}::uuid
              AND (
                  (review."status" = 'APPROVED'
                      AND review."retentionDecision" = 'RETAIN'
                      AND review."retentionReviewedAt" IS NOT NULL
                      AND (review."retentionReviewerAccountId" IS NOT NULL
                          OR review."retentionReviewerUnlinkedAt" IS NOT NULL))
                  OR EXISTS (
                      SELECT 1 FROM public."UserReport" report
                      WHERE report."reviewId" = review."id"
                        AND (report."status" = 'OPEN' OR report."resolvedAt" > ${reportCutoff})
                  )
                  OR EXISTS (
                      SELECT 1 FROM public."RetentionHold" hold
                      WHERE hold."reviewId" = review."id" AND hold."expiresAt" > ${now}
                  )
              )
        `;
        const deletedReviews = await tx.review.deleteMany({ where: { ownerAccountId: locked.accountId } });

        const unlinkedReports = await tx.userReport.updateMany({
            where: { reporterAccountId: locked.accountId },
            data: { reporterAccountId: null, reporterUnlinkedAt: now, details: null },
        });
        const unlinkedModeration = await tx.moderationAction.updateMany({
            where: { moderatorAccountId: locked.accountId },
            data: { moderatorAccountId: null, moderatorUnlinkedAt: now },
        });
        await tx.review.updateMany({
            where: { retentionReviewerAccountId: locked.accountId },
            data: { retentionReviewerAccountId: null, retentionReviewerUnlinkedAt: now },
        });

        const [deletedProfile, deletedFavorites, revokedSessions] = await Promise.all([
            tx.userProfile.deleteMany({ where: { accountId: locked.accountId } }),
            tx.favorite.deleteMany({ where: { accountId: locked.accountId } }),
            tx.authSession.deleteMany({ where: { accountId: locked.accountId } }),
        ]);

        await tx.accountIdentity.updateMany({
            where: { accountId: locked.accountId, unlinkedAt: null },
            data: { unlinkedAt: now },
        });
        await tx.account.update({
            where: { id: locked.accountId },
            data: { state: "CLOSED", closedAt: now },
        });

        return tx.accountClosure.update({
            where: { id: closureId },
            data: {
                status: "PROVIDER_PENDING",
                localCompletedAt: now,
                deletedProfileCount: deletedProfile.count,
                deletedFavoriteCount: deletedFavorites.count,
                revokedSessionCount: closure.revokedSessionCount + revokedSessions.count,
                deletedReviewCount: deletedReviews.count,
                retainedReviewCount,
                unlinkedReportCount: unlinkedReports.count,
                unlinkedModerationCount: unlinkedModeration.count,
            },
            select: closureSelect,
        });
    });
}

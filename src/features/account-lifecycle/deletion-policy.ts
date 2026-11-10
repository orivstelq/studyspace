const DAY_MS = 24 * 60 * 60 * 1000;

export const ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT";

export const RETENTION_LIMITS = {
    resolvedReportDays: 90,
    moderationAuditDays: 180,
    expiredSessionCleanupDays: 7,
} as const;

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "HIDDEN";
export type ReportStatus = "OPEN" | "RESOLVED";
export type ReviewRetentionReason = "OPEN_REPORT" | "REPORT_EVIDENCE" | "AUDIT_EVIDENCE" | "APPROVED_HOLD";
export type IdentifierSignal = "EMAIL" | "PHONE" | "URL" | "SOCIAL_HANDLE";

export interface ReviewRetentionRequirement {
    reason: ReviewRetentionReason;
    /** Null is permitted only while an associated report remains open. */
    until: Date | null;
}

export interface ReviewForDeletionPlan {
    id: string;
    status: ReviewStatus;
    body: string;
    retention?: ReviewRetentionRequirement | null;
}

export interface ReportForDeletionPlan {
    id: string;
    status: ReportStatus;
    resolvedAt: Date | null;
}

export interface AuditException {
    /** An operator-reviewed case reference; the planner deliberately does not return it. */
    reference: string;
    until: Date;
}

export interface ModerationAuditForDeletionPlan {
    id: string;
    createdAt: Date;
    exception?: AuditException | null;
}

export interface AccountDeletionSnapshot {
    profileExists: boolean;
    favoriteCount: number;
    applicationSessionCount: number;
    reviews: ReviewForDeletionPlan[];
    reports: ReportForDeletionPlan[];
    moderationAudits: ModerationAuditForDeletionPlan[];
}

export type ReviewDisposition =
    | "DELETE"
    | "RETAIN_APPROVED_UNLINKED"
    | "RETAIN_RESTRICTED_UNLINKED_UNTIL"
    | "RETAIN_RESTRICTED_UNLINKED_UNTIL_REPORT_RESOLUTION";

export type ReportDisposition = "DELETE" | "RETAIN_OPEN_UNLINKED" | "RETAIN_RESOLVED_UNLINKED_UNTIL";
export type AuditDisposition = "DELETE" | "RETAIN_UNLINKED_UNTIL";

export interface AccountDeletionPlan {
    immediate: {
        deleteProfile: boolean;
        deleteFavoriteCount: number;
        revokeApplicationSessionCount: number;
    };
    reviews: Array<{
        id: string;
        disposition: ReviewDisposition;
        retainUntil: Date | null;
        retentionReason: ReviewRetentionReason | null;
        requiresHumanTextReview: boolean;
        identifierSignals: IdentifierSignal[];
    }>;
    reports: Array<{
        id: string;
        disposition: ReportDisposition;
        retainUntil: Date | null;
        unlinkReporter: boolean;
    }>;
    moderationAudits: Array<{
        id: string;
        disposition: AuditDisposition;
        retainUntil: Date | null;
        unlinkModerator: boolean;
        usesApprovedException: boolean;
    }>;
}

export function isExactDeletionConfirmation(value: unknown) {
    return value === ACCOUNT_DELETION_CONFIRMATION;
}

export function expiredSessionCleanupDeadline(expiresAt: Date) {
    assertDate(expiresAt, "session expiry");
    return addDays(expiresAt, RETENTION_LIMITS.expiredSessionCleanupDays);
}

export function reviewIdentifierSignals(body: string): IdentifierSignal[] {
    const signals: IdentifierSignal[] = [];
    if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(body)) signals.push("EMAIL");
    if (/(?:^|\s)(?:\+?\d[\d ().-]{7,}\d)(?=$|[^\d])/.test(body)) signals.push("PHONE");
    if (/\b(?:https?:\/\/|www\.)\S+/i.test(body)) signals.push("URL");
    if (/(?:^|\s)@[A-Z0-9_]{2,}\b/i.test(body)) signals.push("SOCIAL_HANDLE");
    return signals;
}

/**
 * Produces a non-mutating plan from already-authorized, account-scoped rows.
 * It intentionally accepts neither a provider subject nor an owner key.
 */
export function buildAccountDeletionPlan(snapshot: AccountDeletionSnapshot, now: Date): AccountDeletionPlan {
    assertDate(now, "plan time");
    assertCount(snapshot.favoriteCount, "favorite count");
    assertCount(snapshot.applicationSessionCount, "application session count");

    return {
        immediate: {
            deleteProfile: snapshot.profileExists,
            deleteFavoriteCount: snapshot.favoriteCount,
            revokeApplicationSessionCount: snapshot.applicationSessionCount,
        },
        reviews: snapshot.reviews.map((review) => planReview(review, now)),
        reports: snapshot.reports.map((report) => planReport(report, now)),
        moderationAudits: snapshot.moderationAudits.map((audit) => planAudit(audit, now)),
    };
}

function planReview(review: ReviewForDeletionPlan, now: Date): AccountDeletionPlan["reviews"][number] {
    if (review.status === "APPROVED") {
        return {
            id: review.id,
            disposition: "RETAIN_APPROVED_UNLINKED",
            retainUntil: null,
            retentionReason: null,
            requiresHumanTextReview: true,
            identifierSignals: reviewIdentifierSignals(review.body),
        };
    }

    const retention = review.retention;
    if (!retention) return deletedReview(review.id);
    if (retention.until === null) {
        if (retention.reason !== "OPEN_REPORT") {
            throw new Error("Only an open report may retain a review without a deadline.");
        }
        return {
            id: review.id,
            disposition: "RETAIN_RESTRICTED_UNLINKED_UNTIL_REPORT_RESOLUTION",
            retainUntil: null,
            retentionReason: retention.reason,
            requiresHumanTextReview: false,
            identifierSignals: [],
        };
    }

    assertDate(retention.until, "review retention deadline");
    if (retention.until.getTime() <= now.getTime()) return deletedReview(review.id);
    return {
        id: review.id,
        disposition: "RETAIN_RESTRICTED_UNLINKED_UNTIL",
        retainUntil: new Date(retention.until),
        retentionReason: retention.reason,
        requiresHumanTextReview: false,
        identifierSignals: [],
    };
}

function deletedReview(id: string): AccountDeletionPlan["reviews"][number] {
    return {
        id,
        disposition: "DELETE",
        retainUntil: null,
        retentionReason: null,
        requiresHumanTextReview: false,
        identifierSignals: [],
    };
}

function planReport(report: ReportForDeletionPlan, now: Date): AccountDeletionPlan["reports"][number] {
    if (report.status === "OPEN") {
        if (report.resolvedAt !== null) throw new Error("An open report cannot have a resolution time.");
        return {
            id: report.id,
            disposition: "RETAIN_OPEN_UNLINKED",
            retainUntil: null,
            unlinkReporter: true,
        };
    }

    if (!report.resolvedAt) throw new Error("A resolved report must have a resolution time.");
    assertDate(report.resolvedAt, "report resolution time");
    const retainUntil = addDays(report.resolvedAt, RETENTION_LIMITS.resolvedReportDays);
    if (retainUntil.getTime() <= now.getTime()) {
        return { id: report.id, disposition: "DELETE", retainUntil: null, unlinkReporter: false };
    }
    return {
        id: report.id,
        disposition: "RETAIN_RESOLVED_UNLINKED_UNTIL",
        retainUntil,
        unlinkReporter: true,
    };
}

function planAudit(audit: ModerationAuditForDeletionPlan, now: Date): AccountDeletionPlan["moderationAudits"][number] {
    assertDate(audit.createdAt, "audit creation time");
    const ordinaryDeadline = addDays(audit.createdAt, RETENTION_LIMITS.moderationAuditDays);
    let retainUntil = ordinaryDeadline;
    let usesApprovedException = false;

    if (audit.exception) {
        if (!audit.exception.reference.trim()) throw new Error("An audit retention exception requires a case reference.");
        assertDate(audit.exception.until, "audit exception deadline");
        if (audit.exception.until.getTime() <= ordinaryDeadline.getTime()) {
            throw new Error("An audit retention exception must extend beyond the ordinary deadline.");
        }
        retainUntil = new Date(audit.exception.until);
        usesApprovedException = true;
    }

    if (retainUntil.getTime() <= now.getTime()) {
        return {
            id: audit.id,
            disposition: "DELETE",
            retainUntil: null,
            unlinkModerator: false,
            usesApprovedException,
        };
    }
    return {
        id: audit.id,
        disposition: "RETAIN_UNLINKED_UNTIL",
        retainUntil,
        unlinkModerator: true,
        usesApprovedException,
    };
}

function addDays(value: Date, days: number) {
    return new Date(value.getTime() + days * DAY_MS);
}

function assertDate(value: Date, label: string): asserts value is Date {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error(`Invalid ${label}.`);
}

function assertCount(value: number, label: string) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${label}.`);
}

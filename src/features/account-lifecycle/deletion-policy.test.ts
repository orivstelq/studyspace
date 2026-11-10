import { describe, expect, it } from "vitest";
import {
    ACCOUNT_DELETION_CONFIRMATION,
    buildAccountDeletionPlan,
    expiredSessionCleanupDeadline,
    isExactDeletionConfirmation,
    RETENTION_LIMITS,
} from "./deletion-policy";

const now = new Date("2026-11-09T12:00:00.000Z");

function emptySnapshot() {
    return {
        profileExists: false,
        favoriteCount: 0,
        applicationSessionCount: 0,
        reviews: [],
        reports: [],
        moderationAudits: [],
    };
}

describe("account deletion policy", () => {
    it("requires the deliberate confirmation phrase exactly", () => {
        expect(isExactDeletionConfirmation(ACCOUNT_DELETION_CONFIRMATION)).toBe(true);
        expect(isExactDeletionConfirmation("delete my account")).toBe(false);
        expect(isExactDeletionConfirmation(` ${ACCOUNT_DELETION_CONFIRMATION}`)).toBe(false);
        expect(isExactDeletionConfirmation(null)).toBe(false);
    });

    it("plans immediate removal of profile, favorites, and every application session", () => {
        const plan = buildAccountDeletionPlan({
            ...emptySnapshot(),
            profileExists: true,
            favoriteCount: 4,
            applicationSessionCount: 3,
        }, now);
        expect(plan.immediate).toEqual({
            deleteProfile: true,
            deleteFavoriteCount: 4,
            revokeApplicationSessionCount: 3,
        });
    });

    it("retains approved reviews only as unlinked rows and flags identifying text for human assessment", () => {
        const [review] = buildAccountDeletionPlan({
            ...emptySnapshot(),
            reviews: [{
                id: "approved",
                status: "APPROVED",
                body: "Contact me at writer@example.test, +1 (512) 555-0100, https://example.test, or @writer.",
            }],
        }, now).reviews;

        expect(review).toEqual({
            id: "approved",
            disposition: "RETAIN_APPROVED_UNLINKED",
            retainUntil: null,
            retentionReason: null,
            requiresHumanTextReview: true,
            identifierSignals: ["EMAIL", "PHONE", "URL", "SOCIAL_HANDLE"],
        });
        expect(review).not.toHaveProperty("body");
    });

    it("deletes non-public reviews unless a current, justified retention requirement applies", () => {
        const reviews = buildAccountDeletionPlan({
            ...emptySnapshot(),
            reviews: [
                { id: "pending", status: "PENDING", body: "Pending review" },
                { id: "rejected", status: "REJECTED", body: "Rejected review", retention: { reason: "AUDIT_EVIDENCE", until: new Date("2026-11-08T12:00:00Z") } },
                { id: "withdrawn", status: "WITHDRAWN", body: "Withdrawn review", retention: { reason: "REPORT_EVIDENCE", until: new Date("2026-12-01T12:00:00Z") } },
                { id: "hidden", status: "HIDDEN", body: "Hidden review", retention: { reason: "OPEN_REPORT", until: null } },
            ],
        }, now).reviews;

        expect(reviews.map(({ id, disposition }) => [id, disposition])).toEqual([
            ["pending", "DELETE"],
            ["rejected", "DELETE"],
            ["withdrawn", "RETAIN_RESTRICTED_UNLINKED_UNTIL"],
            ["hidden", "RETAIN_RESTRICTED_UNLINKED_UNTIL_REPORT_RESOLUTION"],
        ]);
        expect(() => buildAccountDeletionPlan({
            ...emptySnapshot(),
            reviews: [{ id: "invalid", status: "HIDDEN", body: "Hidden", retention: { reason: "AUDIT_EVIDENCE", until: null } }],
        }, now)).toThrow(/open report/i);
    });

    it("unlinks open and recent resolved reports, then deletes them at the 90-day maximum", () => {
        const resolvedAt = new Date("2026-09-01T12:00:00Z");
        const reports = buildAccountDeletionPlan({
            ...emptySnapshot(),
            reports: [
                { id: "open", status: "OPEN", resolvedAt: null },
                { id: "recent", status: "RESOLVED", resolvedAt },
                { id: "expired", status: "RESOLVED", resolvedAt: new Date("2026-08-11T12:00:00Z") },
            ],
        }, now).reports;

        expect(reports[0]).toMatchObject({ disposition: "RETAIN_OPEN_UNLINKED", unlinkReporter: true, retainUntil: null });
        expect(reports[1]).toMatchObject({ disposition: "RETAIN_RESOLVED_UNLINKED_UNTIL", unlinkReporter: true });
        expect(reports[1].retainUntil).toEqual(new Date("2026-11-30T12:00:00Z"));
        expect(reports[2]).toEqual({ id: "expired", disposition: "DELETE", retainUntil: null, unlinkReporter: false });
        expect(() => buildAccountDeletionPlan({
            ...emptySnapshot(), reports: [{ id: "bad", status: "RESOLVED", resolvedAt: null }],
        }, now)).toThrow(/resolution time/i);
    });

    it("limits moderation audit retention to 180 days unless a reviewed exception is supplied", () => {
        const audits = buildAccountDeletionPlan({
            ...emptySnapshot(),
            moderationAudits: [
                { id: "ordinary", createdAt: new Date("2026-10-01T12:00:00Z") },
                { id: "expired", createdAt: new Date("2026-05-01T12:00:00Z") },
                {
                    id: "exception",
                    createdAt: new Date("2026-05-20T12:00:00Z"),
                    exception: { reference: "operator-reviewed-case", until: new Date("2026-12-01T12:00:00Z") },
                },
            ],
        }, now).moderationAudits;

        expect(audits[0]).toMatchObject({ disposition: "RETAIN_UNLINKED_UNTIL", unlinkModerator: true, usesApprovedException: false });
        expect(audits[0].retainUntil).toEqual(new Date("2027-03-30T12:00:00Z"));
        expect(audits[1]).toMatchObject({ disposition: "DELETE", unlinkModerator: false });
        expect(audits[2]).toMatchObject({ disposition: "RETAIN_UNLINKED_UNTIL", unlinkModerator: true, usesApprovedException: true });
        expect(() => buildAccountDeletionPlan({
            ...emptySnapshot(),
            moderationAudits: [{
                id: "bad-exception",
                createdAt: new Date("2026-10-01T12:00:00Z"),
                exception: { reference: "", until: new Date("2027-05-01T12:00:00Z") },
            }],
        }, now)).toThrow(/case reference/i);
    });

    it("calculates the latest permitted expired-session cleanup time without mutating the input", () => {
        const expiredAt = new Date("2026-11-01T12:00:00Z");
        expect(expiredSessionCleanupDeadline(expiredAt)).toEqual(new Date("2026-11-08T12:00:00Z"));
        expect(expiredAt).toEqual(new Date("2026-11-01T12:00:00Z"));
        expect(RETENTION_LIMITS.expiredSessionCleanupDays).toBe(7);
    });
});

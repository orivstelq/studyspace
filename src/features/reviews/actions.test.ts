import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { moderateContent, submitReport, updateReview } from "./actions";
import { parseReport, parseReview } from "./validation";

const mocks = vi.hoisted(() => ({
    headers: vi.fn(), identity: vi.fn(), database: vi.fn(), revalidate: vi.fn(),
    save: vi.fn(), withdraw: vi.fn(), report: vi.fn(), moderate: vi.fn(), resolve: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/auth/auth", () => ({ getAuthIdentity: mocks.identity }));
vi.mock("@/lib/db/private-client", () => ({ privateDatabase: mocks.database }));
vi.mock("./query", () => ({
    saveOwnReview: mocks.save,
    withdrawOwnReview: mocks.withdraw,
    submitContentReport: mocks.report,
    moderateReview: mocks.moderate,
    resolveReport: mocks.resolve,
}));

function reviewForm() {
    const form = new FormData();
    form.set("slug", "test-space");
    form.set("intent", "submit");
    form.set("rating", "4");
    form.set("body", "A useful and sufficiently detailed review.");
    return form;
}

function reportForm() {
    const form = new FormData();
    form.set("targetType", "LISTING");
    form.set("slug", "test-space");
    form.set("reason", "INACCURATE");
    form.set("details", "The listed hours are no longer current.");
    return form;
}

describe("review, report, and moderation actions", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("APP_BASE_URL", "https://studyspace.example");
        mocks.headers.mockResolvedValue(new Headers({ origin: "https://studyspace.example" }));
        mocks.identity.mockResolvedValue({ ownerKey: "verified-owner", isModerator: false });
        mocks.database.mockReturnValue("private-db");
        mocks.save.mockResolvedValue({ id: "review" });
        mocks.withdraw.mockResolvedValue(true);
        mocks.report.mockResolvedValue(true);
        mocks.moderate.mockResolvedValue(true);
        mocks.resolve.mockResolvedValue(true);
    });

    afterEach(() => vi.unstubAllEnvs());

    it("validates review and report boundaries", () => {
        expect(parseReview(reviewForm())).toMatchObject({ slug: "test-space", rating: 4 });
        const short = reviewForm(); short.set("body", "too short");
        expect(parseReview(short)).toBeNull();
        expect(parseReport(reportForm())).toMatchObject({ target: { type: "LISTING", slug: "test-space" }, reason: "INACCURATE" });
        const invalid = reportForm(); invalid.set("reason", "UNTRUSTED");
        expect(parseReport(invalid)).toBeNull();
    });

    it("denies guests before private mutations", async () => {
        mocks.identity.mockResolvedValue(null);
        expect(await updateReview(null, reviewForm())).toMatch(/Sign in/);
        expect(await submitReport(null, reportForm())).toMatch(/Sign in/);
        expect(mocks.save).not.toHaveBeenCalled();
        expect(mocks.report).not.toHaveBeenCalled();
    });

    it("uses the verified owner for review and report writes", async () => {
        expect(await updateReview(null, reviewForm())).toMatch(/approval/);
        expect(mocks.save).toHaveBeenCalledWith("private-db", "verified-owner", "test-space", 4, "A useful and sufficiently detailed review.");
        expect(await submitReport(null, reportForm())).toMatch(/privately/);
        expect(mocks.report).toHaveBeenCalledWith("private-db", "verified-owner", { type: "LISTING", slug: "test-space" }, "INACCURATE", "The listed hours are no longer current.");
    });

    it("denies moderation to authenticated non-moderators", async () => {
        const form = new FormData();
        form.set("intent", "approve-review");
        form.set("id", "d9428888-122b-4b1f-bad6-3c3fb13b14da");
        expect(await moderateContent(null, form)).toMatch(/not authorized/);
        expect(mocks.moderate).not.toHaveBeenCalled();
    });

    it("passes a trusted moderator identity to the DAL", async () => {
        mocks.identity.mockResolvedValue({ ownerKey: "moderator", isModerator: true });
        const form = new FormData();
        form.set("intent", "hide-review");
        form.set("id", "d9428888-122b-4b1f-bad6-3c3fb13b14da");
        expect(await moderateContent(null, form)).toMatch(/recorded/);
        expect(mocks.moderate).toHaveBeenCalledWith("private-db", { ownerKey: "moderator", isModerator: true }, form.get("id"), "hide");
    });
});

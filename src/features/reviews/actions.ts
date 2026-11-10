"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthIdentity } from "@/lib/auth/auth";
import { privateDatabase } from "@/lib/db/private-client";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { moderateReview, resolveReport, saveOwnReview, submitContentReport, withdrawOwnReview } from "./query";
import { parseReport, parseReview, validSlug, validUuid } from "./validation";

async function verifiedRequest() {
    const baseUrl = process.env.APP_BASE_URL;
    const origin = (await headers()).get("origin");
    return Boolean(baseUrl && origin && origin === new URL(baseUrl).origin);
}

export async function updateReview(_previousMessage: string | null, form: FormData): Promise<string> {
    if (!await verifiedRequest()) return "This request could not be verified.";
    const identity = await getAuthIdentity();
    if (!identity) return "Sign in again to update your review.";

    const intent = form.get("intent");
    const slug = form.get("slug");
    try {
        if (intent === "withdraw" && validSlug(slug)) {
            if (!await withdrawOwnReview(privateDatabase(), identity.accountId, slug)) return "This review could not be withdrawn.";
            revalidatePath(`/spaces/${slug}`);
            revalidatePath("/admin");
            return "Review withdrawn.";
        }
        if (intent !== "submit") return "This review could not be updated.";
        const review = parseReview(form);
        if (!review) return "Add a rating and 20–2,000 characters of review text.";
        if (!(await enforceRateLimit(RATE_LIMITS.reviewSubmission, identity.ownerKey)).allowed) {
            return "Too many review updates. Try again later.";
        }
        if (!await saveOwnReview(privateDatabase(), identity.accountId, review.slug, review.rating, review.body)) {
            return "This listing is no longer available for reviews.";
        }
        revalidatePath(`/spaces/${review.slug}`);
        revalidatePath("/admin");
        return "Review submitted for moderator approval.";
    } catch (error) {
        console.error("Review update failed:", error instanceof Error ? error.name : "Unknown error");
        return "Reviews are temporarily unavailable. Try again.";
    }
}

export async function submitReport(_previousMessage: string | null, form: FormData): Promise<string> {
    if (!await verifiedRequest()) return "This request could not be verified.";
    const identity = await getAuthIdentity();
    if (!identity) return "Sign in again to submit a report.";
    const report = parseReport(form);
    if (!report) return "Choose a reason and provide 10–1,000 characters when adding details.";

    try {
        if (!(await enforceRateLimit(RATE_LIMITS.reportSubmission, identity.ownerKey)).allowed) {
            return "Too many reports submitted. Try again later.";
        }
        if (!await submitContentReport(privateDatabase(), identity.accountId, report.target, report.reason, report.details)) {
            return "This content is no longer available to report.";
        }
        revalidatePath("/admin");
        return "Report submitted privately to moderators.";
    } catch (error) {
        if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
            return "You already have an open report for this content.";
        }
        console.error("Report submission failed:", error instanceof Error ? error.name : "Unknown error");
        return "Reports are temporarily unavailable. Try again.";
    }
}

export async function moderateContent(_previousMessage: string | null, form: FormData): Promise<string> {
    if (!await verifiedRequest()) return "This request could not be verified.";
    const identity = await getAuthIdentity();
    if (!identity?.isModerator) return "You are not authorized to moderate content.";

    const intent = form.get("intent");
    const id = form.get("id");
    if (!validUuid(id)) return "This moderation request is invalid.";
    try {
        if (!(await enforceRateLimit(RATE_LIMITS.moderationMutation, identity.ownerKey)).allowed) {
            return "Too many moderation updates. Try again later.";
        }
        const changed = intent === "resolve-report"
            ? await resolveReport(privateDatabase(), identity, id)
            : intent === "approve-review" || intent === "reject-review" || intent === "hide-review"
                ? await moderateReview(privateDatabase(), identity, id, intent.replace("-review", "") as "approve" | "reject" | "hide")
                : false;
        if (!changed) return "This item has already changed and was not updated.";
        revalidatePath("/admin");
        revalidatePath("/spaces", "layout");
        return "Moderation action recorded.";
    } catch (error) {
        console.error("Moderation failed:", error instanceof Error ? error.name : "Unknown error");
        return "Moderation is temporarily unavailable. Try again.";
    }
}

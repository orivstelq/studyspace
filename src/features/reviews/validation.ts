const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reportReasons = ["INACCURATE", "CLOSED", "INAPPROPRIATE", "OTHER"] as const;

export function validSlug(value: FormDataEntryValue | null): value is string {
    return typeof value === "string" && value.length <= 160 && slugPattern.test(value);
}

export function validUuid(value: FormDataEntryValue | null): value is string {
    return typeof value === "string" && uuidPattern.test(value);
}

export function parseReview(form: FormData) {
    const slug = form.get("slug");
    const rating = form.get("rating");
    const body = form.get("body");
    if (!validSlug(slug) || typeof rating !== "string" || !/^[1-5]$/.test(rating) || typeof body !== "string") return null;
    const trimmed = body.trim();
    if (trimmed.length < 20 || trimmed.length > 2000) return null;
    return { slug, rating: Number(rating), body: trimmed };
}

export function parseReport(form: FormData) {
    const targetType = form.get("targetType");
    const reason = form.get("reason");
    const detailsValue = form.get("details");
    if ((targetType !== "LISTING" && targetType !== "REVIEW") ||
        typeof reason !== "string" || !reportReasons.includes(reason as typeof reportReasons[number]) ||
        typeof detailsValue !== "string") return null;
    const details = detailsValue.trim() || null;
    if (details && (details.length < 10 || details.length > 1000)) return null;

    if (targetType === "LISTING") {
        const slug = form.get("slug");
        return validSlug(slug) ? { target: { type: "LISTING" as const, slug }, reason: reason as typeof reportReasons[number], details } : null;
    }
    const reviewId = form.get("reviewId");
    return validUuid(reviewId) ? { target: { type: "REVIEW" as const, reviewId }, reason: reason as typeof reportReasons[number], details } : null;
}

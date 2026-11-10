import { getAuthClient, getAuthIdentity } from "@/lib/auth/auth";
import { publicDatabase } from "@/lib/db/client";
import { privateDatabase } from "@/lib/db/private-client";
import { getOwnReview, listApprovedReviews } from "./query";
import { ReviewForm } from "./review-form";
import { ReportForm } from "./report-form";

export async function CommunityReviews({ studySpaceId, slug }: { studySpaceId: string; slug: string }) {
    const auth = getAuthClient();
    const identity = auth ? await getAuthIdentity() : null;
    const [reviews, ownReview] = await Promise.all([
        listApprovedReviews(publicDatabase(), studySpaceId),
        identity ? getOwnReview(privateDatabase(), identity, studySpaceId) : Promise.resolve(null),
    ]);

    return (
        <section aria-labelledby="community-reviews-heading" className="mt-10 border-t border-clay pt-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 id="community-reviews-heading" className="text-2xl font-semibold">Community reviews</h2>
                    <p className="mt-2 text-sm text-muted">Only moderator-approved reviews appear publicly.</p>
                </div>
                {identity && <ReportForm target={{ targetType: "LISTING", slug }} />}
            </div>

            {identity ? (
                <ReviewForm slug={slug} review={ownReview} />
            ) : auth ? (
                <a href={`/auth/login?returnTo=/spaces/${slug}`} className="mt-6 inline-flex min-h-11 items-center font-semibold text-harbor underline">Sign in to review or report</a>
            ) : null}

            {reviews.length ? (
                <ul className="mt-8 grid gap-4">
                    {reviews.map((review) => (
                        <li key={review.id} className="rounded-2xl border border-clay bg-white p-5">
                            <p className="font-semibold" aria-label={`${review.rating} out of 5 stars`}>{review.rating} / 5</p>
                            <p className="mt-3 whitespace-pre-wrap leading-7 text-muted">{review.body}</p>
                            {review.publishedAt && <p className="mt-3 text-xs text-muted"><time dateTime={review.publishedAt.toISOString()}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(review.publishedAt)}</time></p>}
                            {identity && <ReportForm target={{ targetType: "REVIEW", reviewId: review.id }} />}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mt-8 rounded-2xl border border-clay bg-white p-6 text-muted">No approved reviews yet.</p>
            )}
        </section>
    );
}

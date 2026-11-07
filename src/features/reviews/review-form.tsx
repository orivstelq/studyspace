"use client";

import { useActionState } from "react";
import { updateReview } from "./actions";

type OwnReview = {
    rating: number;
    body: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "HIDDEN";
} | null;

const statusLabels = {
    PENDING: "Pending moderator approval",
    APPROVED: "Published",
    REJECTED: "Rejected — edit to resubmit",
    WITHDRAWN: "Withdrawn — edit to resubmit",
    HIDDEN: "Hidden by a moderator — edit to resubmit",
} as const;

export function ReviewForm({ slug, review }: { slug: string; review: OwnReview }) {
    const [message, action, pending] = useActionState(updateReview, null);
    const [withdrawMessage, withdrawAction, withdrawing] = useActionState(updateReview, null);

    return (
        <div className="mt-6 rounded-2xl border border-clay bg-white p-5">
            <h3 className="text-lg font-semibold">{review ? "Your review" : "Write a review"}</h3>
            {review && <p className="mt-2 text-sm font-semibold text-harbor">{statusLabels[review.status]}</p>}
            <form action={action} className="mt-4">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="intent" value="submit" />
                <label htmlFor="review-rating" className="block text-sm font-semibold">Rating</label>
                <select id="review-rating" name="rating" defaultValue={review?.rating ?? 5} className="mt-2 rounded-lg border border-clay bg-paper px-4 py-3">
                    {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} of 5</option>)}
                </select>
                <label htmlFor="review-body" className="mt-4 block text-sm font-semibold">Review</label>
                <textarea
                    id="review-body"
                    name="body"
                    defaultValue={review?.body ?? ""}
                    minLength={20}
                    maxLength={2000}
                    required
                    rows={5}
                    className="mt-2 w-full rounded-lg border border-clay bg-paper px-4 py-3"
                />
                <p className="mt-2 text-xs text-muted">
                    {review?.status === "APPROVED"
                        ? "Submitting changes temporarily removes this review from public view until a moderator approves it again."
                        : "New reviews and changes stay private until a moderator approves them."}
                </p>
                <button type="submit" disabled={pending} className="mt-4 min-h-11 rounded-lg bg-harbor px-4 py-3 font-semibold text-white disabled:opacity-60">
                    {pending ? "Submitting…" : review ? "Submit changes" : "Submit review"}
                </button>
                {message && <p role="status" aria-live="polite" className="mt-3 text-sm">{message}</p>}
            </form>
            {review && review.status !== "WITHDRAWN" && (
                <form action={withdrawAction} className="mt-3">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="intent" value="withdraw" />
                    <button type="submit" disabled={withdrawing} className="min-h-11 px-1 text-sm font-semibold text-harbor underline disabled:opacity-60">
                        {withdrawing ? "Withdrawing…" : "Withdraw review"}
                    </button>
                    {withdrawMessage && <p role="status" aria-live="polite" className="mt-2 text-sm">{withdrawMessage}</p>}
                </form>
            )}
        </div>
    );
}

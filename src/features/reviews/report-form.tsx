"use client";

import { useActionState } from "react";
import { submitReport } from "./actions";

type ReportTarget = { targetType: "LISTING"; slug: string } | { targetType: "REVIEW"; reviewId: string };

export function ReportForm({ target }: { target: ReportTarget }) {
    const [message, action, pending] = useActionState(submitReport, null);
    return (
        <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold text-harbor underline">Report this {target.targetType === "LISTING" ? "listing" : "review"}</summary>
            <form action={action} className="mt-3 rounded-xl border border-clay bg-paper p-4">
                <input type="hidden" name="targetType" value={target.targetType} />
                {target.targetType === "LISTING"
                    ? <input type="hidden" name="slug" value={target.slug} />
                    : <input type="hidden" name="reviewId" value={target.reviewId} />}
                <label className="block font-semibold">
                    Reason
                    <select name="reason" className="mt-2 block w-full rounded-lg border border-clay bg-white px-3 py-3">
                        <option value="INACCURATE">Inaccurate information</option>
                        <option value="CLOSED">Location closed or unavailable</option>
                        <option value="INAPPROPRIATE">Inappropriate content</option>
                        <option value="OTHER">Other</option>
                    </select>
                </label>
                <label className="mt-3 block font-semibold">
                    Details (optional)
                    <textarea name="details" minLength={10} maxLength={1000} rows={3} className="mt-2 block w-full rounded-lg border border-clay bg-white px-3 py-3" />
                </label>
                <button type="submit" disabled={pending} className="mt-3 min-h-11 rounded-lg border border-harbor px-4 py-2 font-semibold text-harbor disabled:opacity-60">
                    {pending ? "Submitting…" : "Send private report"}
                </button>
                {message && <p role="status" aria-live="polite" className="mt-2">{message}</p>}
            </form>
        </details>
    );
}

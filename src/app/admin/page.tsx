import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getAuthClient, getAuthIdentity } from "@/lib/auth/auth";
import { privateDatabase } from "@/lib/db/private-client";
import { listModerationQueue } from "@/features/reviews/query";
import { ModerationControl } from "@/features/reviews/moderation-controls";

export const metadata: Metadata = { title: "Moderation", robots: { index: false, follow: false } };

async function ModerationQueue() {
    await connection();
    const auth = getAuthClient();
    if (!auth) return <p className="mt-8 rounded-2xl border border-clay bg-white p-6 text-muted">Moderation sign-in is not configured.</p>;
    const identity = await getAuthIdentity();
    if (!identity) return <a href="/auth/login?returnTo=/admin" className="mt-8 inline-flex min-h-11 items-center rounded-lg bg-harbor px-4 py-3 font-semibold text-white">Sign in</a>;
    if (!identity.isModerator) notFound();
    const queue = await listModerationQueue(privateDatabase(), identity);
    if (!queue) notFound();

    return (
        <div className="mt-8 space-y-10">
            <section aria-labelledby="pending-reviews-heading">
                <h2 id="pending-reviews-heading" className="text-2xl font-semibold">Pending reviews</h2>
                {queue.reviews.length ? <ul className="mt-4 grid gap-4">{queue.reviews.map((review) => (
                    <li key={review.id} className="rounded-2xl border border-clay bg-white p-5">
                        <h3 className="font-semibold"><Link href={`/spaces/${review.studySpace.slug}`} className="hover:underline">{review.studySpace.name}</Link> · {review.rating}/5</h3>
                        <p className="mt-3 whitespace-pre-wrap text-muted">{review.body}</p>
                        <div className="mt-4 flex flex-wrap gap-3">
                            <ModerationControl id={review.id} intent="approve-review" label="Approve" />
                            <ModerationControl id={review.id} intent="reject-review" label="Reject" />
                        </div>
                    </li>
                ))}</ul> : <p className="mt-4 text-muted">No pending reviews.</p>}
            </section>

            <section aria-labelledby="published-reviews-heading">
                <h2 id="published-reviews-heading" className="text-2xl font-semibold">Published reviews</h2>
                {queue.publishedReviews.length ? <ul className="mt-4 grid gap-4">{queue.publishedReviews.map((review) => (
                    <li key={review.id} className="rounded-2xl border border-clay bg-white p-5">
                        <h3 className="font-semibold"><Link href={`/spaces/${review.studySpace.slug}`} className="hover:underline">{review.studySpace.name}</Link> · {review.rating}/5</h3>
                        <p className="mt-3 whitespace-pre-wrap text-muted">{review.body}</p>
                        <div className="mt-4"><ModerationControl id={review.id} intent="hide-review" label="Hide review" /></div>
                    </li>
                ))}</ul> : <p className="mt-4 text-muted">No published reviews.</p>}
            </section>

            <section aria-labelledby="reports-heading">
                <h2 id="reports-heading" className="text-2xl font-semibold">Open reports</h2>
                {queue.reports.length ? <ul className="mt-4 grid gap-4">{queue.reports.map((report) => {
                    const target = report.listing ?? report.review?.studySpace;
                    return <li key={report.id} className="rounded-2xl border border-clay bg-white p-5">
                        <h3 className="font-semibold">{report.reason.replaceAll("_", " ").toLowerCase()} · {target?.name ?? "Unavailable target"}</h3>
                        {report.review && <p className="mt-2 text-sm text-muted">Reported review: {report.review.body}</p>}
                        {report.details && <p className="mt-3 whitespace-pre-wrap text-muted">{report.details}</p>}
                        <div className="mt-4"><ModerationControl id={report.id} intent="resolve-report" label="Resolve report" /></div>
                    </li>;
                })}</ul> : <p className="mt-4 text-muted">No open reports.</p>}
            </section>
        </div>
    );
}

export default function AdminPage() {
    return (
        <main id="main-content" className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-harbor">Restricted administration</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">Moderation</h1>
            <p className="mt-4 text-muted">Review pending community content and private reports.</p>
            <Suspense fallback={<p role="status" className="mt-8 text-muted">Loading moderation queue…</p>}><ModerationQueue /></Suspense>
        </main>
    );
}

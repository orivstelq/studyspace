import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getAuthClient, getAuthIdentity } from "@/lib/auth/auth";
import { privateDatabase } from "@/lib/db/private-client";
import { ProfileForm } from "@/features/profile/profile-form";
import { getProfile, type ProfilePreferences } from "@/features/profile/query";
import { mapDatabaseSpace } from "@/features/discovery/map-record";
import { listRecommendationCandidates } from "@/features/discovery/repository";
import { rankSpaces } from "@/features/recommendations/score";

export const metadata: Metadata = {
    title: "Study preferences",
    robots: { index: false, follow: false },
};

const emptyPreferences: ProfilePreferences = { category: "all", amenities: [] };

async function ProfileContent() {
    await connection();
    const auth = getAuthClient();
    const identity = auth ? await getAuthIdentity() : null;

    if (!auth) return (
        <section className="mt-8 rounded-2xl border border-clay bg-white p-6">
            <h2 className="text-xl font-semibold">Preferences are unavailable</h2>
            <p className="mt-3 text-muted">Sign-in is not configured on this installation.</p>
            <Link href="/explore" className="mt-4 inline-block font-semibold text-harbor underline">Explore spaces</Link>
        </section>
    );

    if (!identity) return (
        <section className="mt-8 rounded-2xl border border-clay bg-white p-6">
            <h2 className="text-xl font-semibold">Sign in to save preferences</h2>
            <a href="/auth/login?returnTo=/profile" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-harbor px-4 py-3 font-semibold text-white">Sign in</a>
        </section>
    );

    const [storedPreferences, candidates] = await Promise.all([
        getProfile(privateDatabase(), identity.ownerKey),
        listRecommendationCandidates(),
    ]);
    const preferences = storedPreferences ?? emptyPreferences;
    const hasPreferences = preferences.category !== "all" || preferences.amenities.length > 0;
    const recommendations = hasPreferences
        ? rankSpaces(candidates.map(mapDatabaseSpace), preferences).slice(0, 3)
        : [];

    return (
        <>
            <section aria-label="Active account" className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-clay bg-white p-5">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Active account</p>
                    <p className="mt-1 font-semibold text-ink">{identity.displayLabel ?? "Account details unavailable for this session"}</p>
                </div>
                {identity.isModerator && <span className="rounded-full bg-linen px-3 py-2 text-xs font-semibold text-harbor">Moderator</span>}
            </section>
            <ProfileForm preferences={preferences} />
            <section aria-labelledby="recommendations-heading" className="mt-10">
                <h2 id="recommendations-heading" className="text-2xl font-semibold">Recommended for you</h2>
                <p className="mt-2 text-sm leading-6 text-muted">Scores reflect only your selected preferences and checked listing sources—not overall quality.</p>
                {!hasPreferences ? (
                    <p className="mt-5 rounded-2xl border border-clay bg-white p-6 text-muted">Save at least one preference to compare published spaces.</p>
                ) : recommendations.length ? (
                    <ol className="mt-5 grid gap-4">
                        {recommendations.map(({ space, score, reasons }) => (
                            <li key={space.id} className="rounded-2xl border border-clay bg-white p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <h3 className="text-xl font-semibold"><Link href={`/spaces/${space.slug}`} className="hover:text-harbor hover:underline">{space.name}</Link></h3>
                                    <span className="rounded-full bg-linen px-3 py-1 text-sm font-semibold text-harbor">Match score {score}</span>
                                </div>
                                <ul className="mt-3 flex flex-wrap gap-2 text-xs text-muted" aria-label={`Score reasons for ${space.name}`}>
                                    {reasons.length ? reasons.map((reason) => <li key={reason}>{reason}</li>) : <li>No confirmed matches</li>}
                                </ul>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="mt-5 rounded-2xl border border-clay bg-white p-6 text-muted">No published spaces are available to compare.</p>
                )}
            </section>
        </>
    );
}

export default function ProfilePage() {
    return (
        <main id="main-content" className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-harbor">Personalize StudySpace</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">Study preferences</h1>
            <p className="mt-4 max-w-xl leading-7 text-muted">Keep the study-space qualities you care about in one private profile.</p>
            <Suspense fallback={<p role="status" className="mt-8 text-muted">Loading your preferences…</p>}>
                <ProfileContent />
            </Suspense>
        </main>
    );
}

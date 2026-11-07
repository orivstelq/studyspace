import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { FavoriteButton } from "@/features/favorites/favorite-button";
import { listFavorites } from "@/features/favorites/query";
import { parseDirectoryParams } from "@/features/discovery/directory-params";
import { getAuthClient, getFavoriteOwner } from "@/lib/auth/auth";
import { privateDatabase } from "@/lib/db/private-client";

export const metadata: Metadata = {
    title: "Saved spaces",
    robots: { index: false, follow: false },
};

type SavedProps = Pick<PageProps<"/saved">, "searchParams">;

async function SavedCollection({ searchParams }: SavedProps) {
    await connection();
    const owner = await getFavoriteOwner();
    if (!owner) {
        return (
            <section className="mt-8 rounded-2xl border border-clay bg-white p-6 sm:p-10">
                <h2 className="text-xl font-semibold">Your collection starts here</h2>
                <p className="mt-3 text-muted">
                    {getAuthClient()
                        ? "Sign in to save places and revisit them on any device."
                        : "Sign-in is currently unavailable on this installation."}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                    {getAuthClient() && <a href="/auth/login" className="rounded-lg bg-harbor px-4 py-3 font-semibold text-white">Sign in</a>}
                    <Link href="/explore" className="inline-flex min-h-11 items-center font-semibold text-harbor underline">Go to Explore</Link>
                </div>
            </section>
        );
    }

    const page = parseDirectoryParams({ page: (await searchParams).page })?.page ?? 1;
    const { spaces, hasNext } = await listFavorites(privateDatabase(), owner, page);

    return (
        <section aria-label="Your collection" className="mt-8">
            <a href="/auth/logout" className="inline-flex min-h-11 items-center text-sm font-semibold text-harbor underline">Sign out</a>
            {spaces.length ? (
                <ul className="mt-3 grid gap-4 md:grid-cols-2">
                    {spaces.map((space) => (
                        <li key={space.id} className="min-w-0 wrap-anywhere rounded-2xl border border-clay bg-white p-5">
                            <h2 className="text-xl font-semibold">
                                <Link href={`/spaces/${space.slug}`} className="underline-offset-4 hover:underline">{space.name}</Link>
                            </h2>
                            <p className="mt-1 mb-4 text-sm text-muted">{space.city}, {space.region}</p>
                            <FavoriteButton slug={space.slug} saved name={space.name} />
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="mt-3 rounded-2xl border border-clay bg-white p-6">
                    <h2 className="text-xl font-semibold">{page > 1 ? "No spaces on this page" : "No saved spaces yet"}</h2>
                    <Link href={page > 1 ? "/saved" : "/explore"} className="mt-3 inline-block font-semibold text-harbor underline">
                        {page > 1 ? "First page" : "Find a space to save"}
                    </Link>
                </div>
            )}
            {(page > 1 || hasNext) && (
                <nav aria-label="Saved pages" className="mt-6 flex flex-wrap items-center gap-4 text-sm">
                    {page > 1 && <Link rel="prev" href={`/saved?page=${page - 1}`} className="rounded-lg border border-clay px-4 py-3 font-semibold text-harbor">Previous</Link>}
                    <span className="text-muted">Page {page}</span>
                    {hasNext && <Link rel="next" href={`/saved?page=${page + 1}`} className="rounded-lg border border-clay px-4 py-3 font-semibold text-harbor">Next</Link>}
                </nav>
            )}
        </section>
    );
}

export default function SavedPage({ searchParams }: SavedProps) {
    return (
        <main id="main-content" className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
            <h1 className="text-4xl font-semibold tracking-tight">Saved spaces</h1>
            <p className="mt-4 max-w-xl leading-7 text-muted">Your own collection of places worth returning to.</p>
            <Suspense fallback={<p role="status" className="mt-8 text-muted">Loading your collection…</p>}>
                <SavedCollection searchParams={searchParams} />
            </Suspense>
        </main>
    );
}

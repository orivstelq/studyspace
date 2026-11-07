
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FavoriteButton } from "@/features/favorites/favorite-button";
import { hasFavorite } from "@/features/favorites/query";
import { getAuthClient, getFavoriteOwner } from "@/lib/auth/auth";
import { privateDatabase } from "@/lib/db/private-client";

import { publicSourceUrl, sourceLabels } from "@/features/discovery/provenance";
import { mapDatabaseSpace } from "@/features/discovery/map-record";
import { getPublishedSpaceBySlug } from "@/features/discovery/repository";

interface PageProps {
    params: Promise<{ slug: string }>;
}

// Keep metadata non-indexable until our listing verification
// and public metadata strategy are complete.
export const metadata: Metadata = {
    title: "Study Space Details",
    description: "Details about a published study space.",
    robots: {
        index: false,
        follow: false,
    },
};

async function FavoriteControl({ id, slug, name }: { id: string; slug: string; name: string }) {
    if (!getAuthClient()) return null;
    try {
        const owner = await getFavoriteOwner();
        if (!owner) {
            return <a href="/auth/login" className="inline-flex min-h-11 items-center font-semibold text-harbor underline">Sign in to save</a>;
        }
        return <FavoriteButton slug={slug} name={name} saved={await hasFavorite(privateDatabase(), owner, id)} />;
    } catch (error) {
        console.error("Saved state unavailable:", error instanceof Error ? error.name : "Unknown error");
        return <p className="text-sm text-muted">Saving is temporarily unavailable.</p>;
    }
}

async function SpaceDetailsContent({
    params,
}: PageProps) {
    const { slug } = await params;

    const record = await getPublishedSpaceBySlug(slug);

    if (!record) {
        notFound();
    }

    const space = mapDatabaseSpace(record);
    const sourceUrl = publicSourceUrl(record.sourceUrl);

    return (
        <main id="main-content" className="mx-auto w-full max-w-5xl wrap-anywhere px-5 py-12 sm:px-8">
            <Link
                href="/explore"
                className="text-sm font-semibold text-harbor hover:underline"
            >
                ← Back to Explore
            </Link>

            <div className="mt-10">
                <span className="rounded-full bg-linen px-3 py-2 text-xs font-semibold capitalize text-harbor">
                    {space.category}
                </span>

                <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
                    {space.name}
                </h1>

                <p className="mt-4 text-muted">
                    {[record.address, space.city, space.region].filter(Boolean).join(", ")}
                </p>
                <div className="mt-4">
                    <Suspense fallback={null}>
                        <FavoriteControl id={space.id} slug={space.slug} name={space.name} />
                    </Suspense>
                </div>
            </div>

            <div className="mt-10 grid gap-8 md:grid-cols-[2fr_1fr]">
                <section className="rounded-2xl border border-clay bg-white p-7">
                    <h2 className="text-xl font-semibold">
                        About this space
                    </h2>

                    <p className="mt-5 leading-8 text-muted">
                        {space.description}
                    </p>

                    <h2 className="mt-10 text-xl font-semibold">
                        Amenities
                    </h2>

                    {space.amenities.length > 0 ? (
                        <ul className="mt-5 flex flex-wrap gap-3">
                            {space.amenities.map((amenity) => (
                                <li
                                    key={amenity}
                                    className="rounded-full bg-linen px-4 py-2 text-sm capitalize text-ink"
                                >
                                    {amenity.replaceAll("-", " ")}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-5 text-muted">
                            No amenities have been listed yet.
                        </p>
                    )}
                </section>

                <aside className="self-start rounded-2xl border border-clay bg-linen/50 p-6">
                    <h2 className="text-lg font-semibold">
                        Listing information
                    </h2>

                    <p className="mt-4 text-sm leading-7 text-muted">
                        Source checks cover the details shown here. Check the listing source for current hours and access rules.
                    </p>

                    <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-harbor">
                        Source
                    </p>
                    <p className="mt-1 text-sm text-ink">
                        {sourceUrl ? (
                            <a href={sourceUrl} rel="noreferrer" className="text-harbor underline underline-offset-4">
                                {sourceLabels[record.sourceType]}
                            </a>
                        ) : sourceLabels[record.sourceType]}
                    </p>
                    <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-harbor">
                        Last source check
                    </p>
                    <p className="mt-1 text-sm text-ink">
                        {space.verifiedAt ? (
                            <time dateTime={space.verifiedAt}>
                                {new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(space.verifiedAt))}
                            </time>
                        ) : "Not yet verified"}
                    </p>
                </aside>
            </div>
        </main>
    );
}

export default function SpaceDetailsPage({
    params,
}: PageProps) {
    return (
        <Suspense
            fallback={
                <main
                    id="main-content"
                    role="status"
                    className="mx-auto max-w-5xl px-5 py-12 text-muted sm:px-8"
                >
                    Loading study space details…
                </main>
            }
        >
            <SpaceDetailsContent params={params} />
        </Suspense>
    );
}

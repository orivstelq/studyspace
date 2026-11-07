
import type { Metadata } from "next";
import Link from "next/link";
import { parseDirectoryParams } from "@/features/discovery/directory-params";
import { Suspense } from "react";
import { headers } from "next/headers";

import { ExploreDirectory } from "@/features/discovery/explore-directory";
import { mapDatabaseSpace } from "@/features/discovery/map-record";
import { listPublishedSpaces } from "@/features/discovery/repository";
import { clientAddress, enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

export const metadata: Metadata = {
    title: "Explore",
    description:
        "Explore study-friendly spaces and filter by environment and amenities.",
};

async function PublishedSpacesDirectory({ searchParams }: Pick<PageProps<"/explore">, "searchParams">) {
    const filters = parseDirectoryParams(await searchParams);
    if (!filters) {
        return (
            <div className="rounded-2xl border border-clay bg-white p-6">
                <h2 className="text-xl font-semibold">These search filters are invalid</h2>
                <Link href="/explore" className="mt-4 inline-block font-semibold text-harbor underline">Reset filters</Link>
            </div>
        );
    }

    const requestHeaders = await headers();
    let unavailableMessage: string | null = null;
    try {
        const limit = await enforceRateLimit(RATE_LIMITS.publicSearch, clientAddress(requestHeaders));
        if (!limit.allowed) unavailableMessage = "Too many searches. Try again shortly.";
    } catch (error) {
        console.error("Explore rate limiter failed:", error instanceof Error ? error.name : "Unknown error");
        unavailableMessage = "Search is temporarily unavailable. Try again.";
    }
    if (unavailableMessage) return <SearchUnavailable message={unavailableMessage} />;

    const { spaces, hasNext } = await listPublishedSpaces(filters);
    return <ExploreDirectory spaces={spaces.map(mapDatabaseSpace)} filters={filters} hasNext={hasNext} />;
}

function SearchUnavailable({ message }: { message: string }) {
    return (
        <div role="alert" className="rounded-2xl border border-clay bg-white p-6">
            <h2 className="text-xl font-semibold">Search unavailable</h2>
            <p className="mt-3 text-muted">{message}</p>
        </div>
    );
}

export default function ExplorePage({ searchParams }: PageProps<"/explore">) {
    return (
        <main id="main-content" className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
            <div className="mb-10 max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-harbor">
                    Discover your next study spot
                </p>

                <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                    Find a space that fits.
                </h1>

                <p className="mt-4 leading-7 text-muted">
                    Explore published study spaces by their environment
                    and amenities. The directory is growing as new
                    locations are added.
                </p>
            </div>

            <Suspense
                fallback={
                    <div
                        role="status"
                        className="rounded-2xl border border-clay bg-white p-8 text-muted"
                    >
                        Loading study spaces…
                    </div>
                }
            >
                <PublishedSpacesDirectory searchParams={searchParams} />
            </Suspense>
        </main>
    );
}

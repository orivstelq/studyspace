
import type { Metadata } from "next";
import { Suspense } from "react";

import { ExploreDirectory } from "@/features/discovery/explore-directory";
import { mapDatabaseSpace } from "@/features/discovery/map-record";
import { listPublishedSpaces } from "@/features/discovery/repository";

export const metadata: Metadata = {
    title: "Explore",
    description:
        "Explore study-friendly spaces and filter by environment and amenities.",
};

async function PublishedSpacesDirectory() {
    const records = await listPublishedSpaces();
    const spaces = records.map(mapDatabaseSpace);

    return <ExploreDirectory spaces={spaces} />;
}

export default function ExplorePage() {
    return (
        <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
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
                <PublishedSpacesDirectory />
            </Suspense>
        </main>
    );
}

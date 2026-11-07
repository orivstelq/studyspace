
import type { Metadata } from "next";
import { ExploreDirectory } from "@/features/discovery/explore-directory";

export const metadata: Metadata = {
    title: "Explore",
    description:
        "Explore study-friendly spaces and filter by environment and amenities.",
};

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
                    Explore spaces by their environment and amenities.
                    This early preview uses fictional records while
                    we build the real directory.
                </p>
            </div>

            <ExploreDirectory />
        </main>
    );
}

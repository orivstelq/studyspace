
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { developmentSpaces } from "@/features/discovery/fixtures";
import { findStudySpaceBySlug } from "@/features/discovery/search";

interface PageProps {
    params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
    return developmentSpaces.map((space) => ({
        slug: space.slug,
    }));
}

export async function generateMetadata({
    params,
}: PageProps): Promise<Metadata> {
    const { slug } = await params;

    const space = findStudySpaceBySlug(
        developmentSpaces,
        slug,
    );

    if (!space) {
        return { title: "Space not found" };
    }

    return {
        title: space.name,
        description: space.description,
        robots: { index: false, follow: false },
    };
}

export default async function SpaceDetailsPage({
    params,
}: PageProps) {
    const { slug } = await params;

    const space = findStudySpaceBySlug(
        developmentSpaces,
        slug,
    );

    if (!space) {
        notFound();
    }

    return (
        <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
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
                    {space.city}, {space.region}
                </p>
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
                </section>

                <aside className="self-start rounded-2xl border border-clay bg-linen/50 p-6">
                    <h2 className="text-lg font-semibold">
                        Listing information
                    </h2>

                    <p className="mt-4 text-sm leading-7 text-muted">
                        This is a fictional development listing.
                        Its location and amenities are sample data,
                        not verified information about a real place.
                    </p>

                    <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-harbor">
                        Source
                    </p>
                    <p className="mt-1 text-sm text-ink">
                        Development fixture
                    </p>
                </aside>
            </div>
        </main>
    );
}

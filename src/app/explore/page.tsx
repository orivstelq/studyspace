
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Explore",
    description: "Explore study-friendly places with StudySpace.",
};

export default function ExplorePage() {
    return (
        <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
            <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-harbor">
                    Discover
                </p>
                <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                    Find your study space.
                </h1>
                <p className="mt-4 leading-7 text-muted">
                    Explore places for quiet work, focused reading,
                    and collaborative sessions.
                </p>
            </div>

            <section
                aria-labelledby="directory-heading"
                className="mt-10 rounded-2xl border border-clay bg-white p-8 sm:p-12"
            >
                <div className="max-w-lg">
                    <div
                        aria-hidden="true"
                        className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-linen text-xl text-harbor"
                    >
                        ◇
                    </div>
                    <h2
                        id="directory-heading"
                        className="text-2xl font-semibold tracking-tight"
                    >
                        The directory is taking shape.
                    </h2>
                    <p className="mt-4 leading-7 text-muted">
                        We are preparing the first collection of study
                        spaces. Listings will include useful details
                        and clearly identified information sources.
                    </p>
                    <p className="mt-4 text-sm text-muted">
                        No listings have been published yet.
                    </p>
                </div>
            </section>
        </main>
    );
}

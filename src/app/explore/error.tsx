
"use client";

import { useEffect } from "react";

export default function ExploreError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Explore page failed:", error.name);
    }, [error]);

    return (
        <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
            <div className="rounded-2xl border border-clay bg-white p-8 text-center sm:p-12">
                <h1 className="text-2xl font-semibold">
                    We couldn&apos;t load study spaces
                </h1>

                <p className="mt-3 text-muted">
                    The directory is temporarily unavailable.
                    Please try again.
                </p>

                <button
                    type="button"
                    onClick={reset}
                    className="mt-6 rounded-lg bg-harbor px-5 py-3 font-semibold text-white hover:bg-ink"
                >
                    Try again
                </button>
            </div>
        </main>
    );
}

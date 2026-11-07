
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Saved spaces",
};

export default function SavedPage() {
    return (
        <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
            <h1 className="text-4xl font-semibold tracking-tight">
                Saved spaces
            </h1>

            <p className="mt-4 max-w-xl leading-7 text-muted">
                Your own collection of places worth returning to.
            </p>

            <section className="mt-10 rounded-2xl border border-clay bg-white p-8 sm:p-12">
                <h2 className="text-xl font-semibold">
                    Your collection starts here.
                </h2>

                <p className="mt-3 max-w-lg leading-7 text-muted">
                    Personal bookmarks will become available when
                    secure accounts and favorites are implemented.
                </p>

                <Link
                    href="/explore"
                    className="mt-6 inline-flex rounded-lg bg-harbor px-5 py-3 text-sm font-semibold text-white hover:bg-ink"
                >
                    Go to Explore
                </Link>
            </section>
        </main>
    );
}

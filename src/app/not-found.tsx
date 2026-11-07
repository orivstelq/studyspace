import Link from "next/link";

export default function NotFound() {
    return (
        <main id="main-content" className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
            <h1 className="text-3xl font-semibold tracking-tight">This page is unavailable</h1>
            <p className="mt-4 text-muted">The address may have changed or the listing may have been removed.</p>
            <Link href="/explore" className="mt-4 inline-flex min-h-11 items-center font-semibold text-harbor underline">Browse study spaces</Link>
        </main>
    );
}

"use client";

import Link from "next/link";

export function RouteError({ title, message, retry }: { title: string; message: string; retry: () => void }) {
    return (
        <main id="main-content" className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
            <div className="rounded-2xl border border-clay bg-white p-6 sm:p-10">
                <h1 className="text-2xl font-semibold">{title}</h1>
                <p className="mt-3 text-muted">{message}</p>
                <div className="mt-5 flex flex-wrap items-center gap-4">
                    <button type="button" onClick={retry} className="rounded-lg bg-harbor px-4 py-3 font-semibold text-white hover:bg-ink">
                        Try again
                    </button>
                    <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-harbor underline">Go home</Link>
                </div>
            </div>
        </main>
    );
}

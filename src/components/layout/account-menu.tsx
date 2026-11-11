import Link from "next/link";
import { connection } from "next/server";
import { getAuthClient, getAuthIdentity } from "@/lib/auth/auth";

export async function AccountMenu() {
    await connection();
    if (!getAuthClient()) return null;

    const identity = await getAuthIdentity();

    if (!identity) {
        return <a href="/auth/login" className="inline-flex min-h-11 items-center rounded-lg border border-harbor px-3 py-2 text-sm font-semibold text-harbor hover:bg-linen">Sign in</a>;
    }

    const label = identity.displayLabel ?? "Account";
    return (
        <details className="group relative">
            <summary
                aria-label={`Account menu for ${label}`}
                className="flex min-h-11 max-w-44 cursor-pointer list-none items-center gap-2 rounded-lg border border-clay bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-harbor [&::-webkit-details-marker]:hidden"
            >
                <span className="truncate">{label}</span>
                <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-clay bg-white p-3 shadow-lg">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Signed in as</p>
                <p className="mt-1 truncate text-sm font-semibold text-ink" title={label}>{label}</p>
                <div className="mt-3 grid border-t border-clay pt-2">
                    <Link href="/profile" className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-semibold text-harbor hover:bg-linen">Profile</Link>
                    <a href="/auth/logout" className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-semibold text-harbor hover:bg-linen">Sign out</a>
                </div>
            </div>
        </details>
    );
}

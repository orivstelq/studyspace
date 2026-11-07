
import Link from "next/link";

const navigation = [
    { label: "Home", href: "/" },
    { label: "Explore", href: "/explore" },
    { label: "Saved", href: "/saved" },
] as const;

export function SiteHeader() {
    return (
        <header className="border-b border-clay/70 bg-paper">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5 py-5 sm:px-8">
                <Link
                    href="/"
                    className="flex items-center gap-3 text-xl font-semibold tracking-tight text-ink"
                    aria-label="StudySpace home"
                >
                    <span
                        aria-hidden="true"
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-harbor text-lg font-semibold text-white"
                    >
                        S.
                    </span>
                    StudySpace
                </Link>

                <nav aria-label="Main navigation">
                    <ul className="flex items-center gap-2 sm:gap-6">
                        {navigation.map((item) => (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    className="inline-block rounded-md px-2 py-2 text-sm font-medium text-ink transition-colors hover:bg-linen hover:text-harbor"
                                >
                                    {item.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
        </header>
    );
}

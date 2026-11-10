import Link from "next/link";

export function SiteFooter() {
    return (
        <footer className="mt-auto border-t border-clay/70 bg-linen/30">
            <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <p>StudySpace is an independent portfolio project.</p>
                <nav aria-label="Legal and support">
                    <ul className="flex flex-wrap gap-x-5 gap-y-2">
                        <li><Link href="/privacy" className="hover:text-harbor hover:underline">Privacy</Link></li>
                        <li><Link href="/terms" className="hover:text-harbor hover:underline">Terms</Link></li>
                        <li><Link href="/privacy#support" className="hover:text-harbor hover:underline">Support status</Link></li>
                    </ul>
                </nav>
            </div>
        </footer>
    );
}

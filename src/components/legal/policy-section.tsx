import type { ReactNode } from "react";

export function PolicySection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
    return (
        <section
            id={id}
            aria-labelledby={`${id}-heading`}
            className="grid scroll-mt-6 gap-0 border-t border-clay/70 pt-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
        >
            <h2 id={`${id}-heading`} className="text-2xl font-semibold text-ink">{title}</h2>
            <div className="max-w-2xl">{children}</div>
        </section>
    );
}

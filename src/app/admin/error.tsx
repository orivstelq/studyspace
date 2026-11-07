"use client";

import { RouteError } from "@/components/layout/route-error";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return <RouteError title="Moderation is unavailable" message="We could not load the moderation queue." reset={reset} />;
}

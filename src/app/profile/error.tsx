"use client";

import { RouteError } from "@/components/layout/route-error";

export default function ProfileError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return <RouteError title="Preferences are unavailable" message="We could not load your study preferences." reset={reset} />;
}

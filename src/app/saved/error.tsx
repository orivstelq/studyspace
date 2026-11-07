"use client";

import { RouteError } from "@/components/layout/route-error";

export default function SavedError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return <RouteError title="We couldn’t load Saved" message="Your collection is temporarily unavailable." reset={reset} />;
}

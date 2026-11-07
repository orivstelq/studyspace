"use client";

import { RouteError } from "@/components/layout/route-error";

export default function SpaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return <RouteError title="We couldn’t load this study space" message="The listing is temporarily unavailable." reset={reset} />;
}

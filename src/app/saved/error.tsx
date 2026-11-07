"use client";

import { RouteError } from "@/components/layout/route-error";

export default function SavedError({ retry }: { retry: () => void }) {
    return <RouteError title="We couldn’t load Saved" message="Your collection is temporarily unavailable." retry={retry} />;
}

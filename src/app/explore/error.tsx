"use client";

import { RouteError } from "@/components/layout/route-error";

export default function ExploreError({ retry }: { retry: () => void }) {
    return <RouteError title="We couldn’t load study spaces" message="The directory is temporarily unavailable." retry={retry} />;
}

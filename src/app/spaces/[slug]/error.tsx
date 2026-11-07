"use client";

import { RouteError } from "@/components/layout/route-error";

export default function SpaceError({ retry }: { retry: () => void }) {
    return <RouteError title="We couldn’t load this study space" message="The listing is temporarily unavailable." retry={retry} />;
}

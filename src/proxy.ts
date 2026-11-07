import type { NextRequest } from "next/server";
import { getAuthClient } from "@/lib/auth/auth";

export function proxy(request: NextRequest) {
    const auth = getAuthClient();
    if (!auth) return new Response("Sign-in is unavailable.", { status: 503 });
    return auth.middleware(request);
}

export const config = {
    matcher: ["/auth/login", "/auth/logout", "/auth/callback", "/auth/backchannel-logout"],
};

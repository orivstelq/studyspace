import "server-only";

import { createHash } from "node:crypto";
import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { createSessionStore, SESSION_DURATION } from "./session-store";
import { isModeratorSubject } from "./roles";
import { sessionDisplayLabel } from "./identity";

let client: Auth0Client | undefined;

export function getAuthClient() {
    if (client) return client;
    const {
        AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET,
        AUTH0_SECRET, APP_BASE_URL, FAVORITES_DATABASE_URL,
    } = process.env;
    if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID || !AUTH0_CLIENT_SECRET ||
        !AUTH0_SECRET || !APP_BASE_URL || !FAVORITES_DATABASE_URL) return null;

    client = new Auth0Client({
        appBaseUrl: APP_BASE_URL,
        authorizationParameters: { scope: "openid profile email" },
        signInReturnToPath: "/saved",
        enableAccessTokenEndpoint: false,
        includeIdTokenHintInOIDCLogoutUrl: false,
        session: {
            rolling: false,
            absoluteDuration: SESSION_DURATION,
            cookie: {
                sameSite: "lax",
                secure: new URL(APP_BASE_URL).protocol === "https:",
            },
        },
        sessionStore: createSessionStore(),
    });
    return client;
}

export async function getFavoriteOwner() {
    return (await getAuthIdentity())?.ownerKey ?? null;
}

export async function getAuthIdentity() {
    const session = await getAuthClient()?.getSession();
    if (!session?.user.sub) return null;

    const ownerKey = createHash("sha256")
        .update(JSON.stringify([process.env.AUTH0_DOMAIN, session.user.sub]))
        .digest("hex");
    return {
        ownerKey,
        displayLabel: sessionDisplayLabel(session.user),
        isModerator: isModeratorSubject(session.user.sub),
    };
}

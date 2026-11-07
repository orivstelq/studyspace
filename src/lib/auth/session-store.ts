import "server-only";

import type { SessionData, SessionDataStore } from "@auth0/nextjs-auth0/types";
import { privateDatabase } from "../db/private-client";

export const SESSION_DURATION = 8 * 60 * 60;

export function createSessionStore(database = privateDatabase): SessionDataStore {
    return {
        async get(id) {
            const row = await database().authSession.findUnique({ where: { id } });
            if (!row || row.expiresAt.getTime() <= Date.now()) return null;
            return {
                user: { sub: row.subject },
                // StudySpace uses identity only and does not call provider APIs.
                tokenSet: { accessToken: "", expiresAt: 0 },
                internal: {
                    sid: row.providerSessionId,
                    createdAt: row.createdAt,
                    sessionExpiresAt: Math.floor(row.expiresAt.getTime() / 1000),
                },
            };
        },
        async set(id, session) {
            await database().authSession.create({ data: { id, ...sessionFields(session) } });
        },
        async delete(id) {
            await database().authSession.deleteMany({ where: { id } });
        },
        async deleteByLogoutToken({ sub, sid }) {
            if (!sub && !sid) return;
            await database().authSession.deleteMany({ where: { subject: sub, providerSessionId: sid } });
        },
    };
}

function sessionFields(session: SessionData) {
    const { createdAt, sid, sessionExpiresAt } = session.internal;
    return {
        subject: session.user.sub,
        providerSessionId: sid,
        createdAt,
        expiresAt: new Date(Math.min(createdAt + SESSION_DURATION, sessionExpiresAt ?? Infinity) * 1000),
    };
}

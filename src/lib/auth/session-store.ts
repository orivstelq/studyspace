import "server-only";

import type { SessionData, SessionDataStore } from "@auth0/nextjs-auth0/types";
import { privateDatabase } from "../db/private-client";
import { sessionDisplayLabel } from "./identity";

export const SESSION_DURATION = 8 * 60 * 60;

export function createSessionStore(database = privateDatabase): SessionDataStore {
    return {
        async get(id) {
            const row = await database().authSession.findUnique({ where: { id } });
            if (!row || row.expiresAt.getTime() <= Date.now()) return null;
            return {
                user: { sub: row.subject, ...(row.displayLabel ? { name: row.displayLabel } : {}) },
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
            const fields = sessionFields(session);
            await database().authSession.upsert({
                where: { id },
                create: { id, ...fields },
                update: fields,
            });
        },
        async update(id, session) {
            const result = await database().authSession.updateMany({
                where: { id },
                data: sessionFields(session),
            });
            return result.count > 0;
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
        displayLabel: sessionDisplayLabel(session.user),
        providerSessionId: sid,
        createdAt,
        expiresAt: new Date(Math.min(createdAt + SESSION_DURATION, sessionExpiresAt ?? Infinity) * 1000),
    };
}

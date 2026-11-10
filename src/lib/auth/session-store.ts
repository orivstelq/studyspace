import "server-only";

import type { SessionData, SessionDataStore } from "@auth0/nextjs-auth0/types";
import { privateDatabase } from "../db/private-client";
import {
    lookupActiveAccountIdentityInTransaction,
    resolveAccountIdentityInTransaction,
    setActiveAccountContextInTransaction,
} from "../../features/account-lifecycle/repository";
import { createIdentityKey } from "./identity-key";
import { sessionDisplayLabel } from "./identity";

export const SESSION_DURATION = 8 * 60 * 60;

export function createSessionStore(database = privateDatabase): SessionDataStore {
    return {
        async get(id) {
            return database().$transaction(async (tx) => {
                const row = await tx.authSession.findUnique({ where: { id } });
                if (!row || row.expiresAt.getTime() <= Date.now()) return null;

                let accountId = row.accountId;
                const verifiedAccountId = await lookupActiveAccountIdentityInTransaction(tx, identityKey(row.subject));
                if (!verifiedAccountId || (accountId && accountId !== verifiedAccountId)) return null;
                if (!accountId) {
                    accountId = verifiedAccountId;
                    await tx.authSession.updateMany({
                        where: { id, accountId: null },
                        data: { accountId },
                    });
                }
                if (!await setActiveAccountContextInTransaction(tx, accountId, false)) return null;

                return {
                    user: {
                        sub: row.subject,
                        ...(row.displayLabel ? { name: row.displayLabel } : {}),
                        studyspaceAccountId: accountId,
                    },
                    // StudySpace uses identity only and does not call provider APIs.
                    tokenSet: { accessToken: "", expiresAt: 0 },
                    internal: {
                        sid: row.providerSessionId,
                        createdAt: row.createdAt,
                        sessionExpiresAt: Math.floor(row.expiresAt.getTime() / 1000),
                    },
                };
            });
        },
        async set(id, session) {
            await database().$transaction(async (tx) => {
                const accountId = await resolveAccountIdentityInTransaction(tx, identityKey(session.user.sub));
                if (!accountId) throw new Error("Account is unavailable.");
                const fields = sessionFields(session, accountId);
                await tx.authSession.upsert({
                    where: { id },
                    create: { id, ...fields },
                    update: fields,
                });
            });
        },
        async update(id, session) {
            return database().$transaction(async (tx) => {
                const existing = await tx.authSession.findUnique({
                    where: { id },
                    select: { subject: true, accountId: true },
                });
                if (!existing || existing.subject !== session.user.sub) return false;

                let accountId = existing.accountId;
                const verifiedAccountId = await lookupActiveAccountIdentityInTransaction(tx, identityKey(session.user.sub));
                if (!verifiedAccountId || (accountId && accountId !== verifiedAccountId)) return false;
                accountId ??= verifiedAccountId;
                if (!await setActiveAccountContextInTransaction(tx, accountId, false)) return false;
                const result = await tx.authSession.updateMany({
                    where: { id, OR: [{ accountId }, { accountId: null }] },
                    data: sessionFields(session, accountId),
                });
                return result.count > 0;
            });
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

function identityKey(subject: string) {
    return createIdentityKey(process.env.AUTH0_DOMAIN ?? "", subject);
}

function sessionFields(session: SessionData, accountId: string) {
    const { createdAt, sid, sessionExpiresAt } = session.internal;
    return {
        subject: session.user.sub,
        displayLabel: sessionDisplayLabel(session.user),
        providerSessionId: sid,
        createdAt,
        expiresAt: new Date(Math.min(createdAt + SESSION_DURATION, sessionExpiresAt ?? Infinity) * 1000),
        accountId,
    };
}

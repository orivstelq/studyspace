import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionStore, SESSION_DURATION } from "./session-store";

const db = vi.hoisted(() => ({
    authSession: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("../db/private-client", () => ({ privateDatabase: () => db }));

afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
});

describe("Auth0 server session storage", () => {
    it("stores only the subject and session identifiers and enforces expiration", async () => {
        vi.useFakeTimers();
        const createdAt = 1_800_000_000;
        vi.setSystemTime(createdAt * 1000);
        const store = createSessionStore();
        await store.set("session", {
            user: { sub: "provider|user", email: "private@example.org" },
            tokenSet: { accessToken: "secret-token", expiresAt: 0 },
            internal: { createdAt, sid: "provider-session" },
        });

        const row = {
            id: "session", subject: "provider|user", displayLabel: "private@example.org", providerSessionId: "provider-session", createdAt,
            expiresAt: new Date((createdAt + SESSION_DURATION) * 1000),
        };
        expect(db.authSession.upsert).toHaveBeenCalledWith({
            where: { id: "session" },
            create: row,
            update: {
                subject: row.subject,
                displayLabel: row.displayLabel,
                providerSessionId: row.providerSessionId,
                createdAt: row.createdAt,
                expiresAt: row.expiresAt,
            },
        });
        db.authSession.findUnique.mockResolvedValue(row);
        expect(await store.get("session")).toMatchObject({ user: { sub: row.subject, name: row.displayLabel } });
        vi.setSystemTime(row.expiresAt);
        expect(await store.get("session")).toBeNull();
    });

    it("keeps existing sessions usable when no display label was stored", async () => {
        const row = {
            id: "legacy", subject: "provider|legacy", displayLabel: null, providerSessionId: "provider-session", createdAt: 1_800_000_000,
            expiresAt: new Date(Date.now() + 60_000),
        };
        db.authSession.findUnique.mockResolvedValue(row);
        expect((await createSessionStore().get("legacy"))?.user).toEqual({ sub: row.subject });
    });

    it("updates an existing session atomically without recreating a revoked session", async () => {
        const store = createSessionStore();
        const session = {
            user: { sub: "provider|user", name: "Updated User" },
            tokenSet: { accessToken: "ignored", expiresAt: 0 },
            internal: { createdAt: 1_800_000_000, sid: "provider-session" },
        };
        db.authSession.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

        expect(await store.update?.("existing", session)).toBe(true);
        expect(await store.update?.("revoked", session)).toBe(false);
        expect(db.authSession.upsert).not.toHaveBeenCalled();
    });

    it("scopes revocations to the supplied session or verified logout subject", async () => {
        const store = createSessionStore();
        await store.delete("session");
        await store.deleteByLogoutToken?.({ sub: "provider|user", sid: "provider-session" });
        await store.deleteByLogoutToken?.({});
        expect(db.authSession.deleteMany.mock.calls).toEqual([
            [{ where: { id: "session" } }],
            [{ where: { subject: "provider|user", providerSessionId: "provider-session" } }],
        ]);
    });
});

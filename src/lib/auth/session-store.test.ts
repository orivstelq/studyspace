import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionStore, SESSION_DURATION } from "./session-store";

const db = vi.hoisted(() => ({
    authSession: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
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
            id: "session", subject: "provider|user", providerSessionId: "provider-session", createdAt,
            expiresAt: new Date((createdAt + SESSION_DURATION) * 1000),
        };
        expect(db.authSession.create).toHaveBeenCalledWith({ data: row });
        db.authSession.findUnique.mockResolvedValue(row);
        expect(await store.get("session")).toMatchObject({ user: { sub: row.subject } });
        vi.setSystemTime(row.expiresAt);
        expect(await store.get("session")).toBeNull();
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

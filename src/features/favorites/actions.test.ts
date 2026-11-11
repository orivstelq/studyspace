import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateFavorite } from "./actions";

const mocks = vi.hoisted(() => ({
    headers: vi.fn(),
    identity: vi.fn(),
    database: vi.fn(),
    change: vi.fn(),
    revalidate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("../../lib/auth/auth", () => ({ getAuthIdentity: mocks.identity }));
vi.mock("../../lib/db/private-client", () => ({ privateDatabase: mocks.database }));
vi.mock("./query", () => ({ changeFavorite: mocks.change }));

function favoriteForm(slug = "test-space") {
    const form = new FormData();
    form.set("slug", slug);
    form.set("intent", "save");
    form.set("ownerKey", "attacker-supplied");
    return form;
}

describe("Saved server action", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("APP_BASE_URL", "https://studyspace.example");
        mocks.headers.mockResolvedValue(new Headers({ origin: "https://studyspace.example" }));
        mocks.identity.mockResolvedValue({
            accountId: "verified-account",
            ownerKey: "verified-owner",
            isModerator: false,
        });
        mocks.database.mockReturnValue("private-db");
        mocks.change.mockResolvedValue(true);
    });

    afterEach(() => vi.unstubAllEnvs());

    it("rejects cross-origin requests before looking up a session", async () => {
        mocks.headers.mockResolvedValue(new Headers({ origin: "https://other.example" }));
        expect(await updateFavorite(null, favoriteForm())).toMatch(/verified/);
        expect(mocks.identity).not.toHaveBeenCalled();
        expect(mocks.change).not.toHaveBeenCalled();
    });

    it("rejects guests and invalid slugs without using the database", async () => {
        mocks.identity.mockResolvedValueOnce(null);
        expect(await updateFavorite(null, favoriteForm())).toMatch(/Sign in/);
        expect(await updateFavorite(null, favoriteForm("../saved"))).toMatch(/could not be updated/);
        expect(mocks.database).not.toHaveBeenCalled();
    });

    it("uses the server-verified identity and refreshes the affected routes", async () => {
        expect(await updateFavorite(null, favoriteForm())).toBeNull();
        expect(mocks.change).toHaveBeenCalledWith("private-db", {
            accountId: "verified-account",
            ownerKey: "verified-owner",
            isModerator: false,
        }, "test-space", true);
        expect(mocks.revalidate).toHaveBeenCalledWith("/saved");
        expect(mocks.revalidate).toHaveBeenCalledWith("/spaces/test-space");
    });
});

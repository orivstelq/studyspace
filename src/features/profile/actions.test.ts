import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateProfile } from "./actions";
import { parseProfilePreferences } from "./preferences";

const mocks = vi.hoisted(() => ({
    headers: vi.fn(),
    owner: vi.fn(),
    database: vi.fn(),
    save: vi.fn(),
    revalidate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("../../lib/auth/auth", () => ({ getFavoriteOwner: mocks.owner }));
vi.mock("../../lib/db/private-client", () => ({ privateDatabase: mocks.database }));
vi.mock("./query", () => ({ saveProfile: mocks.save }));

function profileForm(category = "library", amenities = ["quiet", "wifi"]) {
    const form = new FormData();
    form.set("category", category);
    amenities.forEach((amenity) => form.append("amenities", amenity));
    form.set("ownerKey", "attacker-supplied");
    return form;
}

describe("Profile preferences", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("APP_BASE_URL", "https://studyspace.example");
        mocks.headers.mockResolvedValue(new Headers({ origin: "https://studyspace.example" }));
        mocks.owner.mockResolvedValue("verified-owner");
        mocks.database.mockReturnValue("private-db");
        mocks.save.mockResolvedValue({ ownerKey: "verified-owner" });
    });

    afterEach(() => vi.unstubAllEnvs());

    it("parses only known categories and unique amenities", () => {
        expect(parseProfilePreferences(profileForm())).toEqual({ category: "library", amenities: ["quiet", "wifi"] });
        expect(parseProfilePreferences(profileForm("unknown"))).toBeNull();
        expect(parseProfilePreferences(profileForm("library", ["quiet", "quiet"]))).toBeNull();
        expect(parseProfilePreferences(profileForm("all", ["parking"]))).toBeNull();
    });

    it("rejects cross-origin and unauthenticated updates", async () => {
        mocks.headers.mockResolvedValueOnce(new Headers({ origin: "https://other.example" }));
        expect(await updateProfile(null, profileForm())).toMatch(/verified/);
        expect(mocks.owner).not.toHaveBeenCalled();

        mocks.owner.mockResolvedValueOnce(null);
        expect(await updateProfile(null, profileForm())).toMatch(/Sign in/);
        expect(mocks.save).not.toHaveBeenCalled();
    });

    it("uses the verified owner and refreshes the profile", async () => {
        expect(await updateProfile(null, profileForm())).toBe("Preferences saved.");
        expect(mocks.save).toHaveBeenCalledWith("private-db", "verified-owner", {
            category: "library",
            amenities: ["quiet", "wifi"],
        });
        expect(mocks.revalidate).toHaveBeenCalledWith("/profile");
    });
});

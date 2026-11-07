import { describe, expect, it } from "vitest";
import type { StudySpace } from "../discovery/types";
import type { ProfilePreferences } from "../profile/query";
import { rankSpaces, scoreSpace } from "./score";

function space(overrides: Partial<StudySpace> = {}): StudySpace {
    return {
        id: "space-1",
        slug: "space-1",
        name: "Space One",
        description: "Test space",
        category: "library",
        city: "Test",
        region: "TX",
        amenities: ["quiet", "wifi"],
        source: "published",
        verifiedAt: "2026-11-06T00:00:00.000Z",
        ...overrides,
    };
}

describe("recommendation scoring", () => {
    it("explains category, confirmed amenity, and checked-source points", () => {
        expect(scoreSpace(space(), { category: "library", amenities: ["quiet", "outlets"] })).toMatchObject({
            score: 4,
            reasons: ["Preferred space type +2", "quiet +1", "Source checked +1"],
        });
    });

    it("does not award unknown facts", () => {
        expect(scoreSpace(space({ amenities: [], verifiedAt: null }), { category: "cafe", amenities: ["wifi"] })).toMatchObject({
            score: 0,
            reasons: [],
        });
    });

    it("uses name and id as deterministic tie-breakers", () => {
        const preferences: ProfilePreferences = { category: "all", amenities: [] };
        const ranked = rankSpaces([
            space({ id: "2", name: "Beta", verifiedAt: null }),
            space({ id: "1", name: "Alpha", verifiedAt: null }),
        ], preferences);
        expect(ranked.map(({ space: item }) => item.name)).toEqual(["Alpha", "Beta"]);
    });
});


import { describe, expect, it } from "vitest";
import { developmentSpaces } from "./fixtures";
import { filterStudySpaces } from "./search";

describe("filterStudySpaces", () => {
    it("returns all spaces when no filters are applied", () => {
        const result = filterStudySpaces(developmentSpaces, {
            query: "",
            category: "all",
            amenity: "all",
        });

        expect(result).toHaveLength(4);
    });

    it("matches names regardless of case", () => {
        const result = filterStudySpaces(developmentSpaces, {
            query: "READING",
            category: "all",
            amenity: "all",
        });

        expect(result.map((space) => space.slug)).toEqual([
            "the-reading-room",
        ]);
    });

    it("filters by category", () => {
        const result = filterStudySpaces(developmentSpaces, {
            query: "",
            category: "cafe",
            amenity: "all",
        });

        expect(result).toHaveLength(1);
        expect(result[0].category).toBe("cafe");
    });

    it("filters by amenity", () => {
        const result = filterStudySpaces(developmentSpaces, {
            query: "",
            category: "all",
            amenity: "quiet",
        });

        expect(result).toHaveLength(2);
    });

    it("combines search and filters", () => {
        const result = filterStudySpaces(developmentSpaces, {
            query: "focus",
            category: "coworking",
            amenity: "outlets",
        });

        expect(result).toHaveLength(1);
        expect(result[0].slug).toBe("the-focus-studio");
    });

    it("returns an empty array for unmatched searches", () => {
        const result = filterStudySpaces(developmentSpaces, {
            query: "nonexistent location",
            category: "all",
            amenity: "all",
        });

        expect(result).toEqual([]);
    });

    it("does not modify the original records", () => {
        const originalOrder = developmentSpaces.map(
            (space) => space.id
        );

        filterStudySpaces(developmentSpaces, {
            query: "room",
            category: "all",
            amenity: "all",
        });

        expect(developmentSpaces.map((space) => space.id)).toEqual(
            originalOrder
        );
    });
});

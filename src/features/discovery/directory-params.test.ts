import { describe, expect, it } from "vitest";
import { exploreUrl, parseDirectoryParams } from "./directory-params";

describe("directory parameters", () => {
    it("defaults filters and preserves them in page links", () => {
        expect(parseDirectoryParams({})).toEqual({ query: "", category: "all", amenity: "all", page: 1 });
        const filters = parseDirectoryParams({ q: " A&B ", category: "library", amenity: "wifi", page: "2" });
        expect(filters).toEqual({ query: "A&B", category: "library", amenity: "wifi", page: 2 });
        expect(exploreUrl(filters!, 3)).toBe("/explore?q=A%26B&category=library&amenity=wifi&page=3");
    });

    it.each([
        { q: ["first", "second"] }, { q: "a".repeat(121) }, { q: "\u0000" },
        { page: "0" }, { page: "01" }, { page: "1e2" }, { page: "1001" },
        { category: "office" }, { amenity: ["wifi"] },
    ])("rejects malformed filters %j", (params) => {
        expect(parseDirectoryParams(params)).toBeNull();
    });
});

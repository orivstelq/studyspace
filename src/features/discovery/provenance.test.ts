import { describe, expect, it } from "vitest";
import { mapDatabaseSpace } from "./map-record";
import { publicSourceUrl } from "./provenance";

describe("listing provenance", () => {
    it.each([null, "/relative", "javascript:alert(1)", "http://example.org", "https://u:p@example.org"])(
        "does not publish an unsafe source %s",
        (value) => expect(publicSourceUrl(value)).toBeNull(),
    );

    it("requires a source URL and review timestamp before showing verification", () => {
        const verifiedAt = new Date("2026-11-06T00:00:00Z");
        const space = {
            id: "test", slug: "test", name: "Test", description: "Test", category: "LIBRARY",
            city: "Test", region: "Test", address: null, sourceType: "OFFICIAL", amenities: [],
            verifiedAt, sourceUrl: "https://example.org/library",
        } as const;
        const record = { ...space, amenities: [] };
        expect(mapDatabaseSpace(record).verifiedAt).toBe(verifiedAt.toISOString());
        expect(mapDatabaseSpace({ ...record, sourceUrl: null }).verifiedAt).toBeNull();
        expect(mapDatabaseSpace({ ...record, verifiedAt: null }).verifiedAt).toBeNull();
    });
});

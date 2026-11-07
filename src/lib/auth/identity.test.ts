import { describe, expect, it } from "vitest";
import { sessionDisplayLabel } from "./identity";

describe("account display labels", () => {
    it("prefers a display name and falls back to email", () => {
        expect(sessionDisplayLabel({ name: " Ada Lovelace ", email: "ada@example.test" })).toBe("Ada Lovelace");
        expect(sessionDisplayLabel({ email: "ada@example.test" })).toBe("ada@example.test");
    });

    it("rejects missing, oversized, and control-character labels", () => {
        expect(sessionDisplayLabel({})).toBeNull();
        expect(sessionDisplayLabel({ name: "a".repeat(256) })).toBeNull();
        expect(sessionDisplayLabel({ name: "unsafe\nname" })).toBeNull();
    });
});

import { describe, expect, it } from "vitest";
import { createIdentityKey } from "./identity-key";

describe("account identity key", () => {
    it("is deterministic, issuer-scoped, and validates verified inputs", () => {
        const key = createIdentityKey("https://identity.example", "provider|user");
        expect(key).toMatch(/^[0-9a-f]{64}$/);
        expect(createIdentityKey("https://identity.example", "provider|user")).toBe(key);
        expect(createIdentityKey("https://other.example", "provider|user")).not.toBe(key);
        expect(() => createIdentityKey("", "provider|user")).toThrow(/incomplete/i);
    });
});

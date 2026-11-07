import { describe, expect, it } from "vitest";
import { isModeratorSubject } from "./roles";

describe("trusted moderator assignment", () => {
    it("matches only exact configured Auth0 subjects", () => {
        const configured = "auth0|moderator, google-oauth2|second";
        expect(isModeratorSubject("auth0|moderator", configured)).toBe(true);
        expect(isModeratorSubject("google-oauth2|second", configured)).toBe(true);
        expect(isModeratorSubject("auth0|moderator-extra", configured)).toBe(false);
        expect(isModeratorSubject("auth0|moderator", "")).toBe(false);
    });
});

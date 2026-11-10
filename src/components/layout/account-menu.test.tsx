import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/auth/auth", () => ({
    getAuthClient: vi.fn(),
    getAuthIdentity: vi.fn(),
}));

import { getAuthClient, getAuthIdentity } from "@/lib/auth/auth";
import { AccountMenu } from "./account-menu";

const authClient = vi.mocked(getAuthClient);
const authIdentity = vi.mocked(getAuthIdentity);

describe("AccountMenu", () => {
    beforeEach(() => vi.resetAllMocks());

    it("does not advertise sign-in when authentication is unavailable", async () => {
        authClient.mockReturnValue(null);

        expect(await AccountMenu()).toBeNull();
        expect(authIdentity).not.toHaveBeenCalled();
    });

    it("offers sign-in to a guest when authentication is configured", async () => {
        authClient.mockReturnValue({} as ReturnType<typeof getAuthClient>);
        authIdentity.mockResolvedValue(null);

        expect(renderToStaticMarkup(await AccountMenu())).toContain('href="/auth/login"');
    });

    it("renders only server-verified account identity", async () => {
        authClient.mockReturnValue({} as ReturnType<typeof getAuthClient>);
        authIdentity.mockResolvedValue({
            accountId: "account-id",
            ownerKey: "owner-key",
            displayLabel: "Verified User",
            isModerator: false,
        });

        const html = renderToStaticMarkup(await AccountMenu());
        expect(html).toContain('aria-label="Account menu for Verified User"');
        expect(html).toContain('href="/profile"');
        expect(html).toContain('href="/auth/logout"');
    });
});

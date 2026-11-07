import { expect, test } from "@playwright/test";

test("stored test session exposes the active account without leaking it publicly", async ({ page }) => {
    test.skip(!process.env.PLAYWRIGHT_AUTH_STATE, "Set PLAYWRIGHT_AUTH_STATE to an ignored, environment-local storage-state file.");
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Study preferences" })).toBeVisible();
    await expect(page.getByText("Active account")).toBeVisible();
    await page.getByRole("button", { name: /Account menu for/ }).click();
    await expect(page.getByRole("link", { name: "Sign out" })).toBeVisible();
});

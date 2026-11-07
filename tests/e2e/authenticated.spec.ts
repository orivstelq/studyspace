import { expect, type Page, test } from "@playwright/test";

function accountDisclosure(page: Page) {
    const details = page.locator("details").filter({
        has: page.locator("summary[aria-label^='Account menu for']"),
    });
    return { details, summary: details.locator("summary") };
}

test("Account disclosure is keyboard accessible and links to Profile", async ({ page }) => {
    test.skip(!process.env.PLAYWRIGHT_AUTH_STATE, "Set PLAYWRIGHT_AUTH_STATE to an ignored, environment-local storage-state file.");
    await page.goto("/");
    const { details, summary } = accountDisclosure(page);
    await expect(summary).toHaveAttribute("aria-label", /^Account menu for .+/);
    await expect(details).not.toHaveAttribute("open", "");
    await summary.focus();
    await expect(summary).toBeFocused();
    await summary.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await page.getByRole("link", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { name: "Study preferences" })).toBeVisible();
    await expect(page.getByText("Active account")).toBeVisible();
});

test("Account disclosure exposes the server logout route", async ({ page }) => {
    test.skip(!process.env.PLAYWRIGHT_AUTH_STATE, "Set PLAYWRIGHT_AUTH_STATE to an ignored, environment-local storage-state file.");
    await page.goto("/");
    const { details, summary } = accountDisclosure(page);
    await summary.click();
    await expect(details).toHaveAttribute("open", "");
    await expect(details.getByRole("link", { name: "Sign out" })).toHaveAttribute("href", "/auth/logout");
});

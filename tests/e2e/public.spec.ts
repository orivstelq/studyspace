import { expect, test } from "@playwright/test";

test("public navigation, search, and listing details", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("A place for every kind of focus");
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

    await page.getByRole("link", { name: "Explore study spaces" }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await page.getByLabel("Search spaces").fill("Alkek");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("link", { name: "Albert B. Alkek Library" })).toBeVisible();

    await page.getByRole("link", { name: "Albert B. Alkek Library" }).click();
    await expect(page).toHaveURL(/\/spaces\/alkek-library$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Albert B. Alkek Library");
    await expect(page.getByRole("heading", { name: "Amenities" })).toBeVisible();
});

test("public pages fit mobile and desktop viewports", async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(viewport);
        await page.goto("/explore");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        expect(overflow).toBe(false);
    }
});

test("invalid filters and missing listings have recoverable error states", async ({ page }) => {
    await page.goto("/explore?page=0");
    await expect(page.getByRole("heading", { name: "These search filters are invalid" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reset filters" })).toBeVisible();

    await page.goto("/spaces/not-a-published-listing");
    await expect(page.getByRole("heading", { name: "This page is unavailable" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse study spaces" })).toBeVisible();
});

test("signed-out private pages offer sign-in without exposing account data", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Sign in to save preferences" })).toBeVisible();
    await expect(page.locator("#main-content").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/login?returnTo=/profile");
    await expect(page.getByText("Active account")).toHaveCount(0);

    await page.goto("/saved");
    await expect(page.getByRole("heading", { name: "Your collection starts here" })).toBeVisible();
    await expect(page.locator("#main-content").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/login");
});

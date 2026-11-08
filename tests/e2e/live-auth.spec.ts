import { expect, type Browser, type BrowserContext, type Page, test } from "@playwright/test";
import { resolvePlaywrightBaseUrl } from "../../playwright-origin";

const userAState = process.env.PLAYWRIGHT_USER_A_STATE ?? process.env.PLAYWRIGHT_AUTH_STATE;
const userBState = process.env.PLAYWRIGHT_USER_B_STATE;
const moderatorState = process.env.PLAYWRIGHT_MODERATOR_STATE;
const spaceSlug = process.env.PLAYWRIGHT_E2E_SPACE_SLUG ?? "alkek-library";
const spaceName = process.env.PLAYWRIGHT_E2E_SPACE_NAME ?? "Albert B. Alkek Library";
const runId = `${Date.now()}-${process.pid}`;
const baseURL = resolvePlaywrightBaseUrl();

function requireState(value: string | undefined, variable: string) {
    test.skip(!value, `${variable} must point to an ignored storage-state file created from a real Auth0 session.`);
    return value as string;
}

async function contextFor(browser: Browser, storageState: string) {
    return browser.newContext({ storageState, baseURL });
}

async function accountLabel(page: Page) {
    const summary = page.locator("summary[aria-label^='Account menu for']");
    await expect(summary).toBeVisible();
    return summary.getAttribute("aria-label");
}

async function moderationItem(page: Page, text: string) {
    await page.goto("/admin");
    const item = page.getByRole("listitem").filter({ hasText: text });
    await expect(item).toBeVisible();
    return item;
}

function publicReviews(page: Page) {
    return page.locator("section[aria-labelledby='community-reviews-heading'] > ul");
}

test.describe.configure({ mode: "serial" });

test("two real accounts keep Saved and Profile data isolated and persistent", async ({ browser }) => {
    const stateA = requireState(userAState, "PLAYWRIGHT_USER_A_STATE");
    const stateB = requireState(userBState, "PLAYWRIGHT_USER_B_STATE");
    let userA: BrowserContext | undefined;
    let userB: BrowserContext | undefined;

    try {
        userA = await contextFor(browser, stateA);
        const pageA = await userA.newPage();
        await pageA.goto(`/spaces/${spaceSlug}`);
        const saveButton = pageA.getByRole("button", { name: `Save space: ${spaceName}` });
        if (await saveButton.isVisible()) await saveButton.click();
        await expect(pageA.getByRole("button", { name: `Remove from Saved: ${spaceName}` })).toBeVisible();

        await pageA.goto("/profile");
        await pageA.getByLabel("Preferred space type").selectOption("coworking");
        await pageA.getByLabel("Accessible").check();
        await pageA.getByRole("button", { name: "Save preferences" }).click();
        await expect(pageA.getByRole("status")).toHaveText("Preferences saved.");
        const labelA = await accountLabel(pageA);
        await userA.close();
        userA = undefined;

        userA = await contextFor(browser, stateA);
        const persistedA = await userA.newPage();
        await persistedA.goto("/saved");
        await expect(persistedA.getByRole("link", { name: spaceName })).toBeVisible();
        await persistedA.goto("/profile");
        await expect(persistedA.getByLabel("Preferred space type")).toHaveValue("coworking");
        await expect(persistedA.getByLabel("Accessible")).toBeChecked();

        userB = await contextFor(browser, stateB);
        const pageB = await userB.newPage();
        await pageB.goto("/saved");
        await expect(pageB.getByRole("link", { name: spaceName })).toHaveCount(0);
        const labelB = await accountLabel(pageB);
        expect(labelB).not.toBe(labelA);

        await persistedA.goto(`/spaces/${spaceSlug}`);
        await persistedA.getByRole("button", { name: `Remove from Saved: ${spaceName}` }).click();
        await persistedA.goto("/profile");
        await persistedA.getByLabel("Preferred space type").selectOption("all");
        await persistedA.getByLabel("Accessible").uncheck();
        await persistedA.getByRole("button", { name: "Save preferences" }).click();
        await expect(persistedA.getByRole("status")).toHaveText("Preferences saved.");
    } finally {
        await Promise.all([userA?.close(), userB?.close()]);
    }
});

test("real user and moderator sessions cover review, report, and authorization transitions", async ({ browser }) => {
    const stateA = requireState(userAState, "PLAYWRIGHT_USER_A_STATE");
    const stateB = requireState(userBState, "PLAYWRIGHT_USER_B_STATE");
    const stateModerator = requireState(moderatorState, "PLAYWRIGHT_MODERATOR_STATE");
    const submittedBody = `Live staging review ${runId}: a sufficiently detailed review for approval.`;
    const rejectedBody = `Live staging review ${runId}: this edit is deliberately sent through rejection.`;
    const approvedBody = `Live staging review ${runId}: final approved text before withdrawal.`;
    const reportDetails = `Live staging private report ${runId}.`;
    const contexts: BrowserContext[] = [];

    try {
        const userA = await contextFor(browser, stateA);
        const userB = await contextFor(browser, stateB);
        const moderator = await contextFor(browser, stateModerator);
        contexts.push(userA, userB, moderator);
        const pageA = await userA.newPage();
        const pageB = await userB.newPage();
        const moderatorPage = await moderator.newPage();

        await pageA.goto(`/spaces/${spaceSlug}`);
        await pageA.getByLabel("Review").fill(submittedBody);
        await pageA.getByRole("button", { name: /Submit (review|changes)/ }).click();
        await expect(pageA.getByRole("status")).toHaveText("Review submitted for moderator approval.");

        const publicPage = await browser.newPage({ baseURL });
        await publicPage.goto(`/spaces/${spaceSlug}`);
        await expect(publicPage.getByText(submittedBody)).toHaveCount(0);
        await publicPage.close();

        await pageB.goto("/admin");
        await expect(pageB.getByRole("heading", { name: "This page is unavailable" })).toBeVisible();

        let item = await moderationItem(moderatorPage, submittedBody);
        await item.getByRole("button", { name: "Approve" }).click();
        await expect(item.getByRole("button", { name: "Approve" })).toHaveCount(0);
        await pageA.reload();
        await expect(publicReviews(pageA).getByText(submittedBody)).toBeVisible();

        await pageA.locator("details").filter({ hasText: "Report this listing" }).getByText("Report this listing", { exact: true }).click();
        await pageA.getByLabel("Reason").selectOption("INACCURATE");
        await pageA.getByLabel("Details (optional)").fill(reportDetails);
        await pageA.getByRole("button", { name: "Send private report" }).click();
        await expect(pageA.getByRole("status")).toHaveText("Report submitted privately to moderators.");
        await expect(pageB.getByText(reportDetails)).toHaveCount(0);
        item = await moderationItem(moderatorPage, reportDetails);
        await item.getByRole("button", { name: "Resolve report" }).click();
        await expect(moderatorPage.getByText(reportDetails)).toHaveCount(0);

        await pageA.getByLabel("Review").fill(rejectedBody);
        await pageA.getByRole("button", { name: "Submit changes" }).click();
        await expect(pageA.getByText("Pending moderator approval")).toBeVisible();
        item = await moderationItem(moderatorPage, rejectedBody);
        await item.getByRole("button", { name: "Reject" }).click();
        await expect(moderatorPage.getByText(rejectedBody)).toHaveCount(0);
        await pageA.reload();
        await expect(pageA.getByText("Rejected — edit to resubmit")).toBeVisible();

        await pageA.getByLabel("Review").fill(approvedBody);
        await pageA.getByRole("button", { name: "Submit changes" }).click();
        item = await moderationItem(moderatorPage, approvedBody);
        await item.getByRole("button", { name: "Approve" }).click();
        await pageA.reload();
        await expect(publicReviews(pageA).getByText(approvedBody)).toBeVisible();
        await pageA.getByRole("button", { name: "Withdraw review" }).click();
        await expect(pageA.getByRole("status")).toHaveText("Review withdrawn.");
        await pageA.reload();
        await expect(pageA.getByText("Withdrawn — edit to resubmit")).toBeVisible();
        await expect(publicReviews(pageA).getByText(approvedBody)).toHaveCount(0);
    } finally {
        await Promise.all(contexts.map((context) => context.close()));
    }
});

test("real Auth0 logout invalidates the application session", async ({ page }) => {
    requireState(userAState, "PLAYWRIGHT_USER_A_STATE");
    await page.goto("/");
    const summary = page.locator("summary[aria-label^='Account menu for']");
    await summary.click();
    await page.getByRole("link", { name: "Sign out" }).click();
    await page.waitForURL((url) => url.origin === baseURL, { timeout: 30_000 });
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Sign in to save preferences" })).toBeVisible();
});

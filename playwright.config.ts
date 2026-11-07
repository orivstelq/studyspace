import { defineConfig, devices } from "@playwright/test";

const authenticatedState = process.env.PLAYWRIGHT_AUTH_STATE;

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? "github" : "list",
    use: {
        baseURL: "http://127.0.0.1:3100",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },
    webServer: {
        command: "npm start -- --hostname 127.0.0.1 --port 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
            ...process.env,
            APP_BASE_URL: "http://127.0.0.1:3100",
            RATE_LIMIT_SECRET: process.env.RATE_LIMIT_SECRET ?? "local-e2e-rate-limit-secret-not-for-production",
            TRUSTED_CLIENT_IP_SOURCE: process.env.TRUSTED_CLIENT_IP_SOURCE ?? "shared",
        },
    },
    projects: [
        {
            name: "chromium-public",
            testIgnore: /authenticated\.spec\.ts/,
            use: { ...devices["Desktop Chrome"] },
        },
        ...(authenticatedState ? [{
            name: "chromium-authenticated",
            testMatch: /authenticated\.spec\.ts/,
            use: { ...devices["Desktop Chrome"], storageState: authenticatedState },
        }] : []),
    ],
});

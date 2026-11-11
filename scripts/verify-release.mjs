#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

function fail(message) {
    throw new Error(message);
}

function run(command, args, environment) {
    const result = spawnSync(command, args, {
        env: environment,
        stdio: "inherit",
        shell: false,
    });
    if (result.status !== 0) fail(`${command} ${args[0] ?? ""} failed`);
}

function releaseOrigin() {
    const value = process.env.STAGING_BASE_URL;
    if (!value) fail("STAGING_BASE_URL is required.");
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
        fail("STAGING_BASE_URL must be an origin-only HTTPS URL.");
    }
    const playwrightOrigin = process.env.PLAYWRIGHT_BASE_URL;
    if (playwrightOrigin && new URL(playwrightOrigin).origin !== url.origin) {
        fail("PLAYWRIGHT_BASE_URL must match STAGING_BASE_URL.");
    }
    return url.origin;
}

function authenticatedState(environment, name) {
    const path = environment[name];
    if (!path || !existsSync(path)) fail(`${name} must point to an existing ignored storage-state file.`);
    const relativePath = relative(process.cwd(), resolve(path));
    if (!relativePath.startsWith("..") && !isAbsolute(relativePath)) {
        const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", relativePath], { stdio: "ignore" });
        if (tracked.status === 0) fail(`${name} must not point to a tracked file.`);
        const ignored = spawnSync("git", ["check-ignore", "--quiet", "--", relativePath], { stdio: "ignore" });
        if (ignored.status !== 0) fail(`${name} must point outside the repository or to an ignored file.`);
    }
}

function main() {
    if (process.argv.includes("--help")) {
        console.log("Set STAGING_BASE_URL and the three PLAYWRIGHT_*_STATE paths, then run npm run verify:release.");
        return;
    }
    if (process.argv.length > 2) fail("This verifier accepts only --help.");

    const origin = releaseOrigin();
    const environment = {
        ...process.env,
        STAGING_BASE_URL: origin,
        PLAYWRIGHT_BASE_URL: origin,
    };
    for (const name of ["PLAYWRIGHT_USER_A_STATE", "PLAYWRIGHT_USER_B_STATE", "PLAYWRIGHT_MODERATOR_STATE"]) {
        authenticatedState(environment, name);
    }

    run("node", ["scripts/verify-staging.mjs"], environment);
    run("npx", ["--no-install", "playwright", "test", "tests/e2e/public.spec.ts", "--project=chromium-public"], environment);
    run("npx", [
        "--no-install", "playwright", "test",
        "tests/e2e/authenticated.spec.ts", "tests/e2e/live-auth.spec.ts",
        "--project=chromium-authenticated",
    ], environment);

    console.log("PASS public and authenticated release smoke automation");
    console.log("NOT VERIFIED fresh interactive Auth0 login; storage states prove only existing real sessions");
    console.log("NOT VERIFIED trusted-ingress spoof resistance and realistic rate-limit behavior");
    console.log("NOT VERIFIED Vercel rollback execution and restored-database integrity");
}

try {
    main();
} catch (error) {
    console.error(`FAIL ${error instanceof Error ? error.message : "release verification failed"}`);
    process.exitCode = 1;
}

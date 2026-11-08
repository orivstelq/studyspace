#!/usr/bin/env node

const timeoutMilliseconds = 15_000;

function fail(message) {
    throw new Error(message);
}

function baseUrlFromEnvironment() {
    const value = process.env.STAGING_BASE_URL;
    if (!value) fail("STAGING_BASE_URL is required.");

    let url;
    try {
        url = new URL(value);
    } catch {
        fail("STAGING_BASE_URL must be a valid URL.");
    }
    if (url.protocol !== "https:") fail("STAGING_BASE_URL must use HTTPS.");
    if (url.username || url.password || url.search || url.hash) {
        fail("STAGING_BASE_URL must not contain credentials, a query, or a fragment.");
    }
    url.pathname = url.pathname.replace(/\/$/, "");
    return url;
}

async function request(baseUrl, path) {
    const response = await fetch(new URL(path, baseUrl), {
        method: "GET",
        redirect: "error",
        cache: "no-store",
        headers: { Accept: path.startsWith("/api/") ? "application/json" : "text/html" },
        signal: AbortSignal.timeout(timeoutMilliseconds),
    });
    return response;
}

function expectStatus(response, expected, path) {
    if (response.status !== expected) {
        fail(`${path} returned ${response.status}; expected ${expected}.`);
    }
}

function expectHeader(response, name, predicate, path) {
    const value = response.headers.get(name);
    if (!value || !predicate(value)) fail(`${path} is missing or has an invalid ${name} header.`);
}

async function verifyPage(baseUrl, path) {
    const response = await request(baseUrl, path);
    expectStatus(response, 200, path);
    expectHeader(response, "content-type", (value) => value.includes("text/html"), path);
    expectHeader(response, "strict-transport-security", (value) => value.includes("max-age=31536000"), path);
    expectHeader(response, "x-content-type-options", (value) => value.toLowerCase() === "nosniff", path);
    expectHeader(response, "referrer-policy", (value) => value === "strict-origin-when-cross-origin", path);
    expectHeader(response, "permissions-policy", (value) => value.includes("camera=()"), path);
    expectHeader(response, "content-security-policy", (value) => (
        value.includes("default-src 'self'")
        && value.includes("script-src-attr 'none'")
        && value.includes("frame-ancestors 'none'")
        && value.includes("upgrade-insecure-requests")
    ), path);
    if (response.headers.has("x-powered-by")) fail(`${path} exposes the X-Powered-By header.`);
    await response.body?.cancel();
    console.log(`PASS ${path}`);
}

async function verifyJson(baseUrl, path, expectedStatus, validate) {
    const response = await request(baseUrl, path);
    expectStatus(response, expectedStatus, path);
    expectHeader(response, "content-type", (value) => value.includes("application/json"), path);
    expectHeader(response, "cache-control", (value) => value.includes("no-store"), path);
    const payload = await response.json();
    if (!validate(payload)) fail(`${path} returned an unexpected response shape.`);
    console.log(`PASS ${path}`);
}

async function main() {
    if (process.argv.includes("--help")) {
        console.log("Set STAGING_BASE_URL to the HTTPS staging origin, then run npm run verify:staging.");
        return;
    }
    if (process.argv.length > 2) fail("This verifier accepts only --help.");

    const baseUrl = baseUrlFromEnvironment();
    await verifyPage(baseUrl, "/");
    await verifyPage(baseUrl, "/explore");
    await verifyJson(baseUrl, "/api/spaces?q=Alkek", 200, (payload) => (
        typeof payload === "object" && payload !== null && Array.isArray(payload.data)
    ));
    await verifyJson(baseUrl, "/api/spaces?page=0", 400, (payload) => (
        payload?.error?.code === "INVALID_FILTERS"
    ));
    await verifyJson(baseUrl, "/api/spaces/not-a-published-listing", 404, (payload) => (
        payload?.error?.code === "NOT_FOUND"
    ));
    console.log("Staging public verification passed without sending credentials or mutation requests.");
}

main().catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : "staging verification failed"}`);
    process.exitCode = 1;
});

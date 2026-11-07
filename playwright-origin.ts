export const LOCAL_PLAYWRIGHT_BASE_URL = "http://127.0.0.1:3100";

export function resolvePlaywrightBaseUrl(value = process.env.PLAYWRIGHT_BASE_URL) {
    if (value === undefined) return LOCAL_PLAYWRIGHT_BASE_URL;

    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error("PLAYWRIGHT_BASE_URL must be a valid HTTPS origin.");
    }
    if (
        url.protocol !== "https:"
        || url.username
        || url.password
        || url.pathname !== "/"
        || url.search
        || url.hash
    ) {
        throw new Error("PLAYWRIGHT_BASE_URL must be an origin-only HTTPS URL.");
    }
    return url.origin;
}

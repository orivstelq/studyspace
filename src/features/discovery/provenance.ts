export const sourceLabels = {
    OFFICIAL: "Official source",
    FIRST_PARTY: "First-party source",
    COMMUNITY: "Community source",
    DEVELOPMENT_FIXTURE: "Development fixture",
};

export function publicSourceUrl(value: string | null) {
    if (!value) return null;

    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
    } catch {
        return null;
    }
}

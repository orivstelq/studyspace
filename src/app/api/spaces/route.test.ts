import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ list: vi.fn(), limit: vi.fn(), address: vi.fn() }));

vi.mock("@/features/discovery/repository", () => ({ listPublishedSpaces: mocks.list }));
vi.mock("@/features/discovery/directory-params", () => ({
    PAGE_SIZE: 20,
    parseDirectoryParams: () => ({ query: "", category: "all", amenity: "all", page: 1 }),
}));
vi.mock("@/features/discovery/provenance", () => ({ publicSourceUrl: (value: string | null) => value }));
vi.mock("@/lib/security/rate-limit", () => ({
    clientAddress: mocks.address,
    enforceRateLimit: mocks.limit,
    rateLimitHeaders: (result: { allowed: boolean }) => result.allowed
        ? { "RateLimit-Remaining": "2" }
        : { "RateLimit-Remaining": "0", "Retry-After": "30" },
    RATE_LIMITS: { publicSearch: "search-policy" },
}));

describe("GET /api/spaces", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.address.mockReturnValue("client");
        mocks.limit.mockResolvedValue({ allowed: true });
        mocks.list.mockResolvedValue({ spaces: [], hasNext: false });
    });

    it("returns 429 and retry metadata without searching when exhausted", async () => {
        mocks.limit.mockResolvedValue({ allowed: false });
        const response = await GET(new Request("https://studyspace.example/api/spaces?q=quiet"));
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("30");
        await expect(response.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED" } });
        expect(mocks.list).not.toHaveBeenCalled();
    });

    it("returns 503 when shared enforcement is unavailable", async () => {
        mocks.limit.mockRejectedValue(new Error("database unavailable"));
        const response = await GET(new Request("https://studyspace.example/api/spaces"));
        expect(response.status).toBe(503);
        expect(mocks.list).not.toHaveBeenCalled();
    });

    it("returns 503 for unsupported ingress configuration", async () => {
        mocks.address.mockImplementation(() => {
            throw new Error("unsupported ingress");
        });
        const response = await GET(new Request("https://studyspace.example/api/spaces"));
        expect(response.status).toBe(503);
        expect(mocks.limit).not.toHaveBeenCalled();
        expect(mocks.list).not.toHaveBeenCalled();
    });

    it("includes limit metadata on successful searches", async () => {
        const response = await GET(new Request("https://studyspace.example/api/spaces"));
        expect(response.status).toBe(200);
        expect(response.headers.get("ratelimit-remaining")).toBe("2");
        expect(mocks.list).toHaveBeenCalledOnce();
    });
});

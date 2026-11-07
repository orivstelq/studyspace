import { parseDirectoryParams, PAGE_SIZE } from "@/features/discovery/directory-params";
import { publicSourceUrl } from "@/features/discovery/provenance";
import { listPublishedSpaces } from "@/features/discovery/repository";
import { clientAddress, enforceRateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/security/rate-limit";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
    let rateLimit;
    try {
        rateLimit = await enforceRateLimit(RATE_LIMITS.publicSearch, clientAddress(request.headers));
    } catch (error) {
        console.error("Search rate limiter failed:", error instanceof Error ? error.name : "Unknown error");
        return Response.json(
            { error: { code: "SERVICE_UNAVAILABLE", message: "Search is temporarily unavailable." } },
            { status: 503, headers },
        );
    }
    if (!rateLimit.allowed) {
        return Response.json(
            { error: { code: "RATE_LIMITED", message: "Too many search requests. Try again shortly." } },
            { status: 429, headers: { ...headers, ...rateLimitHeaders(rateLimit) } },
        );
    }
    const params = new URL(request.url).searchParams;
    const filters = parseDirectoryParams({
        q: getParameter(params, "q"),
        category: getParameter(params, "category"),
        amenity: getParameter(params, "amenity"),
        page: getParameter(params, "page"),
    });

    if (!filters) {
        return Response.json(
            { error: { code: "INVALID_FILTERS", message: "Check the search filters and page number." } },
            { status: 400, headers: { ...headers, ...rateLimitHeaders(rateLimit) } },
        );
    }

    try {
        const { spaces, hasNext } = await listPublishedSpaces(filters);
        const data = spaces.map((space) => {
            const sourceUrl = publicSourceUrl(space.sourceUrl);
            return { ...space, sourceUrl, verifiedAt: sourceUrl ? space.verifiedAt : null };
        });
        return Response.json(
            { data, count: spaces.length, page: filters.page, pageSize: PAGE_SIZE, hasNext },
            { headers: { ...headers, ...rateLimitHeaders(rateLimit) } },
        );
    } catch (error) {
        console.error("Failed to retrieve study spaces:", error instanceof Error ? error.name : "Unknown error");
        return Response.json(
            { error: { code: "INTERNAL_ERROR", message: "Unable to retrieve study spaces." } },
            { status: 500, headers: { ...headers, ...rateLimitHeaders(rateLimit) } },
        );
    }
}

function getParameter(params: URLSearchParams, name: string) {
    const values = params.getAll(name);
    return values.length > 1 ? values : values[0];
}

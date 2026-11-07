import { parseDirectoryParams, PAGE_SIZE } from "@/features/discovery/directory-params";
import { listPublishedSpaces } from "@/features/discovery/repository";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
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
            { status: 400, headers },
        );
    }

    try {
        const { spaces, hasNext } = await listPublishedSpaces(filters);
        return Response.json(
            { data: spaces, count: spaces.length, page: filters.page, pageSize: PAGE_SIZE, hasNext },
            { headers },
        );
    } catch (error) {
        console.error("Failed to retrieve study spaces:", error instanceof Error ? error.name : "Unknown error");
        return Response.json(
            { error: { code: "INTERNAL_ERROR", message: "Unable to retrieve study spaces." } },
            { status: 500, headers },
        );
    }
}

function getParameter(params: URLSearchParams, name: string) {
    const values = params.getAll(name);
    return values.length > 1 ? values : values[0];
}

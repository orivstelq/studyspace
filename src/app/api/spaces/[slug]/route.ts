import { publicSourceUrl } from "@/features/discovery/provenance";
import { getPublishedSpaceBySlug } from "@/features/discovery/repository";

const headers = { "Cache-Control": "no-store" };

export async function GET(_request: Request, { params }: RouteContext<"/api/spaces/[slug]">) {
    const { slug } = await params;

    try {
        const space = await getPublishedSpaceBySlug(slug);
        if (!space) {
            return Response.json(
                { error: { code: "NOT_FOUND", message: "Study space unavailable." } },
                { status: 404, headers },
            );
        }

        const sourceUrl = publicSourceUrl(space.sourceUrl);
        return Response.json(
            { data: { ...space, sourceUrl, verifiedAt: sourceUrl ? space.verifiedAt : null } },
            { headers },
        );
    } catch (error) {
        console.error("Failed to retrieve a study space:", error instanceof Error ? error.name : "Unknown error");
        return Response.json(
            { error: { code: "INTERNAL_ERROR", message: "Unable to retrieve this study space." } },
            { status: 500, headers },
        );
    }
}

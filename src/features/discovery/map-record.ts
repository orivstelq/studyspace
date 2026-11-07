
import { publicSourceUrl } from "./provenance";
import type { StudySpace, Amenity } from "./types";
import { AMENITIES } from "./types";
import type { queryPublishedSpaces } from "./query";

type DatabaseSpace =
    Awaited<ReturnType<typeof queryPublishedSpaces>>["spaces"][number];

const categoryMap = {
    LIBRARY: "library",
    CAFE: "cafe",
    CAMPUS: "campus",
    COWORKING: "coworking",
} as const;

function isSupportedAmenity(code: string): code is Amenity {
    return (AMENITIES as readonly string[]).includes(code);
}

export function mapDatabaseSpace(
    space: DatabaseSpace,
): StudySpace {
    const amenities = space.amenities
        .map(({ amenity }) => amenity.code)
        .filter(isSupportedAmenity);

    return {
        id: space.id,
        slug: space.slug,
        name: space.name,
        description: space.description,
        category: categoryMap[space.category],
        city: space.city,
        region: space.region,
        amenities,
        source: "published",
        verifiedAt: publicSourceUrl(space.sourceUrl) ? space.verifiedAt?.toISOString() ?? null : null,
    };
}

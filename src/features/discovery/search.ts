
import type {
    SearchFilters,
    StudySpace,
} from "./types";

export function filterStudySpaces(
    spaces: readonly StudySpace[],
    filters: SearchFilters
): StudySpace[] {
    const query = filters.query.trim().toLocaleLowerCase();

    return spaces.filter((space) => {
        const searchableText = [
            space.name,
            space.description,
            space.city,
            space.region,
        ]
            .join(" ")
            .toLocaleLowerCase();

        const matchesQuery =
            query.length === 0 ||
            searchableText.includes(query);

        const matchesCategory =
            filters.category === "all" ||
            space.category === filters.category;

        const matchesAmenity =
            filters.amenity === "all" ||
            space.amenities.includes(filters.amenity);

        return (
            matchesQuery &&
            matchesCategory &&
            matchesAmenity
        );
    });
}

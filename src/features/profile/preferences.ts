import { AMENITIES, SPACE_CATEGORIES, type Amenity, type SpaceCategory } from "../discovery/types";
import type { ProfilePreferences } from "./query";

export function parseProfilePreferences(form: FormData): ProfilePreferences | null {
    const category = form.get("category");
    const amenities = form.getAll("amenities");
    if (typeof category !== "string" ||
        (category !== "all" && !SPACE_CATEGORIES.includes(category as SpaceCategory)) ||
        amenities.some((item) => typeof item !== "string" || !AMENITIES.includes(item as Amenity)) ||
        new Set(amenities).size !== amenities.length || amenities.length > AMENITIES.length) {
        return null;
    }
    return { category: category as ProfilePreferences["category"], amenities: amenities as Amenity[] };
}

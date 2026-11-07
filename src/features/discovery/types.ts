
export const SPACE_CATEGORIES = [
    "library",
    "cafe",
    "campus",
    "coworking",
] as const;

export const AMENITIES = [
    "wifi",
    "outlets",
    "quiet",
    "group-friendly",
    "accessible",
] as const;

export type SpaceCategory =
    (typeof SPACE_CATEGORIES)[number];

export type Amenity =
    (typeof AMENITIES)[number];

export interface StudySpace {
    id: string;
    slug: string;
    name: string;
    description: string;
    category: SpaceCategory;
    city: string;
    region: string;
    amenities: Amenity[];
    source: "development-fixture";
}

export interface SearchFilters {
    query: string;
    category: SpaceCategory | "all";
    amenity: Amenity | "all";
}

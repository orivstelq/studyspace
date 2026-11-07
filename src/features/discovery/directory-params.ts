import { AMENITIES, SPACE_CATEGORIES, type SearchFilters } from "./types";

export const PAGE_SIZE = 20;
export const MAX_PAGE = 1000;
export const MAX_SEARCH_LENGTH = 120;

export type DirectoryFilters = SearchFilters & { page: number };

type SearchParams = Record<string, string | string[] | undefined>;

export function parseDirectoryParams(params: SearchParams): DirectoryFilters | null {
    const { q = "", category = "all", amenity = "all", page = "1" } = params;
    if (
        typeof q !== "string" || q.length > MAX_SEARCH_LENGTH || /[\p{Cc}]/u.test(q) ||
        typeof page !== "string" || !/^[1-9]\d{0,3}$/.test(page) || Number(page) > MAX_PAGE
    ) {
        return null;
    }

    const validCategory = category === "all" ? category : SPACE_CATEGORIES.find((item) => item === category);
    const validAmenity = amenity === "all" ? amenity : AMENITIES.find((item) => item === amenity);
    if (!validCategory || !validAmenity) {
        return null;
    }

    return { query: q.trim(), category: validCategory, amenity: validAmenity, page: Number(page) };
}

export function exploreUrl(filters: DirectoryFilters, page: number) {
    const params = new URLSearchParams();
    if (filters.query) params.set("q", filters.query);
    if (filters.category !== "all") params.set("category", filters.category);
    if (filters.amenity !== "all") params.set("amenity", filters.amenity);
    if (page > 1) params.set("page", String(page));
    return params.size ? `/explore?${params}` : "/explore";
}

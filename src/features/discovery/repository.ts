
import "server-only";

import type { DirectoryFilters } from "./directory-params";
import { cache } from "react";
import { publicDatabase } from "@/lib/db/client";

import {
    queryPublishedSpaces,
    queryPublishedSpaceBySlug,
    queryRecommendationCandidates,
} from "./query";

export async function listPublishedSpaces(filters: DirectoryFilters) {
    return queryPublishedSpaces(publicDatabase(), filters);
}

export const getPublishedSpaceBySlug = cache(
    async (slug: string) => {
        if (slug.length > 160 || /[\p{Cc}]/u.test(slug)) return null;
        return queryPublishedSpaceBySlug(publicDatabase(), slug);
    },
);

export async function listRecommendationCandidates() {
    return queryRecommendationCandidates(publicDatabase());
}

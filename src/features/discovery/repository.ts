
import "server-only";

import type { DirectoryFilters } from "./directory-params";
import { cache } from "react";
import { prisma } from "@/lib/db/client";

import {
    queryPublishedSpaces,
    queryPublishedSpaceBySlug,
} from "./query";

export async function listPublishedSpaces(filters: DirectoryFilters) {
    return queryPublishedSpaces(prisma, filters);
}

export const getPublishedSpaceBySlug = cache(
    async (slug: string) => {
        return queryPublishedSpaceBySlug(prisma, slug);
    },
);

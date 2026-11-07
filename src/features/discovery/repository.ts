
import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/db/client";

import {
    queryPublishedSpaces,
    queryPublishedSpaceBySlug,
} from "./query";

export async function listPublishedSpaces() {
    return queryPublishedSpaces(prisma);
}

export const getPublishedSpaceBySlug = cache(
    async (slug: string) => {
        return queryPublishedSpaceBySlug(prisma, slug);
    },
);

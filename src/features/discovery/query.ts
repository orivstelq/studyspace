
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import { MAX_PAGE, PAGE_SIZE, type DirectoryFilters } from "./directory-params";

type Database = Pick<PrismaClient, "studySpace">;

export const publishedSpaceSelect = {
    id: true,
    slug: true,
    name: true,
    description: true,
    category: true,
    city: true,
    region: true,
    address: true,
    sourceType: true,
    sourceUrl: true,
    verifiedAt: true,
    amenities: {
        select: {
            amenity: {
                select: {
                    code: true,
                    name: true,
                },
            },
        },
    },
} as const;

export const publishedSpaceWhere = {
    status: "PUBLISHED" as const,
    sourceType: {
        not: "DEVELOPMENT_FIXTURE" as const,
    },
};

const databaseCategories = {
    library: "LIBRARY",
    cafe: "CAFE",
    campus: "CAMPUS",
    coworking: "COWORKING",
} as const;

const nameOrder = [{ name: "asc" }, { id: "asc" }] satisfies Prisma.StudySpaceOrderByWithRelationInput[];

export async function queryPublishedSpaces(db: Database, filters: DirectoryFilters) {
    const where: Prisma.StudySpaceWhereInput = { ...publishedSpaceWhere };
    if (filters.category !== "all") where.category = databaseCategories[filters.category];
    if (filters.amenity !== "all") where.amenities = { some: { amenity: { code: filters.amenity } } };

    if (filters.query) {
        // Prisma maps contains to LIKE. Escape its wildcard syntax for literal search.
        const match = { contains: filters.query.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" } as const;
        where.OR = [{ name: match }, { description: match }, { city: match }, { region: match }];
    }

    const rows = await db.studySpace.findMany({
        where,
        select: publishedSpaceSelect,
        orderBy: nameOrder,
        skip: (filters.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE + 1,
    });

    return {
        spaces: rows.slice(0, PAGE_SIZE),
        hasNext: filters.page < MAX_PAGE && rows.length > PAGE_SIZE,
    };
}

export function queryPublishedSpaceBySlug(
    db: Database,
    slug: string,
) {
    return db.studySpace.findFirst({
        where: {
            ...publishedSpaceWhere,
            slug,
        },
        select: publishedSpaceSelect,
    });
}

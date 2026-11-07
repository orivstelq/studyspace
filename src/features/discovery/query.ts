
import type { PrismaClient } from "@/generated/prisma/client";

type Database = Pick<PrismaClient, "studySpace">;

const publishedSpaceSelect = {
    id: true,
    slug: true,
    name: true,
    description: true,
    category: true,
    city: true,
    region: true,
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

const publishedSpaceWhere = {
    status: "PUBLISHED" as const,
    sourceType: {
        not: "DEVELOPMENT_FIXTURE" as const,
    },
};

export function queryPublishedSpaces(db: Database) {
    return db.studySpace.findMany({
        where: publishedSpaceWhere,
        select: publishedSpaceSelect,
        orderBy: [
            { name: "asc" },
            { id: "asc" },
        ],
        take: 20,
    });
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

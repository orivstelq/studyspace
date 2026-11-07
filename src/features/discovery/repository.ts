
import "server-only";

import { prisma } from "@/lib/db/client";

export async function listPublishedSpaces() {
    return prisma.studySpace.findMany({
        where: {
            status: "PUBLISHED",
            sourceType: {
                not: "DEVELOPMENT_FIXTURE",
            },
        },
        select: {
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
        },
        orderBy: [
            { name: "asc" },
            { id: "asc" },
        ],
        take: 20,
    });
}

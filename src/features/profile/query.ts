import type { PrismaClient } from "@/generated/prisma/client";
import { withPrivateContext } from "../../lib/db/private-context";
import type { Amenity, SpaceCategory } from "../discovery/types";

type Database = Pick<PrismaClient, "$transaction">;

export interface ProfilePreferences {
    category: SpaceCategory | "all";
    amenities: Amenity[];
}

const databaseCategories = {
    library: "LIBRARY",
    cafe: "CAFE",
    campus: "CAMPUS",
    coworking: "COWORKING",
} as const;

export function getProfile(db: Database, accountId: string): Promise<ProfilePreferences | null> {
    return withPrivateContext(db, accountId, false, async (tx) => {
        const profile = await tx.userProfile.findUnique({
            where: { accountId },
            select: { preferredCategory: true, preferredAmenities: true },
        });
        if (!profile) return null;

        const category = profile.preferredCategory
            ? profile.preferredCategory.toLowerCase() as SpaceCategory
            : "all";
        return { category, amenities: profile.preferredAmenities as Amenity[] };
    });
}

export function saveProfile(db: Database, accountId: string, preferences: ProfilePreferences) {
    return withPrivateContext(db, accountId, false, (tx) => tx.userProfile.upsert({
        where: { accountId },
        create: {
            accountId,
            preferredCategory: preferences.category === "all" ? null : databaseCategories[preferences.category],
            preferredAmenities: preferences.amenities,
        },
        update: {
            preferredCategory: preferences.category === "all" ? null : databaseCategories[preferences.category],
            preferredAmenities: preferences.amenities,
        },
        select: { accountId: true },
    }));
}

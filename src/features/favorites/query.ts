import type { PrismaClient } from "@/generated/prisma/client";
import { withPrivateContext } from "../../lib/db/private-context";
import { MAX_PAGE, PAGE_SIZE } from "../discovery/directory-params";
import { publishedSpaceSelect, publishedSpaceWhere } from "../discovery/query";

type Database = Pick<PrismaClient, "$transaction">;

export function listFavorites(db: Database, ownerKey: string, page: number) {
    return withPrivateContext(db, ownerKey, false, async (tx) => {
        const rows = await tx.favorite.findMany({
            where: { ownerKey, studySpace: publishedSpaceWhere },
            select: { studySpace: { select: publishedSpaceSelect } },
            orderBy: [{ createdAt: "desc" }, { studySpaceId: "asc" }],
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE + 1,
        });
        return {
            spaces: rows.slice(0, PAGE_SIZE).map((row) => row.studySpace),
            hasNext: page < MAX_PAGE && rows.length > PAGE_SIZE,
        };
    });
}

export function hasFavorite(db: Database, ownerKey: string, studySpaceId: string) {
    return withPrivateContext(db, ownerKey, false, async (tx) => {
        const favorite = await tx.favorite.findUnique({
            where: { ownerKey_studySpaceId: { ownerKey, studySpaceId } },
            select: { studySpaceId: true },
        });
        return favorite !== null;
    });
}

export function changeFavorite(db: Database, ownerKey: string, slug: string, save: boolean) {
    return withPrivateContext(db, ownerKey, false, async (tx) => {
        if (!save) {
            await tx.favorite.deleteMany({ where: { ownerKey, studySpace: { slug } } });
            return true;
        }

        const space = await tx.studySpace.findFirst({
            where: { ...publishedSpaceWhere, slug },
            select: { id: true },
        });
        if (!space) return false;

        // A retry or concurrent save for the same pair is harmless.
        await tx.favorite.createMany({ data: { ownerKey, studySpaceId: space.id }, skipDuplicates: true });
        return true;
    });
}

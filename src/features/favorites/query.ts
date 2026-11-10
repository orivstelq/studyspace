import type { PrismaClient } from "@/generated/prisma/client";
import { withPrivateContext } from "../../lib/db/private-context";
import { MAX_PAGE, PAGE_SIZE } from "../discovery/directory-params";
import { publishedSpaceSelect, publishedSpaceWhere } from "../discovery/query";

type Database = Pick<PrismaClient, "$transaction">;

export function listFavorites(db: Database, accountId: string, page: number) {
    return withPrivateContext(db, accountId, false, async (tx) => {
        const rows = await tx.favorite.findMany({
            where: { accountId, studySpace: publishedSpaceWhere },
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

export function hasFavorite(db: Database, accountId: string, studySpaceId: string) {
    return withPrivateContext(db, accountId, false, async (tx) => {
        const favorite = await tx.favorite.findUnique({
            where: { accountId_studySpaceId: { accountId, studySpaceId } },
            select: { studySpaceId: true },
        });
        return favorite !== null;
    });
}

export function changeFavorite(db: Database, accountId: string, slug: string, save: boolean) {
    return withPrivateContext(db, accountId, false, async (tx) => {
        if (!save) {
            await tx.favorite.deleteMany({ where: { accountId, studySpace: { slug } } });
            return true;
        }

        const space = await tx.studySpace.findFirst({
            where: { ...publishedSpaceWhere, slug },
            select: { id: true },
        });
        if (!space) return false;

        // A retry or concurrent save for the same pair is harmless.
        await tx.favorite.createMany({ data: { accountId, studySpaceId: space.id }, skipDuplicates: true });
        return true;
    });
}

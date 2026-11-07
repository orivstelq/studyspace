import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Database = Pick<PrismaClient, "$transaction">;

export function withPrivateContext<T>(
    db: Database,
    ownerKey: string,
    isModerator: boolean,
    run: (tx: Prisma.TransactionClient) => Promise<T>,
) {
    return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('studyspace.favorite_owner', ${ownerKey}, true)`;
        await tx.$queryRaw`SELECT set_config('studyspace.is_moderator', ${String(isModerator)}, true)`;
        return run(tx);
    });
}

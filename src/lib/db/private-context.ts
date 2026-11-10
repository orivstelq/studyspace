import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { InactiveAccountError, setActiveAccountContextInTransaction } from "../../features/account-lifecycle/repository";

type Database = Pick<PrismaClient, "$transaction">;

export function withPrivateContext<T>(
    db: Database,
    accountId: string,
    isModerator: boolean,
    run: (tx: Prisma.TransactionClient) => Promise<T>,
) {
    return db.$transaction(async (tx) => {
        if (!await setActiveAccountContextInTransaction(tx, accountId, isModerator)) {
            throw new InactiveAccountError();
        }
        return run(tx);
    });
}

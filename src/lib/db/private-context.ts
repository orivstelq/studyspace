import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
    type AccountContext,
    InactiveAccountError,
    setActiveAccountContextInTransaction,
} from "../../features/account-lifecycle/repository";

type Database = Pick<PrismaClient, "$transaction">;

export function withPrivateContext<T>(
    db: Database,
    identity: AccountContext,
    isModerator: boolean,
    run: (tx: Prisma.TransactionClient) => Promise<T>,
) {
    return db.$transaction(async (tx) => {
        if (!await setActiveAccountContextInTransaction(tx, identity, isModerator)) {
            throw new InactiveAccountError();
        }
        return run(tx);
    });
}

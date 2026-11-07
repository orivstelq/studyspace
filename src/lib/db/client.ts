
import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { configuredPoolSize } from "./pool";

const globalForPrisma = globalThis as unknown as {
    prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error(
            "DATABASE_URL is not configured on the server.",
        );
    }

    const adapter = new PrismaPg({
        connectionString,
        max: configuredPoolSize("DATABASE_POOL_MAX"),
    });

    return new PrismaClient({ adapter });
}

let client = globalForPrisma.prisma;

export function publicDatabase() {
    client ??= createPrismaClient();
    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
    return client;
}

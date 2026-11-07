import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { configuredPoolSize } from "./pool";

const globalForPrivateDb = globalThis as { privateDb?: PrismaClient };
let client = globalForPrivateDb.privateDb;

export function privateDatabase() {
    if (client) return client;
    const connectionString = process.env.FAVORITES_DATABASE_URL;
    if (!connectionString) throw new Error("Private database is unavailable.");

    client = new PrismaClient({
        adapter: new PrismaPg({ connectionString, max: configuredPoolSize("PRIVATE_DATABASE_POOL_MAX") }),
    });
    if (process.env.NODE_ENV !== "production") globalForPrivateDb.privateDb = client;
    return client;
}

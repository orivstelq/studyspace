
import "server-only";

import { prisma } from "@/lib/db/client";
import { queryPublishedSpaces } from "./query";

export async function listPublishedSpaces() {
    return queryPublishedSpaces(prisma);
}

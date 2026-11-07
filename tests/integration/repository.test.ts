
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { queryPublishedSpaces } from "../../src/features/discovery/query";

function getTestUrl(
    key: "DIRECT_URL" | "DATABASE_URL",
): string {
    const value = process.env[key];

    if (!value) {
        throw new Error(`${key} is missing`);
    }

    const url = new URL(value);

    if (
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.pathname !== "/studyspace_dev"
    ) {
        throw new Error(
            `Unsafe ${key}: expected local studyspace_dev`,
        );
    }

    url.pathname = "/studyspace_test";
    url.search = "";
    url.hash = "";

    return url.toString();
}

describe("Published study spaces repository", () => {
    const migrationUrl = getTestUrl("DIRECT_URL");
    const applicationUrl = getTestUrl("DATABASE_URL");

    const migrationPool = new Pool({
        connectionString: migrationUrl,
        max: 2,
    });

    const prisma = new PrismaClient({
        adapter: new PrismaPg({
            connectionString: applicationUrl,
            max: 2,
        }),
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await migrationPool.end();
    });

    it("returns only eligible records in order with a 20-item limit", async () => {
        const prefix = `000-test-${randomUUID()}`;
        const insertedIds: string[] = [];

        try {
            const records = [
                ...Array.from({ length: 22 }, (_, index) => ({
                    name: `${prefix}-${String(index).padStart(2, "0")}`,
                    status: "PUBLISHED",
                    source: "OFFICIAL",
                })),
                {
                    name: `${prefix}-draft`,
                    status: "DRAFT",
                    source: "OFFICIAL",
                },
                {
                    name: `${prefix}-archived`,
                    status: "ARCHIVED",
                    source: "OFFICIAL",
                },
                {
                    name: `${prefix}-fixture`,
                    status: "DRAFT",
                    source: "DEVELOPMENT_FIXTURE",
                },
            ];

            for (const record of records) {
                const id = randomUUID();

                await migrationPool.query(
                    `
          INSERT INTO "StudySpace" (
            "id",
            "slug",
            "name",
            "description",
            "category",
            "city",
            "region",
            "status",
            "sourceType",
            "updatedAt"
          )
          VALUES (
            $1, $2, $3,
            'Temporary repository integration test',
            'LIBRARY',
            'Test City',
            'Test Region',
            $4::"PublicationStatus",
            $5::"SourceType",
            NOW()
          )
          `,
                    [
                        id,
                        record.name,
                        record.name,
                        record.status,
                        record.source,
                    ],
                );

                insertedIds.push(id);
            }

            const results = await queryPublishedSpaces(prisma);

            // The dedicated test DB should contain only our
            // temporary records for this test.
            expect(results).toHaveLength(20);

            const expectedNames = records
                .filter((record) => record.status === "PUBLISHED")
                .map((record) => record.name)
                .sort()
                .slice(0, 20);

            expect(results.map((space) => space.name)).toEqual(
                expectedNames,
            );

            expect(results.every((space) =>
                space.name.startsWith(prefix)
            )).toBe(true);

            expect(results.some((space) =>
                space.name.endsWith("-draft") ||
                space.name.endsWith("-archived") ||
                space.name.endsWith("-fixture")
            )).toBe(false);
        } finally {
            if (insertedIds.length > 0) {
                await migrationPool.query(
                    `
          DELETE FROM "StudySpace"
          WHERE "id" = ANY($1::uuid[])
          `,
                    [insertedIds],
                );
            }
        }
    });
});

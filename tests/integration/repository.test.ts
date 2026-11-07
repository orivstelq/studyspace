
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { queryPublishedSpaceBySlug, queryPublishedSpaces } from "../../src/features/discovery/query";

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

    it("returns an exact published slug with only public detail fields", async () => {
        const id = randomUUID();
        const slug = `test-${id}`;
        await migrationPool.query(
            `INSERT INTO "StudySpace" (
                "id", "slug", "name", "description", "category",
                "city", "region", "status", "sourceType", "updatedAt"
            ) VALUES ($1, $2, 'Detail test', 'Temporary test record',
                'LIBRARY', 'Test City', 'Test Region', 'PUBLISHED', 'OFFICIAL', NOW())`,
            [id, slug],
        );

        try {
            expect(await queryPublishedSpaceBySlug(prisma, slug)).toEqual({
                id,
                slug,
                name: "Detail test",
                description: "Temporary test record",
                category: "LIBRARY",
                city: "Test City",
                region: "Test Region",
                verifiedAt: null,
                amenities: [],
            });

            for (const missingSlug of [
                slug.toUpperCase(),
                `${slug}-missing`,
                `${slug}' OR '1'='1`,
            ]) {
                expect(await queryPublishedSpaceBySlug(prisma, missingSlug)).toBeNull();
            }
        } finally {
            await migrationPool.query('DELETE FROM "StudySpace" WHERE "id" = $1', [id]);
        }
    });

    it.each([
        ["DRAFT", "OFFICIAL"],
        ["ARCHIVED", "OFFICIAL"],
        ["DRAFT", "DEVELOPMENT_FIXTURE"],
    ])("does not reveal %s %s listings by known slug", async (status, source) => {
        const id = randomUUID();
        const slug = `test-${id}`;
        await migrationPool.query(
            `INSERT INTO "StudySpace" (
                "id", "slug", "name", "description", "category",
                "city", "region", "status", "sourceType", "updatedAt"
            ) VALUES ($1, $2, 'Private detail test', 'Temporary test record',
                'LIBRARY', 'Test City', 'Test Region', $3, $4, NOW())`,
            [id, slug, status, source],
        );

        try {
            expect(await queryPublishedSpaceBySlug(prisma, slug)).toBeNull();
        } finally {
            await migrationPool.query('DELETE FROM "StudySpace" WHERE "id" = $1', [id]);
        }
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

            const filters = { query: prefix.toUpperCase(), category: "library", amenity: "all", page: 1 } as const;
            const { spaces: results, hasNext } = await queryPublishedSpaces(prisma, filters);
            expect(hasNext).toBe(true);
            const lastPage = await queryPublishedSpaces(prisma, { ...filters, page: 2 });
            expect(lastPage.spaces.map((space) => space.name)).toEqual([`${prefix}-20`, `${prefix}-21`]);
            expect(lastPage.hasNext).toBe(false);
            expect((await queryPublishedSpaces(prisma, { ...filters, query: `${prefix}%` })).spaces).toEqual([]);
            expect((await queryPublishedSpaces(prisma, { ...filters, category: "cafe" })).spaces).toEqual([]);
            expect((await queryPublishedSpaces(prisma, { ...filters, amenity: "wifi" })).spaces).toEqual([]);

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

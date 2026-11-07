
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

function testDatabaseUrl(key: "DIRECT_URL" | "DATABASE_URL") {
    const value = process.env[key];

    if (!value) {
        throw new Error(`${key} is missing`);
    }

    const url = new URL(value);

    // Safety: integration tests must only use local development
    // credentials and the dedicated test database.
    if (
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.pathname !== "/studyspace_dev"
    ) {
        throw new Error(
            `Unsafe ${key}: expected local studyspace_dev URL`,
        );
    }

    url.pathname = "/studyspace_test";
    url.search = "";
    url.hash = "";
    return url.toString();
}

describe("StudySpace PostgreSQL integration", () => {
    let migrationPool: Pool;
    let applicationPool: Pool;

    beforeAll(async () => {
        migrationPool = new Pool({
            connectionString: testDatabaseUrl("DIRECT_URL"),
            max: 2,
        });

        applicationPool = new Pool({
            connectionString: testDatabaseUrl("DATABASE_URL"),
            max: 2,
        });

        const migration = await migrationPool.query(
            "SELECT current_database() AS database, current_user AS role",
        );

        const application = await applicationPool.query(`
            SELECT current_database() AS database,
                   current_user AS role,
                   pg_has_role(current_user, 'studyspace_app', 'MEMBER') AS app_member
        `);

        expect(migration.rows[0].database).toBe("studyspace_test");
        expect(migration.rows[0].role).not.toBe("studyspace_app");

        expect(application.rows[0].database).toBe("studyspace_test");
        expect(application.rows[0].role).not.toBe(migration.rows[0].role);
        expect(application.rows[0].app_member).toBe(true);
    });

    afterAll(async () => {
        await migrationPool?.end();
        await applicationPool?.end();
    });

    it("enforces read-only permissions for the application role", async () => {
        const result = await applicationPool.query(`
      SELECT
        has_table_privilege(
          current_user, '"StudySpace"', 'SELECT'
        ) AS can_read,
        has_table_privilege(
          current_user, '"StudySpace"', 'INSERT'
        ) AS can_insert,
        has_table_privilege(
          current_user, '"StudySpace"', 'UPDATE'
        ) AS can_update,
        has_table_privilege(
          current_user, '"StudySpace"', 'DELETE'
        ) AS can_delete
    `);

        expect(result.rows[0]).toEqual({
            can_read: true,
            can_insert: false,
            can_update: false,
            can_delete: false,
        });
    });

    it("keeps tables created by the migration owner private by default", async () => {
        const tableName = `DefaultPrivilegeProbe_${randomUUID().replaceAll("-", "")}`;
        const identifier = `"${tableName}"`;
        await migrationPool.query(`CREATE TABLE ${identifier} ("id" INTEGER)`);

        try {
            const privileges = await migrationPool.query(
                `SELECT
                    has_table_privilege('studyspace_app', $1, 'SELECT') AS app_can_read,
                    has_table_privilege('studyspace_saved', $1, 'SELECT') AS saved_can_read`,
                [`public.${identifier}`],
            );
            expect(privileges.rows[0]).toEqual({ app_can_read: false, saved_can_read: false });
            await expect(applicationPool.query(`SELECT * FROM ${identifier}`)).rejects.toMatchObject({ code: "42501" });
        } finally {
            await migrationPool.query(`DROP TABLE ${identifier}`);
        }
    });

    it("rejects invalid coordinates and published fixtures", async () => {
        const client = await migrationPool.connect();

        try {
            await client.query("BEGIN");

            const invalidRecords = [
                {
                    latitude: 91,
                    longitude: 10,
                    status: "DRAFT",
                    source: "OFFICIAL",
                },
                {
                    latitude: 40,
                    longitude: 181,
                    status: "DRAFT",
                    source: "OFFICIAL",
                },
                {
                    latitude: 40,
                    longitude: null,
                    status: "DRAFT",
                    source: "OFFICIAL",
                },
                {
                    latitude: null,
                    longitude: null,
                    status: "PUBLISHED",
                    source: "DEVELOPMENT_FIXTURE",
                },
            ];

            for (const record of invalidRecords) {
                await client.query("SAVEPOINT validation_case");

                let errorCode: string | undefined;

                try {
                    await client.query(
                        `
            INSERT INTO "StudySpace" (
              "id", "slug", "name", "description",
              "category", "city", "region",
              "latitude", "longitude",
              "status", "sourceType", "updatedAt"
            )
            VALUES (
              $1, $2, 'Integration Test',
              'Temporary test record',
              'LIBRARY', 'Test City', 'Test Region',
              $3, $4, $5::"PublicationStatus",
              $6::"SourceType", NOW()
            )
            `,
                        [
                            randomUUID(),
                            `test-${randomUUID()}`,
                            record.latitude,
                            record.longitude,
                            record.status,
                            record.source,
                        ],
                    );
                } catch (error) {
                    errorCode = (error as { code?: string }).code;
                } finally {
                    await client.query(
                        "ROLLBACK TO SAVEPOINT validation_case",
                    );
                    await client.query(
                        "RELEASE SAVEPOINT validation_case",
                    );
                }

                // PostgreSQL error 23514 = CHECK constraint violation.
                expect(errorCode).toBe("23514");
            }
        } finally {
            await client.query("ROLLBACK");
            client.release();
        }
    });

    it("allows valid draft records without persisting them", async () => {
        const client = await migrationPool.connect();

        try {
            await client.query("BEGIN");

            const id = randomUUID();

            await client.query(
                `
        INSERT INTO "StudySpace" (
          "id", "slug", "name", "description",
          "category", "city", "region",
          "status", "sourceType", "updatedAt"
        )
        VALUES (
          $1, $2, 'Temporary Draft',
          'Integration test record',
          'LIBRARY', 'Test City', 'Test Region',
          'DRAFT', 'DEVELOPMENT_FIXTURE', NOW()
        )
        `,
                [id, `test-${id}`],
            );

            const result = await client.query(
                `SELECT "status" FROM "StudySpace" WHERE "id" = $1`,
                [id],
            );

            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].status).toBe("DRAFT");
        } finally {
            await client.query("ROLLBACK");
            client.release();
        }
    });
});

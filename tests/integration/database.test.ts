
import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { getTestDatabaseName, getTestDatabaseUrl } from "../helpers/test-database";

describe("StudySpace PostgreSQL integration", () => {
    const testDatabaseName = getTestDatabaseName();
    let migrationPool: Pool;
    let applicationPool: Pool;

    beforeAll(async () => {
        migrationPool = new Pool({
            connectionString: getTestDatabaseUrl("DIRECT_URL"),
            max: 2,
        });

        applicationPool = new Pool({
            connectionString: getTestDatabaseUrl("DATABASE_URL"),
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

        expect(migration.rows[0].database).toBe(testDatabaseName);
        expect(migration.rows[0].role).not.toBe("studyspace_app");

        expect(application.rows[0].database).toBe(testDatabaseName);
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

    it("matches the complete committed migration history", async () => {
        const expected = readdirSync("prisma/migrations", { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => ({
                name: entry.name,
                checksum: createHash("sha256")
                    .update(readFileSync(`prisma/migrations/${entry.name}/migration.sql`))
                    .digest("hex"),
            }))
            .sort((left, right) => left.name.localeCompare(right.name));
        const applied = await migrationPool.query<{
            migration_name: string;
            checksum: string;
            finished: boolean;
            rolled_back: boolean;
        }>(`
            SELECT migration_name, checksum,
                   finished_at IS NOT NULL AS finished,
                   rolled_back_at IS NOT NULL AS rolled_back
            FROM public._prisma_migrations
            ORDER BY migration_name
        `);

        expect(applied.rows).toEqual(expected.map((migration) => ({
            migration_name: migration.name,
            checksum: migration.checksum,
            finished: true,
            rolled_back: false,
        })));
    });

    it("limits public Review reads to the approved projection", async () => {
        const privileges = await applicationPool.query(`
            SELECT
                has_table_privilege(current_user, 'public."Review"', 'SELECT') AS table_select,
                has_any_column_privilege(current_user, 'public."Review"', 'SELECT') AS any_column_select,
                has_column_privilege(current_user, 'public."Review"', 'ownerAccountId', 'SELECT') AS owner_select,
                has_column_privilege(current_user, 'public."Review"', 'createdAt', 'SELECT') AS created_select,
                has_column_privilege(current_user, 'public."Review"', 'updatedAt', 'SELECT') AS updated_select
        `);

        expect(privileges.rows[0]).toEqual({
            table_select: false,
            any_column_select: true,
            owner_select: false,
            created_select: false,
            updated_select: false,
        });

        await expect(applicationPool.query(`
            SELECT "id", "studySpaceId", "rating", "body", "status", "publishedAt"
            FROM public."Review"
            LIMIT 0
        `)).resolves.toBeDefined();

        for (const query of [
            'SELECT "ownerAccountId" FROM public."Review" LIMIT 0',
            'SELECT "createdAt", "updatedAt" FROM public."Review" LIMIT 0',
            'SELECT * FROM public."Review" LIMIT 0',
        ]) {
            await expect(applicationPool.query(query)).rejects.toMatchObject({ code: "42501" });
        }

        const privatePrivileges = await migrationPool.query(`
            SELECT
                has_table_privilege('studyspace_saved', 'public."Review"', 'SELECT') AS can_select,
                has_table_privilege('studyspace_saved', 'public."Review"', 'INSERT') AS can_insert,
                has_table_privilege('studyspace_saved', 'public."Review"', 'UPDATE') AS can_update
        `);
        expect(privatePrivileges.rows[0]).toEqual({ can_select: true, can_insert: true, can_update: true });
    });

    it("exposes only the verified account-context functions to the private role", async () => {
        const privileges = await migrationPool.query(`
            SELECT
                has_function_privilege('studyspace_saved', 'public.set_active_account_context(uuid,text)', 'EXECUTE') AS active_context,
                has_function_privilege('studyspace_saved', 'public.set_moderator_account_context(uuid,text)', 'EXECUTE') AS moderator_context,
                has_function_privilege('studyspace_saved', 'public.set_active_account_context(uuid,boolean)', 'EXECUTE') AS legacy_context,
                has_table_privilege('studyspace_saved', 'public."ModeratorGrant"', 'SELECT') AS read_grants,
                has_table_privilege('studyspace_saved', 'public."ModeratorGrant"', 'INSERT') AS create_grants
        `);

        expect(privileges.rows[0]).toEqual({
            active_context: true,
            moderator_context: true,
            legacy_context: false,
            read_grants: false,
            create_grants: false,
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

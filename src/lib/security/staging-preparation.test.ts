import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOCAL_PLAYWRIGHT_BASE_URL, resolvePlaywrightBaseUrl } from "../../../playwright-origin";

describe("staging preparation", () => {
    it("uses localhost by default and accepts only an explicit HTTPS origin", () => {
        expect(resolvePlaywrightBaseUrl(undefined)).toBe(LOCAL_PLAYWRIGHT_BASE_URL);
        expect(resolvePlaywrightBaseUrl("https://staging.example.test/")).toBe("https://staging.example.test");
        for (const value of [
            "http://staging.example.test",
            "https://user:secret@staging.example.test",
            "https://staging.example.test/path",
            "https://staging.example.test?debug=1",
        ]) {
            expect(() => resolvePlaywrightBaseUrl(value)).toThrow("origin-only HTTPS URL");
        }
    });

    it("keeps new staging identities inert until the Neon-compatible wrapper commits", () => {
        const create = readFileSync("scripts/staging/create-login-identities.sql", "utf8");
        const provision = readFileSync("scripts/staging/provision-login-identities.sh", "utf8");
        expect(create).not.toContain("\\password");
        expect(create).not.toMatch(/ALTER ROLE studyspace_staging_\w+_login LOGIN/);
        expect(create).not.toMatch(/CREATE ROLE studyspace_staging_\w+_login LOGIN/);
        expect(create.match(/NOLOGIN PASSWORD NULL/g)).toHaveLength(3);
        expect(create).toContain("NOINHERIT NOREPLICATION NOBYPASSRLS");
        expect(provision).toContain("read -r -s");
        expect(provision).toContain("set +x");
        expect(provision).toContain('[[ "$PGSSLMODE" != "verify-full" ]]');
        expect(create).not.toContain("pg_catalog.pg_stat_ssl");
        expect(provision).not.toContain("STAGING_DIRECT_URL");
        expect(provision).toContain("2>/dev/null");
        expect(provision.indexOf("PASSWORD '%s'")).toBeLessThan(provision.indexOf("LOGIN;'"));
        expect(provision).toContain("'COMMIT;'");
    });

    it("keeps the live Favorite RLS probe deliberate, exact, and rollback-only", () => {
        const script = readFileSync("scripts/staging/verify-favorite-rls-live.sql", "utf8");
        const wrapper = readFileSync("scripts/staging/verify-favorite-rls-live.sh", "utf8");
        const fixture = readFileSync("scripts/staging/create-favorite-rls-fixture.sql", "utf8");
        const cleanup = readFileSync("scripts/staging/cleanup-favorite-rls-fixture.sql", "utf8");
        expect(script).toContain("session_user <> 'studyspace_staging_saved_login'");
        expect(script).not.toContain("pg_catalog.pg_stat_ssl");
        expect(wrapper.match(/export PGSSLMODE=verify-full/g)).toHaveLength(2);
        expect(wrapper.match(/export PGSSLROOTCERT=system/g)).toHaveLength(2);
        expect(wrapper.match(/export PGSSLCERTMODE=disable/g)).toHaveLength(2);
        expect(wrapper.match(/export PGGSSENCMODE=disable/g)).toHaveLength(2);
        const clearedOverrides = wrapper.slice(
            wrapper.indexOf("clear_libpq_overrides()"),
            wrapper.indexOf("use_owner_connection()"),
        );
        for (const override of [
            "PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE", "PGOPTIONS",
            "PGSSLCERT", "PGSSLCERTMODE", "PGSSLKEY", "PGSSLPASSWORD",
            "PGSSLROOTCERT", "PGSSLCRL", "PGSSLCRLDIR", "PGSSLNEGOTIATION",
            "PGSSLMODE", "PGSSLMINPROTOCOLVERSION", "PGSSLMAXPROTOCOLVERSION",
            "PGCHANNELBINDING", "PGGSSENCMODE",
        ]) {
            expect(clearedOverrides).toContain(override);
        }
        expect(wrapper).toContain("*.neon.tech");
        expect(wrapper).toContain("trap on_exit EXIT");
        expect(wrapper).toContain("cleanup-favorite-rls-fixture.sql");
        expect(wrapper.indexOf("create-favorite-rls-fixture.sql")).toBeLessThan(
            wrapper.indexOf("verify-favorite-rls-live.sql"),
        );
        expect(fixture).toContain("'DRAFT'");
        expect(fixture).toContain("'DEVELOPMENT_FIXTURE'");
        expect(cleanup).toContain("refusing to delete a row that is not the exact disposable fixture");
        expect(cleanup).toContain('public."Favorite" WHERE "studySpaceId" = fixture_id');
        for (const privilege of ["SELECT", "INSERT", "DELETE"]) {
            expect(script).toContain(`has_table_privilege(session_user, 'public."Favorite"', '${privilege}')`);
        }
        expect(script).toContain("staging-rls-a-");
        expect(script).toContain("staging-rls-b-");
        expect(script).toContain('INSERT INTO public."Favorite"');
        expect(script).toContain('"ownerKey" = owner_a AND "studySpaceId" = space_id');
        expect(script).toContain('"ownerKey" = owner_b AND "studySpaceId" = space_id');
        expect(script).not.toContain("TRUNCATE");
        expect(script).not.toContain("COMMIT;");
        expect(script.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    });

    it("threads the same disposable fixture through creation, verification, and cleanup", () => {
        const create = readFileSync("scripts/staging/create-favorite-rls-fixture.sql", "utf8");
        const verify = readFileSync("scripts/staging/verify-favorite-rls-live.sql", "utf8");
        const cleanup = readFileSync("scripts/staging/cleanup-favorite-rls-fixture.sql", "utf8");
        const wrapper = readFileSync("scripts/staging/verify-favorite-rls-live.sh", "utf8");

        expect(wrapper.match(/--set=fixture_id="\$fixture_id"/g)).toHaveLength(3);
        expect(create).toContain(":'fixture_id'::uuid");
        expect(create).toContain("'staging-rls-probe-' || :'fixture_id'::uuid::text");
        expect(verify).toContain("SET LOCAL studyspace.rls_fixture_id = :'fixture_id'");
        expect(verify).toContain("space_id := current_setting('studyspace.rls_fixture_id')::uuid");
        expect(verify).toContain("id = space_id");
        expect(verify).toContain("slug = 'staging-rls-probe-' || space_id::text");
        expect(verify).toContain("status = 'DRAFT'");
        expect(verify).toContain('"sourceType" = \'DEVELOPMENT_FIXTURE\'');
        expect(verify).not.toContain("WHERE status = 'PUBLISHED'");
        expect(verify).not.toContain("ORDER BY id");
        expect(verify).not.toContain("LIMIT 1");
        expect(verify.indexOf("the exact disposable RLS fixture is missing or unsafe")).toBeLessThan(
            verify.indexOf('INSERT INTO public."Favorite"'),
        );
        expect(cleanup).toContain("SET LOCAL studyspace.rls_fixture_id = :'fixture_id'");
        expect(cleanup).toContain("session_user <> 'neondb_owner'");
        expect(cleanup).toContain("slug = 'staging-rls-probe-' || fixture_id::text");
        expect(cleanup).toContain('OR EXISTS (SELECT 1 FROM public."Favorite" WHERE "studySpaceId" = fixture_id)');
        expect(wrapper.indexOf("trap on_exit EXIT")).toBeLessThan(wrapper.indexOf("fixture_may_exist=1"));
        expect(wrapper.indexOf("fixture_may_exist=1")).toBeLessThan(
            wrapper.indexOf("create-favorite-rls-fixture.sql"),
        );
        expect(wrapper.indexOf("create-favorite-rls-fixture.sql")).toBeLessThan(
            wrapper.indexOf("fixture_committed=1"),
        );
        expect(wrapper).toContain("status=1");
    });

    it("schedules one fail-closed maintenance cleanup batch", () => {
        const workflow = readFileSync(".github/workflows/rate-limit-cleanup.yml", "utf8");
        const verify = readFileSync("scripts/staging/verify-maintenance-connection.sql", "utf8");
        const cleanup = readFileSync("scripts/cleanup-rate-limit-buckets.sql", "utf8");

        expect(workflow).toContain('cron: "17 * * * *"');
        expect(workflow).toContain("workflow_dispatch:");
        expect(workflow).toContain("group: staging-rate-limit-cleanup");
        expect(workflow).toContain("cancel-in-progress: false");
        expect(workflow).toContain("permissions:\n  contents: read");
        expect(workflow).toContain("environment: staging");
        expect(workflow).toContain("secrets.MAINTENANCE_DATABASE_URL");
        expect(workflow).not.toContain("secrets.DIRECT_URL");
        expect(workflow).not.toContain("secrets.DATABASE_URL");
        expect(workflow).not.toContain("secrets.FAVORITES_DATABASE_URL");
        expect(workflow).toContain("PGSSLMODE: verify-full");
        expect(workflow).toContain("PGSSLROOTCERT: /etc/ssl/certs/ca-certificates.crt");
        expect(workflow).toContain("PGGSSENCMODE: disable");
        expect(workflow).toContain("(gssencmode|service|servicefile|sslmode|sslrootcert)");
        expect(workflow).toContain("persist-credentials: false");
        expect(workflow).toContain("--set=ON_ERROR_STOP=1 --quiet --tuples-only --no-align");
        expect(workflow).toContain('[[ ! "$deleted_count" =~ ^[0-9]+$ ]]');
        expect(workflow.indexOf("verify-maintenance-connection.sql")).toBeLessThan(
            workflow.indexOf("cleanup-rate-limit-buckets.sql"),
        );
        expect(workflow.match(/psql -X/g)).toHaveLength(1);
        expect(workflow.match(/cleanup-rate-limit-buckets\.sql/g)).toHaveLength(1);
        expect(workflow).toContain("repeated full batches indicate a cleanup backlog");
        expect(verify).toContain("session_user <> 'studyspace_staging_maintenance_login'");
        expect(verify).toContain("granted.rolname <> 'studyspace_maintenance'");
        expect(verify).toContain("\\set ON_ERROR_STOP on");
        expect(cleanup).toContain("\\set ON_ERROR_STOP on");
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
            expect(verify).toContain(`has_table_privilege(session_user, 'public."RateLimitBucket"', '${privilege}')`);
        }
        expect(verify).not.toMatch(/^\s*(DELETE|INSERT|UPDATE|TRUNCATE)\s/m);
        expect(cleanup.match(/^SELECT /gm)).toHaveLength(1);
        expect(cleanup).toContain("cleanup_expired_rate_limit_buckets(1000)");
    });

    it("keeps public Review access column-scoped", () => {
        const grants = readFileSync("scripts/grant-runtime-roles.sql", "utf8");
        const verify = readFileSync("scripts/staging/verify-database-security.sql", "utf8");

        expect(grants).not.toContain('GRANT SELECT ON TABLE "Review" TO studyspace_app');
        expect(grants).toContain('GRANT SELECT ("id", "studySpaceId", "rating", "body", "status", "publishedAt") ON TABLE "Review" TO studyspace_app');
        expect(verify).toContain("public application role has table-wide Review read privileges");
        expect(verify).toContain("attribute.attname NOT IN ('id', 'studySpaceId', 'rating', 'body', 'status', 'publishedAt')");
        for (const column of ["ownerKey", "createdAt", "updatedAt"]) {
            expect(grants).toContain(`"${column}"`);
        }
    });
});

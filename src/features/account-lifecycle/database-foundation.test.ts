import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "prisma/migrations/20261110010000_add_account_lifecycle_foundation/migration.sql";

describe("account lifecycle database foundation", () => {
    it("backfills deterministic ownership while preserving legacy columns for the expand rollout", () => {
        const sql = readFileSync(migrationPath, "utf8");
        const backfill = sql.indexOf("CREATE TEMP TABLE account_lifecycle_backfill");
        expect(backfill).toBeGreaterThan(-1);
        for (const table of ["Favorite", "UserProfile", "Review", "UserReport", "ModerationAction"]) {
            expect(sql.indexOf(`UPDATE \"${table}\"`, backfill)).toBeGreaterThan(backfill);
        }
        expect(sql).not.toContain('DROP COLUMN "ownerKey"');
        expect(sql).not.toContain('DROP COLUMN "reporterKey"');
        expect(sql).not.toContain('DROP COLUMN "moderatorKey"');
        expect(sql).toContain('CREATE TRIGGER "Favorite_account_compatibility"');
        expect(sql).toContain('CREATE TRIGGER "Review_account_compatibility"');
        expect(sql).toContain('CREATE UNIQUE INDEX "AccountIdentity_active_identity_key"');
        expect(sql).toContain('CREATE UNIQUE INDEX "Review_active_owner_space_key"');
    });

    it("keeps lifecycle tables private and exposes only verified account context functions", () => {
        const sql = readFileSync(migrationPath, "utf8");
        const authorization = readFileSync("prisma/migrations/20261110170000_harden_account_context_authorization/migration.sql", "utf8");
        const grants = readFileSync("scripts/grant-runtime-roles.sql", "utf8");
        for (const table of ["Account", "AccountIdentity", "AccountClosure", "RetentionHold"]) {
            expect(sql).toContain(`ALTER TABLE \"${table}\" ENABLE ROW LEVEL SECURITY`);
            expect(grants).toContain(`\"${table}\"`);
        }
        expect(authorization).toContain('ALTER TABLE "ModeratorGrant" ENABLE ROW LEVEL SECURITY');
        expect(grants).toContain('"ModeratorGrant"');
        expect(sql).toContain('REVOKE ALL ON FUNCTION "resolve_account_identity"(TEXT)');
        expect(sql).toContain('GRANT EXECUTE ON FUNCTION "resolve_account_identity"(TEXT) TO studyspace_saved');
        expect(sql).toContain('GRANT EXECUTE ON FUNCTION "lookup_active_account_identity"(TEXT) TO studyspace_saved');
        expect(authorization).toContain('REVOKE ALL ON FUNCTION public.set_active_account_context(UUID, BOOLEAN)');
        expect(authorization).toContain('GRANT EXECUTE ON FUNCTION public.set_active_account_context(UUID, TEXT) TO studyspace_saved');
        expect(authorization).toContain('GRANT EXECUTE ON FUNCTION public.set_moderator_account_context(UUID, TEXT) TO studyspace_saved');
        expect(authorization).toContain('identity."identityKey" = requested_identity_key');
        expect(authorization).toContain('FROM public."ModeratorGrant" grant_record');
        expect(grants).not.toContain('GRANT EXECUTE ON FUNCTION public.set_active_account_context(UUID, BOOLEAN)');
        expect(grants).not.toMatch(/GRANT .* ON TABLE "Account"/);
        expect(grants).not.toMatch(/GRANT .* ON TABLE "ModeratorGrant"/);
    });

    it("preserves the explicit legacy rollout bridge without treating it as verified identity", () => {
        const authorization = readFileSync("prisma/migrations/20261110170000_harden_account_context_authorization/migration.sql", "utf8");
        expect(authorization).toContain("current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'");
        expect(authorization).toContain('"ownerKey" = current_setting(\'studyspace.favorite_owner\', TRUE)');
        expect(authorization).toContain("current_setting('studyspace.is_moderator', TRUE) = 'true'");
        expect(authorization).toContain("The contract migration must remove the legacy branch");
    });

    it("permits closure unlinking without allowing reassignment or public private-column reads", () => {
        const sql = readFileSync(migrationPath, "utf8");
        const hardening = readFileSync("prisma/migrations/20261110013000_harden_lifecycle_actor_fields/migration.sql", "utf8");
        const invalidation = readFileSync("prisma/migrations/20261110014500_invalidate_review_retention_assessment/migration.sql", "utf8");
        const grants = readFileSync("scripts/grant-runtime-roles.sql", "utf8");
        expect(sql).toContain('OLD."ownerAccountId" IS NOT NULL');
        expect(sql).toContain('NEW."ownerAccountId" IS NULL');
        expect(sql).toContain("current_setting('studyspace.lifecycle_operation', true) = 'true'");
        expect(sql).toContain("current_user = table_owner");
        expect(hardening).toContain("Review retention assessment requires lifecycle authority");
        expect(hardening).toContain("Report reporter is immutable except for account closure unlinking");
        expect(hardening).toContain('CREATE TRIGGER "UserReport_identity_immutable"');
        expect(invalidation).toContain('IF NEW."body" IS DISTINCT FROM OLD."body"');
        expect(invalidation).toContain('NEW."retentionDecision" := NULL');
        expect(invalidation).toContain('An unlinked or inactive account review cannot be approved');
        expect(grants).toContain('GRANT SELECT ("id", "studySpaceId", "rating", "body", "status", "publishedAt") ON TABLE "Review" TO studyspace_app');
        expect(grants).not.toContain('GRANT SELECT ON TABLE "Review" TO studyspace_app');
    });
});

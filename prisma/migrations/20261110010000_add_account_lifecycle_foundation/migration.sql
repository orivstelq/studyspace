BEGIN;

-- Expand only: legacy actor columns remain until a separately approved contract migration.

CREATE TYPE "AccountState" AS ENUM ('ACTIVE', 'CLOSING', 'CLOSED');
CREATE TYPE "AccountClosureStatus" AS ENUM ('AWAITING_REVIEW', 'READY', 'PROVIDER_PENDING', 'COMPLETE');
CREATE TYPE "ReviewRetentionDecision" AS ENUM ('RETAIN', 'REDACTION_REQUIRED');

CREATE TABLE "Account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "state" "AccountState" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closingAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Account_state_timestamps_check" CHECK (
        ("state" = 'ACTIVE' AND "closingAt" IS NULL AND "closedAt" IS NULL)
        OR ("state" = 'CLOSING' AND "closingAt" IS NOT NULL AND "closedAt" IS NULL)
        OR ("state" = 'CLOSED' AND "closingAt" IS NOT NULL AND "closedAt" IS NOT NULL)
    )
);

CREATE INDEX "Account_state_idx" ON "Account"("state");

CREATE TABLE "AccountIdentity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "identityKey" VARCHAR(64) NOT NULL,
    "generation" INTEGER NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),
    CONSTRAINT "AccountIdentity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountIdentity_generation_check" CHECK ("generation" > 0),
    CONSTRAINT "AccountIdentity_accountId_fkey" FOREIGN KEY ("accountId")
        REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AccountIdentity_identityKey_generation_key"
    ON "AccountIdentity"("identityKey", "generation");
CREATE UNIQUE INDEX "AccountIdentity_active_identity_key"
    ON "AccountIdentity"("identityKey") WHERE "unlinkedAt" IS NULL;
CREATE INDEX "AccountIdentity_accountId_idx" ON "AccountIdentity"("accountId");
CREATE INDEX "AccountIdentity_identityKey_unlinkedAt_idx" ON "AccountIdentity"("identityKey", "unlinkedAt");

CREATE TABLE "AccountClosure" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "status" "AccountClosureStatus" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "localCompletedAt" TIMESTAMP(3),
    "providerCompletedAt" TIMESTAMP(3),
    "deletedProfileCount" INTEGER NOT NULL DEFAULT 0,
    "deletedFavoriteCount" INTEGER NOT NULL DEFAULT 0,
    "revokedSessionCount" INTEGER NOT NULL DEFAULT 0,
    "deletedReviewCount" INTEGER NOT NULL DEFAULT 0,
    "retainedReviewCount" INTEGER NOT NULL DEFAULT 0,
    "unlinkedReportCount" INTEGER NOT NULL DEFAULT 0,
    "unlinkedModerationCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AccountClosure_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountClosure_accountId_key" UNIQUE ("accountId"),
    CONSTRAINT "AccountClosure_accountId_fkey" FOREIGN KEY ("accountId")
        REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountClosure_counts_check" CHECK (
        "deletedProfileCount" >= 0 AND "deletedFavoriteCount" >= 0
        AND "revokedSessionCount" >= 0 AND "deletedReviewCount" >= 0
        AND "retainedReviewCount" >= 0 AND "unlinkedReportCount" >= 0
        AND "unlinkedModerationCount" >= 0
    ),
    CONSTRAINT "AccountClosure_completion_check" CHECK (
        ("status" IN ('AWAITING_REVIEW', 'READY') AND "localCompletedAt" IS NULL AND "providerCompletedAt" IS NULL)
        OR ("status" = 'PROVIDER_PENDING' AND "localCompletedAt" IS NOT NULL AND "providerCompletedAt" IS NULL)
        OR ("status" = 'COMPLETE' AND "localCompletedAt" IS NOT NULL AND "providerCompletedAt" IS NOT NULL)
    )
);

-- Existing deterministic owner keys become generation-one identity links to random accounts.
-- AuthSession cannot be backfilled safely because the issuer is not stored in PostgreSQL;
-- existing rows are linked lazily and fail closed once their account starts closing.
CREATE TEMP TABLE account_lifecycle_backfill (
    "identityKey" VARCHAR(64) PRIMARY KEY,
    "accountId" UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO account_lifecycle_backfill ("identityKey", "accountId")
SELECT legacy_key, gen_random_uuid()
FROM (
    SELECT "ownerKey" AS legacy_key FROM "Favorite"
    UNION SELECT "ownerKey" FROM "UserProfile"
    UNION SELECT "ownerKey" FROM "Review"
    UNION SELECT "reporterKey" FROM "UserReport"
    UNION SELECT "moderatorKey" FROM "ModerationAction"
) legacy_keys;

INSERT INTO "Account" ("id")
SELECT "accountId" FROM account_lifecycle_backfill;

INSERT INTO "AccountIdentity" ("accountId", "identityKey", "generation")
SELECT "accountId", "identityKey", 1 FROM account_lifecycle_backfill;

DROP POLICY "Favorite_owner_access" ON "Favorite";
DROP POLICY "UserProfile_owner_access" ON "UserProfile";
DROP POLICY "Review_owner_read" ON "Review";
DROP POLICY "Review_owner_insert" ON "Review";
DROP POLICY "Review_owner_update" ON "Review";
DROP POLICY "UserReport_submit" ON "UserReport";
DROP POLICY "ModerationAction_moderator_insert" ON "ModerationAction";

ALTER TABLE "AuthSession" ADD COLUMN "accountId" UUID;
CREATE INDEX "AuthSession_accountId_idx" ON "AuthSession"("accountId");
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Favorite" ADD COLUMN "accountId" UUID;
UPDATE "Favorite" favorite
SET "accountId" = mapping."accountId"
FROM account_lifecycle_backfill mapping
WHERE mapping."identityKey" = favorite."ownerKey";
ALTER TABLE "Favorite" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Favorite_accountId_studySpaceId_key" ON "Favorite"("accountId", "studySpaceId");
CREATE INDEX "Favorite_accountId_createdAt_studySpaceId_idx"
    ON "Favorite"("accountId", "createdAt", "studySpaceId");

ALTER TABLE "UserProfile" ADD COLUMN "accountId" UUID;
UPDATE "UserProfile" profile
SET "accountId" = mapping."accountId"
FROM account_lifecycle_backfill mapping
WHERE mapping."identityKey" = profile."ownerKey";
ALTER TABLE "UserProfile" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "UserProfile_accountId_key" ON "UserProfile"("accountId");

DROP TRIGGER "Review_identity_immutable" ON "Review";
DROP FUNCTION "prevent_review_reassignment"();
ALTER TABLE "Review" ADD COLUMN "ownerAccountId" UUID;
ALTER TABLE "Review" ADD COLUMN "ownerUnlinkedAt" TIMESTAMP(3);
ALTER TABLE "Review" ADD COLUMN "retentionDecision" "ReviewRetentionDecision";
ALTER TABLE "Review" ADD COLUMN "retentionReviewedAt" TIMESTAMP(3);
ALTER TABLE "Review" ADD COLUMN "retentionReviewerAccountId" UUID;
ALTER TABLE "Review" ADD COLUMN "retentionReviewerUnlinkedAt" TIMESTAMP(3);
UPDATE "Review" review
SET "ownerAccountId" = mapping."accountId"
FROM account_lifecycle_backfill mapping
WHERE mapping."identityKey" = review."ownerKey";
ALTER TABLE "Review" ALTER COLUMN "ownerKey" DROP NOT NULL;
ALTER TABLE "Review" ADD CONSTRAINT "Review_ownerAccountId_fkey"
    FOREIGN KEY ("ownerAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_retentionReviewerAccountId_fkey"
    FOREIGN KEY ("retentionReviewerAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_unlink_check" CHECK (
    ("ownerAccountId" IS NOT NULL AND "ownerUnlinkedAt" IS NULL)
    OR ("ownerAccountId" IS NULL AND "ownerUnlinkedAt" IS NOT NULL)
);
ALTER TABLE "Review" ADD CONSTRAINT "Review_retention_review_check" CHECK (
    ("retentionDecision" IS NULL AND "retentionReviewedAt" IS NULL
        AND "retentionReviewerAccountId" IS NULL AND "retentionReviewerUnlinkedAt" IS NULL)
    OR ("retentionDecision" IS NOT NULL AND "retentionReviewedAt" IS NOT NULL
        AND (("retentionReviewerAccountId" IS NOT NULL AND "retentionReviewerUnlinkedAt" IS NULL)
            OR ("retentionReviewerAccountId" IS NULL AND "retentionReviewerUnlinkedAt" IS NOT NULL)))
);
CREATE UNIQUE INDEX "Review_active_owner_space_key"
    ON "Review"("ownerAccountId", "studySpaceId") WHERE "ownerAccountId" IS NOT NULL;
CREATE INDEX "Review_ownerAccountId_studySpaceId_idx" ON "Review"("ownerAccountId", "studySpaceId");

ALTER TABLE "UserReport" ADD COLUMN "reporterAccountId" UUID;
ALTER TABLE "UserReport" ADD COLUMN "reporterUnlinkedAt" TIMESTAMP(3);
ALTER TABLE "UserReport" ADD COLUMN "targetReferenceId" UUID;
UPDATE "UserReport" report
SET "reporterAccountId" = mapping."accountId",
    "targetReferenceId" = COALESCE(report."listingId", report."reviewId")
FROM account_lifecycle_backfill mapping
WHERE mapping."identityKey" = report."reporterKey";
ALTER TABLE "UserReport" ALTER COLUMN "targetReferenceId" SET NOT NULL;
ALTER TABLE "UserReport" ALTER COLUMN "reporterKey" DROP NOT NULL;
ALTER TABLE "UserReport" DROP CONSTRAINT "UserReport_target_check";
ALTER TABLE "UserReport" DROP CONSTRAINT "UserReport_reviewId_fkey";
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_reporterAccountId_fkey"
    FOREIGN KEY ("reporterAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_reporter_unlink_check" CHECK (
    ("reporterAccountId" IS NOT NULL AND "reporterUnlinkedAt" IS NULL)
    OR ("reporterAccountId" IS NULL AND "reporterUnlinkedAt" IS NOT NULL)
);
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_target_check" CHECK (
    ("targetType" = 'LISTING' AND "listingId" IS NOT NULL AND "reviewId" IS NULL
        AND "targetReferenceId" = "listingId")
    OR ("targetType" = 'REVIEW' AND "listingId" IS NULL AND "targetReferenceId" IS NOT NULL)
);
CREATE UNIQUE INDEX "UserReport_open_listing_account_key"
    ON "UserReport"("reporterAccountId", "listingId")
    WHERE "status" = 'OPEN' AND "listingId" IS NOT NULL AND "reporterAccountId" IS NOT NULL;
CREATE UNIQUE INDEX "UserReport_open_review_account_key"
    ON "UserReport"("reporterAccountId", "reviewId")
    WHERE "status" = 'OPEN' AND "reviewId" IS NOT NULL AND "reporterAccountId" IS NOT NULL;

ALTER TABLE "ModerationAction" ADD COLUMN "moderatorAccountId" UUID;
ALTER TABLE "ModerationAction" ADD COLUMN "moderatorUnlinkedAt" TIMESTAMP(3);
ALTER TABLE "ModerationAction" ADD COLUMN "targetReferenceId" UUID;
UPDATE "ModerationAction" action
SET "moderatorAccountId" = mapping."accountId",
    "targetReferenceId" = COALESCE(action."reviewId", action."reportId")
FROM account_lifecycle_backfill mapping
WHERE mapping."identityKey" = action."moderatorKey";
ALTER TABLE "ModerationAction" ALTER COLUMN "targetReferenceId" SET NOT NULL;
ALTER TABLE "ModerationAction" ALTER COLUMN "moderatorKey" DROP NOT NULL;
ALTER TABLE "ModerationAction" DROP CONSTRAINT "ModerationAction_target_check";
ALTER TABLE "ModerationAction" DROP CONSTRAINT "ModerationAction_reviewId_fkey";
ALTER TABLE "ModerationAction" DROP CONSTRAINT "ModerationAction_reportId_fkey";
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_moderatorAccountId_fkey"
    FOREIGN KEY ("moderatorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "UserReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_moderator_unlink_check" CHECK (
    ("moderatorAccountId" IS NOT NULL AND "moderatorUnlinkedAt" IS NULL)
    OR ("moderatorAccountId" IS NULL AND "moderatorUnlinkedAt" IS NOT NULL)
);
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_target_check" CHECK (
    ("action" IN ('REVIEW_APPROVED', 'REVIEW_REJECTED', 'REVIEW_HIDDEN')
        AND "reportId" IS NULL AND "targetReferenceId" IS NOT NULL)
    OR ("action" = 'REPORT_RESOLVED' AND "reviewId" IS NULL AND "targetReferenceId" IS NOT NULL)
);

CREATE TABLE "RetentionHold" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reviewId" UUID,
    "moderationActionId" UUID,
    "caseReference" VARCHAR(120) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "approvedBy" VARCHAR(120) NOT NULL,
    "reviewAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RetentionHold_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RetentionHold_target_check" CHECK (
        ("reviewId" IS NOT NULL AND "moderationActionId" IS NULL)
        OR ("reviewId" IS NULL AND "moderationActionId" IS NOT NULL)
    ),
    CONSTRAINT "RetentionHold_text_check" CHECK (
        char_length(btrim("caseReference")) > 0
        AND char_length(btrim("reason")) > 0
        AND char_length(btrim("approvedBy")) > 0
    ),
    CONSTRAINT "RetentionHold_expiry_check" CHECK ("expiresAt" > "reviewAt"),
    CONSTRAINT "RetentionHold_reviewId_fkey" FOREIGN KEY ("reviewId")
        REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RetentionHold_moderationActionId_fkey" FOREIGN KEY ("moderationActionId")
        REFERENCES "ModerationAction"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RetentionHold_reviewId_expiresAt_idx" ON "RetentionHold"("reviewId", "expiresAt");
CREATE INDEX "RetentionHold_moderationActionId_expiresAt_idx"
    ON "RetentionHold"("moderationActionId", "expiresAt");

CREATE FUNCTION "prevent_review_reassignment"() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog
AS $$
DECLARE
    table_owner name;
BEGIN
    IF NEW."studySpaceId" IS DISTINCT FROM OLD."studySpaceId" THEN
        RAISE EXCEPTION 'Review study space is immutable' USING ERRCODE = '23514';
    END IF;

    IF NEW."ownerAccountId" IS DISTINCT FROM OLD."ownerAccountId" THEN
        SELECT pg_get_userbyid(relowner) INTO table_owner
        FROM pg_class WHERE oid = TG_RELID;

        IF NOT (
            OLD."ownerAccountId" IS NOT NULL
            AND NEW."ownerAccountId" IS NULL
            AND current_user = table_owner
            AND current_setting('studyspace.lifecycle_operation', true) = 'true'
        ) THEN
            RAISE EXCEPTION 'Review owner is immutable except for account closure unlinking'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "prevent_review_reassignment"() FROM PUBLIC, studyspace_app, studyspace_saved;

CREATE TRIGGER "Review_identity_immutable"
    BEFORE UPDATE OF "ownerAccountId", "studySpaceId" ON "Review"
    FOR EACH ROW EXECUTE FUNCTION "prevent_review_reassignment"();

CREATE POLICY "Favorite_owner_access" ON "Favorite"
    USING (
        "accountId" = NULLIF(current_setting('studyspace.account_id', true), '')::UUID
        OR "ownerKey" = current_setting('studyspace.favorite_owner', true)
    )
    WITH CHECK (
        "accountId" = NULLIF(current_setting('studyspace.account_id', true), '')::UUID
        OR "ownerKey" = current_setting('studyspace.favorite_owner', true)
    );

CREATE POLICY "UserProfile_owner_access" ON "UserProfile"
    USING (
        "accountId" = NULLIF(current_setting('studyspace.account_id', true), '')::UUID
        OR "ownerKey" = current_setting('studyspace.favorite_owner', true)
    )
    WITH CHECK (
        "accountId" = NULLIF(current_setting('studyspace.account_id', true), '')::UUID
        OR "ownerKey" = current_setting('studyspace.favorite_owner', true)
    );

CREATE POLICY "Review_owner_read" ON "Review" FOR SELECT TO studyspace_saved
    USING (
        "ownerAccountId" = NULLIF(current_setting('studyspace.account_id', true), '')::UUID
        OR "ownerKey" = current_setting('studyspace.favorite_owner', true)
    );
CREATE POLICY "Review_owner_insert" ON "Review" FOR INSERT TO studyspace_saved
    WITH CHECK (
        ("ownerAccountId" = NULLIF(current_setting('studyspace.account_id', true), '')::UUID
            OR "ownerKey" = current_setting('studyspace.favorite_owner', true))
        AND "ownerUnlinkedAt" IS NULL
        AND "status" = 'PENDING' AND "publishedAt" IS NULL
        AND EXISTS (
            SELECT 1 FROM "StudySpace" AS space
            WHERE space."id" = "Review"."studySpaceId" AND space."status" = 'PUBLISHED'
                AND space."sourceType" <> 'DEVELOPMENT_FIXTURE'
        )
    );
CREATE POLICY "Review_owner_update" ON "Review" FOR UPDATE TO studyspace_saved
    USING (
        "ownerAccountId" = NULLIF(current_setting('studyspace.account_id', true), '')::UUID
        OR "ownerKey" = current_setting('studyspace.favorite_owner', true)
    )
    WITH CHECK (
        ("ownerAccountId" = NULLIF(current_setting('studyspace.account_id', true), '')::UUID
            OR "ownerKey" = current_setting('studyspace.favorite_owner', true))
        AND "ownerUnlinkedAt" IS NULL
        AND "status" IN ('PENDING', 'WITHDRAWN') AND "publishedAt" IS NULL
        AND EXISTS (
            SELECT 1 FROM "StudySpace" AS space
            WHERE space."id" = "Review"."studySpaceId" AND space."status" = 'PUBLISHED'
                AND space."sourceType" <> 'DEVELOPMENT_FIXTURE'
        )
    );

CREATE POLICY "UserReport_submit" ON "UserReport" FOR INSERT TO studyspace_saved
    WITH CHECK (
        ("reporterAccountId" = NULLIF(current_setting('studyspace.account_id', true), '')::UUID
            OR "reporterKey" = current_setting('studyspace.favorite_owner', true))
        AND "reporterUnlinkedAt" IS NULL
        AND "status" = 'OPEN' AND "resolvedAt" IS NULL
        AND "targetReferenceId" = COALESCE("listingId", "reviewId")
        AND (
            ("targetType" = 'LISTING' AND EXISTS (
                SELECT 1 FROM "StudySpace" AS space
                WHERE space."id" = "UserReport"."listingId" AND space."status" = 'PUBLISHED'
                    AND space."sourceType" <> 'DEVELOPMENT_FIXTURE'
            ))
            OR ("targetType" = 'REVIEW' AND EXISTS (
                SELECT 1 FROM "Review" AS review
                JOIN "StudySpace" AS space ON space."id" = review."studySpaceId"
                WHERE review."id" = "UserReport"."reviewId" AND review."status" = 'APPROVED'
                    AND space."status" = 'PUBLISHED' AND space."sourceType" <> 'DEVELOPMENT_FIXTURE'
            ))
        )
    );

CREATE POLICY "ModerationAction_moderator_insert" ON "ModerationAction" FOR INSERT TO studyspace_saved
    WITH CHECK (
        current_setting('studyspace.is_moderator', true) = 'true'
        AND ("moderatorAccountId" = NULLIF(current_setting('studyspace.account_id', true), '')::UUID
            OR "moderatorKey" = current_setting('studyspace.favorite_owner', true))
        AND "moderatorUnlinkedAt" IS NULL
        AND "targetReferenceId" = COALESCE("reviewId", "reportId")
    );

CREATE FUNCTION "resolve_account_identity"(requested_identity_key TEXT) RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
AS $$
DECLARE
    resolved_account_id UUID;
    resolved_state "AccountState";
    latest_generation INTEGER;
    latest_closure_status "AccountClosureStatus";
BEGIN
    IF requested_identity_key !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid identity key' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(requested_identity_key, 0));

    SELECT account."id", account."state"
    INTO resolved_account_id, resolved_state
    FROM public."AccountIdentity" identity
    JOIN public."Account" account ON account."id" = identity."accountId"
    WHERE identity."identityKey" = requested_identity_key
      AND identity."unlinkedAt" IS NULL
    FOR UPDATE OF account;

    IF FOUND THEN
        IF resolved_state = 'ACTIVE' THEN
            RETURN resolved_account_id;
        END IF;
        RETURN NULL;
    END IF;

    SELECT identity."generation", closure."status"
    INTO latest_generation, latest_closure_status
    FROM public."AccountIdentity" identity
    LEFT JOIN public."AccountClosure" closure ON closure."accountId" = identity."accountId"
    WHERE identity."identityKey" = requested_identity_key
    ORDER BY identity."generation" DESC
    LIMIT 1;

    IF latest_generation IS NOT NULL AND latest_closure_status IS DISTINCT FROM 'COMPLETE' THEN
        RETURN NULL;
    END IF;

    INSERT INTO public."Account" DEFAULT VALUES RETURNING "id" INTO resolved_account_id;
    INSERT INTO public."AccountIdentity" ("accountId", "identityKey", "generation")
    VALUES (resolved_account_id, requested_identity_key, COALESCE(latest_generation, 0) + 1);
    RETURN resolved_account_id;
END;
$$;

CREATE FUNCTION "set_active_account_context"(requested_account_id UUID, requested_moderator BOOLEAN)
RETURNS BOOLEAN
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
AS $$
DECLARE
    account_state "AccountState";
BEGIN
    SELECT "state" INTO account_state
    FROM public."Account"
    WHERE "id" = requested_account_id
    FOR UPDATE;

    IF account_state IS DISTINCT FROM 'ACTIVE' THEN
        RETURN FALSE;
    END IF;

    PERFORM set_config('studyspace.account_id', requested_account_id::TEXT, TRUE);
    PERFORM set_config('studyspace.is_moderator', requested_moderator::TEXT, TRUE);
    RETURN TRUE;
END;
$$;

CREATE FUNCTION "lookup_active_account_identity"(requested_identity_key TEXT) RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    STABLE
    SET search_path = pg_catalog, public
AS $$
DECLARE
    resolved_account_id UUID;
BEGIN
    IF requested_identity_key !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid identity key' USING ERRCODE = '22023';
    END IF;

    SELECT account."id" INTO resolved_account_id
    FROM public."AccountIdentity" identity
    JOIN public."Account" account ON account."id" = identity."accountId"
    WHERE identity."identityKey" = requested_identity_key
      AND identity."unlinkedAt" IS NULL
      AND account."state" = 'ACTIVE';
    RETURN resolved_account_id;
END;
$$;

CREATE FUNCTION "active_identity_key_for_account"(requested_account_id UUID) RETURNS TEXT
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path = pg_catalog, public
AS $$
    SELECT identity."identityKey"
    FROM public."AccountIdentity" identity
    JOIN public."Account" account ON account."id" = identity."accountId"
    WHERE identity."accountId" = requested_account_id
      AND identity."unlinkedAt" IS NULL
      AND account."state" = 'ACTIVE'
    ORDER BY identity."linkedAt", identity."id"
    LIMIT 1
$$;

CREATE FUNCTION "sync_legacy_owner_account"() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW."ownerKey" IS NULL AND NEW."accountId" IS NOT NULL THEN
        NEW."ownerKey" := public.active_identity_key_for_account(NEW."accountId");
    ELSIF NEW."accountId" IS NULL AND NEW."ownerKey" IS NOT NULL THEN
        NEW."accountId" := public.resolve_account_identity(NEW."ownerKey");
    END IF;
    IF NEW."ownerKey" IS NULL OR NEW."accountId" IS NULL
       OR public.lookup_active_account_identity(NEW."ownerKey") IS DISTINCT FROM NEW."accountId" THEN
        RAISE EXCEPTION 'Legacy and account ownership do not match' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION "sync_review_owner_account"() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
AS $$
DECLARE
    table_owner name;
BEGIN
    SELECT pg_get_userbyid(relowner) INTO table_owner FROM pg_class WHERE oid = TG_RELID;
    IF OLD."ownerAccountId" IS NOT NULL AND NEW."ownerAccountId" IS NULL
       AND session_user = table_owner
       AND current_setting('studyspace.lifecycle_operation', true) = 'true' THEN
        NEW."ownerKey" := NULL;
        RETURN NEW;
    END IF;
    IF NEW."ownerKey" IS NULL AND NEW."ownerAccountId" IS NOT NULL THEN
        NEW."ownerKey" := public.active_identity_key_for_account(NEW."ownerAccountId");
    ELSIF NEW."ownerAccountId" IS NULL AND NEW."ownerKey" IS NOT NULL THEN
        NEW."ownerAccountId" := public.resolve_account_identity(NEW."ownerKey");
    END IF;
    IF NEW."ownerKey" IS NOT NULL AND NEW."ownerAccountId" IS NOT NULL
       AND public.lookup_active_account_identity(NEW."ownerKey") IS DISTINCT FROM NEW."ownerAccountId" THEN
        RAISE EXCEPTION 'Legacy and account review owners do not match' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION "sync_report_actor_and_target"() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
AS $$
DECLARE
    table_owner name;
BEGIN
    SELECT pg_get_userbyid(relowner) INTO table_owner FROM pg_class WHERE oid = TG_RELID;
    IF OLD."reporterAccountId" IS NOT NULL AND NEW."reporterAccountId" IS NULL
       AND session_user = table_owner
       AND current_setting('studyspace.lifecycle_operation', true) = 'true' THEN
        NEW."reporterKey" := NULL;
    ELSE
    IF NEW."reporterKey" IS NULL AND NEW."reporterAccountId" IS NOT NULL THEN
        NEW."reporterKey" := public.active_identity_key_for_account(NEW."reporterAccountId");
    ELSIF NEW."reporterAccountId" IS NULL AND NEW."reporterKey" IS NOT NULL THEN
        NEW."reporterAccountId" := public.resolve_account_identity(NEW."reporterKey");
    END IF;
        IF NEW."reporterKey" IS NOT NULL AND NEW."reporterAccountId" IS NOT NULL
           AND public.lookup_active_account_identity(NEW."reporterKey") IS DISTINCT FROM NEW."reporterAccountId" THEN
            RAISE EXCEPTION 'Legacy and account report actors do not match' USING ERRCODE = '23514';
        END IF;
    END IF;
    NEW."targetReferenceId" := COALESCE(NEW."listingId", NEW."reviewId", NEW."targetReferenceId");
    RETURN NEW;
END;
$$;

CREATE FUNCTION "sync_moderation_actor_and_target"() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
AS $$
DECLARE
    table_owner name;
BEGIN
    SELECT pg_get_userbyid(relowner) INTO table_owner FROM pg_class WHERE oid = TG_RELID;
    IF OLD."moderatorAccountId" IS NOT NULL AND NEW."moderatorAccountId" IS NULL
       AND session_user = table_owner
       AND current_setting('studyspace.lifecycle_operation', true) = 'true' THEN
        NEW."moderatorKey" := NULL;
    ELSE
    IF NEW."moderatorKey" IS NULL AND NEW."moderatorAccountId" IS NOT NULL THEN
        NEW."moderatorKey" := public.active_identity_key_for_account(NEW."moderatorAccountId");
    ELSIF NEW."moderatorAccountId" IS NULL AND NEW."moderatorKey" IS NOT NULL THEN
        NEW."moderatorAccountId" := public.resolve_account_identity(NEW."moderatorKey");
    END IF;
        IF NEW."moderatorKey" IS NOT NULL AND NEW."moderatorAccountId" IS NOT NULL
           AND public.lookup_active_account_identity(NEW."moderatorKey") IS DISTINCT FROM NEW."moderatorAccountId" THEN
            RAISE EXCEPTION 'Legacy and account moderation actors do not match' USING ERRCODE = '23514';
        END IF;
    END IF;
    NEW."targetReferenceId" := COALESCE(NEW."reviewId", NEW."reportId", NEW."targetReferenceId");
    RETURN NEW;
END;
$$;

CREATE TRIGGER "Favorite_account_compatibility"
    BEFORE INSERT OR UPDATE OF "ownerKey", "accountId" ON "Favorite"
    FOR EACH ROW EXECUTE FUNCTION "sync_legacy_owner_account"();
CREATE TRIGGER "UserProfile_account_compatibility"
    BEFORE INSERT OR UPDATE OF "ownerKey", "accountId" ON "UserProfile"
    FOR EACH ROW EXECUTE FUNCTION "sync_legacy_owner_account"();
CREATE TRIGGER "Review_account_compatibility"
    BEFORE INSERT OR UPDATE OF "ownerKey", "ownerAccountId" ON "Review"
    FOR EACH ROW EXECUTE FUNCTION "sync_review_owner_account"();
CREATE TRIGGER "UserReport_account_compatibility"
    BEFORE INSERT OR UPDATE OF "reporterKey", "reporterAccountId", "listingId", "reviewId", "targetReferenceId" ON "UserReport"
    FOR EACH ROW EXECUTE FUNCTION "sync_report_actor_and_target"();
CREATE TRIGGER "ModerationAction_account_compatibility"
    BEFORE INSERT OR UPDATE OF "moderatorKey", "moderatorAccountId", "reviewId", "reportId", "targetReferenceId" ON "ModerationAction"
    FOR EACH ROW EXECUTE FUNCTION "sync_moderation_actor_and_target"();

REVOKE ALL ON FUNCTION "resolve_account_identity"(TEXT) FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
REVOKE ALL ON FUNCTION "lookup_active_account_identity"(TEXT) FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
REVOKE ALL ON FUNCTION "set_active_account_context"(UUID, BOOLEAN) FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
REVOKE ALL ON FUNCTION "active_identity_key_for_account"(UUID) FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
REVOKE ALL ON FUNCTION "sync_legacy_owner_account"() FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
REVOKE ALL ON FUNCTION "sync_review_owner_account"() FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
REVOKE ALL ON FUNCTION "sync_report_actor_and_target"() FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
REVOKE ALL ON FUNCTION "sync_moderation_actor_and_target"() FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
GRANT EXECUTE ON FUNCTION "resolve_account_identity"(TEXT) TO studyspace_saved;
GRANT EXECUTE ON FUNCTION "lookup_active_account_identity"(TEXT) TO studyspace_saved;
GRANT EXECUTE ON FUNCTION "set_active_account_context"(UUID, BOOLEAN) TO studyspace_saved;

ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountClosure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RetentionHold" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "Account", "AccountIdentity", "AccountClosure", "RetentionHold"
    FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;

COMMIT;

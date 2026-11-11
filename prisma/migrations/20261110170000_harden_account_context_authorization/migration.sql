BEGIN;

-- Expand-only authorization boundary. Legacy policies remain as an explicit
-- rollback bridge until the separately reviewed contract migration.
CREATE TABLE "ModeratorGrant" (
    "accountId" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "ModeratorGrant_pkey" PRIMARY KEY ("accountId"),
    CONSTRAINT "ModeratorGrant_accountId_fkey" FOREIGN KEY ("accountId")
        REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ModeratorGrant_revocation_check" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "grantedAt")
);

ALTER TABLE "ModeratorGrant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ModeratorGrant" FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;

-- The old UUID/boolean function trusted both arguments. Keep its signature for
-- catalog/rollback compatibility, but remove runtime execution.
REVOKE ALL ON FUNCTION public.set_active_account_context(UUID, BOOLEAN)
    FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;

CREATE FUNCTION public.set_active_account_context(
    requested_account_id UUID,
    requested_identity_key TEXT
) RETURNS BOOLEAN
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
AS $$
DECLARE
    account_state public."AccountState";
BEGIN
    IF requested_identity_key !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid identity key' USING ERRCODE = '22023';
    END IF;

    SELECT account."state" INTO account_state
    FROM public."Account" account
    JOIN public."AccountIdentity" identity ON identity."accountId" = account."id"
    WHERE account."id" = requested_account_id
      AND identity."identityKey" = requested_identity_key
      AND identity."unlinkedAt" IS NULL
    FOR UPDATE OF account;

    IF account_state IS DISTINCT FROM 'ACTIVE' THEN
        RETURN FALSE;
    END IF;

    PERFORM set_config('studyspace.account_id', requested_account_id::TEXT, TRUE);
    PERFORM set_config('studyspace.favorite_owner', requested_identity_key, TRUE);
    PERFORM set_config('studyspace.context_verified', 'true', TRUE);
    PERFORM set_config('studyspace.is_moderator', 'false', TRUE);
    RETURN TRUE;
END;
$$;

CREATE FUNCTION public.set_moderator_account_context(
    requested_account_id UUID,
    requested_identity_key TEXT
) RETURNS BOOLEAN
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NOT public.set_active_account_context(requested_account_id, requested_identity_key) THEN
        RETURN FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public."ModeratorGrant" grant_record
        WHERE grant_record."accountId" = requested_account_id
          AND grant_record."revokedAt" IS NULL
    ) THEN
        RETURN FALSE;
    END IF;

    PERFORM set_config('studyspace.is_moderator', 'true', TRUE);
    RETURN TRUE;
END;
$$;

CREATE FUNCTION public.has_verified_account_context(requested_account_id UUID)
RETURNS BOOLEAN
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path = pg_catalog, public
AS $$
    SELECT current_setting('studyspace.context_verified', TRUE) = 'true'
       AND NULLIF(current_setting('studyspace.account_id', TRUE), '')::UUID = requested_account_id
       AND EXISTS (
           SELECT 1
           FROM public."AccountIdentity" identity
           JOIN public."Account" account ON account."id" = identity."accountId"
           WHERE identity."accountId" = requested_account_id
             AND identity."identityKey" = current_setting('studyspace.favorite_owner', TRUE)
             AND identity."unlinkedAt" IS NULL
             AND account."state" = 'ACTIVE'
       )
$$;

CREATE FUNCTION public.has_verified_moderator_context()
RETURNS BOOLEAN
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path = pg_catalog, public
AS $$
    SELECT current_setting('studyspace.is_moderator', TRUE) = 'true'
       AND public.has_verified_account_context(
           NULLIF(current_setting('studyspace.account_id', TRUE), '')::UUID
       )
       AND EXISTS (
           SELECT 1 FROM public."ModeratorGrant" grant_record
           WHERE grant_record."accountId" = NULLIF(current_setting('studyspace.account_id', TRUE), '')::UUID
             AND grant_record."revokedAt" IS NULL
       )
$$;

REVOKE ALL ON FUNCTION public.set_active_account_context(UUID, TEXT)
    FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
REVOKE ALL ON FUNCTION public.set_moderator_account_context(UUID, TEXT)
    FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
REVOKE ALL ON FUNCTION public.has_verified_account_context(UUID)
    FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
REVOKE ALL ON FUNCTION public.has_verified_moderator_context()
    FROM PUBLIC, studyspace_app, studyspace_saved, studyspace_maintenance;
GRANT EXECUTE ON FUNCTION public.set_active_account_context(UUID, TEXT) TO studyspace_saved;
GRANT EXECUTE ON FUNCTION public.set_moderator_account_context(UUID, TEXT) TO studyspace_saved;
GRANT EXECUTE ON FUNCTION public.has_verified_account_context(UUID) TO studyspace_saved;
GRANT EXECUTE ON FUNCTION public.has_verified_moderator_context() TO studyspace_saved;

-- New application code uses the verified account branch. The legacy branch is
-- intentionally limited to transactions that have not entered verified mode.
DROP POLICY "Favorite_owner_access" ON "Favorite";
CREATE POLICY "Favorite_owner_access" ON "Favorite"
    USING (
        public.has_verified_account_context("accountId")
        OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
            AND "ownerKey" = current_setting('studyspace.favorite_owner', TRUE))
    )
    WITH CHECK (
        public.has_verified_account_context("accountId")
        OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
            AND "ownerKey" = current_setting('studyspace.favorite_owner', TRUE))
    );

DROP POLICY "UserProfile_owner_access" ON "UserProfile";
CREATE POLICY "UserProfile_owner_access" ON "UserProfile"
    USING (
        public.has_verified_account_context("accountId")
        OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
            AND "ownerKey" = current_setting('studyspace.favorite_owner', TRUE))
    )
    WITH CHECK (
        public.has_verified_account_context("accountId")
        OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
            AND "ownerKey" = current_setting('studyspace.favorite_owner', TRUE))
    );

DROP POLICY "Review_owner_read" ON "Review";
CREATE POLICY "Review_owner_read" ON "Review" FOR SELECT TO studyspace_saved
    USING (
        public.has_verified_account_context("ownerAccountId")
        OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
            AND "ownerKey" = current_setting('studyspace.favorite_owner', TRUE))
    );

DROP POLICY "Review_owner_insert" ON "Review";
CREATE POLICY "Review_owner_insert" ON "Review" FOR INSERT TO studyspace_saved
    WITH CHECK (
        (public.has_verified_account_context("ownerAccountId")
            OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
                AND "ownerKey" = current_setting('studyspace.favorite_owner', TRUE)))
        AND "ownerUnlinkedAt" IS NULL
        AND "retentionDecision" IS NULL
        AND "retentionReviewedAt" IS NULL
        AND "retentionReviewerAccountId" IS NULL
        AND "retentionReviewerUnlinkedAt" IS NULL
        AND "status" = 'PENDING' AND "publishedAt" IS NULL
        AND EXISTS (
            SELECT 1 FROM "StudySpace" AS space
            WHERE space."id" = "Review"."studySpaceId" AND space."status" = 'PUBLISHED'
                AND space."sourceType" <> 'DEVELOPMENT_FIXTURE'
        )
    );

DROP POLICY "Review_owner_update" ON "Review";
CREATE POLICY "Review_owner_update" ON "Review" FOR UPDATE TO studyspace_saved
    USING (
        public.has_verified_account_context("ownerAccountId")
        OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
            AND "ownerKey" = current_setting('studyspace.favorite_owner', TRUE))
    )
    WITH CHECK (
        (public.has_verified_account_context("ownerAccountId")
            OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
                AND "ownerKey" = current_setting('studyspace.favorite_owner', TRUE)))
        AND "ownerUnlinkedAt" IS NULL
        AND "status" IN ('PENDING', 'WITHDRAWN') AND "publishedAt" IS NULL
        AND EXISTS (
            SELECT 1 FROM "StudySpace" AS space
            WHERE space."id" = "Review"."studySpaceId" AND space."status" = 'PUBLISHED'
                AND space."sourceType" <> 'DEVELOPMENT_FIXTURE'
        )
    );

DROP POLICY "UserReport_submit" ON "UserReport";
CREATE POLICY "UserReport_submit" ON "UserReport" FOR INSERT TO studyspace_saved
    WITH CHECK (
        (public.has_verified_account_context("reporterAccountId")
            OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
                AND "reporterKey" = current_setting('studyspace.favorite_owner', TRUE)))
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

-- Moderator policy remains dual-mode only for the old deployed application.
-- The contract migration must remove the legacy branch after rollback expires.
DROP POLICY "Review_moderator_read" ON "Review";
CREATE POLICY "Review_moderator_read" ON "Review" FOR SELECT TO studyspace_saved
    USING (
        public.has_verified_moderator_context()
        OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
            AND current_setting('studyspace.is_moderator', TRUE) = 'true')
    );

DROP POLICY "Review_moderator_update" ON "Review";
CREATE POLICY "Review_moderator_update" ON "Review" FOR UPDATE TO studyspace_saved
    USING (
        public.has_verified_moderator_context()
        OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
            AND current_setting('studyspace.is_moderator', TRUE) = 'true')
    )
    WITH CHECK (
        (public.has_verified_moderator_context()
            OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
                AND current_setting('studyspace.is_moderator', TRUE) = 'true'))
        AND ("status" <> 'APPROVED' OR "ownerAccountId" IS NOT NULL)
    );

DROP POLICY "UserReport_moderator_read" ON "UserReport";
CREATE POLICY "UserReport_moderator_read" ON "UserReport" FOR SELECT TO studyspace_saved
    USING (
        public.has_verified_moderator_context()
        OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
            AND current_setting('studyspace.is_moderator', TRUE) = 'true')
    );

DROP POLICY "UserReport_moderator_update" ON "UserReport";
CREATE POLICY "UserReport_moderator_update" ON "UserReport" FOR UPDATE TO studyspace_saved
    USING (
        public.has_verified_moderator_context()
        OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
            AND current_setting('studyspace.is_moderator', TRUE) = 'true')
    )
    WITH CHECK (
        public.has_verified_moderator_context()
        OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
            AND current_setting('studyspace.is_moderator', TRUE) = 'true')
    );

DROP POLICY "ModerationAction_moderator_read" ON "ModerationAction";
CREATE POLICY "ModerationAction_moderator_read" ON "ModerationAction" FOR SELECT TO studyspace_saved
    USING (
        public.has_verified_moderator_context()
        OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
            AND current_setting('studyspace.is_moderator', TRUE) = 'true')
    );

DROP POLICY "ModerationAction_moderator_insert" ON "ModerationAction";
CREATE POLICY "ModerationAction_moderator_insert" ON "ModerationAction" FOR INSERT TO studyspace_saved
    WITH CHECK (
        (public.has_verified_moderator_context()
            AND "moderatorAccountId" = NULLIF(current_setting('studyspace.account_id', TRUE), '')::UUID
            OR (current_setting('studyspace.context_verified', TRUE) IS DISTINCT FROM 'true'
                AND current_setting('studyspace.is_moderator', TRUE) = 'true'
                AND "moderatorKey" = current_setting('studyspace.favorite_owner', TRUE)))
        AND "moderatorUnlinkedAt" IS NULL
        AND "targetReferenceId" = COALESCE("reviewId", "reportId")
    );

COMMIT;

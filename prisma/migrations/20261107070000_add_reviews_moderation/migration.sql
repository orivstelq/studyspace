CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'HIDDEN');
CREATE TYPE "ReportTargetType" AS ENUM ('LISTING', 'REVIEW');
CREATE TYPE "ReportReason" AS ENUM ('INACCURATE', 'CLOSED', 'INAPPROPRIATE', 'OTHER');
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE "ModerationActionType" AS ENUM ('REVIEW_APPROVED', 'REVIEW_REJECTED', 'REVIEW_HIDDEN', 'REPORT_RESOLVED');

CREATE TABLE "Review" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerKey" VARCHAR(64) NOT NULL,
    "studySpaceId" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
    CONSTRAINT "Review_body_check" CHECK (char_length(btrim("body")) BETWEEN 20 AND 2000),
    CONSTRAINT "Review_publication_check" CHECK (
        ("status" = 'APPROVED' AND "publishedAt" IS NOT NULL)
        OR ("status" <> 'APPROVED' AND "publishedAt" IS NULL)
    ),
    CONSTRAINT "Review_studySpaceId_fkey" FOREIGN KEY ("studySpaceId") REFERENCES "StudySpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Review_ownerKey_studySpaceId_key" ON "Review"("ownerKey", "studySpaceId");
CREATE INDEX "Review_studySpaceId_status_publishedAt_idx" ON "Review"("studySpaceId", "status", "publishedAt");
CREATE INDEX "Review_status_updatedAt_idx" ON "Review"("status", "updatedAt");

CREATE TABLE "UserReport" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporterKey" VARCHAR(64) NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "listingId" UUID,
    "reviewId" UUID,
    "reason" "ReportReason" NOT NULL,
    "details" VARCHAR(1000),
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "UserReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserReport_target_check" CHECK (
        ("targetType" = 'LISTING' AND "listingId" IS NOT NULL AND "reviewId" IS NULL)
        OR ("targetType" = 'REVIEW' AND "reviewId" IS NOT NULL AND "listingId" IS NULL)
    ),
    CONSTRAINT "UserReport_details_check" CHECK ("details" IS NULL OR char_length(btrim("details")) BETWEEN 10 AND 1000),
    CONSTRAINT "UserReport_resolution_check" CHECK (
        ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL)
        OR ("status" = 'OPEN' AND "resolvedAt" IS NULL)
    ),
    CONSTRAINT "UserReport_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "StudySpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "UserReport_status_createdAt_idx" ON "UserReport"("status", "createdAt");
CREATE INDEX "UserReport_listingId_idx" ON "UserReport"("listingId");
CREATE INDEX "UserReport_reviewId_idx" ON "UserReport"("reviewId");
CREATE UNIQUE INDEX "UserReport_open_listing_key" ON "UserReport"("reporterKey", "listingId") WHERE "status" = 'OPEN' AND "listingId" IS NOT NULL;
CREATE UNIQUE INDEX "UserReport_open_review_key" ON "UserReport"("reporterKey", "reviewId") WHERE "status" = 'OPEN' AND "reviewId" IS NOT NULL;

CREATE TABLE "ModerationAction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "moderatorKey" VARCHAR(64) NOT NULL,
    "action" "ModerationActionType" NOT NULL,
    "reviewId" UUID,
    "reportId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ModerationAction_target_check" CHECK (
        ("action" IN ('REVIEW_APPROVED', 'REVIEW_REJECTED', 'REVIEW_HIDDEN') AND "reviewId" IS NOT NULL AND "reportId" IS NULL)
        OR ("action" = 'REPORT_RESOLVED' AND "reportId" IS NOT NULL AND "reviewId" IS NULL)
    ),
    CONSTRAINT "ModerationAction_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ModerationAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "UserReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ModerationAction_reviewId_createdAt_idx" ON "ModerationAction"("reviewId", "createdAt");
CREATE INDEX "ModerationAction_reportId_createdAt_idx" ON "ModerationAction"("reportId", "createdAt");

ALTER TABLE "Review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModerationAction" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Review_public_read" ON "Review" FOR SELECT TO studyspace_app
    USING ("status" = 'APPROVED' AND EXISTS (
        SELECT 1 FROM "StudySpace" AS space
        WHERE space."id" = "Review"."studySpaceId" AND space."status" = 'PUBLISHED' AND space."sourceType" <> 'DEVELOPMENT_FIXTURE'
    ));

CREATE POLICY "Review_owner_read" ON "Review" FOR SELECT TO studyspace_saved
    USING ("ownerKey" = current_setting('studyspace.favorite_owner', true));
CREATE POLICY "Review_authenticated_public_read" ON "Review" FOR SELECT TO studyspace_saved
    USING ("status" = 'APPROVED' AND EXISTS (
        SELECT 1 FROM "StudySpace" AS space
        WHERE space."id" = "Review"."studySpaceId" AND space."status" = 'PUBLISHED' AND space."sourceType" <> 'DEVELOPMENT_FIXTURE'
    ));
CREATE POLICY "Review_owner_insert" ON "Review" FOR INSERT TO studyspace_saved
    WITH CHECK (
        "ownerKey" = current_setting('studyspace.favorite_owner', true)
        AND "status" = 'PENDING' AND "publishedAt" IS NULL
        AND EXISTS (
            SELECT 1 FROM "StudySpace" AS space
            WHERE space."id" = "Review"."studySpaceId" AND space."status" = 'PUBLISHED' AND space."sourceType" <> 'DEVELOPMENT_FIXTURE'
        )
    );
CREATE POLICY "Review_owner_update" ON "Review" FOR UPDATE TO studyspace_saved
    USING ("ownerKey" = current_setting('studyspace.favorite_owner', true))
    WITH CHECK (
        "ownerKey" = current_setting('studyspace.favorite_owner', true)
        AND "status" IN ('PENDING', 'WITHDRAWN') AND "publishedAt" IS NULL
    );
CREATE POLICY "Review_moderator_read" ON "Review" FOR SELECT TO studyspace_saved
    USING (current_setting('studyspace.is_moderator', true) = 'true');
CREATE POLICY "Review_moderator_update" ON "Review" FOR UPDATE TO studyspace_saved
    USING (current_setting('studyspace.is_moderator', true) = 'true')
    WITH CHECK (current_setting('studyspace.is_moderator', true) = 'true');

CREATE POLICY "UserReport_submit" ON "UserReport" FOR INSERT TO studyspace_saved
    WITH CHECK (
        "reporterKey" = current_setting('studyspace.favorite_owner', true)
        AND "status" = 'OPEN' AND "resolvedAt" IS NULL
        AND (
            ("targetType" = 'LISTING' AND EXISTS (
                SELECT 1 FROM "StudySpace" AS space
                WHERE space."id" = "UserReport"."listingId" AND space."status" = 'PUBLISHED' AND space."sourceType" <> 'DEVELOPMENT_FIXTURE'
            ))
            OR ("targetType" = 'REVIEW' AND EXISTS (
                SELECT 1 FROM "Review" AS review
                JOIN "StudySpace" AS space ON space."id" = review."studySpaceId"
                WHERE review."id" = "UserReport"."reviewId" AND review."status" = 'APPROVED'
                    AND space."status" = 'PUBLISHED' AND space."sourceType" <> 'DEVELOPMENT_FIXTURE'
            ))
        )
    );
CREATE POLICY "UserReport_moderator_read" ON "UserReport" FOR SELECT TO studyspace_saved
    USING (current_setting('studyspace.is_moderator', true) = 'true');
CREATE POLICY "UserReport_moderator_update" ON "UserReport" FOR UPDATE TO studyspace_saved
    USING (current_setting('studyspace.is_moderator', true) = 'true')
    WITH CHECK (current_setting('studyspace.is_moderator', true) = 'true');

CREATE POLICY "ModerationAction_moderator_read" ON "ModerationAction" FOR SELECT TO studyspace_saved
    USING (current_setting('studyspace.is_moderator', true) = 'true');
CREATE POLICY "ModerationAction_moderator_insert" ON "ModerationAction" FOR INSERT TO studyspace_saved
    WITH CHECK (
        current_setting('studyspace.is_moderator', true) = 'true'
        AND "moderatorKey" = current_setting('studyspace.favorite_owner', true)
    );

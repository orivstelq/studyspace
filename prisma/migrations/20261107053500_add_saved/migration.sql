CREATE TABLE "Favorite" (
    "ownerKey" VARCHAR(64) NOT NULL,
    "studySpaceId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("ownerKey", "studySpaceId"),
    CONSTRAINT "Favorite_studySpaceId_fkey" FOREIGN KEY ("studySpaceId")
        REFERENCES "StudySpace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Favorite_ownerKey_createdAt_studySpaceId_idx"
    ON "Favorite"("ownerKey", "createdAt", "studySpaceId");
CREATE INDEX "Favorite_studySpaceId_idx" ON "Favorite"("studySpaceId");

ALTER TABLE "Favorite" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Favorite_owner_access" ON "Favorite"
    USING ("ownerKey" = current_setting('studyspace.favorite_owner', true))
    WITH CHECK ("ownerKey" = current_setting('studyspace.favorite_owner', true));

CREATE TABLE "AuthSession" (
    "id" VARCHAR(32) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "providerSessionId" VARCHAR(255) NOT NULL,
    "createdAt" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthSession_subject_idx" ON "AuthSession"("subject");
CREATE INDEX "AuthSession_providerSessionId_idx" ON "AuthSession"("providerSessionId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

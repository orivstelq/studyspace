-- Shared fixed-window counters for application-level rate limiting.
-- Identifiers are HMAC digests; raw account identifiers and IP addresses are not stored.
CREATE TABLE "RateLimitBucket" (
    "key" VARCHAR(64) NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "RateLimitBucket_count_check" CHECK ("count" > 0)
);

CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

REVOKE ALL ON TABLE "RateLimitBucket" FROM PUBLIC, studyspace_app, studyspace_saved;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RateLimitBucket" TO studyspace_saved;

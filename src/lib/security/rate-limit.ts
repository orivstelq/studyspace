import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { PrismaClient } from "@/generated/prisma/client";
import { privateDatabase } from "@/lib/db/private-client";

export const RATE_LIMITS = {
    publicSearch: { scope: "public-search", limit: 60, windowMs: 60_000 },
    reviewSubmission: { scope: "review-submission", limit: 5, windowMs: 10 * 60_000 },
    reportSubmission: { scope: "report-submission", limit: 5, windowMs: 60 * 60_000 },
    moderationMutation: { scope: "moderation-mutation", limit: 60, windowMs: 10 * 60_000 },
} as const;

export interface RateLimitPolicy {
    scope: string;
    limit: number;
    windowMs: number;
}

export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    retryAfter: number;
    resetAt: Date;
}

type RateLimitDatabase = Pick<PrismaClient, "$queryRaw">;

interface BucketRow {
    count: number;
    resetAt: Date;
}

function signingSecret() {
    const secret = process.env.RATE_LIMIT_SECRET
        ?? (process.env.NODE_ENV === "production" ? undefined : process.env.AUTH0_SECRET)
        ?? (process.env.NODE_ENV === "production" ? undefined : "studyspace-local-rate-limit-only");
    if (!secret) throw new Error("RATE_LIMIT_SECRET is required in production.");
    if (process.env.NODE_ENV === "production" && Buffer.byteLength(secret) < 32) {
        throw new Error("RATE_LIMIT_SECRET must contain at least 32 bytes in production.");
    }
    return secret;
}

export function clientAddress(headers: Headers) {
    const source = process.env.TRUSTED_CLIENT_IP_SOURCE
        ?? (process.env.NODE_ENV === "production" ? undefined : "shared");
    if (source === "shared") return "shared-untrusted-ingress";
    if (source !== "vercel") {
        throw new Error("TRUSTED_CLIENT_IP_SOURCE must be 'vercel' or 'shared'.");
    }

    const address = headers.get("x-vercel-forwarded-for")?.trim();
    return address && isIP(address) ? address : "shared-unidentified-vercel-client";
}

export function rateLimitKey(policy: RateLimitPolicy, subject: string) {
    return createHmac("sha256", signingSecret())
        .update(`${policy.scope}\0${subject}`)
        .digest("hex");
}

export async function enforceRateLimit(
    policy: RateLimitPolicy,
    subject: string,
    database: RateLimitDatabase = privateDatabase(),
): Promise<RateLimitResult> {
    const key = rateLimitKey(policy, subject);
    const rows = await database.$queryRaw<BucketRow[]>`
        INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
        VALUES (${key}, 1, CURRENT_TIMESTAMP + (${policy.windowMs} * INTERVAL '1 millisecond'), CURRENT_TIMESTAMP)
        ON CONFLICT ("key") DO UPDATE SET
            "count" = CASE
                WHEN "RateLimitBucket"."resetAt" <= CURRENT_TIMESTAMP THEN 1
                ELSE "RateLimitBucket"."count" + 1
            END,
            "resetAt" = CASE
                WHEN "RateLimitBucket"."resetAt" <= CURRENT_TIMESTAMP
                    THEN CURRENT_TIMESTAMP + (${policy.windowMs} * INTERVAL '1 millisecond')
                ELSE "RateLimitBucket"."resetAt"
            END,
            "updatedAt" = CURRENT_TIMESTAMP
        RETURNING "count", "resetAt"
    `;
    const bucket = rows[0];
    if (!bucket) throw new Error("Rate limit counter was not returned.");
    const now = Date.now();
    return {
        allowed: bucket.count <= policy.limit,
        limit: policy.limit,
        remaining: Math.max(0, policy.limit - bucket.count),
        retryAfter: Math.max(1, Math.ceil((bucket.resetAt.getTime() - now) / 1000)),
        resetAt: bucket.resetAt,
    };
}

export function rateLimitHeaders(result: RateLimitResult) {
    return {
        "RateLimit-Limit": String(result.limit),
        "RateLimit-Remaining": String(result.remaining),
        "RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
        ...(result.allowed ? {} : { "Retry-After": String(result.retryAfter) }),
    };
}

import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { changeFavorite, hasFavorite, listFavorites } from "../../src/features/favorites/query";
import { resolveAccountIdentity } from "../../src/features/account-lifecycle/repository";
import { getTestDatabaseUrl, type TestDatabaseUrlKey } from "../helpers/test-database";

function testClient(key: TestDatabaseUrlKey) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: getTestDatabaseUrl(key), max: 2 }) });
}

describe("Saved persistence and isolation", () => {
    const admin = testClient("DIRECT_URL");
    const saved = testClient("FAVORITES_DATABASE_URL");
    const discovery = testClient("DATABASE_URL");
    const prefix = `test-${randomUUID()}`;
    const slug = `${prefix}-published`;
    const draftSlug = `${prefix}-draft`;
    const ownerKey = randomBytes(32).toString("hex");
    const strangerKey = randomBytes(32).toString("hex");
    let owner: string;
    let stranger: string;
    let spaceId: string;
    const ownerContext = () => ({ accountId: owner, ownerKey });
    const strangerContext = () => ({ accountId: stranger, ownerKey: strangerKey });

    beforeAll(async () => {
        owner = (await resolveAccountIdentity(saved, ownerKey))!;
        stranger = (await resolveAccountIdentity(saved, strangerKey))!;
        const common = { name: "Temporary Saved test", description: "Fixture", category: "LIBRARY", city: "Test", region: "Test", sourceType: "OFFICIAL" } as const;
        const space = await admin.studySpace.create({ data: { ...common, slug, status: "PUBLISHED" } });
        spaceId = space.id;
        await admin.studySpace.create({ data: { ...common, slug: draftSlug, status: "DRAFT" } });
    });

    afterAll(async () => {
        try {
            await admin.studySpace.deleteMany({ where: { slug: { in: [slug, draftSlug] } } });
            await admin.accountIdentity.deleteMany({ where: { accountId: { in: [owner, stranger] } } });
            await admin.account.deleteMany({ where: { id: { in: [owner, stranger] } } });
        } finally {
            await Promise.all([admin.$disconnect(), saved.$disconnect(), discovery.$disconnect()]);
        }
    });

    it("keeps favorites private, idempotent, and limited to published listings", async () => {
        expect(await changeFavorite(saved, ownerContext(), draftSlug, true)).toBe(false);
        expect(await changeFavorite(saved, ownerContext(), `${slug}-missing`, true)).toBe(false);
        await Promise.all([changeFavorite(saved, ownerContext(), slug, true), changeFavorite(saved, ownerContext(), slug, true)]);
        expect(await hasFavorite(saved, ownerContext(), spaceId)).toBe(true);
        expect(await hasFavorite(saved, strangerContext(), spaceId)).toBe(false);
        expect((await listFavorites(saved, ownerContext(), 1)).spaces.map((space) => space.slug)).toEqual([slug]);
        expect((await listFavorites(saved, strangerContext(), 1)).spaces).toEqual([]);
        expect(await saved.favorite.findMany()).toEqual([]);
        await expect(saved.favorite.create({ data: { accountId: stranger, studySpaceId: spaceId } })).rejects.toThrow();
        await changeFavorite(saved, strangerContext(), slug, false);
        expect(await hasFavorite(saved, ownerContext(), spaceId)).toBe(true);

        await admin.studySpace.update({ where: { id: spaceId }, data: { status: "ARCHIVED" } });
        expect((await listFavorites(saved, ownerContext(), 1)).spaces).toEqual([]);
        await changeFavorite(saved, ownerContext(), slug, false);
        await changeFavorite(saved, ownerContext(), slug, false);
        expect(await hasFavorite(saved, ownerContext(), spaceId)).toBe(false);
    });

    it("keeps the discovery role out of private tables and the Saved role read-only for listings", async () => {
        await expect(discovery.favorite.findMany()).rejects.toThrow();
        await expect(discovery.authSession.findMany()).rejects.toThrow();
        await expect(discovery.account.findMany()).rejects.toThrow();
        await expect(saved.account.findMany()).rejects.toThrow();
        await expect(saved.accountIdentity.findMany()).rejects.toThrow();
        await expect(saved.accountClosure.findMany()).rejects.toThrow();
        await expect(saved.retentionHold.findMany()).rejects.toThrow();
        await expect(saved.moderatorGrant.findMany()).rejects.toThrow();
        await expect(saved.studySpace.update({ where: { id: spaceId }, data: { name: "Unauthorized" } })).rejects.toThrow();
    });
});

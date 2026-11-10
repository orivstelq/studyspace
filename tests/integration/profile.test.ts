import "dotenv/config";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { getProfile, saveProfile } from "../../src/features/profile/query";
import { resolveAccountIdentity } from "../../src/features/account-lifecycle/repository";

function testClient(key: "DIRECT_URL" | "FAVORITES_DATABASE_URL") {
    const url = new URL(process.env[key] ?? "");
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/studyspace_dev") {
        throw new Error(`Unsafe ${key}: expected a local studyspace_dev URL`);
    }
    url.pathname = "/studyspace_test";
    url.search = "";
    url.hash = "";
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 2 }) });
}

describe("Profile persistence and isolation", () => {
    const admin = testClient("DIRECT_URL");
    const profile = testClient("FAVORITES_DATABASE_URL");
    const ownerKey = randomBytes(32).toString("hex");
    const strangerKey = randomBytes(32).toString("hex");
    let owner: string;
    let stranger: string;

    beforeAll(async () => {
        owner = (await resolveAccountIdentity(profile, ownerKey))!;
        stranger = (await resolveAccountIdentity(profile, strangerKey))!;
    });

    afterAll(async () => {
        try {
            await admin.userProfile.deleteMany({ where: { accountId: owner } });
            await admin.accountIdentity.deleteMany({ where: { accountId: { in: [owner, stranger] } } });
            await admin.account.deleteMany({ where: { id: { in: [owner, stranger] } } });
        } finally {
            await Promise.all([admin.$disconnect(), profile.$disconnect()]);
        }
    });

    it("stores only the verified owner's valid preferences", async () => {
        await saveProfile(profile, owner, { category: "library", amenities: ["quiet", "wifi"] });
        expect(await getProfile(profile, owner)).toEqual({ category: "library", amenities: ["quiet", "wifi"] });
        expect(await getProfile(profile, stranger)).toBeNull();
        expect(await profile.userProfile.findMany()).toEqual([]);
        await expect(profile.userProfile.create({
            data: { accountId: stranger, preferredAmenities: [] },
        })).rejects.toThrow();

        await saveProfile(profile, owner, { category: "all", amenities: ["accessible"] });
        expect(await getProfile(profile, owner)).toEqual({ category: "all", amenities: ["accessible"] });
    });

    it("rejects unsupported preference values at the database boundary", async () => {
        const account = await admin.account.create({ data: {} });
        try {
            await expect(admin.userProfile.create({
                data: { accountId: account.id, preferredAmenities: ["parking"] },
            })).rejects.toThrow();
        } finally {
            await admin.account.delete({ where: { id: account.id } });
        }
    });
});

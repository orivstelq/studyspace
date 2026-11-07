import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { getProfile, saveProfile } from "../../src/features/profile/query";

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
    const owner = randomUUID();
    const stranger = randomUUID();

    afterAll(async () => {
        try {
            await admin.userProfile.deleteMany({ where: { ownerKey: owner } });
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
            data: { ownerKey: stranger, preferredAmenities: [] },
        })).rejects.toThrow();

        await saveProfile(profile, owner, { category: "all", amenities: ["accessible"] });
        expect(await getProfile(profile, owner)).toEqual({ category: "all", amenities: ["accessible"] });
    });

    it("rejects unsupported preference values at the database boundary", async () => {
        await expect(admin.userProfile.create({
            data: { ownerKey: randomUUID(), preferredAmenities: ["parking"] },
        })).rejects.toThrow();
    });
});

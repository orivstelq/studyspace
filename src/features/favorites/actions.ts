"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthIdentity } from "../../lib/auth/auth";
import { privateDatabase } from "../../lib/db/private-client";
import { changeFavorite } from "./query";

export async function updateFavorite(_previousMessage: string | null, form: FormData): Promise<string | null> {
    const baseUrl = process.env.APP_BASE_URL;
    const origin = (await headers()).get("origin");
    if (!baseUrl || !origin || origin !== new URL(baseUrl).origin) return "This request could not be verified.";

    const identity = await getAuthIdentity();
    if (!identity) return "Sign in again to update Saved.";

    const slug = form.get("slug");
    const intent = form.get("intent");
    if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
        slug.length > 160 || (intent !== "save" && intent !== "remove")) {
        return "This space could not be updated.";
    }

    try {
        if (!await changeFavorite(privateDatabase(), identity, slug, intent === "save")) {
            return "This space is no longer available to save.";
        }
    } catch (error) {
        console.error("Saved update failed:", error instanceof Error ? error.name : "Unknown error");
        return "Saved is temporarily unavailable. Try again.";
    }

    revalidatePath("/saved");
    revalidatePath(`/spaces/${slug}`);
    return null;
}

"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getActiveAccountId } from "../../lib/auth/auth";
import { privateDatabase } from "../../lib/db/private-client";
import { parseProfilePreferences } from "./preferences";
import { saveProfile } from "./query";

export async function updateProfile(_previousMessage: string | null, form: FormData): Promise<string> {
    const baseUrl = process.env.APP_BASE_URL;
    const origin = (await headers()).get("origin");
    if (!baseUrl || !origin || origin !== new URL(baseUrl).origin) return "This request could not be verified.";

    const accountId = await getActiveAccountId();
    if (!accountId) return "Sign in again to update your preferences.";

    const preferences = parseProfilePreferences(form);
    if (!preferences) return "Choose only the available study preferences.";

    try {
        await saveProfile(privateDatabase(), accountId, preferences);
    } catch (error) {
        console.error("Profile update failed:", error instanceof Error ? error.name : "Unknown error");
        return "Preferences are temporarily unavailable. Try again.";
    }

    revalidatePath("/profile");
    return "Preferences saved.";
}

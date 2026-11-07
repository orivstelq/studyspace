"use client";

import { useActionState } from "react";
import { updateFavorite } from "./actions";

export function FavoriteButton({ slug, saved, name }: { slug: string; saved: boolean; name: string }) {
    const [message, action, pending] = useActionState(updateFavorite, null);
    const label = saved ? "Remove from Saved" : "Save space";
    return (
        <form action={action}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="intent" value={saved ? "remove" : "save"} />
            <button type="submit" disabled={pending} aria-label={`${label}: ${name}`}
                className="min-h-11 rounded-lg border border-harbor px-4 py-2 text-sm font-semibold text-harbor hover:bg-linen disabled:opacity-60">
                {pending ? "Updating…" : label}
            </button>
            {message && <p role="alert" className="mt-2 text-sm text-ink">{message}</p>}
        </form>
    );
}

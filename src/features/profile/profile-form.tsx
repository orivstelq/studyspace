"use client";

import { useActionState, useState } from "react";
import { AMENITIES, SPACE_CATEGORIES, type Amenity, type SpaceCategory } from "../discovery/types";
import { updateProfile } from "./actions";
import type { ProfilePreferences } from "./query";

const categoryLabels: Record<SpaceCategory, string> = {
    library: "Library",
    cafe: "Café",
    campus: "Campus",
    coworking: "Coworking",
};

const amenityLabels: Record<Amenity, string> = {
    wifi: "Wi-Fi",
    outlets: "Power outlets",
    quiet: "Quiet",
    "group-friendly": "Group-friendly",
    accessible: "Accessible",
};

export function ProfileForm({ preferences }: { preferences: ProfilePreferences }) {
    const [message, action, pending] = useActionState(updateProfile, null);
    const [selection, setSelection] = useState(preferences);

    return (
        <form action={action} className="mt-8 rounded-2xl border border-clay bg-white p-6 sm:p-8">
            <label htmlFor="preferred-category" className="block text-sm font-semibold">Preferred space type</label>
            <select
                id="preferred-category"
                name="category"
                value={selection.category}
                onChange={(event) => setSelection((current) => ({
                    ...current,
                    category: event.target.value as ProfilePreferences["category"],
                }))}
                className="mt-2 w-full rounded-lg border border-clay bg-paper px-4 py-3 sm:max-w-sm"
            >
                <option value="all">No preference</option>
                {SPACE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>{categoryLabels[category]}</option>
                ))}
            </select>

            <fieldset className="mt-8">
                <legend className="text-sm font-semibold">Preferred amenities</legend>
                <p className="mt-2 text-sm text-muted">Select what matters when comparing study spaces.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {AMENITIES.map((amenity) => (
                        <label key={amenity} className="flex min-h-11 items-center gap-3 rounded-lg border border-clay px-4 py-3">
                            <input
                                type="checkbox"
                                name="amenities"
                                value={amenity}
                                checked={selection.amenities.includes(amenity)}
                                onChange={(event) => setSelection((current) => ({
                                    ...current,
                                    amenities: event.target.checked
                                        ? [...current.amenities, amenity]
                                        : current.amenities.filter((item) => item !== amenity),
                                }))}
                                className="h-5 w-5 accent-harbor"
                            />
                            <span>{amenityLabels[amenity]}</span>
                        </label>
                    ))}
                </div>
            </fieldset>

            <button type="submit" disabled={pending} className="mt-8 min-h-11 rounded-lg bg-harbor px-5 py-3 font-semibold text-white disabled:opacity-60">
                {pending ? "Saving…" : "Save preferences"}
            </button>
            {message && <p role="status" aria-live="polite" className="mt-3 text-sm text-ink">{message}</p>}
        </form>
    );
}

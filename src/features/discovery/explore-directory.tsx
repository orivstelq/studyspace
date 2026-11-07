
"use client";

import { useMemo, useState } from "react";
import { developmentSpaces } from "./fixtures";
import { filterStudySpaces } from "./search";
import {
    AMENITIES,
    SPACE_CATEGORIES,
    type Amenity,
    type SpaceCategory,
} from "./types";

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

type CategoryFilter = SpaceCategory | "all";
type AmenityFilter = Amenity | "all";

export function ExploreDirectory() {
    const [query, setQuery] = useState("");
    const [category, setCategory] =
        useState<CategoryFilter>("all");
    const [amenity, setAmenity] =
        useState<AmenityFilter>("all");

    const results = useMemo(
        () =>
            filterStudySpaces(developmentSpaces, {
                query,
                category,
                amenity,
            }),
        [query, category, amenity],
    );

    function resetFilters() {
        setQuery("");
        setCategory("all");
        setAmenity("all");
    }

    return (
        <div>
            <section
                aria-label="Study-space filters"
                className="rounded-2xl border border-clay bg-white p-5 sm:p-7"
            >
                <div className="grid gap-5 md:grid-cols-2">
                    <div className="md:col-span-2">
                        <label
                            htmlFor="space-search"
                            className="mb-2 block text-sm font-semibold"
                        >
                            Search spaces
                        </label>
                        <input
                            id="space-search"
                            type="search"
                            value={query}
                            onChange={(event) =>
                                setQuery(event.target.value)
                            }
                            placeholder="Search by name or description"
                            maxLength={120}
                            className="w-full rounded-lg border border-clay bg-paper px-4 py-3 text-ink placeholder:text-muted focus:border-harbor"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="category-filter"
                            className="mb-2 block text-sm font-semibold"
                        >
                            Space type
                        </label>
                        <select
                            id="category-filter"
                            value={category}
                            onChange={(event) =>
                                setCategory(
                                    event.target.value as CategoryFilter,
                                )
                            }
                            className="w-full rounded-lg border border-clay bg-paper px-4 py-3"
                        >
                            <option value="all">All types</option>
                            {SPACE_CATEGORIES.map((item) => (
                                <option key={item} value={item}>
                                    {categoryLabels[item]}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label
                            htmlFor="amenity-filter"
                            className="mb-2 block text-sm font-semibold"
                        >
                            Must have
                        </label>
                        <select
                            id="amenity-filter"
                            value={amenity}
                            onChange={(event) =>
                                setAmenity(
                                    event.target.value as AmenityFilter,
                                )
                            }
                            className="w-full rounded-lg border border-clay bg-paper px-4 py-3"
                        >
                            <option value="all">Any amenity</option>
                            {AMENITIES.map((item) => (
                                <option key={item} value={item}>
                                    {amenityLabels[item]}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="mt-5 flex justify-end">
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="rounded-lg px-4 py-2 text-sm font-semibold text-harbor hover:bg-linen"
                    >
                        Clear filters
                    </button>
                </div>
            </section>

            <section
                aria-label="Search results"
                className="mt-9"
            >
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <h2
                        className="text-xl font-semibold"
                        aria-live="polite"
                        aria-atomic="true"
                    >
                        {results.length}{" "}
                        {results.length === 1 ? "space" : "spaces"} found
                    </h2>
                    <span className="rounded-full bg-linen px-3 py-1 text-xs font-semibold text-harbor">
                        Fictional demo listings
                    </span>
                </div>

                {results.length === 0 ? (
                    <div className="rounded-2xl border border-clay bg-white p-8 text-center sm:p-12">
                        <h3 className="text-xl font-semibold">
                            No matching spaces
                        </h3>
                        <p className="mt-3 text-muted">
                            Try a different search or remove a filter.
                        </p>
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="mt-6 rounded-lg bg-harbor px-5 py-3 font-semibold text-white hover:bg-ink"
                        >
                            Reset search
                        </button>
                    </div>
                ) : (
                    <div className="grid gap-5 md:grid-cols-2">
                        {results.map((space) => (
                            <article
                                key={space.id}
                                className="flex flex-col rounded-2xl border border-clay bg-white p-6 transition-colors hover:border-harbor"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <span className="rounded-md bg-linen px-3 py-1 text-xs font-semibold text-harbor">
                                        {categoryLabels[space.category]}
                                    </span>
                                    <span className="text-xs text-muted">
                                        Demo only
                                    </span>
                                </div>

                                <h3 className="mt-6 text-2xl font-semibold tracking-tight">
                                    {space.name}
                                </h3>

                                <p className="mt-2 text-sm text-muted">
                                    {space.city}, {space.region}
                                </p>

                                <p className="mt-4 flex-1 leading-7 text-muted">
                                    {space.description}
                                </p>

                                <div className="mt-6 border-t border-clay/70 pt-5">
                                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
                                        Listed amenities
                                    </p>
                                    <ul className="flex flex-wrap gap-2">
                                        {space.amenities.map((item) => (
                                            <li
                                                key={item}
                                                className="rounded-full bg-paper px-3 py-2 text-xs font-medium text-ink"
                                            >
                                                {amenityLabels[item]}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

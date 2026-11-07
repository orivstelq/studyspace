import Link from "next/link";
import { exploreUrl, MAX_SEARCH_LENGTH, type DirectoryFilters } from "./directory-params";
import {
    AMENITIES,
    SPACE_CATEGORIES,
    type Amenity,
    type SpaceCategory,
    type StudySpace,
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

interface ExploreDirectoryProps {
    spaces: StudySpace[];
    filters: DirectoryFilters;
    hasNext: boolean;
}

export function ExploreDirectory({ spaces, filters, hasNext }: ExploreDirectoryProps) {
    const hasFilters = Boolean(filters.query || filters.category !== "all" || filters.amenity !== "all");

    return (
        <div>
            <form
                action="/explore"
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
                            name="q"
                            defaultValue={filters.query}
                            placeholder="Search by name or description"
                            maxLength={MAX_SEARCH_LENGTH}
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
                            name="category"
                            defaultValue={filters.category}
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
                            name="amenity"
                            defaultValue={filters.amenity}
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

                <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
                    <Link href="/explore" className="rounded-lg px-4 py-3 text-sm font-semibold text-harbor hover:bg-linen">
                        Clear filters
                    </Link>
                    <button type="submit" className="rounded-lg bg-harbor px-5 py-3 text-sm font-semibold text-white hover:bg-ink">
                        Search
                    </button>
                </div>
            </form>

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
                        {spaces.length}{" "}
                        {spaces.length === 1 ? "space" : "spaces"} on this page
                    </h2>

                    <span className="rounded-full bg-linen px-3 py-1 text-xs font-semibold text-harbor">
                        Published directory
                    </span>
                </div>

                {spaces.length === 0 ? (
                    <div className="rounded-2xl border border-clay bg-white p-8 text-center sm:p-12">
                        <h3 className="text-xl font-semibold">
                            {filters.page > 1 ? "No spaces on this page" : hasFilters ? "No matching spaces" : "No published spaces yet"}
                        </h3>
                        <p className="mt-3 text-muted">
                            {filters.page > 1 ? "Go back to the first page of these results." : hasFilters
                                ? "Try a different search or remove a filter."
                                : "Published locations will appear here as they become available."}
                        </p>
                        {filters.page > 1 && (
                            <Link href={exploreUrl(filters, 1)} className="mt-4 inline-block font-semibold text-harbor underline">
                                First page
                            </Link>
                        )}
                    </div>
                ) : (
                    <div className="grid gap-5 md:grid-cols-2">
                        {spaces.map((space) => (
                            <article
                                key={space.id}
                                className="flex min-w-0 flex-col wrap-anywhere rounded-2xl border border-clay bg-white p-6 transition-colors hover:border-harbor"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <span className="rounded-md bg-linen px-3 py-1 text-xs font-semibold text-harbor">
                                        {categoryLabels[space.category]}
                                    </span>

                                    <span className="text-xs text-muted">
                                        {space.verifiedAt ? "Source checked" : "Unverified"}
                                    </span>
                                </div>

                                <h3 className="mt-6 text-2xl font-semibold tracking-tight">
                                    <Link
                                        href={`/spaces/${space.slug}`}
                                        className="text-ink underline-offset-4 hover:text-harbor hover:underline"
                                    >
                                        {space.name}
                                    </Link>
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

                                    {space.amenities.length > 0 ? (
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
                                    ) : (
                                        <p className="text-sm text-muted">
                                            No amenities listed yet.
                                        </p>
                                    )}
                                </div>

                            </article>
                        ))}
                    </div>
                )}
                {(filters.page > 1 || hasNext) && (
                    <nav aria-label="Results pages" className="mt-6 flex flex-wrap items-center gap-4">
                        {filters.page > 1 && <Link rel="prev" href={exploreUrl(filters, filters.page - 1)} className="rounded-lg border border-clay px-4 py-3 text-sm font-semibold text-harbor">Previous</Link>}
                        <span className="text-sm text-muted">Page {filters.page}</span>
                        {hasNext && <Link rel="next" href={exploreUrl(filters, filters.page + 1)} className="rounded-lg border border-clay px-4 py-3 text-sm font-semibold text-harbor">Next</Link>}
                    </nav>
                )}
            </section>
        </div>
    );
}

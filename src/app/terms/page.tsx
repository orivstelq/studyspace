import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Terms information",
    description: "Current operating information and unresolved terms for the StudySpace portfolio project.",
};

export default function TermsPage() {
    return (
        <main id="main-content" className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-harbor">Public project information</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">Terms of use</h1>
            <p className="mt-4 leading-7 text-muted">
                StudySpace is an independently operated portfolio project for finding and comparing study-friendly spaces. This page records current product behavior while formal terms are under review.
            </p>

            <aside className="mt-8 rounded-2xl border border-dune bg-linen/50 p-5" aria-labelledby="terms-review-heading">
                <h2 id="terms-review-heading" className="font-semibold">Not a finalized agreement</h2>
                <p className="mt-2 leading-7 text-muted">
                    Owner review is still required for the operator identity, support contact, eligibility, acceptable-use rules, content license, suspension process, warranties, liability, governing law, and dispute terms. This page does not present those unresolved matters as agreed legal terms.
                </p>
            </aside>

            <div className="mt-10 space-y-10 leading-7 text-muted">
                <section aria-labelledby="service-heading">
                    <h2 id="service-heading" className="text-2xl font-semibold text-ink">Current service</h2>
                    <p className="mt-3">
                        The public directory shows published study-space records, source information, and checked amenities. Signed-in users can save listings, store study preferences, receive deterministic recommendations, submit one review per published listing, and report published listings or visible reviews.
                    </p>
                    <p className="mt-3">
                        Listing details can change after their source was checked. StudySpace directs users to the cited source for current hours and access rules and does not provide live occupancy or availability information.
                    </p>
                </section>

                <section aria-labelledby="accounts-heading">
                    <h2 id="accounts-heading" className="text-2xl font-semibold text-ink">Accounts</h2>
                    <p className="mt-3">
                        Authentication is provided through Auth0. StudySpace uses the verified server session for account identity and authorization. The application does not accept a browser-supplied owner or moderator role as proof of access.
                    </p>
                    <p className="mt-3">
                        A minimum age, account eligibility rule, account termination process, and complete account-deletion process have not been approved. They must be settled before these terms can become a final agreement.
                    </p>
                </section>

                <section aria-labelledby="content-heading">
                    <h2 id="content-heading" className="text-2xl font-semibold text-ink">Reviews, reports, and moderation</h2>
                    <p className="mt-3">
                        New and edited reviews require moderator approval before they are public. Editing an approved review temporarily removes it from public view. Users may withdraw their own review; withdrawal changes its status and does not delete its stored row.
                    </p>
                    <p className="mt-3">
                        Reports are private to authorized moderators. Moderators can approve or reject pending reviews, hide an approved review, and resolve reports. The application records the moderator action, target, hashed moderator identity, and time.
                    </p>
                    <p className="mt-3">
                        Final rules for prohibited content, review ownership, the permission needed to display submitted reviews, enforcement, and appeals require owner review.
                    </p>
                </section>

                <section aria-labelledby="availability-heading">
                    <h2 id="availability-heading" className="text-2xl font-semibold text-ink">Availability and changes</h2>
                    <p className="mt-3">
                        The project is currently deployed to staging and may change as it is developed. No uptime commitment, service-level agreement, warranty, limitation of liability, or commercial-use commitment has been approved.
                    </p>
                </section>

                <section aria-labelledby="privacy-heading">
                    <h2 id="privacy-heading" className="text-2xl font-semibold text-ink">Privacy and account lifecycle</h2>
                    <p className="mt-3">
                        The <Link href="/privacy" className="font-semibold text-harbor underline">Privacy information</Link> page describes verified data handling and clearly identifies the retention, deletion, support, and provider decisions that remain open. Those decisions must be completed before these terms are finalized.
                    </p>
                </section>

                <section aria-labelledby="contact-heading">
                    <h2 id="contact-heading" className="text-2xl font-semibold text-ink">Contact status</h2>
                    <p className="mt-3">
                        A public support email and formal notice address have not been selected. No placeholder contact is presented as active. See the <Link href="/privacy#support" className="font-semibold text-harbor underline">support status</Link> for the current launch blocker.
                    </p>
                </section>
            </div>

            <p className="mt-12 border-t border-clay pt-5 text-sm text-muted">
                Engineering draft last reviewed <time dateTime="2026-11-09">November 9, 2026</time>.
            </p>
        </main>
    );
}

import type { Metadata } from "next";
import Link from "next/link";
import { PolicySection } from "../../components/legal/policy-section";
import { publicContact } from "../../lib/public-contact";

export const metadata: Metadata = {
    title: "Terms information",
    description: "Current operating information and unresolved terms for the StudySpace portfolio project.",
};

export default function TermsPage() {
    return (
        <main id="main-content" className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 lg:py-16">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-harbor">Public project information</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">Terms of use</h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted">
                StudySpace is an independently operated portfolio project for finding and comparing study-friendly spaces. This page records current product behavior while formal terms are under review.
            </p>

            <aside className="mt-8 grid rounded-2xl border border-dune bg-linen/50 p-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 lg:p-6" aria-labelledby="terms-review-heading">
                <h2 id="terms-review-heading" className="font-semibold">Not a finalized agreement</h2>
                <p className="mt-2 max-w-2xl leading-7 text-muted lg:mt-0">
                    This engineering draft assumes an individual operator, an initial United States audience aged 18 or older, and no initial monetization. Those assumptions and the operator identity, acceptable-use rules, content license, suspension process, warranties, liability, governing law, and dispute terms still require owner confirmation or qualified legal review. This page does not present unresolved matters as agreed legal terms.
                </p>
            </aside>

            <div className="mt-12 space-y-10 leading-7 text-muted">
                <PolicySection id="service" title="Current service">
                    <p className="mt-3">
                        The public directory shows published study-space records, source information, and checked amenities. Signed-in users can save listings, store study preferences, receive deterministic recommendations, submit one review per published listing, and report published listings or visible reviews.
                    </p>
                    <p className="mt-3">
                        Listing details can change after their source was checked. StudySpace directs users to the cited source for current hours and access rules and does not provide live occupancy or availability information.
                    </p>
                </PolicySection>

                <PolicySection id="accounts" title="Accounts">
                    <p className="mt-3">
                        Authentication is provided through Auth0. StudySpace uses the verified server session for account identity and authorization. The application does not accept a browser-supplied owner or moderator role as proof of access.
                    </p>
                    <p className="mt-3">
                        The provisional eligibility rule permits accounts only for people aged 18 or older in the United States; broader international availability is deferred. StudySpace does not currently verify age or residence technically. The owner must approve the rule, its enforcement, and applicable legal requirements before public registration is enabled. The account-termination and complete account-deletion processes also remain unfinished.
                    </p>
                </PolicySection>

                <PolicySection id="content" title="Reviews, reports, and moderation">
                    <p className="mt-3">
                        New and edited reviews require moderator approval before they are public. Editing an approved review temporarily removes it from public view. Users may withdraw their own review; withdrawal changes its status and does not delete its stored row.
                    </p>
                    <p className="mt-3">
                        Reports are private to authorized moderators. Moderators can approve or reject pending reviews, hide an approved review, and resolve reports. The application records the moderator action, target, internal moderator-account association, and time; account-closure handling may later unlink that association while preserving the action record for its approved retention period.
                    </p>
                    <p className="mt-3">
                        Final rules for prohibited content, review ownership, the permission needed to display submitted reviews, enforcement, and appeals require owner review.
                    </p>
                </PolicySection>

                <PolicySection id="availability" title="Availability and changes">
                    <p className="mt-3">
                        The project is currently deployed to staging and may change as it is developed. It has no payment or subscription feature, and this draft assumes no initial monetization. No uptime commitment, service-level agreement, warranty, limitation of liability, promise of continued free access, or commercial-use commitment has been approved.
                    </p>
                </PolicySection>

                <PolicySection id="privacy" title="Privacy and account lifecycle">
                    <p className="mt-3">
                        The <Link href="/privacy" className="font-semibold text-harbor underline">Privacy information</Link> page describes verified data handling and clearly identifies the retention, deletion, and provider decisions that remain open. Those decisions must be completed before these terms are finalized.
                    </p>
                </PolicySection>

                <PolicySection id="contact" title="Contact">
                    <p className="mt-3">
                        For support, moderation questions, or policy inquiries, email <a href={publicContact.href} className="font-semibold text-harbor underline">{publicContact.email}</a>. A formal notice address has not been selected, and the other draft warnings on this page remain unresolved.
                    </p>
                </PolicySection>
            </div>

            <div className="mt-12 grid border-t border-clay pt-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
                <p className="max-w-2xl text-sm text-muted lg:col-start-2">
                    Engineering draft last reviewed <time dateTime="2026-11-10">November 10, 2026</time>.
                </p>
            </div>
        </main>
    );
}

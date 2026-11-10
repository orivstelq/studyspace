import type { Metadata } from "next";
import { PolicySection } from "../../components/legal/policy-section";
import { publicContact } from "../../lib/public-contact";

export const metadata: Metadata = {
    title: "Privacy information",
    description: "Verified information about how the StudySpace portfolio project handles account and community data.",
};

export default function PrivacyPage() {
    return (
        <main id="main-content" className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 lg:py-16">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-harbor">Public project information</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">Privacy information</h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted">
                This page describes verified behavior in the current StudySpace application. StudySpace is personally operated by an independent developer as a portfolio project.
            </p>

            <aside className="mt-8 grid rounded-2xl border border-dune bg-linen/50 p-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 lg:p-6" aria-labelledby="privacy-review-heading">
                <h2 id="privacy-review-heading" className="font-semibold">Owner review required before public launch</h2>
                <p className="mt-2 max-w-2xl leading-7 text-muted lg:mt-0">
                    This is not a finalized privacy policy. Formal operator details, operational retention enforcement, the account-deletion process, legal jurisdiction, and provider disclosures still require owner review.
                </p>
            </aside>

            <div className="mt-12 space-y-10 leading-7 text-muted">
                <PolicySection id="identity" title="Sign-in information">
                    <p className="mt-3">
                        Auth0 provides sign-in. StudySpace requests the <code>openid</code>, <code>profile</code>, and <code>email</code> scopes. The application uses the verified account subject and keeps one display label, preferring the account name and otherwise using the email address. It also stores the application session identifier, provider session identifier, creation time, and expiry time.
                    </p>
                    <p className="mt-3">
                        StudySpace does not persist provider access or refresh tokens. The current session is non-rolling and can authorize access for no more than eight hours. Expiry stops the session from being accepted; it does not by itself establish when the stored session row is deleted.
                    </p>
                </PolicySection>

                <PolicySection id="account-data" title="Account and community data">
                    <p className="mt-3">
                        StudySpace derives a stable, issuer-scoped hash from the verified account identity and maps it to a random internal account generation. It stores selected space-category and amenity preferences, saved listing identifiers, and their timestamps against that internal account.
                    </p>
                    <p className="mt-3">
                        Reviews store a rating, review text, listing, moderation status, timestamps, and an internal account association while linked. Reports store a target, reason, optional details, status, timestamps, and a reporter association while linked. Moderation records store the action, target, time, and a moderator association while linked.
                    </p>
                </PolicySection>

                <PolicySection id="visibility" title="What is public">
                    <p className="mt-3">
                        Published listing information is public. Only moderator-approved review ratings, text, and publication times are returned by public review queries. Account labels, identity hashes, internal account identifiers, preferences, favorites, pending reviews, reports, and moderation records are not included in public responses.
                    </p>
                    <p className="mt-3">
                        New and edited reviews stay private until approved. Editing an approved review removes it from public view while approval is pending. Withdrawing a review removes it from public view but does not delete the stored review row. Reports are visible only to authorized moderators through the application.
                    </p>
                </PolicySection>

                <PolicySection id="security" title="Security and operational data">
                    <p className="mt-3">
                        StudySpace uses an authentication cookie for the signed-in session. The application configures it as HttpOnly and SameSite=Lax, and as Secure when the application uses HTTPS.
                    </p>
                    <p className="mt-3">
                        Shared rate limits protect public search and account mutations. Stored rate-limit keys are keyed hashes rather than raw client addresses or account subjects. Application error messages intentionally log operation names and error types rather than form content or credentials. Hosting, authentication, and database providers may keep their own operational logs; their exact production settings and retention require owner review.
                    </p>
                </PolicySection>

                <PolicySection id="services" title="Services involved">
                    <p className="mt-3">
                        The documented staging architecture uses Auth0 for authentication, Vercel for the application runtime, and Neon PostgreSQL for application data. A Google connection may be enabled through Auth0, but the final production connection, scopes, provider credentials, regions, and contractual data-handling terms must be confirmed by the owner before launch.
                    </p>
                    <p className="mt-3">The current application code contains no advertising or product-analytics integration.</p>
                </PolicySection>

                <PolicySection id="retention" title="Retention and deletion status">
                    <p className="mt-3">
                        StudySpace has approved engineering targets and repository code for bounded cleanup, but does not yet enforce them through a deployed retention schedule: resolved reports should be removed no later than 90 days after resolution, open reports should remain only until resolution and then for no more than 90 days, moderation and security audit records should remain no more than 180 days except for documented limited holds, and expired application-session rows should be removed within seven days. These are implementation targets, not a claim that automated deletion is currently active.
                    </p>
                    <p className="mt-3">
                        StudySpace does not yet offer an account-wide deletion workflow. A signed-in user can remove individual favorites, edit preferences, sign out, and withdraw a review, but those controls do not delete every record associated with an account. The repository contains a local database foundation for a future authenticated deletion workflow; reauthentication, provider deletion, scheduled retention enforcement, backup behavior, and recovery still require verification before it can be offered.
                    </p>
                </PolicySection>

                <PolicySection id="support" title="Support and privacy requests">
                    <p className="mt-3">
                        For privacy questions, account-data requests, or deletion inquiries, email <a href={publicContact.href} className="font-semibold text-harbor underline">{publicContact.email}</a>. Requests require identity verification and manual review. StudySpace does not yet offer an operationally verified account-wide deletion workflow, and the unresolved retention, provider, backup, and legal decisions described above still apply.
                    </p>
                </PolicySection>

                <PolicySection id="review-items" title="Decisions still requiring owner review">
                    <ul className="mt-3 list-disc space-y-2 pl-6">
                        <li>Operator identity, formal notice details, and applicable jurisdiction.</li>
                        <li>Deployment and monitoring of the approved application retention targets, plus provider-log and backup retention.</li>
                        <li>Account deletion, export, correction, and appeal procedures.</li>
                        <li>Production service providers, regions, subprocessors, and Google/Auth0 connection settings.</li>
                        <li>Audience and age requirements, including whether minors may create accounts.</li>
                    </ul>
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

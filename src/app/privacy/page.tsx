import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy information",
    description: "Verified information about how the StudySpace portfolio project handles account and community data.",
};

export default function PrivacyPage() {
    return (
        <main id="main-content" className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-harbor">Public project information</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">Privacy information</h1>
            <p className="mt-4 leading-7 text-muted">
                This page describes verified behavior in the current StudySpace application. StudySpace is personally operated by an independent developer as a portfolio project.
            </p>

            <aside className="mt-8 rounded-2xl border border-dune bg-linen/50 p-5" aria-labelledby="privacy-review-heading">
                <h2 id="privacy-review-heading" className="font-semibold">Owner review required before public launch</h2>
                <p className="mt-2 leading-7 text-muted">
                    This is not a finalized privacy policy. The operator identity and contact, retention periods, account-deletion process, legal jurisdiction, and provider disclosures still require owner review. No support email has been published.
                </p>
            </aside>

            <div className="mt-10 space-y-10 leading-7 text-muted">
                <section aria-labelledby="identity-heading">
                    <h2 id="identity-heading" className="text-2xl font-semibold text-ink">Sign-in information</h2>
                    <p className="mt-3">
                        Auth0 provides sign-in. StudySpace requests the <code>openid</code>, <code>profile</code>, and <code>email</code> scopes. The application uses the verified account subject and keeps one display label, preferring the account name and otherwise using the email address. It also stores the application session identifier, provider session identifier, creation time, and expiry time.
                    </p>
                    <p className="mt-3">
                        StudySpace does not persist provider access or refresh tokens. The current session is non-rolling and can authorize access for no more than eight hours. Expiry stops the session from being accepted; it does not by itself establish when the stored session row is deleted.
                    </p>
                </section>

                <section aria-labelledby="account-data-heading">
                    <h2 id="account-data-heading" className="text-2xl font-semibold text-ink">Account and community data</h2>
                    <p className="mt-3">
                        Private account records use a stable, issuer-scoped hash derived from the verified account identity. StudySpace stores selected space-category and amenity preferences, saved listing identifiers, and their timestamps.
                    </p>
                    <p className="mt-3">
                        Reviews store a rating, review text, listing, moderation status, and timestamps. Reports store a target, reason, optional details, status, and timestamps. Moderation records store the action, target, time, and a hashed moderator identity.
                    </p>
                </section>

                <section aria-labelledby="visibility-heading">
                    <h2 id="visibility-heading" className="text-2xl font-semibold text-ink">What is public</h2>
                    <p className="mt-3">
                        Published listing information is public. Only moderator-approved review ratings, text, and publication times are returned by public review queries. Account labels, owner hashes, preferences, favorites, pending reviews, reports, and moderation records are not included in public responses.
                    </p>
                    <p className="mt-3">
                        New and edited reviews stay private until approved. Editing an approved review removes it from public view while approval is pending. Withdrawing a review removes it from public view but does not delete the stored review row. Reports are visible only to authorized moderators through the application.
                    </p>
                </section>

                <section aria-labelledby="security-heading">
                    <h2 id="security-heading" className="text-2xl font-semibold text-ink">Security and operational data</h2>
                    <p className="mt-3">
                        StudySpace uses an authentication cookie for the signed-in session. The application configures it as HttpOnly and SameSite=Lax, and as Secure when the application uses HTTPS.
                    </p>
                    <p className="mt-3">
                        Shared rate limits protect public search and account mutations. Stored rate-limit keys are keyed hashes rather than raw client addresses or account subjects. Application error messages intentionally log operation names and error types rather than form content or credentials. Hosting, authentication, and database providers may keep their own operational logs; their exact production settings and retention require owner review.
                    </p>
                </section>

                <section aria-labelledby="services-heading">
                    <h2 id="services-heading" className="text-2xl font-semibold text-ink">Services involved</h2>
                    <p className="mt-3">
                        The documented staging architecture uses Auth0 for authentication, Vercel for the application runtime, and Neon PostgreSQL for application data. A Google connection may be enabled through Auth0, but the final production connection, scopes, provider credentials, regions, and contractual data-handling terms must be confirmed by the owner before launch.
                    </p>
                    <p className="mt-3">The current application code contains no advertising or product-analytics integration.</p>
                </section>

                <section aria-labelledby="retention-heading">
                    <h2 id="retention-heading" className="text-2xl font-semibold text-ink">Retention and deletion status</h2>
                    <p className="mt-3">
                        StudySpace does not yet have a published retention schedule or an account-wide deletion workflow. A signed-in user can remove individual favorites, edit preferences, sign out, and withdraw a review. Those controls do not delete every record associated with an account.
                    </p>
                    <p className="mt-3">
                        The repository contains a design for a future authenticated deletion workflow, but destructive deletion has not been implemented. Backup retention, report handling, review disposition, audit preservation, and deletion from Auth0 all require owner decisions before that workflow can be offered.
                    </p>
                </section>

                <section id="support" aria-labelledby="support-heading" className="scroll-mt-6">
                    <h2 id="support-heading" className="text-2xl font-semibold text-ink">Support and privacy requests</h2>
                    <p className="mt-3">
                        A public support email has not been selected. A verified contact method must be added here and to the authentication-provider configuration before public launch. Until then, this page does not offer a finalized channel for account, privacy, or deletion requests.
                    </p>
                </section>

                <section aria-labelledby="review-items-heading">
                    <h2 id="review-items-heading" className="text-2xl font-semibold text-ink">Decisions still requiring owner review</h2>
                    <ul className="mt-3 list-disc space-y-2 pl-6">
                        <li>Operator identity, contact details, and applicable jurisdiction.</li>
                        <li>Retention periods for account, community, security, provider-log, and backup data.</li>
                        <li>Account deletion, export, correction, and appeal procedures.</li>
                        <li>Production service providers, regions, subprocessors, and Google/Auth0 connection settings.</li>
                        <li>Audience and age requirements, including whether minors may create accounts.</li>
                    </ul>
                </section>
            </div>

            <p className="mt-12 border-t border-clay pt-5 text-sm text-muted">
                Engineering draft last reviewed <time dateTime="2026-11-09">November 9, 2026</time>.
            </p>
        </main>
    );
}

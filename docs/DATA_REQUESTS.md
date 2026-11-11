# StudySpace manual account-data requests

Status: reviewed operator procedure; not yet rehearsed end to end against a production Auth0 tenant and database

Public contact: [sidstelq11@gmail.com](mailto:sidstelq11@gmail.com)

StudySpace does not expose self-service account deletion. Email can be a request channel, but possession of an email address or knowledge of a display name is not enough to authorize account access or deletion. This procedure is the minimum manual bridge for access, correction, and deletion requests while the authenticated deletion workflow is deferred.

It is not legal advice. The provisional launch assumption is an individual operator serving an initial United States audience aged 18 or older, with broader international accounts deferred and no initial monetization assumed. The application does not technically verify age or residence. Before accepting public accounts, the owner must confirm that scope and its enforcement, determine which federal and state privacy laws apply, and select response deadlines that meet every applicable rule. A manual channel can be acceptable under some regimes, but that cannot be assumed for every jurisdiction or operator. California guidance can require covered online businesses to designate request methods, while UK/EU guidance remains relevant if the audience later expands and requires proportionate identity verification and timely responses.

## Intake and tracking

1. Treat any message reasonably asking for access, correction, or deletion as a request even if it uses no legal terminology.
2. Create a private case record outside the public repository. Record a random case reference, received date, request scope, verification state, actions, responsible operator, due date chosen under the applicable policy, exceptions, and completion evidence. Do not copy review/report text, cookies, tokens, database URLs, or Auth0 secrets into the case.
3. Acknowledge receipt through the same private channel. Do not promise completion until identity, scope, provider behavior, holds, and backups have been reviewed.
4. If the request concerns content safety rather than account data, route it to moderation without disclosing report or moderator data.

## Requester verification

1. In the Auth0 dashboard, locate the exact user record and record its immutable `user_id`/subject. Never select an account from a display name alone.
2. Require the request to come from the email on that Auth0 record and require Auth0 to mark the email as verified. If the address is absent, unverified, changed, shared, or disputed, stop and use a separately reviewed proportionate verification method; do not request more identity data than necessary.
3. Ask the requester to sign out and complete a fresh StudySpace sign-in. Confirm, using an owner-only read, that a new unexpired `AuthSession` exists for the exact Auth0 subject after the request was received and maps through the current, active `AccountIdentity` generation. Do not ask the requester to send a cookie, token, session ID, database account UUID, or identity digest.
4. If the exact subject, active account generation, verified email, and fresh session do not all agree, mark the case `VERIFICATION_BLOCKED` and make no data change. Requests from an authorized agent and requests for an inaccessible account require a separately approved legal and identity-verification process.

This proves control of the current StudySpace/Auth0 account more strongly than email alone, but it is not recent Auth0 reauthentication. The future self-service flow still requires reviewed `auth_time` handling.

## Access or correction request

Use an owner-only, read-only export scoped by the verified active account UUID. Include only the requester’s Profile, Favorites, owned reviews, submitted reports, mapped session metadata, and closure state. Do not expose moderator identities, other reporters, internal security secrets, keyed rate-limit values, or another account’s records. Review free text for third-party data before release. Corrections must use existing validated product controls where possible; an operator database correction requires a separate change record and backup review.

No reviewed export tool exists yet. Until one is implemented and tested, access requests that require a data export are operationally blocked and public accounts are not release-ready.

## Deletion request

1. Verify the requester and the exact active account generation as above. Record every linked Auth0 identity discovered from the provider; do not expand scope by matching email addresses.
2. Check for open reports, approved-review text assessments, finite retention holds, moderator status, and security/legal exceptions. Record the minimum reason and expiry for any exception. A hold never preserves the account association.
3. Remove every mapped subject from `AUTH0_MODERATOR_SUBJECTS` and deploy that revocation before or with closure. The local closure transaction revokes the generation-specific `ModeratorGrant`.
4. Run the owner-only lifecycle operation: begin closure, assess every approved review for identifying text, record `RETAIN` only when public retention is justified, then finalize local closure. The transaction deletes Profile, Favorites, mapped sessions, and ordinary non-public reviews; unlinks approved retained reviews, reports, and audit actors; minimizes retained report details; and records non-sensitive counts in `AccountClosure`.
5. Delete the exact Auth0 tenant user and all verified linked identities using an approved Auth0 Management API or dashboard procedure. This does not delete the person’s Google account. Do not mark provider completion merely because local deletion succeeded.
6. Independently verify that the Auth0 user is absent, old cookies no longer resolve, Profile/Favorites are absent, non-public review dispositions are correct, approved retained reviews have no account association, reports/audits have no actor association, the moderator grant is revoked, and the closure is `PROVIDER_PENDING` with accurate counts.
7. Only a reviewed owner operation may record `providerCompletedAt` and set the closure to `COMPLETE`. That operation and provider rehearsal do not yet exist; therefore the first live deletion remains blocked.
8. Respond with the case reference, completion date, categories deleted or retained, the basis and deadline of any exception, and the verified provider/backup limitations. Never claim deletion from provider logs or backups unless independently verified.

## Recovery and monitoring

- A restored database can resurrect data that was deleted after the restore point. Before restored traffic is enabled, replay every completed closure and verify it again.
- Current staging recovery history is not a production retention policy. The owner must approve production backup retention, RPO/RTO, and deletion replay.
- Keep the minimum case evidence needed to prove receipt, verification, decisions, and completion under an owner-approved case-record retention period. No period has been approved, so live cases must not begin until that decision is made.
- Review the request mailbox and case queue on a documented schedule, alert before the applicable response deadline, and escalate any missed deadline or failed deletion step.

## Launch decision

The channel and procedure are documented, but the export tool, recent reauthentication, provider-deletion rehearsal, completion operation, case-record retention, response deadline, backup replay, and first end-to-end test are incomplete. This is not yet an operationally verified deletion service. Real public accounts remain a **NO-GO** until the owner resolves those gates and approves the US age-18 scope with qualified advice where needed.

Official references used for the operator decision: [EU GDPR Articles 12 and 17](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=oj%3AJOL_2016_119_R_0001), [UK ICO right-to-erasure guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/), [California CPPA consumer-request guidance](https://cppa.ca.gov/faq), and [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).

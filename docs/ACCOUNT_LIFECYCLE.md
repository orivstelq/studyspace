# StudySpace — Account lifecycle and deletion design

Status: Phase 16H engineering policy approved; destructive workflow not implemented

Public support and privacy contact: [sidstelq11@gmail.com](mailto:sidstelq11@gmail.com).

There is still no account-wide deletion endpoint, migration, database function, Auth0 Management API integration, or retention-cleanup schedule. The approved dispositions below are requirements for the future implementation, not a claim that deletion is currently available. `src/features/account-lifecycle/deletion-policy.ts` is a non-mutating planner used to test these rules; it does not read or change a database.

## Current identity and data boundary

Auth0 verifies the session. `AuthSession` stores the raw Auth0 subject, one display label, the application and provider session identifiers, and timestamps. Other account-owned rows use `ownerKey`, a SHA-256 digest of the configured Auth0 issuer and subject. That digest is pseudonymous, deterministic, and reproducible after re-registration; it is not anonymous.

Current user controls remain narrower than account closure:

- sign-out deletes the current application session only;
- favorites can be removed individually;
- profile preferences can be changed but not deleted through the UI;
- a review can be edited or withdrawn, but withdrawal retains its row;
- a report cannot be read back or deleted by its reporter;
- moderation audit rows cannot be changed or deleted by runtime roles.

## Schema and policy audit

| Record | Current ownership and constraints | Deletion incompatibility |
| --- | --- | --- |
| `AuthSession` | Indexed by raw provider subject; the private runtime can delete rows. | The session-store API deletes one session or a verified back-channel subject/session pair, not every session for an account as one closure operation. |
| `UserProfile` | Non-null `ownerKey` primary key with owner RLS. | Deletion is technically permitted to the private role, but no authenticated account-wide workflow coordinates it. |
| `Favorite` | Non-null `(ownerKey, studySpaceId)` primary key with owner RLS. | Same coordination problem as Profile. |
| `Review` | Non-null owner, unique owner/listing pair, owner and moderator RLS, and a trigger that rejects every owner or listing reassignment. | Runtime has no `DELETE`; the trigger also prevents replacing the owner with an unlink marker. A shared tombstone would collide with the unique constraint and permit correlation. |
| `UserReport` | Non-null reporter, partial unique open-report indexes, moderator-only reads/updates, and restrictive target foreign keys. | Runtime has no `DELETE`; replacing every reporter with one tombstone could collide. A report targeting a review also prevents that review from being deleted. |
| `ModerationAction` | Non-null moderator; immutable to runtime; restrictive foreign keys to reviews and reports. | The moderator association cannot be removed. Restrictive foreign keys can force reports past their 90-day maximum or non-public reviews past their justified hold. |
| `RateLimitBucket` | Keyed HMAC subject, count, and expiry; bounded maintenance cleanup. | It cannot be enumerated reliably by account without reproducing every scope/window key. Immediate removal would also weaken abuse controls. Let existing short windows expire. |

The application public-review query selects only approved reviews and explicit public fields. At the database layer, RLS limits `studyspace_app` to approved rows, but its current table-level `SELECT` grant covers every Review column, including the pseudonymous owner key. Before account closure ships, replace that grant with a reviewed public view or column-level grants so a compromised public credential cannot retrieve ownership columns. Profile, Favorite, session, report, and audit tables remain unavailable to the public role. Existing RLS correctly prevents ordinary cross-account access, but RLS does not supply the new unlink/delete capabilities.

## Approved retention and closure rules

| Data | Approved behavior |
| --- | --- |
| Profile and preferences | Delete during local account closure. |
| Favorites | Delete during local account closure. |
| Active application sessions | Delete all sessions for every identity mapped to the closing StudySpace account in the local closure transaction. Existing cookies must stop resolving immediately after commit. |
| Expired application sessions | Remove no later than seven days after expiry. Earlier cleanup is permitted. |
| Approved, published reviews | Retain only after removing the account association. Keep the listing, rating, text, publication state, and timestamps needed for the public contribution. Every retained text requires human assessment; automated email, phone, URL, or handle signals are triage only. Text or context can still identify the author, so this is unlinking/pseudonymization, not guaranteed anonymization. |
| Pending, rejected, and withdrawn reviews | Delete during closure unless a documented open-report, report-evidence, audit-evidence, or approved security/legal hold requires temporary restricted retention. Unlink the account during any hold, keep the row non-public, and delete it when the dependency expires. |
| Hidden reviews | Keep hidden and unlink the account only while a documented open report, unexpired report/audit dependency, or approved hold requires evidence. Otherwise delete during closure. A hidden review must never become public merely because its account closes. |
| Reports submitted by the account | Remove the reporter association immediately. Keep an open report until resolution. Delete a resolved report no later than 90 days after `resolvedAt`; there is no ordinary extension beyond this report limit. Report details can themselves identify the reporter and require minimization review. |
| Moderation actions performed by the account | Preserve the action, target reference, and timestamp only as long as necessary, while removing the moderator association at closure. Delete no later than 180 days after creation unless a documented, specifically approved, time-bounded security or preservation exception is active. |
| Rate-limit buckets | Do not broaden cleanup privilege or remove an active abuse-control window. Existing keyed buckets expire through the restricted bounded cleanup. |

An exception must name a case reference, approving authority, reason, review date, and finite expiry. It must preserve the minimum evidence, never restore account ownership, and be auditable. An open report may have no fixed review-retention deadline until it is resolved; every other held review and every audit exception must have one.

## Safe code implemented in Phase 16H

The pure planner in `src/features/account-lifecycle/deletion-policy.ts`:

- requires the deliberate phrase `DELETE MY ACCOUNT` exactly;
- encodes the 90-day report, 180-day audit, and seven-day expired-session limits;
- distinguishes every review status, including hidden reviews and open-report holds;
- marks every approved retained review for human text review and returns only signal categories, never its text;
- requires resolved reports to have a resolution timestamp and open reports not to have one;
- requires an operator-reviewed case reference before an audit exception can extend its normal deadline;
- accepts no provider subject, owner key, cookie, or database client and performs no mutation.

It is a policy regression aid, not authorization, an execution plan, or proof that a row is safe to publish.

## Required authenticated workflow

The future self-service operation must use a POST Server Action or route with the existing exact-origin check and framework CSRF protection. It must:

1. Resolve a current verified server session and derive the account on the server. Never accept a subject, owner key, account ID, moderator flag, or deletion target from form data.
2. Require recent Auth0 re-authentication. The current custom session row does not retain `auth_time`, so this needs a reviewed Auth0/session-store change before release.
3. Show the consequences and require the exact confirmation phrase. A GET request, email address, or display label is never sufficient authorization.
4. Rate-limit requests by a server-side keyed account digest.
5. Acquire a database account-row lock and an account-scoped transaction lock. Mark the account `CLOSING` before collecting a bounded dry-run summary.
6. Make every account mutation take the same account lock and verify `ACTIVE` state. A mutation that began before closure must either commit before the closure reads it or wait and fail after the account becomes `CLOSING`; it cannot recreate data after deletion.
7. In one PostgreSQL transaction, delete Profile/Favorites/all application sessions, unlink or delete reviews/reports/audit actors according to the table above, record non-sensitive counts, and mark local closure complete. Any error rolls back the whole local operation.
8. Return only an opaque request reference and state. Do not log subjects, owner keys, review/report text, cookies, tokens, connection URLs, or dry-run row identifiers.
9. Complete provider work through a retryable outbox after local commit. PostgreSQL and Auth0 cannot share a transaction.

Idempotency must be database-enforced by one closure request per account generation. A repeated request returns the existing state and cannot target another account. Recovery for a person who cannot authenticate is a separate operator-reviewed process and is not authorized by possession of an email address alone.

## Proposed migration and privilege design — approval required

No migration has been created or applied. The preferred design replaces deterministic row ownership with a random internal account generation:

1. Add private `Account`, `AccountIdentity`, and `AccountClosure` records. An account has a random UUID and `ACTIVE`, `CLOSING`, or `CLOSED` state. One account can map multiple verified issuer/subject identities. Store only the minimum identity digest and any provider outbox material needed for retries; encryption/key management and the closure-ledger retention period require separate approval.
2. Backfill existing owner keys to accounts without reversing the hash. On a verified sign-in, derive the legacy key once, attach that account to the verified identity, and move the session to the random account ID.
3. Replace Profile/Favorite ownership with a required account ID. Make Review, UserReport reporter, and ModerationAction moderator account IDs nullable and add unlink timestamps. A retained row has `NULL` ownership, not a reusable shared tombstone.
4. Replace the review owner/listing constraint with a uniqueness rule for non-null active account IDs. Keep listing association immutable. Continue to prevent every ordinary owner reassignment; only the reviewed lifecycle function may change an actor reference from one account to `NULL`.
5. Give `ModerationAction` an immutable target reference independent of its optional review/report foreign key. Change target foreign keys to permit the referenced private evidence to expire without deleting the audit event or keeping a report past 90 days.
6. Add retention-hold metadata with a bounded reason, case reference, approval, review date, and expiry. No generic indefinite hold is allowed.
7. Move RLS context from the deterministic owner key to the random account ID and require an `ACTIVE` account for all private writes. Public review policies remain restricted to approved rows and public fields.
8. Implement one fixed-search-path, security-definer lifecycle function owned by a non-login administrative owner. Grant only `EXECUTE` to a separate NOLOGIN lifecycle permission role and environment-specific login; do not add table privileges or lifecycle execution to `studyspace_app`, `studyspace_saved`, or `studyspace_maintenance`.
9. Replace the public role's table-wide Review read with a public view or column-level grants for only `id`, `studySpaceId`, `rating`, `body`, `status`, and `publishedAt`, while RLS continues to enforce approved-row visibility. Test denial of actor and internal timestamp columns directly with the runtime login.
10. Update default privileges and staging catalog verification so the new tables and function are denied to public/runtime roles except for the exact grants reviewed above.

This design resolves re-registration and collision risks better than replacing keys with a constant or random string in the existing columns. It is a destructive schema and authorization change and requires migration review, PostgreSQL integration tests, local data rehearsal, backup approval, and explicit owner approval before creation or application.

## Re-registration, linked identities, moderators, and holds

- **Re-registration:** after completed closure, a later verified login creates a new random account generation. It must not regain retained reviews, reports, audit actions, Profile, or Favorites from the closed account. It may submit a new review for a listing; that is a new contribution and is still subject to moderation and abuse controls. The current deterministic owner-key model cannot provide this guarantee without the proposed migration.
- **Linked identities:** close every identity already mapped to the same internal account and revoke all of their application sessions. Do not expand deletion by matching email addresses. Auth0-linked identities that the application has never mapped require verified Auth0 Management API behavior; until then, public promises must be limited to the identity/account boundary actually verified.
- **Moderator accounts:** before local closure, an operator must remove every mapped subject from `AUTH0_MODERATOR_SUBJECTS` and deploy that revocation. Closure then unlinks the moderator actor while preserving the action/target/time for the approved retention window. Re-registration does not restore moderator status.
- **Holds:** a hold never preserves account ownership. It delays deletion only for the minimum evidence and only until its documented deadline. Resolved reports still have the firm 90-day maximum; audit exceptions beyond 180 days require specific approval and periodic review.

## Auth0, Google, and backup limits

Local closure and provider deletion are different operations. StudySpace currently has no Auth0 Management API scope or verified user-deletion procedure. Deleting a StudySpace or Auth0 user does not delete the person's Google account or data retained independently by Google.

Before any public deletion promise:

- verify the Auth0 tenant's user deletion, linked-identity, log-retention, and provider-session behavior with dedicated test accounts;
- decide whether closure deletes the Auth0 tenant user or only StudySpace data and connection authorization;
- store any retry outbox payload encrypted and remove it after provider completion under an approved limit;
- verify Neon backup/recovery retention. Current staging recovery history is only six hours and the available plan has no scheduled snapshots; that staging fact is not a production policy;
- make restore tooling replay completed closures before restored traffic is enabled, then prove it in an isolated full-data restore rehearsal.

Until those checks pass, `/privacy` must not promise a completion time, perfect anonymization, provider deletion, or deletion from backups.

## Cleanup schedule and monitoring proposal — not active

Use an hourly job with a restricted maintenance login and bounded security-definer functions. Each invocation should delete at most 1,000 rows per category using `FOR UPDATE SKIP LOCKED`. Make expired sessions eligible immediately, ordinary resolved reports eligible at 89 days, and ordinary audits eligible at 179 days; the one-day buffer allows missed or full-batch runs without intentionally crossing the seven-, 90-, or 180-day maximum. Apply the same pre-deadline buffer to approved exception expiries and delete non-public held reviews when their dependencies have ended.

The maintenance identity must have function execution only, not table reads/deletes or lifecycle execution. Alert on function failure, missed hourly runs, oldest eligible row age, repeated full batches, invalid/open-ended holds, and any row beyond its approved deadline. The existing rate-limit cleanup workflow is a pattern, not authorization to add these functions, credentials, secrets, or schedules.

## Required verification and remaining approval gates

Before the workflow can be enabled, tests must prove:

- guests and another account cannot inspect, dry-run, confirm, or execute a closure;
- browser-supplied identity and role values are ignored;
- exact confirmation and recent re-authentication are enforced;
- all mapped sessions are invalid immediately after local commit;
- Profile/Favorites are deleted only for the closing account;
- approved reviews are unlinked, text-reviewed, still public only when approved, and never reclaimed after re-registration;
- every non-public and hidden-review disposition, report deadline, audit deadline, and hold transition works;
- report/audit foreign keys do not extend retention accidentally;
- failure at each stage rolls back, retries are idempotent, and concurrent writes cannot recreate data;
- moderator allowlist revocation and linked-identity handling work with real Auth0 accounts;
- a full isolated backup restore re-applies completed closures before serving traffic.

Explicit approval is still required for the schema migration, lifecycle database identity and grants, Auth0/session changes, Auth0 Management API access, cleanup functions and schedule, production backup/recovery policy, public policy wording, and any first live deletion. No staging or production deletion should be attempted before all of those gates are satisfied.

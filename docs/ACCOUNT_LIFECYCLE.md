# StudySpace — Account lifecycle and deletion design

Status: Phase 17 database foundation implemented and rehearsed; no user-facing or cloud deletion workflow

Public support and privacy contact: [sidstelq11@gmail.com](mailto:sidstelq11@gmail.com).

The Phase 17 expand migrations, authorization hardening, and owner-only repository operations implement the database foundation. They have been exercised against isolated local PostgreSQL 17 and 18 databases and a disposable Neon PostgreSQL 18 branch. They have not been applied to the parent staging branch. There is still no account-deletion route, button, dedicated lifecycle login, Auth0 Management API integration, provider-completion worker, or retention-cleanup schedule. The approved dispositions below remain engineering requirements, not a public claim that deletion is available.

## Current identity and data boundary

Auth0 verifies the session. The application derives a deterministic SHA-256 identity key from the configured issuer and verified subject, then resolves it through a narrow security-definer function to a random internal `Account` UUID. `AccountIdentity` records each identity generation. Profile, Favorite, Review, report-reporter, moderation-actor, and new sessions use the random account UUID. The identity key remains pseudonymous and reproducible; it is not anonymous.

Existing deterministic ownership values are preserved as generation-one `AccountIdentity` rows during migration without reversing their hashes. Existing `AuthSession` rows cannot be associated in SQL because the issuer is not stored in the database. A passive session read may attach only to an already-active generation; it never creates a generation. Only the verified fresh-login session write may create the next generation after provider completion. New and updated sessions always store `accountId`, and every stored account ID is checked against the subject-derived identity before use.

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
| `AuthSession` | Optional `accountId`, raw provider subject, session identifiers, display label, and expiry. | Closure deletes mapped rows and account state invalidates legacy unmapped rows. Physical cleanup of expired/unmapped rows still needs the approved scheduled job. |
| `UserProfile` | Required random `accountId` primary key with account RLS. | Owner-only closure finalization deletes it; no runtime deletion privilege or UI exists. |
| `Favorite` | Required `(accountId, studySpaceId)` primary key with account RLS. | Owner-only closure finalization deletes it; normal writes require an `ACTIVE` locked account. |
| `Review` | Nullable `ownerAccountId`, partial unique owner/listing index, unlink timestamp, retention assessment fields, RLS, and immutable listing/owner and approval-transition triggers. | Only migration-owner lifecycle context can change a non-null owner to `NULL`; relinking is rejected. Approved retention blocks until a human records `RETAIN`. Reviewer unlink time preserves evidence that an accountable reviewer was recorded. |
| `UserReport` | Nullable reporter, unlink timestamp, independent immutable target UUID, moderator-only reads/updates, and target foreign keys that may become null. | Closure removes free-form details before unlinking the reporter. It can delete expired resolved reports without losing the moderation target reference. |
| `ModerationAction` | Nullable moderator, unlink timestamp, independent immutable target UUID, and nullable target foreign keys. | Closure unlinks retained actor associations. Bounded `RetentionHold` rows can justify a finite exception; scheduled expiry enforcement remains unimplemented. |
| `Account`, `AccountIdentity`, `AccountClosure`, `RetentionHold` | RLS enabled with no runtime table grants. One active identity generation is enforced by a partial unique index. | Destructive operations require the migration owner today. A dedicated lifecycle identity and audited provider worker are rollout gates. |
| `RateLimitBucket` | Keyed HMAC subject, count, and expiry; bounded maintenance cleanup. | It cannot be enumerated reliably by account without reproducing every scope/window key. Immediate removal would also weaken abuse controls. Let existing short windows expire. |

The application public-review query selects only approved reviews and explicit public fields. PostgreSQL grants `studyspace_app` only `id`, `studySpaceId`, `rating`, `body`, `status`, and `publishedAt`; actor, lifecycle, assessment, and internal timestamp columns remain denied. Profile, Favorite, session, account-generation, report, hold, and audit tables remain unavailable to the public role.

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

## Implemented local foundation

The pure planner in `src/features/account-lifecycle/deletion-policy.ts`:

- requires the deliberate phrase `DELETE MY ACCOUNT` exactly;
- encodes the 90-day report, 180-day audit, and seven-day expired-session limits;
- distinguishes every review status, including hidden reviews and open-report holds;
- marks every approved retained review for human text review and returns only signal categories, never its text;
- requires resolved reports to have a resolution timestamp and open reports not to have one;
- requires an operator-reviewed case reference before an audit exception can extend its normal deadline;
- accepts no provider subject, owner key, cookie, or database client and performs no mutation.

It is a policy regression aid, not authorization, an execution plan, or proof that a row is safe to publish.

`src/features/account-lifecycle/repository.ts` adds narrowly scoped operations:

- identity resolution creates or returns an `ACTIVE` random account generation under an advisory and row lock;
- every Profile, Favorite, review, report, moderation, and session transaction locks the acting account and fails unless it is `ACTIVE`;
- `beginAccountClosure` locks the verified identity's account, marks it `CLOSING`, creates the one-per-generation closure record, revokes mapped sessions, and revokes any active database moderator grant;
- `finalizeLocalAccountClosure` verifies the same identity belongs to the opaque closure ID, locks all owned review rows, blocks on any unassessed approved review, performs all local dispositions in one transaction, unlinks every mapped identity, and stops at `PROVIDER_PENDING`;
- moderator approval is rejected for an unlinked or inactive review owner, so a held non-public review cannot later become public;
- changing review text clears any prior retention assessment in a database trigger, so later reapproval requires a fresh human assessment before closure can retain the text;
- repeat begin/finalize calls return the same closure state, while another identity cannot finalize the closure;
- a closed generation cannot resolve again until a separately approved provider workflow marks its closure `COMPLETE`.

These operations accept an injected database client and are not connected to an HTTP action. Lifecycle tables have no runtime grants. Passing the ordinary private runtime client to destructive operations therefore fails closed; local integration tests use the isolated migration-owner test client.

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

## Expand/migrate/contract rollout — implemented locally through expand, cloud approval required

The unpublished Phase 17 migrations are an **expand** release. They retain the deployed `ownerKey`, `reporterKey`, and `moderatorKey` columns, backfill random account IDs, and install compatibility triggers that validate and dual-write both representations. The old application can therefore continue reading and writing while migrations run, and the new application can use account IDs after all migrations and runtime grants succeed. The authorization hardening migration adds private `ModeratorGrant` records, replaces the runtime-callable UUID/boolean context function with account/digest verification, and requires the database grant in addition to the Auth0 allowlist. The public role still receives only the six approved Review columns.

Required order:

1. Rehearse the complete migration and grants against a populated PostgreSQL 18 clone; verify the target, recovery point, row counts, ownership, role inheritance, RLS, and current Auth0 issuer-derived keys.
2. Apply all expand migrations and runtime grants before deploying application code. If any migration fails, leave the old application running, repair forward, and rerun; do not deploy Phase 17 code.
3. Run catalog verification plus old-application smoke checks for Profile, Favorites, review/report submission, and moderation. Verify active legacy rows have matching account IDs.
4. Deploy the Phase 17 application with account closure still inaccessible. Verify new sessions, legacy sessions, two-account isolation, moderation, and the passive/fresh identity split.
5. Keep the compatibility columns and triggers through the observation period. During this period an application rollback to the previous release remains schema-compatible.
6. During that same window, legacy policy branches still accept the deployed application's raw transaction settings. Treat the private runtime credential as privileged and monitor access; these branches are a rollback bridge, not authenticated identity evidence.
7. Only after no old deployment or rollback depends on legacy columns may a separately reviewed **contract** migration remove them, remove the raw-setting policy branches, and simplify compatibility policies. That migration is intentionally not present in Phase 17.

New application code is intentionally not compatible with the pre-expand schema; the deployment gate is migration-first. Old-code/new-expanded-schema compatibility is integration-tested. After a future contract migration, rollback means a forward application fix, not redeploying legacy code.

Forward recovery uses the transactional migration boundary: a failed migration rolls back its own changes, while previously completed expand migrations remain compatible with the old release. Do not use ad hoc down migrations. If data recovery is required, stop traffic, restore into an isolated branch, replay completed closure records before serving, verify integrity, and then promote only under a separate approval.

## Migration and privilege design

The local migration implements the reviewed random account-generation design:

1. Add private `Account`, `AccountIdentity`, and `AccountClosure` records. An account has a random UUID and `ACTIVE`, `CLOSING`, or `CLOSED` state. One account can map multiple verified issuer/subject identities. Store only the minimum identity digest and any provider outbox material needed for retries; encryption/key management and the closure-ledger retention period require separate approval.
2. Backfill existing owner keys to accounts without reversing the hash. On a verified sign-in, derive the legacy key once, attach that account to the verified identity, and move the session to the random account ID.
3. Add required Profile/Favorite account IDs and nullable Review, report-reporter, and moderation-actor account IDs with unlink timestamps. Keep legacy columns only for the expand compatibility window. A retained row has `NULL` ownership in both representations, not a reusable shared tombstone.
4. Replace the review owner/listing constraint with a uniqueness rule for non-null active account IDs. Keep listing association immutable. Continue to prevent every ordinary owner reassignment; only the reviewed lifecycle function may change an actor reference from one account to `NULL`.
5. Give `ModerationAction` an immutable target reference independent of its optional review/report foreign key. Change target foreign keys to permit the referenced private evidence to expire without deleting the audit event or keeping a report past 90 days.
6. Add retention-hold metadata with a bounded reason, case reference, approval, review date, and expiry. No generic indefinite hold is allowed.
7. Move RLS context from the deterministic owner key to the random account ID and require an `ACTIVE` account for all private writes. Public review policies remain restricted to approved rows and public fields.
8. Identity resolution and account-context functions use fixed search paths, owner execution, input validation, and exact `EXECUTE` grants to `studyspace_saved`. Normal context requires a matching active account/digest pair; moderator context additionally requires an unrevoked private `ModeratorGrant`. Because the application shares one database login, these checks prevent accidental and application-path escalation but do not authenticate the human caller independently of the trusted server credential. Destructive closure is not a security-definer function and has no runtime grant or route. A separate NOLOGIN lifecycle permission role and environment-specific login remain required before any deployed worker can call it.
9. Preserve the public role's column-level Review grants for only `id`, `studySpaceId`, `rating`, `body`, `status`, and `publishedAt`, while RLS continues to enforce approved-row visibility. Test denial of actor, lifecycle, assessment, and internal timestamp columns directly with the runtime login.
10. Update default privileges and staging catalog verification so the new tables and function are denied to public/runtime roles except for the exact grants reviewed above.

This design resolves re-registration and collision risks better than replacing keys with a shared tombstone. The expand chain preserved populated synthetic legacy data in disposable PostgreSQL 18 and Neon rehearsals. Applying it to the parent staging branch or any production environment still requires backup/recovery review, exact pending-migration checks, and explicit owner approval.

## Re-registration, linked identities, moderators, and holds

- **Re-registration:** identity resolution returns `NULL` while the prior closure is `PROVIDER_PENDING`. Only a separately verified provider-completion process may mark it `COMPLETE`; a later verified login can then create the next generation. Retained rows have `NULL` actor associations and cannot be reclaimed by that generation.
- **Linked identities:** close every identity already mapped to the same internal account and revoke all of their application sessions. Do not expand deletion by matching email addresses. Auth0-linked identities that the application has never mapped require verified Auth0 Management API behavior; until then, public promises must be limited to the identity/account boundary actually verified.
- **Moderator accounts:** an operator provisions `ModeratorGrant` only after matching a verified Auth0 subject to its active random account generation. Local closure revokes that grant transactionally; the operator must also remove every mapped subject from `AUTH0_MODERATOR_SUBJECTS` and deploy the application-side revocation. Closure then unlinks the moderator actor while preserving the action/target/time for the approved retention window. Re-registration creates a new account generation and does not inherit the grant or moderator status.
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

Explicit approval is still required to apply the migrations to the parent staging branch or production, create the dedicated lifecycle identity and grants, expose a reauthenticated confirmation flow, add Auth0 Management API access and a retryable provider outbox, implement retention cleanup functions and schedules, verify linked identities and moderator revocation, approve backup/recovery behavior and public policy wording, and perform any first live deletion. No staging or production deletion should be attempted before those gates are satisfied.

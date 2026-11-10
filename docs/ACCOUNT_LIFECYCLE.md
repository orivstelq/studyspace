# StudySpace — Account lifecycle and deletion design

Status: design only; owner and security review required

No account-wide deletion endpoint, database function, or provider deletion integration exists. This document describes the decisions and controls required before destructive deletion can be implemented. It does not authorize an operator to delete data manually.

## Current account boundary

Auth0 verifies the session. StudySpace stores the provider subject and session identifiers in `AuthSession`, then derives an issuer-scoped `ownerKey` hash for private application records. The hash is pseudonymous, not anonymous: the same issuer and subject produce the same value again.

The current user controls are narrower than account deletion:

- sign-out removes the current server session;
- a favorite can be removed individually;
- profile preferences can be changed, but the profile row cannot be deleted through the UI;
- a review can be edited or withdrawn, but withdrawal retains the row;
- a submitted report cannot be read back or deleted by its reporter;
- moderation audit rows cannot be changed or deleted by runtime roles.

## Decisions required before implementation

The owner must approve and publish:

1. A verified support channel and a method for requests when a user cannot sign in.
2. Whether deletion covers only StudySpace data or also the Auth0 tenant user record. StudySpace cannot delete a Google account.
3. Retention periods for active data, expired sessions, reports, moderation evidence, provider logs, and backups.
4. Whether approved review text remains public after account deletion, is anonymized, or is removed.
5. Whether report details must be retained for abuse handling and, if so, which fields are necessary.
6. How moderator-attributed audit events remain trustworthy after a moderator requests deletion.
7. Applicable age, jurisdiction, identity-verification, appeal, and legal-hold requirements.
8. How a restored backup re-applies completed deletion requests before serving traffic.

Until these decisions are approved, the application must describe account-wide deletion as unavailable.

## Proposed request controls

A future self-service request should:

- require a current verified server session and recent re-authentication;
- use the existing exact-origin and framework CSRF protections;
- derive the provider subject and `ownerKey` on the server, never accept either from a form;
- require a clear confirmation that names the effects that the approved policy selects;
- rate-limit requests and prevent concurrent requests for the same owner;
- treat moderator accounts as a reviewed special case because their audit history must remain intelligible;
- offer a separately reviewed recovery path for a user who cannot authenticate.

No deletion URL should be accepted through a public GET request. Logs and user responses must not contain the provider subject, session cookie, database URL, or owner key.

## Proposed database transaction

Local deletion should run through one narrowly scoped server operation and one PostgreSQL transaction. The normal browser runtime must not gain unrestricted delete or row-level-security bypass privileges.

The operation should acquire an account-scoped transaction lock, re-check the authenticated identity, collect bounded counts, and apply the approved disposition in dependency order:

| Data | Proposed treatment | Unresolved point |
| --- | --- | --- |
| `AuthSession` | Delete every application session for the verified subject so all current cookies stop resolving. | Define cleanup for already expired rows and sessions in other environments. |
| `UserProfile` | Delete the owner-scoped row. | Confirm whether an export is offered first. |
| `Favorite` | Delete every owner-scoped row. | None beyond backup handling. |
| `Review` | Either remove the content or retain only approved content with ownership irreversibly unlinked. Withdrawn status alone is not deletion. | Content ownership, public-history, and moderation policy. |
| `UserReport` | Delete, redact, or retain the minimum approved abuse record while irreversibly unlinking the reporter. | Necessary evidence and retention period. |
| `ModerationAction` | Preserve the action, target, and timestamp needed for audit integrity while applying the approved treatment to the moderator identifier. | Whether identifier tombstoning is compatible with the audit policy. |
| `RateLimitBucket` | Do not broaden maintenance privileges. Existing keyed hashes expire through bounded cleanup. | Decide whether account deletion should remove known account-scoped buckets or retain them briefly for abuse controls. |

Any error must roll back every local change. A retry must be idempotent and must not target another account. Successful completion should return only a non-sensitive request reference and result state.

## Identity unlinking constraint

Deleting `AuthSession` removes the stored raw subject, but the deterministic `ownerKey` can be recreated if the same provider identity signs in again. Retaining that key on reviews, reports, or moderation records would reconnect a new session to historical rows.

Irreversible unlinking therefore requires a reviewed schema and migration design. One possible design is to replace account-derived keys on retained records with unique random tombstone identifiers through a deletion-only database function. The current review-identity trigger deliberately blocks owner reassignment, and runtime roles cannot update audit rows, so this cannot be added as ordinary application code or by weakening existing grants. Any implementation requires a new threat model, narrowly scoped execution privilege, rollback tests, and proof that normal review edits still cannot change ownership.

If the owner instead chooses to preserve the existing pseudonymous key for audit reasons, the public documentation must not call that data deleted or anonymous.

## Auth0 and upstream providers

Local PostgreSQL deletion and Auth0 tenant deletion are separate systems and cannot share one transaction. The implementation must define ordering, retry, and visible status before it claims provider deletion.

- Deleting the local account first must not lose the durable state needed to finish an approved Auth0 deletion.
- Deleting the Auth0 user first must not strand local data without a verified way to identify it.
- Provider failures must remain pending and observable without logging tokens or account claims.
- Removing a StudySpace/Auth0 account does not delete the person's Google account or data Google retains under its own terms.

The current application has no Auth0 Management API access and should not receive it until this workflow is approved.

## Backups and restoration

A completed deletion may remain in provider backups until the approved backup window expires. Production documentation must state that window accurately. Restore procedures must replay or reapply deletion records before restored data is exposed; otherwise a restore can resurrect deleted account data.

The deletion record itself should contain only the minimum information needed to prove and reapply completion. Its fields and retention are owner decisions and require a migration review.

## Required verification

Before release, automated PostgreSQL integration and application tests must prove:

- a guest or another account cannot request deletion;
- browser-supplied subjects, owner keys, and moderator flags are ignored;
- favorites and profile data are removed only for the requesting owner;
- the selected review and report disposition preserves foreign-key integrity;
- retained community and moderation records cannot be re-linked after a new login;
- moderation audit targets and timestamps survive as required;
- all sessions for the account are invalid after completion;
- a failure at each transaction stage rolls back all local changes;
- repeated requests are safe and return the same completed outcome;
- concurrent writes cannot recreate private rows during deletion;
- backup-restore rehearsal does not resurrect a completed request.

Live Auth0 verification must remain separate from mocked or database-only tests.

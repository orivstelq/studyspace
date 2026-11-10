
# StudySpace — Security Specification

Status: Public engineering specification; release controls remain under review
Classification: Public

Private vulnerability reports should follow the repository [security policy](../SECURITY.md). This document describes engineering controls and known limitations; it is not a claim that every external production prerequisite is complete.

## 1. Security Objectives

StudySpace must protect user accounts, personal
information, application integrity, and system
availability.

Security must be considered during design,
implementation, testing, and deployment.

A successful build or clean dependency audit
does not prove the application is secure.

## 2. Trust Boundaries

Treat the following as untrusted:

- Browser requests and form submissions
- URL parameters and query strings
- Cookies until cryptographically verified
- User-generated reviews and reports
- Third-party API responses
- Imported data and uploaded files

The browser must never be trusted to establish
identity, ownership, or administrative permissions.

## 3. Authentication

Use an established, maintained authentication
solution instead of custom authentication code.

Requirements:

- Server-verified sessions
- Secure, HttpOnly cookies where applicable
- Appropriate SameSite and Secure attributes
- Session expiration and revocation
- Protection against account enumeration
- Rate limiting for sensitive operations

Passwords must never be logged or stored in plaintext.

## 4. Authorization

Enforce authorization on the server for every
protected read, write, update, and delete.

Roles:

Guest:
- View published study spaces
- Search and filter public listings

Authenticated User:
- Guest permissions
- Manage own favorites
- Manage own profile
- Submit reports or reviews
- Edit own contributions where permitted

Administrator:
- Review submitted content
- Moderate listings and reports
- Manage authorized administrative operations

An admin role must be assigned through a trusted
server-side process.

Never trust client-supplied role or user IDs
as proof of authorization.

## 5. Object-Level Access Control

For every private resource operation:

1. Verify the session.
2. Identify the authenticated user.
3. Validate the requested resource identifier.
4. Verify ownership or appropriate role access.
5. Perform the authorized operation.
6. Return only permitted information.

Test attempts to access another user's resources.

## 6. Input Validation

Validate all externally supplied data at
server entry points.

Use schemas with:

- Explicit types
- Length limits
- Required and optional fields
- Allowed values
- Numeric bounds
- Reasonable collection limits

Reject malformed and unexpected input.

Validation alone does not prevent every form
of injection or application vulnerability.

## 7. Database Security

Use parameterized queries or safe ORM methods.

Requirements:

- No database credentials in browser bundles
- Least-privilege database users
- Foreign keys and uniqueness constraints
- Appropriate transactions
- Restricted access to private data
- Controlled schema migrations

Avoid raw SQL unless required and reviewed.

## 8. Application Security

### Cross-Site Scripting

- Render user content as text by default
- Avoid unsafe HTML rendering
- Sanitize HTML if rich text is introduced
- Use appropriate output encoding

### Cross-Site Request Forgery

- Review cookie-based mutation endpoints
- Use the authentication framework's
  recommended CSRF protections
- Validate request origin where applicable

### Security Headers

Configure and test appropriate:

- Content-Security-Policy
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- HSTS in HTTPS production environments

Test policies before enforcing restrictive
settings that might break legitimate resources.

### Rate Limiting

Apply rate limits to:

- Authentication attempts
- Account recovery
- Report submissions
- Reviews
- Expensive search operations

Limits must be enforced server-side.

### Error Handling

- Do not expose stack traces to users
- Do not leak SQL statements or secrets
- Use consistent public error responses
- Log technical details securely

## 9. Secrets Management

- Never commit real secrets
- Use .env files locally
- Commit .env.example with placeholders only
- Keep privileged credentials server-side
- Avoid NEXT_PUBLIC_ for secrets
- Rotate exposed credentials immediately

Inspect Git history and deployment configuration
for accidental secret exposure.

## 10. Privacy

Collect only information necessary to operate
the product.

Avoid collecting precise user location unless
the feature requires it and the user consents.

Do not disclose private user activity through
public APIs or analytics.

Define and operationally enforce data retention and deletion policies before enabling unrestricted public accounts. A browse-only release may proceed without account creation when authentication is deliberately left unconfigured and the public pages accurately disclose that state.

Phase 16H approves engineering limits for account closure: Profile and Favorites are deleted; application sessions are revoked; approved reviews may remain only after ownership is removed and identifying text is assessed; non-public reviews are deleted except for justified temporary holds; reports are unlinked and removed no later than 90 days after resolution; moderation/security audit records are removed no later than 180 days except for documented limited exceptions; and expired sessions are removed within seven days. Phase 17 implements the local database foundation, transaction tests, and a bounded maintenance-only cleanup function and schedule, but no parent-cloud migration, user workflow, provider deletion, or deployed lifecycle cleanup is active. The public `/privacy` and `/terms` pages must not promise deletion timing, provider deletion, backup deletion, or perfect anonymization until those operations and backup recovery have been verified. `docs/ACCOUNT_LIFECYCLE.md` is the authoritative implementation design; `docs/DATA_REQUESTS.md` records the manual request procedure and remaining operational blockers.

## 11. Dependency and Supply-Chain Security

- Maintain package-lock.json
- Use npm ci in automated build environments
- Run npm audit regularly
- Review dependency changes
- Avoid unverified installation scripts
- Review licensing before adopting code
- Use automated dependency update reviews

Do not blindly execute npm audit fix --force.

Document major-version overrides and validate
their compatibility during upgrades.

## 12. Logging and Monitoring

Record relevant operational and security events.

Never log:

- Passwords
- Authentication tokens
- Session cookies
- Private credentials
- Unnecessary personal information

Monitor repeated authorization failures,
suspicious request patterns, and error spikes.

## 13. Required Security Tests

Before production deployment, test:

- Unauthenticated access to private endpoints
- Unauthorized access to another user's data
- Unauthorized administrative operations
- Invalid and oversized inputs
- Injection attempts
- Rate-limit enforcement
- Session expiration and revocation
- CSRF protections for relevant mutations
- Safe rendering of untrusted text
- Secret exposure in browser bundles

## 14. Threat Model

Primary threats:

- Credential stuffing
- Account takeover
- Broken object-level authorization
- Unauthorized data modification
- Stored cross-site scripting
- Cross-site request forgery
- Injection attacks
- Denial of service
- Dependency compromise
- Secret leakage

Threat severity and mitigation effectiveness
must be reassessed as the product evolves.

## 15. Security Release Gate

A feature cannot be considered production-ready
until:

- Relevant authorization checks exist
- Inputs are validated
- Sensitive data is protected
- Security tests pass
- Known vulnerabilities are reviewed
- Deployment secrets are configured securely
- The feature's threat model is updated

For public v1, browse-only traffic and authenticated accounts have separate gates. Public browsing still requires the migration-first rollout, runtime-grant verification, HTTPS/header checks, rate-limit ingress verification, monitoring, and rollback readiness. Authenticated enrollment additionally requires finalized privacy and terms decisions, production social-connection credentials, operational retention cleanup, live two-account verification, and a moderator workflow test. Account deletion UX may remain deferred only while the public privacy page accurately discloses its absence and the operator has a reviewed manual process for data requests.

## Current implementation notes

- Saved mutations use the framework's same-origin protection and verify the request origin against the configured application URL. The server derives the favorite owner from the Auth0 session.
- Favorite access uses an explicit owner predicate and a PostgreSQL policy with transaction-local owner context. The Saved runtime role is trusted to set that context. The directory role has no access to private tables.
- Profile reads and writes use the same verified owner context. Server and database validation limit preferences to public category and amenity values, and row-level security prevents cross-owner access.
- Moderator status first comes from an exact Auth0 subject allowlist in the server environment. The database additionally requires an active, owner-provisioned `ModeratorGrant` for the resolved random account generation. Every admin page load and mutation re-verifies the session; browser-supplied roles, owner keys, account IDs, and PostgreSQL-setting values are ignored. Neither the runtime role nor the application can grant itself access to the private grant table.
- Current application transactions call fixed-search-path functions with the random account ID and its matching issuer/subject digest. PostgreSQL verifies that pair against an unlinked identity on an `ACTIVE` account and separately checks `ModeratorGrant` before enabling moderator policies. The former UUID/boolean context function is no longer executable by runtime roles. Transaction settings are context transport, not authentication evidence: the shared `studyspace_saved` credential and trusted server process remain inside the authorization boundary.
- Review policies separate owner drafts from approved public DTOs. Editing an approved review changes that row to pending and temporarily removes it from public view; the MVP does not retain a separately published prior version. Withdrawals are non-destructive, and invalid status transitions fail without an audit row. A trigger prevents owner and listing reassignment after creation.
- Report insertion returns no identifier because submitters have no report read policy. Moderators alone can read and resolve reports. Successful moderation and resolution writes an immutable `ModerationAction` row in the same transaction.
- Auth0 provides the login flow and cookie cryptography. Sessions are non-rolling, capped at eight hours, and invalidated by deleting the server-side session. The SDK makes the session cookie HttpOnly; the app explicitly selects SameSite=Lax and Secure on HTTPS origins. Next.js Server Action origin checks are supplemented by an exact application-origin check on mutations.
- Account labels come only from the verified Auth0 session. The app requests `profile` and `email`, resolves one bounded display label, and stores no separate email/name fields or provider tokens. Header and Profile read it in uncached server components; public reviews and shared caches never receive it.
- Shared PostgreSQL counters rate-limit public directory searches, review submissions, reports, and moderation mutations across application instances. Subjects are scoped HMAC digests. Public APIs fail closed with `503` if the shared limiter is unavailable and return `429` plus retry metadata when a limit is exhausted.
- Security headers apply to all routes. HSTS and insecure-request upgrades activate only for a production HTTPS origin. The CSP has no `unsafe-eval`, wildcard source, external script host, frame, object, or inline-event permission. It permits inline framework scripts and styles because nonce CSP would disable the current Next.js partial prerendering. It is not nonce-equivalent: a successful markup injection that creates an inline script can still execute. This residual risk and the rendering tradeoff are tracked in the deployment guide.
- The runtime-grant script must run as the table-creating migration owner. It revokes default runtime access to future tables so every new public or private table requires an explicit grant.
- Phase 16H adds a pure, non-mutating account-deletion policy planner and unit tests. It encodes the approved time limits, explicit hidden-review behavior, exact confirmation phrase, report-state validation, audit-exception reference requirement, and identifying-text signals. It remains a policy aid rather than authorization.
- Phase 17C hardens the local foundation with passive identity lookup for existing sessions, subject/account binding checks, review-row locks during finalization, database-enforced denial of approval for unlinked or inactive owners, reviewer-unlink evidence, restrictive actor foreign keys, and removal of report free text before reporter unlinking. Approved review finalization requires a recorded human `RETAIN` assessment; any later body edit clears it. No public deletion operation exists.
- The unpublished database rollout is expand-first: legacy actor columns remain temporarily and compatibility triggers dual-write them with account IDs. This keeps the deployed application compatible while all migrations and grants finish. The destructive contract migration is deferred and requires a separate review after rollback to legacy application code is no longer needed.
- `studyspace_app` retains only the six approved public Review columns. `studyspace_saved` has no direct access to Account, AccountIdentity, AccountClosure, RetentionHold, or ModeratorGrant; it can execute only the fixed-search-path identity-resolution and verified-context functions. Closing an account immediately revokes its database moderator grant in the owner-only lifecycle transaction.
- The expand release deliberately retains old owner-key and raw moderator-setting policy branches only for transactions that have not entered verified-context mode. This keeps the currently deployed application rollback-compatible, but a party holding the private database credential can still use those legacy branches. That is a documented temporary risk, not independently authenticated database identity. A separately reviewed contract migration must remove those branches after the legacy rollback window; stronger isolation can then use a dedicated moderator credential/role if required.
- No runtime credential can perform closure. The repository finalizer requires a migration-owner client and is not wired to a route. Before deployment, create a separate restricted lifecycle identity, design its exact functions/grants, require recent Auth0 reauthentication, and complete provider/outbox/recovery testing. Never expose the migration owner to the application runtime.
- Staging separates NOLOGIN permission roles from fixed environment-specific LOGIN identities. Each login inherits exactly one permission role with PostgreSQL 18 membership options `INHERIT TRUE`, `SET FALSE`, and `ADMIN FALSE`; neither kind of runtime role owns objects or belongs to the migration owner. The provisioning scripts abort on the wrong database/major version and never recreate an existing login silently.
- Production requires an explicit trusted client-IP source. Direct Vercel ingress reads only Vercel's `x-vercel-forwarded-for`; ordinary forwarding headers are ignored. Missing or malformed trusted values share one limiter bucket, and missing/unsupported production configuration fails closed. Custom proxy behavior and the deployed Vercel headers still require live verification. Provider edge protections remain necessary for volumetric traffic and Auth0 endpoints.
- Rate-limit cleanup runs through a bounded security-definer function. A no-login maintenance role has function execution but no table privileges; the scheduler login inherits only that role. The hourly GitHub Actions workflow verifies the exact restricted staging identity and runs at most one 1,000-row batch per invocation with lock and statement timeouts. Staging run `42527692806` succeeded on 2026-11-08 with zero deletions.

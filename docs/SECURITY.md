
# StudySpace — Security Specification

Status: Draft v0.1
Classification: Internal engineering documentation

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

Define data retention and deletion policies
before production launch.

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

## Current implementation notes

- Saved mutations use the framework's same-origin protection and verify the request origin against the configured application URL. The server derives the favorite owner from the Auth0 session.
- Favorite access uses an explicit owner predicate and a PostgreSQL policy with transaction-local owner context. The Saved runtime role is trusted to set that context. The directory role has no access to private tables.
- Profile reads and writes use the same verified owner context. Server and database validation limit preferences to public category and amenity values, and row-level security prevents cross-owner access.
- Moderator status comes from an exact Auth0 subject allowlist in the server environment. Every admin page load and moderation action re-verifies the session; browser-supplied roles, owner keys, and PostgreSQL-setting values are ignored.
- `studyspace.is_moderator` is a transaction-local setting controlled by trusted application code using the `studyspace_saved` connection. It is not an independently authenticated database role and does not protect against compromise of that runtime credential or server process. If that stronger boundary becomes necessary, use a separate least-privilege moderator database role and connection after a dedicated design review.
- Review policies separate owner drafts from approved public DTOs. Editing an approved review changes that row to pending and temporarily removes it from public view; the MVP does not retain a separately published prior version. Withdrawals are non-destructive, and invalid status transitions fail without an audit row. A trigger prevents owner and listing reassignment after creation.
- Report insertion returns no identifier because submitters have no report read policy. Moderators alone can read and resolve reports. Successful moderation and resolution writes an immutable `ModerationAction` row in the same transaction.
- Auth0 provides the login flow and cookie cryptography. Sessions are non-rolling, capped at eight hours, and invalidated by deleting the server-side session. The SDK makes the session cookie HttpOnly; the app explicitly selects SameSite=Lax and Secure on HTTPS origins. Next.js Server Action origin checks are supplemented by an exact application-origin check on mutations.
- Account labels come only from the verified Auth0 session. The app requests `profile` and `email`, resolves one bounded display label, and stores no separate email/name fields or provider tokens. Header and Profile read it in uncached server components; public reviews and shared caches never receive it.
- Shared PostgreSQL counters rate-limit public directory searches, review submissions, reports, and moderation mutations across application instances. Subjects are scoped HMAC digests. Public APIs fail closed with `503` if the shared limiter is unavailable and return `429` plus retry metadata when a limit is exhausted.
- Security headers apply to all routes. HSTS and insecure-request upgrades activate only for a production HTTPS origin. The CSP has no `unsafe-eval`, wildcard source, external script host, frame, object, or inline-event permission. It permits inline framework scripts and styles because nonce CSP would disable the current Next.js partial prerendering. It is not nonce-equivalent: a successful markup injection that creates an inline script can still execute. This residual risk and the rendering tradeoff are tracked in the deployment guide.
- The runtime-grant script must run as the table-creating migration owner. It revokes default runtime access to future tables so every new public or private table requires an explicit grant.
- Staging separates NOLOGIN permission roles from fixed environment-specific LOGIN identities. Each login inherits exactly one permission role with PostgreSQL 18 membership options `INHERIT TRUE`, `SET FALSE`, and `ADMIN FALSE`; neither kind of runtime role owns objects or belongs to the migration owner. The provisioning scripts abort on the wrong database/major version and never recreate an existing login silently.
- Production requires an explicit trusted client-IP source. Direct Vercel ingress reads only Vercel's `x-vercel-forwarded-for`; ordinary forwarding headers are ignored. Missing or malformed trusted values share one limiter bucket, and missing/unsupported production configuration fails closed. Custom proxy behavior and the deployed Vercel headers still require live verification. Provider edge protections remain necessary for volumetric traffic and Auth0 endpoints.
- Rate-limit cleanup runs through a bounded security-definer function. A no-login maintenance role has function execution but no table privileges; the scheduler login inherits only that role. The committed hourly GitHub Actions workflow verifies the exact restricted staging identity and runs at most one 1,000-row batch per invocation with lock and statement timeouts. It is not active until it reaches the default branch and its staging environment secret is configured.

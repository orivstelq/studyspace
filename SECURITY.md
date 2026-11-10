# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately to [sidstelq11@gmail.com](mailto:sidstelq11@gmail.com) with “StudySpace security” in the subject. Do not include passwords, session cookies, database credentials, private user data, or working exploits against real accounts. Do not open a public issue until the report has been reviewed.

StudySpace is an independently maintained portfolio project and does not promise a response-time SLA. Reports that clearly identify the affected route or component, expected impact, and safe reproduction steps are the most useful.

## Supported version

Security fixes target the current `main` branch and the actively deployed release. Old commits, preview deployments, and local forks are not supported services.

## Current boundaries

- Authentication is delegated to Auth0 and authorization is rechecked by the server.
- Private PostgreSQL data is protected by least-privilege runtime roles, ownership predicates, and row-level security.
- Moderator access requires both a server-side Auth0 subject allowlist and an active database grant.
- Account-wide deletion is not a released feature. Privacy and retention limitations are disclosed on the public privacy page.

The detailed threat model, controls, residual CSP risk, database trust boundary, and release gates are maintained in [docs/SECURITY.md](docs/SECURITY.md).

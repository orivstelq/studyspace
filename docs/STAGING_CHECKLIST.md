# Staging release evidence checklist

Status values are `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`. A release requires a dated artifact or link for every `PASS`; a check is not satisfied by intent, local success in place of cloud evidence, or an empty status.

## Source and build

| Status | Gate | Required evidence |
| --- | --- | --- |
| NOT RUN | Approved commit | PR #3 commit SHA reviewed; no local-only change assumed deployed |
| NOT RUN | CI | GitHub Actions URL showing lint, typecheck, unit, PostgreSQL 18 integration, production build, public Playwright, and audit results |
| NOT RUN | Secret scan | Reviewed staged-file list and automated scan showing no `.env`, URL, password, cookie, token, or Playwright state |
| NOT RUN | Immutable build | Vercel deployment ID and source commit match |

## Neon database

| Status | Gate | Required evidence |
| --- | --- | --- |
| NOT RUN | Environment identity | Redacted console capture: project `curly-paper-15884428`, AWS US East 2, database `studyspace_staging`, PostgreSQL 18.6 |
| NOT RUN | Backup policy | Recorded retention, RPO, RTO, and successful isolated restore rehearsal |
| NOT RUN | Preflight | Redacted `scripts/staging/preflight.sql` output with expected DB/version/permission attributes |
| NOT RUN | Login identities | Catalog output showing three fixed login roles with no elevated attributes; provisioning transcript excludes secrets and records Neon's plaintext-over-TLS requirement |
| NOT RUN | Membership | `INHERIT TRUE`, `SET FALSE`, `ADMIN FALSE`, exactly one permission role per login |
| NOT RUN | Ownership | All application objects owned by `neondb_owner`; no runtime/permission role owns objects |
| NOT RUN | Migrations | `prisma migrate status` and `_prisma_migrations` show every committed migration exactly once |
| NOT RUN | Grants/defaults | Public database/schema access revoked; temporary future table is private until explicitly granted |
| NOT RUN | Public denial | Application login cannot read private account, report, moderation, session, or rate-limit tables |
| NOT RUN | Owner isolation | Two distinct verified owner contexts cannot read or mutate each other's Favorite/Profile/Review data |
| NOT RUN | Live Favorite RLS probe | Reviewed wrapper fixing libpq `verify-full` with system certificate trust, plus output for restricted-login isolation, rollback, and exact fixture cleanup |
| NOT RUN | Review integrity | Rating/body edit succeeds; owner/listing reassignment fails; approved edit becomes pending/private |
| NOT RUN | Moderator boundary | Browser/non-moderator cannot set moderator authority; valid moderator transitions create audit rows |
| NOT RUN | Reports | Submitter/public cannot read reports; moderator can resolve with an audit row |
| NOT RUN | Cleanup | Maintenance login has function execution only; one 1,000-row bounded batch observed and recorded |
| NOT RUN | Pool capacity | Pooled URLs verified; connection/queue metrics captured under representative concurrency |

## Vercel and network

| Status | Gate | Required evidence |
| --- | --- | --- |
| NOT RUN | Isolation | Dedicated staging project/domain; no production or local secret reused; previews cannot reach staging data by default |
| NOT RUN | Runtime | Node.js 24, Next.js production server, region aligned with Neon US East 2 |
| NOT RUN | Environment | Required variables present in the intended environment; owner/maintenance URLs absent from runtime |
| NOT RUN | HTTPS | HTTP redirects to HTTPS; certificate is valid; HSTS is one year with `includeSubDomains` |
| NOT RUN | Headers | `npm run verify:staging` transcript plus browser network capture |
| NOT RUN | CSP | No required resource violation; `unsafe-inline` residual risk explicitly accepted, not called nonce protection |
| NOT RUN | Forwarded IP | Conflicting user forwarding headers cannot choose limiter identity; Vercel header behavior captured |
| NOT RUN | Rate limiting | Shared thresholds observed across two application instances; 429 metadata and limiter-failure 503 verified |
| NOT RUN | Rollback | Previous immutable deployment promoted successfully without reversing migrations |

## Auth0 and application behavior

| Status | Gate | Required evidence |
| --- | --- | --- |
| NOT RUN | Auth0 isolation | Dedicated staging app/issuer and exact callback/logout/back-channel URLs |
| NOT RUN | Cookies/session | Browser capture shows Secure, HttpOnly, SameSite=Lax; eight-hour non-rolling expiry and invalidation verified |
| NOT RUN | CSRF | Cross-origin mutation rejected; same-origin Server Actions succeed |
| NOT RUN | Signed out | Public/search/details work; Saved/Profile prompt sign-in; private identity and reports absent |
| NOT RUN | Account menu | Real user display/email fallback, keyboard disclosure, Profile, Sign out |
| NOT RUN | Two accounts | Saved/Profile persistence after a fresh session and cross-account isolation |
| NOT RUN | Reviews | Submit, pending invisibility, approve, edit-to-pending, reject, resubmit, approve, withdraw |
| NOT RUN | Moderation | Non-moderator denied; moderator approve/reject/hide and audit evidence |
| NOT RUN | Reports | Private submission, non-disclosure, moderator resolution, audit evidence |
| NOT RUN | Logout | Application session and provider flow invalidate access; stale state cannot reopen private pages |
| NOT RUN | Responsive/a11y | 390 px and desktop screenshots; no horizontal overflow; keyboard-only navigation record |

## Operations and approval

| Status | Gate | Required evidence |
| --- | --- | --- |
| NOT RUN | Monitoring | Owners and tested alerts for errors, latency, auth, DB saturation/storage, 429/503, cleanup backlog |
| NOT RUN | Cleanup schedule | Approved restricted scheduler, secret location, cadence, last count, and failure alert |
| NOT RUN | Incident access | Named operator can revoke/rotate each login and Auth0/Vercel secret without code change |
| NOT RUN | Deployment approval | Explicit owner approval references the tested commit and unresolved accepted risks |

Do not merge a failed or blocked gate into a claim of successful staging verification. Record local, CI, staging-cloud, and manual results separately in `docs/VERIFICATION.md`.

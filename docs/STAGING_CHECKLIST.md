# Staging release evidence checklist

Status values are `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`. A release requires a dated artifact or link for every `PASS`; a check is not satisfied by intent, local success in place of cloud evidence, or an empty status.

## Recorded staging evidence — 2026-11-08

| Evidence | Recorded result | Scope limitation |
| --- | --- | --- |
| Vercel deployment | Commit `70e2bf4` is deployed to staging with status Ready. | The Vercel Node.js version override warning remains unresolved. |
| Manual Auth0/application exercise | Login, logout, separate accounts, Profile preferences, public directory, Favorites, review submission and withdrawal, and report submission worked through the staging UI. | Manual evidence only; authenticated Playwright and moderator approval/rejection were not run. |
| Cross-account isolation | Profile and Favorites stayed isolated between two accounts, and the second account could not see the first account's pending review. | This does not replace the remaining direct RLS, mutation-denial, or moderator tests. |
| Scheduled cleanup | GitHub Actions run `42527692806` succeeded and deleted `0` expired buckets from a maximum batch of `1,000`. | One successful empty batch does not demonstrate backlog alerting under load. |
| Neon recovery exercise | A manual snapshot was restored into a separate branch; both published library listings were verified, then the temporary branch was deleted. | This was not a full database integrity, private-data, RLS, or application cutover test. Recovery history is limited to six hours and scheduled snapshots are unavailable on the current plan. |
| Rollback control | Previous Vercel deployment `b508b79` is Ready and Instant Rollback is available. | No rollback was executed, so rollback remains `NOT RUN`. |

## Recorded Phase 17 disposable rehearsal evidence — 2026-11-10

| Evidence | Recorded result | Scope limitation |
| --- | --- | --- |
| Disposable Neon migration rehearsal | All 14 migrations and runtime grants were applied to `rehearsal-account-lifecycle` (`br-cold-king-beer2yusy`) in `studyspace_staging`. | The parent staging branch was not changed; this is not deployment approval. |
| Runtime boundary | Public/Saved permissions, two synthetic-account isolation, legacy ownership mappings, 12 verified-context policies, seven legacy-compatibility policies, no-grant moderator denial, and denial of the retired UUID/boolean context function passed. | Catalog and grant checks are not executed old-application behavior. Positive/revoked moderator grants were verified only in local integration tests. |
| Compatibility | Local PostgreSQL integration tests executed legacy Profile, Favorite, Review, report, and moderation reads and writes against the expanded schema. | The baseline application binary and live Vercel/Auth0 flows were not run against the disposable branch. |

## Recorded public-launch preparation evidence — 2026-11-10

| Evidence | Recorded result | Scope limitation |
| --- | --- | --- |
| Reachable-history scan | All 52 reachable commits and 872 reachable objects were checked for private-key markers, common provider-token formats, JWT-shaped values, credential-bearing PostgreSQL URLs, environment files, logs, screenshots, and Playwright state. Matches were limited to documented placeholders, CI-only local credentials, environment-variable references, the approved public contact, and documented infrastructure metadata. | Pattern scanning cannot prove that an arbitrary unstructured secret is absent. GitHub author metadata includes the owner's full name, which requires owner acceptance before visibility changes. |
| Public staging headers | Read-only HTTPS HEAD requests to `/`, `/privacy`, and `/terms` returned 200 with one-year HSTS, the documented CSP, `nosniff`, referrer policy, permissions policy, and no `X-Powered-By`. | This did not query database-backed routes, test CSP violations in a browser, verify HTTP-to-HTTPS redirect, or test forwarded-header trust. |
| Local release gates | 127 unit tests, 33 PostgreSQL integration tests against `studyspace_test_recovery`, ESLint, TypeScript, Prisma validation, webpack production build, four public Playwright tests, and `npm audit` passed. | The connected-browser list was empty; authenticated and moderator Playwright tests were not executed. GitHub CI must rerun for the final commit. |

## Source and build

| Status | Gate | Required evidence |
| --- | --- | --- |
| NOT RUN | Approved commit | PR #4 final commit SHA reviewed; no local-only change assumed deployed |
| NOT RUN | CI | PR #4 Actions URL for the final commit showing lint, typecheck, unit, PostgreSQL 18 integration, production build, public Playwright, and audit results |
| PASS | Secret scan | 2026-11-10 reachable-history and tracked-artifact scan described above; no real credential or authenticated state was identified |
| PASS | Immutable build | 2026-11-08: Vercel staging deployment is Ready at source commit `70e2bf4` |

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
| PASS | Cleanup | 2026-11-08: restricted cleanup run `42527692806` succeeded with `0` deletions and a 1,000-row limit |
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
| PASS | Profile/Favorites isolation | 2026-11-08: two authenticated accounts remained isolated through the staging UI |
| NOT RUN | Fresh-session persistence | Saved/Profile state persists after a new authenticated session |
| PASS | Review author flow | 2026-11-08: review submission and withdrawal worked through the staging UI |
| PASS | Pending-review isolation | 2026-11-08: a pending review was not visible to the second account |
| NOT RUN | Moderation | Non-moderator denied; moderator approve/reject/hide and audit evidence |
| PASS | Report submission | 2026-11-08: authenticated report submission worked through the staging UI |
| NOT RUN | Report privacy/resolution | Submitter/public non-disclosure, moderator resolution, and audit evidence |
| NOT RUN | Logout | Application session and provider flow invalidate access; stale state cannot reopen private pages |
| NOT RUN | Responsive/a11y | 390 px and desktop screenshots; no horizontal overflow; keyboard-only navigation record |

## Operations and approval

| Status | Gate | Required evidence |
| --- | --- | --- |
| NOT RUN | Monitoring | Owners and tested alerts for errors, latency, auth, DB saturation/storage, 429/503, cleanup backlog |
| PASS | Cleanup schedule | 2026-11-08: hourly restricted workflow run `42527692806` succeeded; last count `0` of `1,000` |
| NOT RUN | Incident access | Named operator can revoke/rotate each login and Auth0/Vercel secret without code change |
| NOT RUN | Deployment approval | Explicit owner approval references the tested commit and unresolved accepted risks |

## Phase 17 parent-staging rollout gate

| Status | Gate | Required evidence |
| --- | --- | --- |
| NOT RUN | Parent identity | Neon dashboard evidence for project `curly-paper-15884428`, branch name `production`, its non-rehearsal branch ID, exact direct hostname, database `studyspace_staging`, and PostgreSQL 18 |
| NOT RUN | Fresh recovery point | Provider evidence captured within 30 minutes of migration, plus the operator timestamp supplied to the rollout guard |
| NOT RUN | Read-only rollout check | `phase17-rollout.mjs check` produces only PASS results for the approved clean commit, owner connection, roles, and exact ten-applied/four-pending history |
| NOT RUN | Migration-first rollout | `phase17-rollout.mjs apply` records all 14 checksums, grants, RLS/security checks, legacy columns, and compatibility triggers before any Vercel promotion |
| NOT RUN | Moderator provisioning | Exact Auth0 subject and active generation verified; supplied allowlist compared with Vercel; deliberate owner grant recorded without email/display-name inference |
| NOT RUN | Application smoke | Existing and fresh sessions, Profile, Favorites, reviews, reports, moderator/non-moderator access, logout, and absence of account-deletion UI verified after promotion |
| NOT RUN | Rollback readiness | Prior immutable deployment and stable Server Action key confirmed; no contract migration; rollback does not reverse the expand migrations |

Do not merge a failed or blocked gate into a claim of successful staging verification. Record local, CI, staging-cloud, and manual results separately in `docs/VERIFICATION.md`.

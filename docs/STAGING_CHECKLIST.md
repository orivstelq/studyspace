# Staging release evidence checklist

Status values are `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`. A release requires a dated artifact or link for every `PASS`; a check is not satisfied by intent, local success in place of cloud evidence, or an empty status.

## Recorded staging evidence — 2026-11-08

| Evidence | Recorded result | Scope limitation |
| --- | --- | --- |
| Vercel deployment | Commit `70e2bf4` is deployed to staging with status Ready; the project is configured for Node.js 24.x. | The Phase 17 release commit has not been promoted. |
| Manual Auth0/application exercise | Login, logout, separate accounts, Profile preferences, public directory, Favorites, review submission and withdrawal, and report submission worked through the staging UI. | Manual evidence only; authenticated Playwright and moderator approval/rejection were not run. |
| Cross-account isolation | Profile and Favorites stayed isolated between two accounts, and the second account could not see the first account's pending review. | This does not replace the remaining direct RLS, mutation-denial, or moderator tests. |
| Scheduled cleanup | GitHub Actions run `42527692806` succeeded and deleted `0` expired buckets from a maximum batch of `1,000`. | One successful empty batch does not demonstrate backlog alerting under load. |
| Neon recovery exercise | A manual snapshot was restored into a separate branch; both published library listings were verified, then the temporary branch was deleted. | This was not a full database integrity, private-data, RLS, or application cutover test. Recovery history is limited to six hours and scheduled snapshots are unavailable on the current plan. |
| Rollback control | Previous Vercel deployment `b508b79` is Ready and Instant Rollback is available. | No rollback was executed, so rollback remains `NOT RUN`. |

## Recorded Phase 17 disposable rehearsal evidence — 2026-11-10

| Evidence | Recorded result | Scope limitation |
| --- | --- | --- |
| Disposable Neon migration rehearsal | The first 14 migrations and runtime grants were applied to `rehearsal-account-lifecycle` (`br-cold-king-beer2yusy`) in `studyspace_staging`. | The new additive lifecycle-cleanup migration still needs rehearsal; the parent staging branch was not changed. |
| Retention rehearsal guard | A local fail-closed command is pinned to the exact disposable branch ID, direct endpoint, owner, PostgreSQL major, clean approved commit, checksums, and sole pending migration. | The command has not been executed against Neon because no approved rehearsal connection was available in the process environment. |
| Runtime boundary | Public/Saved permissions, two synthetic-account isolation, legacy ownership mappings, 12 verified-context policies, seven legacy-compatibility policies, no-grant moderator denial, and denial of the retired UUID/boolean context function passed. | Catalog and grant checks are not executed old-application behavior. Positive/revoked moderator grants were verified only in local integration tests. |
| Compatibility | Local PostgreSQL integration tests executed legacy Profile, Favorite, Review, report, and moderation reads and writes against the expanded schema. | The baseline application binary and live Vercel/Auth0 flows were not run against the disposable branch. |

## Recorded public-launch preparation evidence — 2026-11-10

| Evidence | Recorded result | Scope limitation |
| --- | --- | --- |
| Reachable-history scan | On 2026-11-10, 56 reachable commits, 971 named objects, and 916 unique blobs were checked for private-key markers, common provider-token formats, JWT-shaped values, credential-bearing PostgreSQL URLs, environment files, logs, screenshots, Playwright state, and unnecessary tool attribution. Matches were limited to documented placeholders, CI-only local credentials, the approved public contact, and documented infrastructure metadata. | Pattern scanning cannot prove that an arbitrary unstructured secret is absent. GitHub author metadata and the MIT license include the owner's full name, which is legitimate attribution and requires owner acceptance before visibility changes. |
| Public staging headers | Read-only HTTPS HEAD requests to `/`, `/privacy`, and `/terms` returned 200 with one-year HSTS, the documented CSP, `nosniff`, referrer policy, permissions policy, and no `X-Powered-By`. | This did not query database-backed routes, test CSP violations in a browser, verify HTTP-to-HTTPS redirect, or test forwarded-header trust. |
| Local release gates | 128 unit tests, 34 PostgreSQL integration tests against `studyspace_test_recovery`, ESLint, TypeScript, Prisma validation, webpack production build, four public Playwright tests, and `npm audit` passed. | The local Turbopack worker could not bind its helper port; authenticated/moderator Playwright and the new lifecycle cleanup remain live-cloud gates. GitHub CI must rerun for the final commit. |

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
| PASS | Environment identity | 2026-11-10 parent rollout guard verified project `curly-paper-15884428`, the non-rehearsal parent branch, database `studyspace_staging`, owner role, TLS, and PostgreSQL 18.6 |
| NOT RUN | Backup policy | Recorded retention, RPO, RTO, and successful isolated restore rehearsal |
| PASS | Preflight | 2026-11-10 parent rollout preflight passed the expected database, version, role, and permission checks |
| PASS | Login identities | 2026-11-10 security verification passed for the three constrained staging login roles; no credentials were recorded |
| PASS | Membership | 2026-11-10 security verification passed `INHERIT TRUE`, `SET FALSE`, `ADMIN FALSE`, with one expected permission role per login |
| PASS | Ownership | 2026-11-10 security verification found application objects owned by `neondb_owner`, not runtime roles |
| PASS | Migrations | 2026-11-10 all 15 committed migration names and checksums passed after the parent rollout |
| PASS | Grants/defaults | 2026-11-10 runtime grants, default privileges, schema restrictions, and RLS checks passed |
| PASS | Public denial | 2026-11-10 security verification confirmed the public role cannot read private account, report, moderation, session, or rate-limit tables |
| NOT RUN | Owner isolation | Two distinct verified owner contexts cannot read or mutate each other's Favorite/Profile/Review data |
| NOT RUN | Live Favorite RLS probe | Reviewed wrapper fixing libpq `verify-full` with system certificate trust, plus output for restricted-login isolation, rollback, and exact fixture cleanup |
| NOT RUN | Review integrity | Rating/body edit succeeds; owner/listing reassignment fails; approved edit becomes pending/private |
| NOT RUN | Moderator boundary | Browser/non-moderator cannot set moderator authority; valid moderator transitions create audit rows |
| NOT RUN | Reports | Submitter/public cannot read reports; moderator can resolve with an audit row |
| PASS | Rate-limit cleanup | 2026-11-08: restricted cleanup run `42527692806` succeeded with `0` deletions and a 1,000-row limit |
| NOT RUN | Lifecycle cleanup | Additive cleanup migration rehearsed on disposable Neon; restricted run records session/report/audit counts and preserves active audit holds |
| NOT RUN | Pool capacity | Pooled URLs verified; connection/queue metrics captured under representative concurrency |

## Vercel and network

| Status | Gate | Required evidence |
| --- | --- | --- |
| NOT RUN | Isolation | Dedicated staging project/domain; no production or local secret reused; previews cannot reach staging data by default |
| PASS | Runtime | 2026-11-10 authenticated Vercel project inspection confirmed Node.js 24.x and the Next.js preset |
| BLOCKED | Environment | Exactly 12 expected variables are Production-only; Preview has none; `DIRECT_URL`, `MAINTENANCE_DATABASE_URL`, and `AUTH0_MODERATOR_SUBJECTS` are absent. Eleven values are Vercel Secrets and cannot be retrieved after creation, so their exact values and stability remain unverified. |
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
| PASS | Rate-limit cleanup schedule | 2026-11-08: hourly restricted workflow run `42527692806` succeeded; last count `0` of `1,000` |
| NOT RUN | Lifecycle cleanup schedule | New migration and combined workflow applied; first restricted run and alert evidence recorded |
| NOT RUN | Incident access | Named operator can revoke/rotate each login and Auth0/Vercel secret without code change |
| NOT RUN | Deployment approval | Explicit owner approval references the tested commit and unresolved accepted risks |

## Phase 17 parent-staging rollout gate

| Status | Gate | Required evidence |
| --- | --- | --- |
| PASS | Parent identity | 2026-11-10 guarded rollout verified the intended parent branch, direct endpoint, `studyspace_staging`, owner role, TLS, and PostgreSQL 18.6 |
| NOT RUN | Fresh recovery point | Provider evidence captured within 30 minutes of migration, plus the operator timestamp supplied to the rollout guard |
| PASS | Read-only rollout check | 2026-11-10 `phase17-rollout.mjs check` passed for the approved clean commit, owner connection, roles, and exact ten-applied/five-pending history |
| PASS | Migration-first rollout | 2026-11-10 all five Phase 17 migrations were applied before application promotion; all 15 checksums, grants, RLS/security checks, legacy columns, and compatibility triggers passed |
| NOT RUN | Moderator provisioning | Exact Auth0 subject and active generation verified; supplied allowlist compared with Vercel; deliberate owner grant recorded without email/display-name inference |
| NOT RUN | Application smoke | Existing and fresh sessions, Profile, Favorites, reviews, reports, moderator/non-moderator access, logout, and absence of account-deletion UI verified after promotion |
| NOT RUN | Rollback readiness | Prior immutable deployment and stable Server Action key confirmed; no contract migration; rollback does not reverse the expand migrations |

Do not merge a failed or blocked gate into a claim of successful staging verification. Record local, CI, staging-cloud, and manual results separately in `docs/VERIFICATION.md`.

# Auth0 and Google production release checklist

Status: repository configuration reviewed; dashboard configuration not inspected

The application uses `@auth0/nextjs-auth0` server routes and requests only `openid profile email`. It stores the verified subject, a validated display label, provider session ID, application session metadata, and internal account mapping. It stores no provider access or refresh token. Sessions are PostgreSQL-backed, non-rolling, limited to eight hours, `HttpOnly`, `SameSite=Lax`, and `Secure` when `APP_BASE_URL` is HTTPS.

## Required Vercel variables

Configure these separately for the intended production environment; never copy staging values into production or expose values in logs:

- `APP_BASE_URL` — one exact HTTPS public origin, without a path.
- `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` — the production Auth0 tenant/application.
- `AUTH0_SECRET` — an independent high-entropy session secret, stable across every instance and rollback artifact in the environment.
- `AUTH0_MODERATOR_SUBJECTS` — comma-separated exact Auth0 subjects; empty until a subject is owner-verified and its matching active `ModeratorGrant` exists.
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` and `RATE_LIMIT_SECRET` — independent, high-entropy, stable environment secrets.
- The documented direct/pooled database URLs and pool limits. The migration owner URL must not be present in the runtime deployment.
- `TRUSTED_CLIENT_IP_SOURCE=vercel` only after the deployed ingress test proves Vercel overwrites the trusted header.

The repository cannot verify Vercel values or secret rotation state. In the Vercel dashboard, compare names and environment scopes without copying values into a ticket or terminal. Ensure Preview cannot reach production Auth0 or PostgreSQL resources, and set the project runtime to Node.js 24 to match `package.json`.

## Auth0 application

Use a separate production tenant/application where practical. Configure it as a Regular Web Application with the exact final origin:

- Allowed Callback URLs: `https://<final-origin>/auth/callback`
- Allowed Logout URLs: `https://<final-origin>`
- Allowed Web Origins: `https://<final-origin>`
- Back-Channel Logout URI: `https://<final-origin>/auth/backchannel-logout`, enabled only after a dedicated test proves Auth0 logout tokens delete matching local sessions

Remove localhost, preview, and staging URLs from the production application. Keep them in separate non-production applications. Verify OIDC-conformant behavior and RS256 signing. The application intentionally excludes the ID token from the logout URL to reduce URL disclosure; this reduces the SDK's logout-request DoS protection and should be accepted explicitly during the live logout review.

## Google connection

The Auth0 development Google keys are not suitable for real public accounts. In an owner-controlled Google Cloud project:

1. Configure the OAuth consent screen with the final homepage, `/privacy`, `/terms`, and the approved support email. Select the intended audience and publishing status only after the eligibility/jurisdiction decision.
2. Request only the identity scopes used by StudySpace: `openid`, `profile`, and `email`.
3. Create a Web application OAuth client. Set the authorized JavaScript origin to the exact Auth0 tenant/custom-domain origin and the redirect URI to `https://<AUTH0_DOMAIN>/login/callback`.
4. Put the Google client ID and secret into the Auth0 Google social connection, enable it only for the production StudySpace Auth0 application, and remove/disable Auth0 development keys.
5. Test consent, first login, repeat login, logout, account switching, revoked consent, unverified/missing email behavior, linked identities, and provider-user deletion with dedicated accounts.

The Auth0 application callback (`/auth/callback`) and the Google-to-Auth0 connection callback (`/login/callback`) are different and both must be exact.

## Release evidence

Record dashboard screenshots or exported non-secret settings privately, the tested commit/deployment, test account identifiers, timestamps, and PASS/FAIL results. Never commit client secrets, cookies, tokens, authenticated Playwright storage, or dashboard exports containing credentials.

Official implementation references: [Auth0 Next.js application setup](https://developer.auth0.com/resources/guides/web-app/nextjs/basic-authentication), [Auth0 Google production keys](https://developer.auth0.com/resources/labs/authentication/google-social-connection-to-login), and [Google production homepage/privacy requirement](https://support.google.com/cloud/answer/13807376).

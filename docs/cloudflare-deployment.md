# Cloudflare deployment

The canonical site is `https://giasudiem10.online`. `/` serves the education landing; `/app` and `/app/` redirect to it. Named `/app/*` routes serve the React marketplace. The Worker handles `/api/*` using the same Express routes as local development through Cloudflare's Node HTTP adapter.

## Persistent data

The `MARKETPLACE` binding targets one SQLite-backed Durable Object, `marketplace-v1`. Accounts, sessions, profiles, bookings, messages, reviews, OAuth state and upload metadata persist across deployments. CVs, portraits and tutor gallery images are stored as 100 KB SQLite chunks; existing local BLOB uploads remain readable. Local SQLite remains in `.data/marketplace.sqlite`; production does **not** import this local database or seed demo users. Catalogue subjects/exams are seeded idempotently. Keep the namespace and object name stable when deploying.

A single Durable Object keeps booking transactions atomic. This is an initial small-scale deployment, not a horizontally sharded database. The shared `transaction()` helper maps to `storage.transactionSync` on Cloudflare and native SQLite transactions locally. Portrait and gallery processing uses the Images binding in production and Sharp locally. Gallery images retain aspect ratio within 1280 × 1280; portraits remain 640 × 640 crops. Images binding usage can incur Cloudflare transformation charges.

## Google sign-in

Create an OAuth **Web application** client and register:

- Authorized origin: `https://giasudiem10.online`
- Authorized redirect URI: `https://giasudiem10.online/api/auth/google/callback`
- Local redirect, if required: `http://127.0.0.1:4174/api/auth/google/callback`

Set Worker secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_ADMIN_EMAIL` with `wrangler secret put <name>`. Never place secrets in `wrangler.jsonc`, browser bundles, or committed files. The designated admin email must authenticate through verified Google identity; public email registration for that address is blocked. Google-only users do not receive a password. Existing password accounts link Google from Settings after signing in; email equality alone never links an account.

`hungquocnguyen252@gmail.com` is also explicitly allowed in `server/admin-access.js`; the configured `GOOGLE_ADMIN_EMAIL` remains allowed. Admin status is granted on verified Google sign-in (or explicit linking from the matching account). Promotion revokes earlier sessions, records an audit entry, and requires Google for subsequent sign-ins. Password accounts with that email must sign in and link Google from Settings first; email matching alone does not merge accounts.

Administrators can promote an existing active account from **Quản trị → Tài khoản → Cấp quyền quản trị**. Confirmation shows the target name/email and explains the role change. `PATCH /api/admin/users/:id/role` accepts only `{ "role": "admin" }`, requires a current administrator, revokes the target's sessions and records `user.promoted_to_admin` atomically. The target signs in again using their existing authentication method. Suspended accounts must be activated first; public signup still cannot request admin. This changes the account's single role; tutor records and past bookings remain stored, while the former tutor is no longer discoverable or available for new bookings. Admin demotion and suspension remain unavailable.

New email and Google accounts enter `/app/onboarding`: choose a role, save the student goal or tutor profile, then review the account and read the first-use guide. `users.onboarding_step` persists each completed step. Existing accounts migrate to step 3 (complete); admins skip setup. Tutor profiles remain pending review. `PUT /api/account/onboarding` validates step order and profile fields server-side, and role selection locks after the first step. Unsaved field edits are not persisted across reloads.

The flow uses an expiring one-use database state, HttpOnly browser binding, PKCE S256, nonce verification, and Google JWKS validation of signature, issuer, audience and expiry. Google access/refresh tokens are not stored. Cancelled/expired/error callbacks return to sign-in with a concise message. If secrets are missing, Google sign-in is hidden and email/password remains available.

For local Node development, use `node --env-file=.env server/index.js`. Use `.dev.vars` (ignored) for Wrangler. Never reuse production sessions in tests.

## Automatic CI and deployment

`.github/workflows/ci-deploy.yml` runs on pull requests and pushes to `main` in `The-Educations/Gia-Su-10-Diem`. The **Validate** job installs locked dependencies, checks types, runs API/OAuth and Chrome browser tests, audits dependencies, builds the site, exercises the local Cloudflare runtime, and checks the Worker bundle. Failed checks prevent the dependent deployment job from starting.

On `main`, **Deploy Cloudflare** downloads the static artifact from that same run and deploys the matching source commit using the encrypted repository secret `CLOUDFLARE_API_TOKEN`. Pull requests and forks cannot deploy. Production deployments are serialized. Durable Object updates are immediate to avoid serving old account APIs with new frontend assets. The final check verifies canonical routing, health, Google availability, the exact frontend entry file, and authenticated account/admin API routes. A manual workflow dispatch also runs all checks before deployment and only deploys from `main`.

The token must permit Worker script deployment and route management for the account and `giasudiem10.online` zone in `wrangler.jsonc` (Cloudflare's **Edit Cloudflare Workers** template covers these permissions). Store it only in GitHub Actions secrets; no Google application secrets are copied into CI. Existing Worker secrets and the Durable Object namespace remain in place. For emergency rollback, use `npx wrangler rollback <version-id> --durable-objects-code-update-mode immediate`, then rerun the production checks against the restored build.

## Build and deploy

```sh
npm ci
npm run typecheck
npm test
npm run test:e2e
npm run build:cloudflare
npx wrangler deploy --dry-run
npx wrangler deploy
```

`wrangler.jsonc` owns the `giasudiem10.online/*` and `www.giasudiem10.online/*` Worker routes. The Worker redirects `www` to the canonical apex host, preserving path and query, so it cannot serve the previous origin’s HTML or favicon. Both hosts need proxied DNS records in the Cloudflare zone. The Worker serves HTML, assets and API requests directly; it does not fetch a Vercel origin and does not require a Vercel project. Only this Worker/domain is in scope. No other Cloudflare applications are changed. The compatibility date is pinned to `2026-10-30`, supported by the installed workerd binary.

Local runtime check:

```sh
npm run build:cloudflare
npx wrangler dev --port 4176 --var APP_ORIGIN:http://127.0.0.1:4176
# In another terminal; creates test users in the local Worker database only:
npm run test:cloudflare
```

## Verify and recover

Cloudflare defers active Durable Object code updates for up to five minutes by default. New frontend assets can be live before the API updates. After deploying account changes, check that unauthenticated `PUT /api/account/onboarding` returns 401 (not the old-version 404) before declaring the rollout complete. See [Cloudflare code update strategy](https://developers.cloudflare.com/durable-objects/deployments/durable-objects-code-updates/).

Check `/api/health`, `/api/auth/providers`, `/api/subjects`, `/app/tutors`, and `/`. Confirm HTTPS, Google authorization redirect and callback URI, Secure/HttpOnly/SameSite cookies, mobile layout, and console/network errors. Complete Google consent manually with an authorized account to verify the full external login. Production starts without demo tutors; approved real profiles populate search.

Use `npx wrangler deployments list` to find versions and `npx wrangler rollback <version-id>` to restore code. Code rollback does not roll back database changes. Migrations are additive; do not delete the Durable Object namespace or rename `marketplace-v1`. Use Cloudflare SQLite Durable Object Time Travel for database recovery; never restore production data from the local demo file. There is no previous app deployment to roll back to on the first release. Keep both Worker routes enabled. With the Vercel project removed, removing the routes can leave the site unavailable even though the Worker and its database still exist.

Run `node test/production-routing.mjs` after deployment to check both hostnames, canonical redirects, and matching favicon bytes. This check is read-only.

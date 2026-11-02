# Cloudflare deployment

The canonical site is `https://giasudiem10.online`. `/` serves the education landing; `/app` and `/app/` redirect to it. Named `/app/*` routes serve the React marketplace. The Worker handles `/api/*` using the same Express routes as local development through Cloudflare's Node HTTP adapter.

## Persistent data

The `MARKETPLACE` binding targets one SQLite-backed Durable Object, `marketplace-v1`. Accounts, sessions, profiles, bookings, messages, reviews, OAuth state and upload metadata persist across deployments. Portraits, banners and tutor gallery images are stored as 100 KB SQLite chunks; existing local BLOB uploads remain readable. Local SQLite remains in `.data/marketplace.sqlite`; production does **not** import this local database or seed demo users. Catalogue subjects/exams are seeded idempotently. Keep the namespace and object name stable when deploying.

A single Durable Object keeps booking transactions atomic. This is an initial small-scale deployment, not a horizontally sharded database. The shared `transaction()` helper maps to `storage.transactionSync` on Cloudflare and native SQLite transactions locally. Portrait and gallery processing uses the Images binding in production and Sharp locally. Gallery images retain aspect ratio within 1280 × 1280; portraits remain 640 × 640 crops. Images binding usage can incur Cloudflare transformation charges.

## Google sign-in

See [Search indexing and OAuth branding](search-and-oauth.md) for the public privacy/terms URLs and consent-screen fields.

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

`.github/workflows/ci-deploy.yml` runs on pull requests and pushes to `main` in `The-Educations/Gia-Su-10-Diem`. GitHub shows separate checks for:

- **API, types and build**: installs locked dependencies, checks TypeScript, tests the API, authorization and Google OAuth, audits dependencies, and builds the production site once.
- **Browser journeys**: downloads that build and runs Chrome tests for signup, resumable onboarding, student bookings, tutor approval, messages, admin promotion and responsive layouts.
- **Cloudflare runtime**: downloads the same build, validates the Worker bundle and bindings, and exercises registration, onboarding, sessions, uploads and galleries in local workerd with an isolated test database.
- **Validate**: preserves the required branch-protection check and succeeds only when all three jobs succeed. A failed, skipped or cancelled prerequisite fails this gate.

Browser and Cloudflare runtime checks run in parallel after the build. They receive no deployment credentials. Failed browser tests retain traces and screenshots; failed Cloudflare tests retain the Worker log for seven days.

On `main`, **Deploy Cloudflare** runs only after **Validate** passes. It checks the current remote `main` revision before deploying; superseded runs exit with a notice and leave production alone. It downloads the static artifact from that same run and deploys the matching source commit using the encrypted repository secret `CLOUDFLARE_API_TOKEN`. Pull requests and forks cannot deploy. Production deployments and their verification are serialized. Durable Object updates are immediate to avoid serving old account APIs with new frontend assets. The final check verifies canonical routing, health, Google availability, the exact frontend entry file, and authenticated account/admin API routes. A manual workflow dispatch also runs all checks before deployment and only deploys from `main`.

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

## Native Cloudflare status in GitHub

The optional native path matches the `Workers Builds: megadaytwin` integration: after **Validate** passes, GitHub promotes the exact current `main` commit to `cloudflare-production`. Cloudflare builds that branch and publishes **Workers Builds: giasu-diem10** using its own GitHub App. GitHub waits for the matching Cloudflare check and then verifies the live app against the CI artifact. Failed, cancelled, missing or unrelated checks cannot mark deployment successful. The production branch is never force-pushed.

One-time connection in **Cloudflare → Workers & Pages → giasu-diem10 → Settings → Builds → Connect**:

| Setting | Value |
| --- | --- |
| GitHub repository | `The-Educations/Gia-Su-10-Diem` |
| Production branch | `cloudflare-production` |
| Root directory | `/` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npx wrangler deploy --durable-objects-code-update-mode immediate` |
| Build environment variable | `NODE_VERSION=24.13.0` |
| Non-production branch builds | Disabled |

Grant the Cloudflare Workers & Pages GitHub App access to this repository if prompted. Use the dashboard's build-token setup. Keep the Worker name `giasu-diem10` and existing bindings/secrets unchanged. The production branch must already exist before connecting. Do not configure direct builds from `main`: that would bypass the existing CI gate.

After the native connection has produced a successful **Workers Builds: giasu-diem10** check, set repository Actions variable `CLOUDFLARE_NATIVE_BUILDS=true`, then run the workflow on `main` to verify the complete path. Until that variable is enabled, deployment continues through the existing Wrangler Actions step. The two deployment paths are mutually exclusive. If the native connection is later removed, unset the variable before the next deployment; retain the Actions deployment secret for this fallback.

Cloudflare-native builds rebuild the same checked commit with the lockfile, rather than downloading GitHub's artifact. Production verification still compares the deployed app entry to the CI artifact and checks health, authorization, routes and SEO. The `production` environment and job summary link to the live site.

## Account-confirmation email

New email/password accounts must verify their inbox before onboarding or protected actions. Mailflare sends a single-use, 24-hour activation link from `contact@giasudiem10.online`. The link opens a confirmation screen; an explicit POST consumes it so mail-link scanners cannot confirm accounts. Only a SHA-256 hash is stored. Resends replace earlier links, have a 60-second cooldown and a five-per-hour account limit, alongside the authentication IP limiter. Delivery failure leaves a pending account with a retry action.

Set `MAILFLARE_API_KEY` with `npx wrangler secret put MAILFLARE_API_KEY`, entering the value through the protected prompt/stdin. Use a send-only Mailflare key restricted to the contact mailbox. `MAILFLARE_URL` and `MAILFLARE_MAILBOX_ID` are non-secret Worker vars in `wrangler.jsonc`. Local Node development reads the same three environment variables. Never pass real keys as CLI arguments or commit them. No Mailflare schema changes are needed.

Google's verified identity confirms the matching account email. Existing accounts remain usable and are not falsely labelled verified. Cross-browser activation verifies the address but does not create a login session. Confirmation proves inbox access, not identity or teaching qualifications. No third-party email-validation API receives addresses.

CI uses injected delivery capture for Node/browser tests and a local Mailflare HTTP fixture for Worker tests. The capture endpoint exists only in `test/e2e-server.js`. These checks prove the send contract and activation flow, not delivery to Gmail's inbox. Sender reputation and the domain's mail authentication still determine spam placement.

## Profile fields and tutor images

Every account stores an IANA `timezone` (default `Asia/Ho_Chi_Minh`). Students and parents edit their name, learning goals and timezone in Settings. The account corner shows the saved zone and current GMT offset. Tutor profile editing updates this same account timezone. Booking and availability selectors still explicitly use Vietnam time; no booking-time conversion was introduced.

Tutor `education_history` is a chronological timeline with up to eight entries: level, institution, optional field, start year and nullable end year (ongoing study). Core profile fields remain required, and new tutor onboarding asks for a school entry. Existing free-text education is retained without inventing qualifications. `profile_sections` stores up to ten tutor-defined title/body pairs. The editor offers teaching experience, certifications, languages, skills and achievements, or a custom heading. Content is rendered as text, not HTML. Older clients omitting new fields preserve stored values.

The structure is informed by the [Indeed tutor résumé examples](https://www.indeed.com/career-advice/resume-samples/education-resumes/tutor) and [Prospects teaching CV guidance/examples](https://www.prospects.ac.uk/careers-advice/cvs-and-cover-letters/example-cvs), reviewed 2 November 2026. Only section structure informs the app; no personal CV data is copied or stored.

Tutors upload their own banners using `PUT /api/tutor/uploads/banner`. The same 5 MB / 16-million-pixel image validation as portraits applies. Sharp locally and Cloudflare Images in the Worker strip metadata and produce a centered 1280×320 WebP. A preview shows the 4:1 crop. Banners live in additive `tutor_banners` / `banner_chunks` tables; existing uploads and their chunk foreign keys remain intact. Replacement/deletion removes obsolete chunks. New images and profile edits return the tutor to pending review. Admin moderation shows banners, timezone, education and custom sections.

CV upload and download are retired. Metadata responses omit CVs, and existing `/api/uploads/:id` CV URLs return 404 for every role. Historical CV records remain stored; the migration does not delete them. New demo seeds create portraits only. The app uses inline profile sections in place of PDF résumés.

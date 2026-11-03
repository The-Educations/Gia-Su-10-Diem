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

New email and Google accounts verify an emailed code before entering `/app/onboarding`: choose a role, then save name, timezone and an optional learning goal. `users.onboarding_step` persists each completed step. Existing accounts migrate to step 3 (complete); admins skip setup. Tutor profiles remain pending review. `PUT /api/account/onboarding` validates step order and profile fields server-side, and role selection locks after the first step. Unsaved field edits are not persisted across reloads.

The flow uses an expiring one-use database state, HttpOnly browser binding, PKCE S256, nonce verification, and Google JWKS validation of signature, issuer, audience and expiry. Google access/refresh tokens are not stored by sign-in. Optional Calendar sync stores an encrypted refresh token under a separate `GOOGLE_CALENDAR_TOKEN_KEY`; see `google-calendar.md`. Cancelled/expired/error callbacks return to sign-in with a concise message. If secrets are missing, Google sign-in is hidden and email/password remains available.

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

### Inspect a failed native build

Run **CI and Cloudflare deploy** manually with **Inspect native Cloudflare build** enabled. This runs diagnostics only, without deploying the app. It reads the connected repository, production/preview build commands and the latest failed build's logs; supply a build UUID to inspect a particular preview failure. Environment values and credentials are omitted or redacted.

This job needs a separate `CLOUDFLARE_BUILDS_API_TOKEN` Actions secret containing a **user-scoped** token created under Cloudflare **My Profile → API Tokens**, with **Workers Builds Configuration: Edit** and **Workers Scripts: Read** for this account. Cloudflare's [Builds API](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/) rejects account-scoped tokens with `401 Invalid token`, even when they can deploy Workers. Wrangler OAuth can also return `403` for Builds. Keep the working `CLOUDFLARE_API_TOKEN` deployment secret unchanged.

The optional **Repair Cloudflare Builds** input changes settings only after checking that `cloudflare-production` matches a `main` commit with a successful Validate check. It selects that branch, disables unconfigured previews, pins Node 24 and applies the build/deploy commands above while preserving the Cloudflare build token. Production promotion records existing check IDs so an earlier preview result for the same commit cannot satisfy the new deployment wait. An already promoted commit can reuse its existing build result.

## Account-confirmation email

All new accounts, including Google signups, require a six-digit code sent from `contact@giasudiem10.online` before a user, OAuth identity or login session is created. `pending_signups` holds the hashed password/verified Google claims for up to one hour; a browser-bound HttpOnly cookie identifies the challenge. Codes expire after ten minutes, are stored as hashes, allow five guesses, and are replaced on resend. Resends have a sixty-second cooldown and a five-per-hour email limit. Abandoned records are pruned on subsequent signup starts. No tutorial/protected action is available before successful verification. Setup then asks for role, name, timezone and an optional learning goal; tutor qualifications are completed separately in the studio.

Set `MAILFLARE_API_KEY` with `npx wrangler secret put MAILFLARE_API_KEY`, entering the value through the protected prompt/stdin. Use a send-only Mailflare key restricted to the contact mailbox. `MAILFLARE_URL` and `MAILFLARE_MAILBOX_ID` are non-secret Worker vars in `wrangler.jsonc`. Local Node development reads the same three environment variables. Never pass real keys as CLI arguments or commit them. No Mailflare schema changes are needed.

Existing Google accounts keep their usual login. New Google identities also enter the code flow. Legacy unverified accounts retain the old activation-link endpoint so previously issued links remain usable. Confirmation proves inbox access, not identity or teaching qualifications. No third-party email-validation API receives addresses.

CI uses injected delivery capture for Node/browser tests and a local Mailflare HTTP fixture for Worker tests. The capture endpoint exists only in `test/e2e-server.js`. These checks prove the send contract and activation flow, not delivery to Gmail's inbox. Sender reputation and the domain's mail authentication still determine spam placement.

## Profile fields and tutor images

Every account stores an IANA `timezone` (default `Asia/Ho_Chi_Minh`). Students and parents edit their name, learning goals and timezone in Settings. The account corner shows the saved zone and current GMT offset. Tutor search and saved-profile cards show the tutor’s saved location followed by their current local time and UTC offset (for example, `15:37 (UTC +07:00)`). The clock updates at minute boundaries and when the tab becomes visible, using the saved IANA zone for daylight-saving and fractional offsets. Tutor profile editing updates this same account timezone. Booking and availability selectors still explicitly use Vietnam time; no booking-time conversion was introduced.

Tutor `education_history` is a chronological timeline with up to eight entries: level, institution, optional field, start year and nullable end year (ongoing study). Core profile fields remain required when sending a tutor profile for approval, not during quick account setup. Existing free-text education is retained without inventing qualifications. `profile_sections` stores up to ten tutor-defined title/body pairs. The editor offers teaching experience, certifications, languages, skills and achievements, or a custom heading. Content is rendered as text, not HTML. Older clients omitting new fields preserve stored values.

The structure is informed by the [Indeed tutor résumé examples](https://www.indeed.com/career-advice/resume-samples/education-resumes/tutor) and [Prospects teaching CV guidance/examples](https://www.prospects.ac.uk/careers-advice/cvs-and-cover-letters/example-cvs), reviewed 2 November 2026. Only section structure informs the app; no personal CV data is copied or stored.

Tutors upload their own banners using `PUT /api/tutor/uploads/banner`. The same 5 MB / 16-million-pixel image validation as portraits applies. Sharp locally and Cloudflare Images in the Worker strip metadata and produce a centered 1280×320 WebP. A preview shows the 4:1 crop. Banners live in additive `tutor_banners` / `banner_chunks` tables; existing uploads and their chunk foreign keys remain intact. Replacement/deletion removes obsolete chunks. New images and profile edits return the tutor to pending review. Admin moderation shows banners, timezone, education and custom sections.

CV upload and download are retired. Metadata responses omit CVs, and existing `/api/uploads/:id` CV URLs return 404 for every role. Historical CV records remain stored; the migration does not delete them. New demo seeds create portraits only. The app uses inline profile sections in place of PDF résumés.

## Weekly tutor availability

The studio combines portrait, banner, gallery and profile fields under **Hồ sơ nhận dạy**. **Giờ trống** edits a repeating Monday–Sunday template: 24 one-hour rows in Vietnam time (UTC+7), with mouse rectangle selection, touch taps and keyboard buttons/arrows. Changes remain a draft until saved. A revision check rejects edits from stale tabs.

`PUT /api/tutor/availability` accepts `{revision, blocks: [{weekday, hour}]}` with Monday=0, Sunday=6 and integer hours 0–23. Availability reads and saves materialize the next 56 days, at least one hour ahead. Existing manual slots take precedence over overlapping generated slots. Removing a rule retires its future generated slots; it never cancels a booked lesson or removes its history. A later cancellation cannot reopen retired availability. Re-selecting the rule can reopen it. Unbooked past generated slots are pruned.

Additive `duration_minutes` columns default existing slots and bookings to 60. New weekly slots use 60; existing two-hour rules expand to two adjacent one-hour cells once, and reserved legacy slots retain 120. Unreserved future weekly slots convert to 60; bookings snapshot that duration and the hourly rate. Displayed totals are `rate × duration_minutes / 60`. Conflict checks use full intervals, while completion and calendar exports use the saved duration. The account timezone tag does not change this grid's timezone. No new payment handling is introduced.


Students and parents use **Lịch rảnh** (`/app/availability`) to save a private recurring template through `GET/PUT /api/account/availability`, with the same validation and revision protection as tutor schedules. **Khớp lịch của tôi** ranks tutors by shared weekly hours; it compares recurring rules, not dated booking availability. The profile uses the same seven-column weekly grid to include preferred recurring hours in a private contact message; it does not create a weekly request or reserve time. All schedule grids and booking times use Vietnam time regardless of profile timezone.

## Tutor inventory and profile review

**Góc flexing** is the tutor photo gallery. Tutors no longer select arbitrary profile styles. Administrators grant catalogue themes through `PUT /api/admin/tutors/:id/themes/:theme`; tutors equip owned items through `PUT /api/tutor/theme`. The default paper theme is always available. First migration resets old self-selected themes to paper. Equipped themes frame both the discovery card and full profile without reopening moderation.

Admin review uses the public `TutorProfileView` inside a viewport-sized, fade-only dialog. The admin-only preview endpoint includes unpublished profiles, reviews, and weekly availability. Inventory controls remain in a collapsed disclosure. Approval still checks profile revisions.

**Soạn email trong Mailflare** opens `/compose?template=giasu-review&to=…&name=…`. The Mailflare installation pre-fills the recipient, subject, admin@giasudiem10.online sender, and an editable branded template; its login preserves this known compose route. Opening it neither sends mail nor changes review status. The administrator edits and sends in Mailflare. The older server-side rejection/email endpoint refuses profile-update mail through the contact sender; use the Mailflare action for review correspondence.

Existing `weekly_requests` remain manageable for compatibility. The current profile contact form sends `POST /api/inquiries` with the message, subject, mode and optional offered hours; the server validates them and adds readable context to the message without creating a request or booking.

`weekly_requests` stores selected weekday/hour blocks, subject, delivery mode, note, hourly rate, participants and status. Creation rechecks the public tutor and offered hours, opens/reuses a private inquiry and inserts a request message. Tutors accept/decline; either participant can cancel. Acceptance rechecks availability and conflicts against accepted weekly requests for either participant. Accepted hours are excluded from public matching. These are recurring agreements, not generated dated bookings; the two parties arrange the first date in chat. Existing dated bookings and their history/calendar exports remain available.


## Messages and account deletion

`GET /api/support` creates/reuses one support thread for each non-admin account; the unique owner key prevents duplicates. The thread is pinned first and opens by default, with a pinned welcome and `admin@giasudiem10.online`. Owners can read/send only their own support messages; administrators share the support inbox and can reply. Private learner/tutor inquiries remain participant-only; admin access to existing booking conversations remains unchanged. The inbox refreshes every fifteen seconds and the open conversation every six seconds while the page is visible.

`DELETE /api/admin/users/:id` requires administrator authorization and the target email in the confirmation body. Admin accounts cannot be deleted. This erases account/profile fields, images, private drafts, credentials and sessions, cancels pending/accepted lessons and weekly requests, and records `user.deleted`. A non-loginable `deleted` identity remains so historical messages and learning records retain referential integrity under “Tài khoản đã xóa”. Historical message/post content is retained, not scrubbed. Deleted identities cannot be reactivated through the account-status endpoint. No real account is deleted during deployment.


## Dated study proposals (Đề nghị học)

The profile submits `/api/offers` with a start/end date and weekly one-hour blocks in Vietnam time. Proposals are pending until the assigned tutor accepts. `/api/offers/preview` and the participant-only detail endpoint show actual occurrences and conflicts without exposing other learners. Date ranges are inclusive, at most 365 days apart, with at most 1,000 lessons. Each occurrence must begin more than an hour in the future when submitted or accepted.

Acceptance checks both participants' dated bookings, legacy recurring agreements, current tutor hours, subject and teaching mode inside one transaction, then inserts accepted `bookings` linked by `offer_id`. The unique occurrence index and state transition reject repeat acceptance. Pending proposals do not reserve hours. The separate teaching/learning list groups accepted proposals and opens a dated weekly calendar plus lesson list; existing lesson notes and meeting links are shared with the learner and editable only by that lesson's tutor. One inquiry conversation serves the whole proposal rather than one new chat per lesson.

Cancellation cancels future pending/accepted lessons only, retaining completed lessons and notes. Account deletion also cancels its active proposals. Existing `weekly_requests` remain available under Đề nghị học for historical management; they are not silently converted to dated lessons. The `offers` table, `bookings.offer_id` and indexes are additive migrations applied by the existing SQLite startup migration in Node and the Durable Object.

### Admin moderation emails

Set `MAILFLARE_ADMIN_MAILBOX_ID` to the Mailflare mailbox for `admin@giasudiem10.online`, and `MAILFLARE_ADMIN_API_KEY` to a send-only API key scoped to that mailbox. Enter the key with `wrangler secret put MAILFLARE_ADMIN_API_KEY` through stdin; set the mailbox ID with `wrangler secret put MAILFLARE_ADMIN_MAILBOX_ID` or a Worker var. Node uses the same environment names. The contact key remains scoped to verification mail. Never use the contact mailbox to impersonate admin.

Profile removals, hidden/rejected posts, and removed comments enqueue an email in the same database transaction, then attempt delivery after commit. Mail includes the affected item, reason, time, community/profile link and logo, with replies directed to admin. Failed or unconfigured delivery does not undo moderation: the admin sees a warning and the persisted “Email chưa gửi” list in community management. Retry is admin-only and throttled to once per minute; already-sent entries do not send again. Mailflare accepting a send request is not proof of inbox delivery. An ambiguous network failure can require checking Mailflare before retrying to avoid duplicate delivery. Deleting an account clears these mail records.

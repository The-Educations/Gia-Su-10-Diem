# Cloudflare deployment

The canonical site is `https://giasudiem10.online`. `/` serves the education landing; `/app` and `/app/` redirect to it. Named `/app/*` routes serve the React marketplace. The Worker handles `/api/*` using the same Express routes as local development through Cloudflare's Node HTTP adapter.

## Persistent data

The `MARKETPLACE` binding targets one SQLite-backed Durable Object, `marketplace-v1`. Accounts, sessions, profiles, bookings, messages, reviews, OAuth state and upload metadata persist across deployments. Files are stored as 100 KB SQLite chunks; existing local BLOB uploads remain readable. Local SQLite remains in `.data/marketplace.sqlite`; production does **not** import this local database or seed demo users. Catalogue subjects/exams are seeded idempotently. Keep the namespace and object name stable when deploying.

A single Durable Object keeps booking transactions atomic. This is an initial small-scale deployment, not a horizontally sharded database. The shared `transaction()` helper maps to `storage.transactionSync` on Cloudflare and native SQLite transactions locally. Portrait processing uses the Images binding in production and Sharp locally. Images binding usage can incur Cloudflare transformation charges.

## Google sign-in

Create an OAuth **Web application** client and register:

- Authorized origin: `https://giasudiem10.online`
- Authorized redirect URI: `https://giasudiem10.online/api/auth/google/callback`
- Local redirect, if required: `http://127.0.0.1:4174/api/auth/google/callback`

Set Worker secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_ADMIN_EMAIL` with `wrangler secret put <name>`. Never place secrets in `wrangler.jsonc`, browser bundles, or committed files. The designated admin email must authenticate through verified Google identity; public email registration for that address is blocked. Google-only users do not receive a password. Existing password accounts link Google from Settings after signing in; email equality alone never links an account.

The flow uses an expiring one-use database state, HttpOnly browser binding, PKCE S256, nonce verification, and Google JWKS validation of signature, issuer, audience and expiry. Google access/refresh tokens are not stored. Cancelled/expired/error callbacks return to sign-in with a concise message. If secrets are missing, Google sign-in is hidden and email/password remains available.

For local Node development, use `node --env-file=.env server/index.js`. Use `.dev.vars` (ignored) for Wrangler. Never reuse production sessions in tests.

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

`wrangler.jsonc` owns the `giasudiem10.online/*` Worker route. The existing proxied DNS record is retained: the route serves all requests through the Worker without replacing the previous Vercel origin. Only this Worker/domain is in scope. No other Cloudflare applications are changed. The compatibility date is pinned to `2026-10-30`, supported by the installed workerd binary.

Local runtime check:

```sh
npm run build:cloudflare
npx wrangler dev --port 4176 --var APP_ORIGIN:http://127.0.0.1:4176
# In another terminal; creates test users in the local Worker database only:
npm run test:cloudflare
```

## Verify and recover

Check `/api/health`, `/api/auth/providers`, `/api/subjects`, `/app/tutors`, and `/`. Confirm HTTPS, Google authorization redirect and callback URI, Secure/HttpOnly/SameSite cookies, mobile layout, and console/network errors. Complete Google consent manually with an authorized account to verify the full external login. Production starts without demo tutors; approved real profiles populate search.

Use `npx wrangler deployments list` to find versions and `npx wrangler rollback <version-id>` to restore code. Code rollback does not roll back database changes. Migrations are additive; do not delete the Durable Object namespace or rename `marketplace-v1`. Use Cloudflare SQLite Durable Object Time Travel for database recovery; never restore production data from the local demo file. There is no previous app deployment to roll back to on the first release. Removing only the `giasudiem10.online/*` Worker route restores traffic to the existing DNS origin; this does not delete the Worker or its database.

# Production audit — 31 October 2026

The site runs on Cloudflare Workers at `https://giasudiem10.online`; `www` redirects to that host. Vercel is not a runtime dependency. The marketplace is suitable for a supervised pilot after the owner completes the external sign-in and operational checks below. This is not a claim of unrestricted production readiness or complete coverage of every Vietnamese exam.

## Changes from this audit

- Tutor profile editor: live preview, three cover themes, optional teaching method and lesson plan. Public profiles show the tutor's actual content instead of a fabricated universal lesson plan.
- New content is validated, persisted and visible to the administrator reviewing the profile. Public name changes now atomically return tutor profiles to moderation; unchanged names do not.
- Profile previews refresh portraits after upload while retaining form drafts across tabs. Mobile layout and reduced motion are supported.
- A failed session check preserves the requested protected page and offers retry instead of treating the visitor as logged out.
- Google provider request errors now show retry rather than silently removing the sign-in button. Loading and unconfigured environments also have explicit states.
- Additive SQLite migration preserves existing accounts/profiles and defaults existing tutor themes to paper. It runs on both Node and Cloudflare Durable Objects.

## Feature coverage and evidence

| Area | Implemented and checked | Limits |
| --- | --- | --- |
| Discovery | Guest search, accents, subject/level/exam/price/mode filters, favorites, public profiles | Search initially has no approved production tutors; real tutors must register and be approved |
| Catalogue | 25 subject groups and 8 exam/reference entries; admin editing and publishing | A curated starting catalogue, not every exam or an answer bank |
| Student | Registration, login, saved tutors, private contact before booking, booking, cancellation, messages, calendar export, completed-lesson review | Parents share the student role; no child-account management |
| Tutor | Profile and CV/portrait upload/replacement, custom presentation, moderation, availability, accepting/declining, lesson links/notes, completion | 60-minute slots; editing a published profile hides it until reapproval |
| Administrator | Profile/content review, account suspension, subject/resource management, booking overview and audit trail | Admin identity requires verified Google sign-in; moderation is not professional credential verification |
| Authentication | Password sessions and revocation, roles, Google PKCE/state/nonce/signature validation, account linking | Full external Google consent remains an owner check; no password reset or email verification |
| Privacy | Participant authorization for inquiries/bookings; unpublished uploads private; only approved active profiles public | Approved CVs are public downloads; admins can inspect booking conversations, not private inquiries |
| Hosting | Worker HTML/assets/API, persistent SQLite Durable Object, HTTPS, www canonical redirect, current favicon | Single object; no sharding or demonstrated capacity/load target |

Verification commands are `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build:cloudflare`, `npm run test:cloudflare` against local Wrangler, and `node test/production-routing.mjs` against production. The API/OAuth suite covers 12 tests; the browser suite covers 10 flows, including profile preview-to-publication and retrying authentication/provider failures. Production checks are read-only; test registrations/uploads/bookings run only in isolated local databases.

Chrome DevTools inspection covered the desktop tutor editor and 390-pixel mobile profile with reduced motion, no horizontal overflow, and no console warnings/errors. The live Google button was observed on `/app/auth`, and clicking it reached Google's sign-in screen with the canonical callback. This verifies entry into OAuth, not a completed account consent/session.

`npm audit --omit=dev` reported zero known dependency vulnerabilities on this date. This is dependency evidence, not a penetration-test certification. The first browser run was interrupted by rebuilding its served output; the stable-build rerun is the release gate.

## Before opening broadly

1. Complete Google sign-in with the designated administrator and a non-admin student/tutor. Verify the OAuth consent screen's publishing/test-user settings in Google Cloud. Do not substitute mocked OAuth tests for this external check.
2. Onboard and approve real tutors. At audit time the live search API returned zero approved tutors; no demo accounts were imported into production.
3. Choose an email provider and implement verified email/password recovery before relying on public password registration. Current password changes require an active session and the existing password. Google-only accounts use Google recovery.
4. Define who monitors new profiles, booking requests and messages. These are in-app workflows; there are no email/SMS/push reminders. Payment collection, refunds and video hosting are not implemented; tutors provide their own meeting links.
5. Rehearse SQLite Durable Object Time Travel recovery in a disposable environment and establish a production restore procedure. A code rollback does not undo a data migration. Preserve the namespace and `marketplace-v1` object name.
6. Establish a load target and measure it. Current lists/messages are unpaginated and rate limits are in memory, resetting if the Durable Object restarts. No sustained load or recovery drill was executed in this audit.

See [deployment operations](cloudflare-deployment.md) and [product rules](marketplace.md). Future work should preserve the tutor-finding scope: no quizzes or answer bank.

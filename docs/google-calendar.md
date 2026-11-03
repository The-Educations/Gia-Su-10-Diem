# Google Calendar sync

Students, parents and tutors connect from the schedule's **Google Calendar** button. The first click opens Google's consent screen; the callback creates a private secondary calendar named **Gia Sư 10 Điểm** and starts syncing. Later changes sync server-side without an open browser. The button can request another pass; settings expose the connected email, last completed sync, Google calendar link and disconnect.

## Configuration

Use the existing OAuth web client and redirect URI, `https://giasudiem10.online/api/auth/google/callback`. Sign-in retains `openid email profile`; Calendar separately requests `openid email https://www.googleapis.com/auth/calendar.app.created`. The Calendar grant only manages secondary calendars created by this application, not other personal calendars.

Enable **Google Calendar API** in the Google Cloud project owning this client. Add the Calendar scope to the consent screen's data access configuration and publish/verify the consent configuration as required by Google. Testing-mode grants can expire after seven days; test-user restrictions and organization policies also apply. These Google project settings cannot be set by this repository's Cloudflare deployment.

Set `GOOGLE_CALENDAR_TOKEN_KEY` to a cryptographically random 32-byte base64 value using `wrangler secret put GOOGLE_CALENDAR_TOKEN_KEY` (protected stdin). Do not print, commit or rotate this key casually: it encrypts stored refresh tokens using AES-256-GCM with account/origin-bound associated data. The existing `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are reused. Local Node reads the same environment names. Without a valid key the Calendar integration is disabled; existing login and `.ics` downloads continue working.

## Behavior and boundaries

- Only a user's own accepted/completed bookings are copied. Admin accounts cannot connect a global calendar. Each account has one connection; switching Google accounts requires disconnecting first.
- Events include subject, counterpart name, precise start/end, mode, note/homework, room link and the authenticated lesson URL. No attendees/invitations are created. Cancellation, rejection or removal deletes the corresponding event.
- Sync is one-way from the application. Changes made directly in Google do not alter bookings. Event IDs are persisted before insertion, and retries recover ambiguous event responses without creating duplicates. Deleted events are recreated when their lesson changes; deleting the whole calendar pauses sync with an actionable error.
- Worker Durable Object alarms process up to five accounts concurrently and ten event changes per account per pass. Normal passes repeat about every minute; large initial schedules require multiple passes. Local Node uses a one-minute interval. Source changes during a pass converge on the next pass. Database leases prevent concurrent passes for an account and expire after a crash.
- An ambiguous calendar-creation response pauses instead of automatically creating another calendar. The UI asks the user to check Google and reconnect. Google calendar creation has no idempotency key with the narrow scope, so an orphaned calendar might need removing in Google after such a network failure.
- Transient provider failures retry; revoked authorization pauses until reconnection. The browser never receives tokens. Disconnect removes local authorization/mappings first and attempts provider revocation; existing Google events remain. Account deletion removes stored Calendar credentials/state. A suspended account is not synced.
- OAuth uses a separate browser cookie and claimed, cancellable state bound to the exact active session, PKCE and nonce. Disconnect or a newer authorization attempt invalidates an in-flight callback. Calendar consent does not create/link login identities or change application roles.

`node --test test/google-calendar.test.js` verifies these contracts against a simulated Google provider. Browser tests cover consent navigation, sync states, disconnect and preserved schedule behavior. The Cloudflare runtime check verifies the disabled/default integration path; a real Google account's first consent and project API enablement remain required for live-provider validation.

References: [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [calendar creation](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert), [event insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

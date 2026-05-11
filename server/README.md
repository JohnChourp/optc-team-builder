# Google Drive Sync Backend

This backend keeps Google Drive sync connected after the browser page closes.
It uses Google OAuth authorization code flow with `access_type=offline`, stores
refresh tokens encrypted at rest, and exposes only an HttpOnly app session cookie
to the browser.

## Local Setup

1. Create a Google OAuth Web application client.
2. Add `http://localhost:8787/auth/google/callback` as an authorized redirect URI.
3. Copy `.env.example` to `.env.local` and set:
   - `APP_GOOGLE_DRIVE_BACKEND_URL=http://localhost:8787`
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8787/auth/google/callback`
   - `DRIVE_SYNC_SESSION_SECRET`
   - `DRIVE_SYNC_TOKEN_ENCRYPTION_KEY`
4. Start the backend with `npm run server:drive-sync`.
5. Start the Angular app with `npm start`.

The Angular app keeps the existing browser/mobile Drive sync path when
`APP_GOOGLE_DRIVE_BACKEND_URL` is empty.

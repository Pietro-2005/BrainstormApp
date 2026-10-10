# Setup

Three one-time jobs: publish the site, connect Google (for the inbox doc), and add the doc to your Claude project.

## 1. Publish on GitHub Pages

1. Push this repo to GitHub (any repo name works; the build reads it).
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` now runs `.github/workflows/deploy.yml` (tests, build, deploy). The site appears at `https://<your-user>.github.io/<repo>/`, for example `https://pietro-2005.github.io/BrainstormApp/`.

The repo must be public for free GitHub Pages.

## 2. Google Doc inbox (about 10 minutes, free)

You create a Google Cloud "OAuth client" so the app can create and append to one Google Doc in your Drive. It uses the `drive.file` scope: the app can only see files it created itself.

1. Open <https://console.cloud.google.com/> and sign in with the Google account whose Drive should hold the inbox.
2. Project picker (top left) → **New project** → name it `Voice Notes` → **Create**, then make sure it's selected. No billing account is needed.
3. **APIs & Services → Library** → search **Google Docs API** → **Enable**.
4. **Google Auth Platform** (older consoles call it **OAuth consent screen**) → **Get started**:
   - App name `Voice Notes`, your email as support email → Next.
   - Audience: **External** → Next. Contact email → Next. Agree → **Create**.
5. **Audience → Test users → Add users** → add your own Gmail address → Save. Leave the publishing status on **Testing**; only test users can sign in, which is what you want.
6. **Clients → Create client** (or **Credentials → Create credentials → OAuth client ID**):
   - Application type: **Web application**, name `Voice Notes web`.
   - **Authorized JavaScript origins** → add both:
     - your site's origin, with no path: `https://pietro-2005.github.io`
     - `http://localhost:5173` (for local development)
   - No redirect URIs are needed. → **Create**.
7. Copy the **Client ID** (ends in `.apps.googleusercontent.com`). It is not a secret.
8. In the app: **Settings → Google Doc inbox → OAuth Client ID** → paste → tap **Connect Google**.
   - Google shows "Google hasn't verified this app" because it's your private test app: tap **Continue**.
   - Allow "See, edit, create and delete only the specific Google Drive files you use with this app".
9. Open any note → **Send to inbox doc**. The first send creates **Voice Notes Inbox** in your Drive (the app shows a link under Settings).

Sign-in lasts about an hour; after that, sending asks you to tap **Connect** again. Notes sent while offline or signed out wait in a queue and go out once you're back.

If a send fails with "the Google Docs API is not enabled", repeat step 3 in the same Cloud project as the client ID. If the popup says `origin_mismatch`, the origin in step 6 doesn't exactly match the site's address (no trailing slash, no `/BrainstormApp`).

## 3. Add the inbox doc to your Claude project

1. On claude.ai, open your project (it must be a private project).
2. **Project knowledge / Files → + → Google Drive** → pick **Voice Notes Inbox**.
3. The project keeps the doc in sync, so every new note shows up there.

With **Start a new inbox doc each month** on, the app creates `Voice Notes Inbox 2026-10`, `… 2026-11` and so on. Add each month's doc to the project when it appears.

For **Copy & open project**, paste the project's address (`https://claude.ai/project/…`) into **Settings → Claude project**.

## Checking it on your phone

- Open the site in Chrome (Android) or Safari (iPhone).
- **Settings → Transcription → Download now** on Wi-Fi, once (base is about 77 MB on CPU or 165 MB with the GPU).
- Install it: Android shows **Install** in Settings; on iPhone use Share → **Add to Home Screen**. Installed, it works offline and the browser is less likely to clear its storage.
- Test checklist from the plan: 10 s / 5 min / 30 min notes; airplane mode (record and transcribe); close the app mid-recording and reopen (the note is recovered); a call or screen lock mid-recording (clear message, audio kept); auto vs fixed language; send while offline, then come back online.

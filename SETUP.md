# Setup

Three one-time jobs: publish the site, set up the Google Doc inbox, and add the doc to your Claude project.

## 1. Publish on GitHub Pages

1. Push this repo to GitHub (any repo name works; the build reads it).
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` now runs `.github/workflows/deploy.yml` (tests, build, deploy). The site appears at `https://<your-user>.github.io/<repo>/`, for example `https://pietro-2005.github.io/BrainstormApp/`.

The repo must be public for free GitHub Pages.

## 2. Google Doc inbox (free, about 5 minutes)

The app sends each note to a small **Google Apps Script** that you publish from your own Google account, and the script appends it to a Google Doc in your Drive. Apps Script comes with every Gmail account. You don't need a Google Cloud project, billing or an OAuth client, and nothing expires.

1. Sign in to Google with the account your Claude project uses for Google Drive.
2. In the app: **Settings → Google Doc inbox → Copy script**. The script includes a private key unique to your install, so nobody else who finds the URL can write to your doc.
3. Open <https://script.google.com> → **New project**. Delete the code in the editor, paste the script, and save (Ctrl/Cmd+S).
4. **Deploy → New deployment** → gear icon → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**. "Anyone" lets the app reach the script without a sign-in; the private key protects it.
   - **Deploy**.
5. Google asks for permission: **Authorize access** → pick your account → **Advanced → Go to Untitled project (unsafe)** → **Allow**. The warning appears because the script is yours and unpublished; it can only touch Google Docs in your own account.
6. Copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`), paste it into the app's **Apps Script web app URL**, and tap **Test**. "Connected" means it works, and **Voice Notes Inbox** now exists in your Drive.

The doc stays in step with the app. Each note is wrapped in an invisible named range: sending a note again after editing it updates it in place, and deleting a sent note in the app removes it from the doc. Offline, both wait in the queue. Notes sent with an older script have no named range, so remove those from the doc by hand.

**Updating the script.** When the app shows "Update your Apps Script", tap **Copy script**, paste it over the old code in Apps Script, and save. Then go to **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. This keeps the same URL, so nothing changes in the app. Creating a *new deployment* instead gives a new URL, which you'd have to paste into the app again.

Troubleshooting:
- **"answered with a web page instead of data"**: the deployment's access isn't **Anyone**, or Execute as isn't **Me**.
- **"Wrong secret"**: the deployed script's key differs from this copy of the app. Each copy (phone app, phone browser, computer) has its own key, and on iPhone the home-screen app and Safari are separate. Either:
  - in the app where you'll use it, tap **Copy script**, paste it over the code in Apps Script, save, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**; or
  - copy the value of `SECRET` from the script and paste it into **Settings → Secret key**. Do this on every device you send from.
- **"Could not reach the script"**: check the URL ends in `/exec` and you're online.

### Alternative: your own Google Cloud OAuth client

This only works if your Google Cloud account can create projects. Express-mode accounts whose trial has ended can't. If yours can: create a project, enable the **Google Docs API**, set up **Google Auth Platform** (External, Testing, your Gmail as test user), and create a **Web application** client with JavaScript origins `https://pietro-2005.github.io` and `http://localhost:5173`. Then paste the Client ID under **Settings → Google Doc inbox → Advanced** and tap **Connect Google**. The Apps Script URL takes priority when both are set.

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

# Voice Notes → Claude: Build Plan

Oct 10, 2026 · @Pietro Roversi

## Read this first

This app can be built and run for $0 on top of Claude Pro. One catch: no app can push text straight into a Claude project, so notes reach the project through a Google Doc the project keeps in sync, or through copy and paste.

- **Building it:** Claude Code is included in Pro, so building uses your plan's normal usage ([Claude Code with Pro](https://support.claude.com/en/articles/11145838)).
- **Running it:** the app must never call the Claude API. Pro does not include API usage; it is billed separately ([What is the Pro plan](https://support.claude.com/en/articles/8325606)). Nothing in this plan needs it.
- **Transcription:** OpenAI's open-source Whisper model runs inside the browser, on your own device. Free, private, and it works offline once the model is downloaded.
- **Hosting:** any free static host with HTTPS (GitHub Pages, Cloudflare Pages, Netlify).
- **Into the project:** Google Docs added to a private project's files stay synced with Drive ([Google Drive in Claude](https://support.claude.com/en/articles/10166901)). The app appends each note to one "inbox" doc that you add to the project once.

**How to use this plan:** export this doc as Markdown, save it as `PLAN.md` in a new GitHub repo, open that repo in Claude Code, and paste the prompt from the last section. Pasting the whole doc as your first message also works.

## Goal and user flow

One-tap voice notes that become clean text inside a Claude project, on phone and desktop, without ever losing a recording.

1. **Record.** One big button. The screen stays awake, and a timer and level meter prove it is working. Pause and resume allowed.
2. **Stop.** The audio is saved on the device before anything else happens.
3. **Transcribe.** Runs on-device in the background with a progress bar. You can leave the screen.
4. **Review.** Read and fix the text, add a title and tags, play back the audio to check unclear words.
5. **Send, when you choose.** Append to the project's inbox doc, copy and open the project, or download as Markdown.
6. **Done.** The note is marked Sent with the date. Keep or delete the audio.

## Tech decisions

A static web app with no server: everything, including transcription, runs in the browser, so there is nothing to pay for or maintain.

| Area | Choice | Why |
| --- | --- | --- |
| Framework | Vite + React + TypeScript | Static build, fast, well suited to Claude Code |
| Styling | Tailwind CSS, mobile-first | Quick to build a clean phone UI |
| Transcription | Whisper via `@huggingface/transformers` in a Web Worker; WebGPU, falling back to WASM | Free, offline, accurate; the worker keeps the UI responsive |
| Models | `whisper-base` (about 74 MB) default on phones; `whisper-small` (about 244 MB) on desktop; multilingual, not `.en` | Base is reliable on phones; small is noticeably more accurate. Sizes from [this example](https://github.com/CuplexUser/WebGPU) |
| Recording | `MediaRecorder` with a 1-second timeslice + Screen Wake Lock | Chunks are saved as they arrive, so a crash loses at most 1 second |
| Storage | IndexedDB via Dexie | Audio and notes survive reloads and offline use |
| Install / offline | `vite-plugin-pwa`; the model is cached by the browser after first download | Add to home screen and use it like a native app |
| Send to project | Google Identity Services + Google Docs API, scope `drive.file` | Free; the app can only touch files it created itself |
| Hosting | GitHub Pages or Cloudflare Pages | Free HTTPS, which the mic and WebGPU require |

Deliberately not used: the browser's built-in Web Speech API (Chrome sends audio to Google, it stops on silence, it can't re-transcribe saved audio, and iOS support is patchy) and the Claude API (not included in Pro).

## Features by screen

Four screens. Each has an acceptance test Claude Code should verify before moving on.

**Record**

- Big record button, pause/resume, elapsed time, live input level meter.
- Asks for mic permission with a one-line explanation; shows a clear fix if permission is denied.
- Holds a screen wake lock while recording; warns that locking the phone may stop recording on iOS.
- Writes audio chunks to IndexedDB every second; on reopen, recovers any unfinished recording.
- **Accept:** a 30-minute recording on a phone survives, plays back, and transcribes.

**Notes list**

- Newest first, with a status badge: Recording, Queued, Transcribing (%), Ready, Sent, Failed.
- Search the text; filter by tag or by not-yet-sent.
- Import an audio file (m4a, mp3, wav, webm) to transcribe it too.
- **Accept:** 100 notes load instantly; search finds a word in any transcript.

**Note detail**

- Editable title (auto-filled from the first words), editable transcript, tags.
- Audio player; tapping a timestamped line jumps the audio to that spot.
- Actions: Send, Copy, Download .md, Retry transcription (pick a model), Delete audio, Delete note.
- **Accept:** edits autosave; retry with a bigger model replaces the text only after it succeeds.

**Settings**

- Model (base / small) and language (auto or a fixed language); "Download model now" button for Wi-Fi.
- Google account connect/disconnect, inbox doc name, "start a new inbox doc each month" toggle.
- Claude project URL, used by Copy & open.
- Note template in Markdown with `{title}` `{date}` `{duration}` `{tags}` `{text}`.
- Storage used, and "Export all" as a .zip of Markdown files and audio.
- **Accept:** settings persist after closing the app.

## Sending to a Claude project

Build all three methods; the Google Doc inbox is the one that feels automatic.

| Method | One-time setup | What happens | Best for |
| --- | --- | --- | --- |
| Google Doc inbox | Google Cloud OAuth client; add the doc to the project once | App appends the note to the doc; the project sees it on its own | Everyday use |
| Copy & open project | Paste your project URL in Settings | App copies the formatted note and opens the project; you paste it into a new chat | Asking Claude about one note right now |
| Download .md | None | Saves a Markdown file; you upload it to the project's files | Archiving, or no Google account |

**Google Doc inbox: how to build it**

1. **Google Cloud (done by hand, Claude Code should walk me through it):** create a project, enable the Google Docs API, set the OAuth consent screen to External / Testing with my account as a test user, and create a Web OAuth client ID. Authorized JavaScript origins: the live site URL and `http://localhost:5173`.
2. **Sign-in:** Google Identity Services token client (`google.accounts.oauth2.initTokenClient`) with scope `https://www.googleapis.com/auth/drive.file`. No backend; keep the token in memory and re-request it when it expires. Occasionally tapping Connect again is acceptable.
3. **First send:** create the doc with `POST https://docs.googleapis.com/v1/documents` (title "Voice Notes Inbox") and store its `documentId`.
4. **Every send:** `documents.batchUpdate` with `insertText` at `endOfSegmentLocation`, using the note template plus a separator line. If offline, queue it and retry automatically; mark the note Sent only after success.
5. **In Claude:** open the project, go to Files, tap +, choose Drive, pick "Voice Notes Inbox". This works only in private projects ([Google Drive in Claude](https://support.claude.com/en/articles/10166901)).

The whole doc counts toward the project's knowledge, so the monthly-doc toggle keeps each file small; add each new month's doc to the project.

**Copy & open: detail.** Claude's documented links can open a project but don't prefill text inside it ([Claude links](https://support.claude.com/en/articles/14729294)), so copy to the clipboard first, then open `https://claude.ai/project/<id>`. On phones, offer the system share sheet as well.

## Build phases

Six phases, each ending with something usable on a phone. Commit and deploy after every phase.

1. **Skeleton.** Vite + React + TS + Tailwind, Dexie schema (`notes`, `audioChunks`, `settings`, `sendQueue`), four screens with routing, GitHub Actions deploy to GitHub Pages.
   - Done when: the app loads on my phone over HTTPS.
2. **Recording.** `MediaRecorder` with mime-type detection (`audio/webm;codecs=opus` on Chrome/Android, `audio/mp4` on Safari), 1 s timeslice, chunks to IndexedDB, wake lock, pause/resume, recovery on reopen, audio file import.
   - Done when: the 30-minute test passes and a killed tab recovers its recording.
3. **Transcription.** Web Worker owning one Whisper pipeline (singleton). Decode with Web Audio, convert to mono 16 kHz `Float32Array` via `OfflineAudioContext`. `device: 'webgpu'` with `'wasm'` fallback, `chunk_length_s: 30`, `stride_length_s: 5`, `return_timestamps: true`, language from Settings. Model download progress, one job at a time, retry on failure.
   - Done when: a 5-minute note transcribes on my phone with airplane mode on (model already cached).
4. **Review and export.** Transcript editor with autosave, timestamped segments that seek the audio, copy, Markdown download from the template.
   - Done when: I can fix a word, and the downloaded .md matches the template.
5. **Google Doc inbox.** Settings connect button, create doc, append, offline queue, monthly rotation, Copy & open project.
   - Done when: a sent note appears in the doc and Claude in the project can quote it.
6. **PWA and polish.** Installable, offline app shell, `navigator.storage.persist()`, Export all (.zip), empty and error states, dark mode.
   - Done when: the installed app works offline and survives a phone restart.

## Testing and pitfalls

Test on Android Chrome, iPhone Safari (both in the browser and installed to the home screen), and desktop Chrome.

- [ ] 10-second, 5-minute and 30-minute notes
- [ ] Airplane mode: record and transcribe with the model already cached
- [ ] Close the tab mid-recording, reopen, recording recovered
- [ ] Incoming call or screen lock mid-recording: handled with a clear message
- [ ] Accented or non-English speech, language set to auto vs fixed
- [ ] Send while offline: queued, then delivered once back online

**Known pitfalls for Claude Code to handle**

- iOS may stop recording when the screen locks or the app goes to the background. Keep the screen awake and say so in the UI.
- Phone memory is tight: `whisper-small` can crash a mobile tab. Default to base on phones and catch the failure gracefully.
- The first model download is tens to hundreds of MB. Show its size and suggest Wi-Fi.
- Safari and Chrome record different formats. Always decode through Web Audio; never assume a container.
- Whisper can invent repeated phrases during long silences. Trim silence with a simple energy check before transcribing, and drop identical consecutive lines.
- Load Transformers.js only inside the worker and keep its Node-only dependencies out of the browser bundle.
- Browsers can clear IndexedDB under storage pressure. Request persistent storage and make Export all easy to find.

**Optional later upgrades**

- Live captions during recording via the Web Speech API, as a preview only; final text still comes from Whisper.
- A cloud Whisper fallback using your own API key from a provider with a free tier. Faster on old phones, but audio leaves the device.

## Prompt for Claude Code

Copy this as your first message in Claude Code, with `PLAN.md` in the repo (or this whole doc pasted under it).

```text
Build the web app described in PLAN.md: a voice-notes PWA that records audio, transcribes it on-device with Whisper (Transformers.js, WebGPU with WASM fallback), and sends notes to a Claude project via a Google Doc inbox, copy & open, or Markdown download.

Rules:
- Static site only. No server, no paid services, and never call the Claude/Anthropic API.
- Work one phase at a time, in order. Before each phase, give me a 3-line plan. After each phase, build, run tests, commit, deploy to GitHub Pages, and tell me exactly how to check it on my phone.
- Never lose audio: save chunks to IndexedDB before any processing.
- Ask me before adding any dependency that needs an account or could cost money.
- In Phase 5, walk me step by step through the Google Cloud setup, since I will do that part by hand.
- If something in the plan doesn't work as written, tell me and propose the simplest fix.
```

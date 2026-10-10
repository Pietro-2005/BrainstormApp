# Voice Notes → Claude

One-tap voice notes, transcribed **on your device** with Whisper, sent to a Claude project through a Google Doc inbox, copy & open, or Markdown download. A static PWA: no server, no API keys, no costs, and it never calls the Claude API. The design is in [PLAN.md](PLAN.md); one-time setup (GitHub Pages, the Apps Script inbox, Claude project) is in [SETUP.md](SETUP.md).

## What it does

- **Record**: big button, pause/resume, timer, level meter, screen kept awake. Audio is written to IndexedDB every second, so a crash loses at most a second, and unfinished recordings are recovered when the app reopens. Audio files (m4a, mp3, wav, webm…) can be imported too.
- **Transcribe**: Whisper (`whisper-base` on phones, `whisper-small` on desktop by default) runs in a Web Worker, on WebGPU when available and WebAssembly otherwise. Works offline once the model is downloaded.
- **Review**: edit the title, each transcript line (tap its time to hear it), and tags. Search, tag filters, a "not sent" filter.
- **Send**: append to your Google Doc inbox through a free Google Apps Script you deploy in your own account (queued while offline), copy & open your Claude project, share, or download Markdown, all from an editable template.
- **Keep**: Export all as a .zip (Markdown, audio, JSON backup), with persistent-storage protection.

## How transcription works

Transformers.js runs Whisper in a worker (`src/workers/transcriber.worker.ts`). Before transcribing, long silences are trimmed by an energy check and the audio is cut into ≤ 30 s windows at quiet points (`src/lib/audio-plan.ts`). Timestamps are then mapped back to the original recording. This gives a real progress bar and avoids Whisper inventing text during silence. Repeated lines and non-speech tags are cleaned up afterwards (`src/lib/transcript.ts`).

Three things differ from the plan, because the plan's version didn't work as written:

- **Language auto-detect.** Transformers.js silently treats "auto" as English, so the worker detects the language itself with one decoder step.
- **Chunking.** The pipeline's built-in `chunk_length_s`/`stride_length_s` has no progress reporting, so the app does its own silence-aware windowing.
- **Google inbox.** It goes through a Google Apps Script web app instead of a Google Cloud OAuth client. Google Cloud's Express-mode accounts can't create projects once their trial ends; Apps Script is free with any Gmail. The OAuth route remains as an advanced option.
- **GPU path.** It runs both halves of the model on WebGPU (fp16 encoder where supported, 4-bit decoder), as in the upstream demo. An encoder-on-GPU/decoder-on-CPU split was tested and silently dropped speech.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173/BrainstormApp/
npm test         # unit tests (audio planning, cleanup, templates, search, schema)
npm run build    # type-check + production build with service worker
```

Every push to `main` runs the tests, builds, and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Layout

```
src/
  db/          Dexie schema (notes, audioChunks, settings, sendQueue) and settings
  lib/         recorder, transcription queue, audio planning, Google + send queue, export
  workers/     the Whisper worker and its message protocol
  screens/     Record, Notes, Note detail, Settings
  components/  shared UI
```

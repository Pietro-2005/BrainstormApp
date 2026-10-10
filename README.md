# Voice Notes → Claude

One-tap voice notes, transcribed on your device with Whisper, sent to a Claude project through a Google Doc inbox, copy & open, or Markdown download. Static site, no server, no API costs. See [PLAN.md](PLAN.md).

## Develop

```sh
npm install
npm run dev      # http://localhost:5173/BrainstormApp/
npm test
npm run build
```

Every push to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`.

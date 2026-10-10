/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// GitHub Pages serves the site from /<repo>/, so assets need that prefix.
const base = process.env.BASE_PATH ?? '/BrainstormApp/'

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Never reload on its own: an update must not interrupt a recording.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Voice Notes → Claude',
        short_name: 'Voice Notes',
        description: 'One-tap voice notes, transcribed on your device, sent to your Claude project.',
        theme_color: '#faf9f7',
        background_color: '#faf9f7',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell, including the transcription worker. The model and the ONNX runtime
        // are cached separately by Transformers.js when first used.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['**/*.wasm'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

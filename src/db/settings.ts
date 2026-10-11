import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ModelSize } from './db'
import { isMobile } from '../lib/device'

export const DEFAULT_TEMPLATE = `## {title}

*{date} · {duration}* {tags}

{text}`

export interface Settings {
  model: ModelSize
  /** 'auto' or a Whisper language code such as 'en' or 'it'. */
  language: string
  /** Run the Whisper encoder on WebGPU when the device has it. */
  useGpu: boolean
  /** Deployed Apps Script web app that appends notes to the inbox doc (the free, no-Cloud way). */
  appsScriptUrl: string
  /** Shared secret embedded in the user's Apps Script so only this app can write to the doc. */
  inboxSecret: string
  /** Version reported by the deployed script (0 = not checked yet). */
  scriptVersion: number
  /** OAuth client for the advanced Google Cloud route. */
  googleClientId: string
  inboxName: string
  monthlyInbox: boolean
  projectUrl: string
  template: string
  /** Google Doc ids this app created, keyed by doc title. */
  inboxDocs: Record<string, string>
}

export const DEFAULT_SETTINGS: Settings = {
  // whisper-small can run a phone out of memory, so phones start on base.
  model: isMobile ? 'base' : 'small',
  language: 'auto',
  useGpu: true,
  appsScriptUrl: '',
  inboxSecret: '',
  scriptVersion: 0,
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  inboxName: 'Voice Notes Inbox',
  monthlyInbox: false,
  projectUrl: '',
  template: DEFAULT_TEMPLATE,
  inboxDocs: {},
}

function merge(rows: { key: string; value: unknown }[]): Settings {
  const settings = { ...DEFAULT_SETTINGS } as Record<string, unknown>
  for (const row of rows) if (row.key in settings) settings[row.key] = row.value
  return settings as unknown as Settings
}

export async function getSettings(): Promise<Settings> {
  return merge(await db.settings.toArray())
}

export async function saveSettings(changes: Partial<Settings>) {
  await db.settings.bulkPut(Object.entries(changes).map(([key, value]) => ({ key, value })))
}

/** Live settings; undefined until the first read from IndexedDB finishes. */
export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => merge(await db.settings.toArray()))
}

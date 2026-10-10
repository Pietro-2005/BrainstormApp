import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { DEFAULT_TEMPLATE, saveSettings, type Settings } from '../db/settings'
import { docUrl, loadGoogleIdentity, onTokenChange, requestToken, revokeToken, tokenExpiresAt } from '../lib/google'
import { inboxTitle, sendQueue, useSendState } from '../lib/send'
import { renderNote } from '../lib/template'
import { showToast } from '../lib/toast'
import { Field, Section, Toggle, inputClass, primaryButton, secondaryButton } from './Form'
import { Icon } from './Icon'

export function useGoogleConnection() {
  const expiresAt = useSyncExternalStore(onTokenChange, tokenExpiresAt)
  return expiresAt !== null && expiresAt - Date.now() > 60_000 ? expiresAt : null
}

export const PROJECT_URL_RE = /^https:\/\/claude\.ai\/project\/[\w-]+\/?$/

/** Tap handler that signs in to Google; reports problems as toasts. Returns true on success. */
export async function connectGoogle(clientId: string): Promise<boolean> {
  try {
    await requestToken(clientId.trim())
    return true
  } catch (err) {
    showToast({ tone: 'error', message: (err as Error).message })
    return false
  }
}

export function GoogleSettings({ settings }: { settings: Settings }) {
  const connectedUntil = useGoogleConnection()
  const send = useSendState()
  const queued = useLiveQuery(() => db.sendQueue.count(), [], 0)
  const [clientId, setClientId] = useState(settings.googleClientId)
  const hasClientId = settings.googleClientId.trim().length > 0
  const docs = Object.entries(settings.inboxDocs)
  const currentTitle = inboxTitle(settings)

  useEffect(() => {
    // Load Google's script ahead of the tap so the sign-in popup isn't blocked.
    if (hasClientId) loadGoogleIdentity().catch(() => {})
  }, [hasClientId])

  return (
    <Section
      title="Google Doc inbox"
      description="Each sent note is appended to one Google Doc. Add that doc to your Claude project once and the project stays in sync."
    >
      <Field
        label="OAuth Client ID"
        hint={
          <details>
            <summary className="cursor-pointer">How do I get one?</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>console.cloud.google.com → create a project.</li>
              <li>APIs &amp; Services → Library → enable “Google Docs API”.</li>
              <li>OAuth consent screen: External, Testing, add your Google account as a test user.</li>
              <li>
                Credentials → Create credentials → OAuth client ID → Web application. Authorized JavaScript origins: <code>{location.origin}</code>
              </li>
              <li>Paste the Client ID here. It is not a secret.</li>
            </ol>
          </details>
        }
      >
        <input
          className={`${inputClass} font-mono text-sm`}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          onBlur={() => clientId !== settings.googleClientId && void saveSettings({ googleClientId: clientId.trim() })}
          placeholder="1234-abc.apps.googleusercontent.com"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </Field>

      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1 text-sm">
          {connectedUntil ? (
            <span className="flex items-center gap-1.5 font-medium text-green-700 dark:text-green-400">
              <Icon name="check" className="size-4" /> Connected for {Math.max(1, Math.round((connectedUntil - Date.now()) / 60_000))} min
            </span>
          ) : (
            <span className="text-stone-500 dark:text-stone-400">
              {hasClientId ? 'Not connected. Sign-in lasts about an hour.' : 'Add a Client ID to connect.'}
            </span>
          )}
        </div>
        {connectedUntil ? (
          <button type="button" className={secondaryButton} onClick={revokeToken}>
            Disconnect
          </button>
        ) : (
          <button type="button" className={primaryButton} disabled={!hasClientId} onClick={() => void connectGoogle(settings.googleClientId)}>
            Connect Google
          </button>
        )}
      </div>

      {queued > 0 && (
        <div className="flex items-center gap-3 p-4 text-sm">
          <div className="min-w-0 flex-1">
            {queued} note{queued > 1 ? 's' : ''} waiting to send
            {send.offline ? ' (offline)' : send.needsAuth ? ' (connect to send)' : ''}.
            {send.error && <div className="text-xs text-red-700 dark:text-red-300">{send.error}</div>}
          </div>
          <button type="button" className={secondaryButton} disabled={send.sending} onClick={() => void sendQueue.flush()}>
            {send.sending ? 'Sending…' : 'Send now'}
          </button>
        </div>
      )}

      <Field label="Inbox doc name" hint={`Notes go to “${currentTitle}”.`}>
        <input
          className={inputClass}
          defaultValue={settings.inboxName}
          onBlur={(e) => e.target.value.trim() !== settings.inboxName && void saveSettings({ inboxName: e.target.value.trim() || 'Voice Notes Inbox' })}
        />
      </Field>

      <Toggle
        label="Start a new inbox doc each month"
        hint="Keeps each doc small, since the whole doc counts toward the project's knowledge. Add each new month's doc to the project."
        checked={settings.monthlyInbox}
        onChange={(monthlyInbox) => void saveSettings({ monthlyInbox })}
      />

      {docs.length > 0 && (
        <Field label="Inbox docs created by this app">
          <ul className="space-y-1 text-sm">
            {docs.map(([title, id]) => (
              <li key={id}>
                <a href={docUrl(id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline">
                  {title} <Icon name="external" className="size-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </Field>
      )}
    </Section>
  )
}

export function ProjectSettings({ settings }: { settings: Settings }) {
  const [url, setUrl] = useState(settings.projectUrl)
  const valid = !url || PROJECT_URL_RE.test(url.trim())
  return (
    <Section title="Claude project" description="Used by Copy & open: the note is copied, then your project opens so you can paste it into a chat.">
      <Field
        label="Project URL"
        hint={valid ? 'Open the project on claude.ai and copy the address, like https://claude.ai/project/…' : 'This doesn’t look like a claude.ai project link.'}
      >
        <input
          className={`${inputClass} ${valid ? '' : 'ring-red-400'}`}
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => url.trim() !== settings.projectUrl && void saveSettings({ projectUrl: url.trim() })}
          placeholder="https://claude.ai/project/…"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </Field>
    </Section>
  )
}

export function TemplateSettings({ settings }: { settings: Settings }) {
  const latest = useLiveQuery(() => db.notes.orderBy('createdAt').reverse().filter((n) => n.text.length > 0).first())
  const [template, setTemplate] = useState(settings.template)
  const sample = latest ?? { title: 'Example note', createdAt: Date.now(), durationMs: 83_000, tags: ['idea'], text: 'The transcript goes here.' }
  return (
    <Section title="Note template" description="Markdown used for Send, Copy and Download.">
      <Field
        label="Template"
        hint={
          <>
            Placeholders: <code>{'{title}'}</code> <code>{'{date}'}</code> <code>{'{duration}'}</code> <code>{'{tags}'}</code> <code>{'{text}'}</code>
          </>
        }
      >
        <textarea
          className={`${inputClass} min-h-32 font-mono text-sm`}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          onBlur={() => template !== settings.template && void saveSettings({ template })}
          spellCheck={false}
        />
        {template !== DEFAULT_TEMPLATE && (
          <button
            type="button"
            className="text-xs text-accent"
            onClick={() => {
              setTemplate(DEFAULT_TEMPLATE)
              void saveSettings({ template: DEFAULT_TEMPLATE })
            }}
          >
            Reset to default
          </button>
        )}
      </Field>
      <Field label="Preview">
        <pre className="max-h-48 overflow-auto rounded-lg bg-stone-100 p-3 text-xs whitespace-pre-wrap dark:bg-stone-800">{renderNote(template, sample)}</pre>
      </Field>
    </Section>
  )
}

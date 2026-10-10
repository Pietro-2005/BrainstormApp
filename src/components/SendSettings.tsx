import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { DEFAULT_TEMPLATE, saveSettings, type Settings } from '../db/settings'
import { docUrl, loadGoogleIdentity, onTokenChange, requestToken, revokeToken, tokenExpiresAt } from '../lib/google'
import { inboxTitle, sendQueue, usesAppsScript, useSendState } from '../lib/send'
import { SCRIPT_URL_RE, ScriptError, newSecret, scriptSource } from '../lib/appsScript'
import { copyText } from '../lib/files'
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
  const send = useSendState()
  const queued = useLiveQuery(() => db.sendQueue.count(), [], 0)
  const [scriptUrl, setScriptUrl] = useState(settings.appsScriptUrl)
  const [testing, setTesting] = useState(false)
  const docs = Object.entries(settings.inboxDocs)
  const currentTitle = inboxTitle(settings)
  const urlValid = !scriptUrl.trim() || SCRIPT_URL_RE.test(scriptUrl.trim())

  useEffect(() => {
    // Every install gets its own secret, embedded in the script the user copies.
    if (!settings.inboxSecret) void saveSettings({ inboxSecret: newSecret() })
  }, [settings.inboxSecret])

  const onCopyScript = async () => {
    try {
      await copyText(scriptSource(settings.inboxSecret))
      showToast({ tone: 'success', message: 'Script copied. Paste it into the Apps Script editor.' })
    } catch (err) {
      showToast({ tone: 'error', message: (err as Error).message })
    }
  }

  const saveUrl = async () => {
    const url = scriptUrl.trim()
    if (url !== settings.appsScriptUrl) await saveSettings({ appsScriptUrl: url })
  }

  const onTest = async () => {
    await saveUrl()
    setTesting(true)
    try {
      const result = await sendQueue.testScript()
      showToast({ tone: 'success', message: `Connected. “${currentTitle}” is ready in your Google Drive.` })
      if (result.docUrl) void sendQueue.flush()
    } catch (err) {
      showToast({
        tone: 'error',
        message:
          err instanceof ScriptError
            ? err.message
            : 'Could not reach the script. Check the URL, and that the deployment’s access is “Anyone”.',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Section
      title="Google Doc inbox"
      description="Each sent note is appended to one Google Doc in your Drive. Add that doc to your Claude project once and the project stays in sync."
    >
      <Field label="Set up (free, about 5 minutes, once)">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-stone-700 dark:text-stone-300">
          <li>
            Open{' '}
            <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer" className="text-accent underline">
              script.google.com → New project
            </a>{' '}
            with the Google account your Claude project uses.
          </li>
          <li>
            Delete the code that's there and paste this script (it contains your private key):
            <button type="button" className={`${secondaryButton} mt-1.5 flex`} disabled={!settings.inboxSecret} onClick={() => void onCopyScript()}>
              <Icon name="copy" className="size-4" /> Copy script
            </button>
          </li>
          <li>
            Click <b>Deploy → New deployment</b>, choose type <b>Web app</b>, set <b>Execute as: Me</b> and <b>Who has access: Anyone</b>, then{' '}
            <b>Deploy</b>.
          </li>
          <li>
            Google asks you to authorize: <b>Review permissions</b> → your account → <b>Advanced → Go to … (unsafe)</b> → <b>Allow</b>. It's
            your own script, so this is expected.
          </li>
          <li>Copy the <b>Web app URL</b>, paste it below, and tap Test.</li>
        </ol>
      </Field>

      <Field
        label="Apps Script web app URL"
        hint={urlValid ? 'Looks like https://script.google.com/macros/s/…/exec' : 'This should be the Web app URL ending in /exec.'}
      >
        <div className="flex gap-2">
          <input
            className={`${inputClass} min-w-0 flex-1 font-mono text-sm ${urlValid ? '' : 'ring-red-400'}`}
            value={scriptUrl}
            onChange={(e) => setScriptUrl(e.target.value)}
            onBlur={() => void saveUrl()}
            placeholder="https://script.google.com/macros/s/…/exec"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="button" className={primaryButton} disabled={!scriptUrl.trim() || !urlValid || testing} onClick={() => void onTest()}>
            {testing ? 'Testing…' : 'Test'}
          </button>
        </div>
      </Field>

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
        <Field label="Inbox docs">
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

      <AdvancedGoogleSettings settings={settings} />
    </Section>
  )
}

/** The original route: your own Google Cloud OAuth client. Only used when no Apps Script URL is set. */
function AdvancedGoogleSettings({ settings }: { settings: Settings }) {
  const connectedUntil = useGoogleConnection()
  const [clientId, setClientId] = useState(settings.googleClientId)
  const hasClientId = settings.googleClientId.trim().length > 0
  const active = hasClientId && !usesAppsScript(settings)

  useEffect(() => {
    // Load Google's script ahead of the tap so the sign-in popup isn't blocked.
    if (active) loadGoogleIdentity().catch(() => {})
  }, [active])

  return (
    <details className="p-4 text-sm" open={active}>
      <summary className="cursor-pointer font-medium">Advanced: use a Google Cloud OAuth client instead</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Needs a Google Cloud project with the Docs API enabled (see SETUP.md). Ignored while an Apps Script URL is set. Sign-in lasts about an
          hour.
        </p>
        <input
          className={`${inputClass} font-mono text-sm`}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          onBlur={() => clientId !== settings.googleClientId && void saveSettings({ googleClientId: clientId.trim() })}
          placeholder="OAuth Client ID (…apps.googleusercontent.com)"
          aria-label="OAuth Client ID"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        {active && (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              {connectedUntil ? (
                <span className="flex items-center gap-1.5 font-medium text-green-700 dark:text-green-400">
                  <Icon name="check" className="size-4" /> Connected for {Math.max(1, Math.round((connectedUntil - Date.now()) / 60_000))} min
                </span>
              ) : (
                <span className="text-stone-500 dark:text-stone-400">Not connected.</span>
              )}
            </div>
            {connectedUntil ? (
              <button type="button" className={secondaryButton} onClick={revokeToken}>
                Disconnect
              </button>
            ) : (
              <button type="button" className={primaryButton} onClick={() => void connectGoogle(settings.googleClientId)}>
                Connect Google
              </button>
            )}
          </div>
        )}
      </div>
    </details>
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

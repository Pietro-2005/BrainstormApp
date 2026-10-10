import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { exportAll, exportFilename } from '../lib/export'
import { downloadBlob } from '../lib/files'
import { formatBytes } from '../lib/format'
import { requestPersistentStorage, storageStatus } from '../lib/storage'
import { isIOS, isStandalone } from '../lib/device'
import { promptInstall, useInstallPrompt } from '../lib/install'
import { showToast } from '../lib/toast'
import { Field, ProgressBar, Section, primaryButton, secondaryButton } from './Form'
import { Icon } from './Icon'

export function InstallSection() {
  const installPrompt = useInstallPrompt()
  if (isStandalone) return null
  if (installPrompt)
    return (
      <Section title="Install">
        <div className="flex items-center gap-3 p-4 text-sm">
          <span className="min-w-0 flex-1">Install Voice Notes to open it from your home screen and use it offline.</span>
          <button type="button" className={primaryButton} onClick={() => void promptInstall()}>
            Install
          </button>
        </div>
      </Section>
    )
  if (isIOS)
    return (
      <Section title="Install">
        <p className="p-4 text-sm">
          In Safari, tap <Icon name="share" className="inline size-4 align-text-bottom" /> Share → <b>Add to Home Screen</b>. The installed app keeps
          your notes safer from automatic cleanup and works offline.
        </p>
      </Section>
    )
  return null
}

export function StorageSettings() {
  const noteCount = useLiveQuery(() => db.notes.count(), [], 0)
  const audioBytes = useLiveQuery(async () => {
    let total = 0
    await db.audioChunks.each((c) => (total += c.data.size))
    return total
  }, [], 0)
  const [status, setStatus] = useState<Awaited<ReturnType<typeof storageStatus>>>(null)
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    void storageStatus().then(setStatus)
  }, [noteCount, audioBytes])

  const onExport = async () => {
    setExporting({ done: 0, total: noteCount })
    try {
      const zip = await exportAll((done, total) => setExporting({ done, total }))
      downloadBlob(zip, exportFilename())
      showToast({ tone: 'success', message: `Exported ${noteCount} notes (${formatBytes(zip.size)}).` })
    } catch (err) {
      showToast({ tone: 'error', message: `Export failed: ${(err as Error).message}` })
    } finally {
      setExporting(null)
    }
  }

  const onProtect = async () => {
    const ok = await requestPersistentStorage()
    setStatus(await storageStatus())
    if (!ok)
      showToast({
        tone: 'warning',
        message: isIOS ? 'Install the app to your home screen to protect its storage.' : 'The browser declined. Installing the app usually allows it.',
      })
  }

  return (
    <Section title="Storage and backup" description="Everything lives on this device. Export regularly: browsers can clear site data.">
      <div className="space-y-1 p-4 text-sm">
        <div>
          {noteCount} note{noteCount === 1 ? '' : 's'} · {formatBytes(audioBytes)} of audio
        </div>
        {status && (
          <div className="text-xs text-stone-500 dark:text-stone-400">
            {formatBytes(status.usage)} used on this device, including the speech model
            {status.quota ? ` (browser allows ${formatBytes(status.quota)})` : ''}.
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 p-4 text-sm">
        {status?.persisted ? (
          <span className="flex items-center gap-1.5 font-medium text-green-700 dark:text-green-400">
            <Icon name="check" className="size-4" /> Protected from automatic cleanup
          </span>
        ) : (
          <>
            <span className="min-w-0 flex-1 text-stone-600 dark:text-stone-300">Not protected: the browser may clear notes if the device runs low on space.</span>
            <button type="button" className={secondaryButton} onClick={() => void onProtect()}>
              Protect
            </button>
          </>
        )}
      </div>
      <Field label="Export all" hint="A .zip with a Markdown file per note, the audio, and a full JSON backup.">
        <button type="button" className={`${primaryButton} w-full`} disabled={!!exporting || noteCount === 0} onClick={() => void onExport()}>
          <Icon name="download" className="size-4" />
          {exporting ? `Exporting ${exporting.done}/${exporting.total}…` : 'Export all (.zip)'}
        </button>
        {exporting && <ProgressBar value={exporting.total ? exporting.done / exporting.total : 0} className="mt-2" />}
      </Field>
    </Section>
  )
}

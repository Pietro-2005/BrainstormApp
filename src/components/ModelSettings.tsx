import { useEffect, useMemo, useState } from 'react'
import type { ModelSize } from '../db/db'
import { saveSettings, type Settings } from '../db/settings'
import { isModelCached, transcription, useTranscriptionState } from '../lib/transcription'
import { DOWNLOAD_MB } from '../workers/protocol'
import { languageOptions } from '../lib/languages'
import { formatBytes } from '../lib/format'
import { isMobile } from '../lib/device'
import { Field, ProgressBar, Section, Toggle, inputClass, secondaryButton } from './Form'
import { Icon } from './Icon'

export function ModelSettings({ settings }: { settings: Settings }) {
  const engineState = useTranscriptionState()
  const [cached, setCached] = useState<boolean | null>(null)
  const languages = useMemo(languageOptions, [])
  const gpuLikely = settings.useGpu && 'gpu' in navigator
  const size = (m: ModelSize) => DOWNLOAD_MB[m][gpuLikely ? 'gpu' : 'cpu']
  const loadingThis = engineState.status === 'loading' && engineState.model === settings.model
  const readyThis = engineState.status === 'ready' && engineState.model === settings.model

  useEffect(() => {
    let cancelled = false
    void isModelCached(settings.model).then((c) => !cancelled && setCached(c))
    return () => {
      cancelled = true
    }
  }, [settings.model, engineState.status])

  return (
    <Section title="Transcription" description="Whisper runs on this device. Audio never leaves it.">
      <Field
        label="Speech model"
        hint={
          settings.model === 'small' && isMobile
            ? 'Small is more accurate but can run a phone out of memory. If transcription crashes, switch to base.'
            : 'Base is fast and reliable on phones. Small is noticeably more accurate.'
        }
      >
        <select className={inputClass} value={settings.model} onChange={(e) => void saveSettings({ model: e.target.value as ModelSize })}>
          <option value="base">Base, about {size('base')} MB</option>
          <option value="small">Small, about {size('small')} MB</option>
        </select>
      </Field>

      <Field label="Language" hint="Auto detects the language of each note. Pick one if detection gets it wrong.">
        <select className={inputClass} value={settings.language} onChange={(e) => void saveSettings({ language: e.target.value })}>
          <option value="auto">Auto-detect</option>
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>

      <Toggle
        label="Use the GPU when available"
        hint="Faster on most devices (WebGPU). Turn off if transcription fails or produces garbage."
        checked={settings.useGpu}
        onChange={(useGpu) => void saveSettings({ useGpu })}
      />

      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 text-sm">
            {cached || readyThis ? (
              <span className="flex items-center gap-1.5 font-medium text-green-700 dark:text-green-400">
                <Icon name="check" className="size-4" /> Downloaded. Works offline.
              </span>
            ) : (
              <span>
                Not downloaded yet: about <b>{size(settings.model)} MB</b>, once. Use Wi-Fi.
              </span>
            )}
            {engineState.engine && engineState.model === settings.model && readyThis && (
              <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                Running on {engineState.engine === 'gpu' ? 'the GPU (WebGPU)' : 'the CPU (WebAssembly)'}
              </div>
            )}
          </div>
          {!readyThis && (
            <button type="button" disabled={loadingThis} onClick={() => void transcription.preload(settings.model)} className={secondaryButton}>
              <Icon name="download" className="size-4" />
              {loadingThis ? 'Loading…' : cached ? 'Load now' : 'Download now'}
            </button>
          )}
        </div>
        {loadingThis && engineState.download && engineState.download.total > 0 && (
          <div className="space-y-1">
            <ProgressBar value={engineState.download.loaded / engineState.download.total} />
            <div className="text-xs tabular-nums text-stone-500 dark:text-stone-400">
              {formatBytes(engineState.download.loaded)} of {formatBytes(engineState.download.total)}
            </div>
          </div>
        )}
        {engineState.status === 'error' && engineState.error && (
          <p className="text-sm text-red-700 dark:text-red-300">{engineState.error}</p>
        )}
      </div>
    </Section>
  )
}

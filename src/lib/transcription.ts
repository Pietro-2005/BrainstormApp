import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'
import { db, getNoteAudio, updateNote, type ModelSize, type Note, type Segment } from '../db/db'
import { getSettings, saveSettings } from '../db/settings'
import type { Engine, WorkerRequest, WorkerResponse } from '../workers/protocol'
import { decodeToMono16k, WHISPER_SAMPLE_RATE } from './decode'
import { cleanSegments, segmentsToText } from './transcript'
import { titleFromText } from './format'
import { showToast } from './toast'

export interface EngineState {
  model: ModelSize | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  engine: Engine | null
  download: { loaded: number; total: number } | null
  error: string | null
  /** True when the queue is stalled until the device is back online. */
  waitingForNetwork: boolean
  /** Text recognised so far for the note being transcribed (not saved until it finishes). */
  live: { noteId: string; segments: Segment[] } | null
}

class TranscriptionError extends Error {
  readonly network: boolean
  /** Settings were made safer after a crash; queue the note again instead of failing it. */
  readonly retry: boolean
  constructor(message: string, network = false, retry = false) {
    super(message)
    this.network = network
    this.retry = retry
  }
}

/**
 * Heavy work in progress, kept in localStorage (written synchronously) so that if the tab is
 * killed for memory, the next launch knows what was running and can pick lighter settings.
 */
interface HeavyWork {
  kind: 'load' | 'job'
  model: ModelSize
  engine: Engine | null
  noteId: string | null
  /** The page was hidden at some point: the OS may have closed it, which is not our crash. */
  hidden: boolean
}
const WORK_KEY = 'voice-notes:heavy-work'

function readWork(): HeavyWork | null {
  try {
    return JSON.parse(localStorage.getItem(WORK_KEY) ?? 'null') as HeavyWork | null
  } catch {
    return null
  }
}
function writeWork(work: HeavyWork | null) {
  try {
    if (work) localStorage.setItem(WORK_KEY, JSON.stringify(work))
    else localStorage.removeItem(WORK_KEY)
  } catch {
    // Storage blocked: crash recovery falls back to the attempt counter.
  }
}
function updateWork(patch: Partial<HeavyWork>) {
  const work = readWork()
  if (work) writeWork({ ...work, ...patch })
}

interface Job {
  resolve: (r: { segments: Segment[]; language: string | null; engine: Engine }) => void
  reject: (e: TranscriptionError) => void
  onProgress: (ratio: number, segments: Segment[], language: string | null) => void
}

/** A note left in "transcribing" this many times means the tab keeps dying (out of memory). */
const MAX_ATTEMPTS = 2

class TranscriptionService {
  private state: EngineState = {
    model: null,
    status: 'idle',
    engine: null,
    download: null,
    error: null,
    waitingForNetwork: false,
    live: null,
  }
  private listeners = new Set<() => void>()
  private worker: Worker | null = null
  private jobs = new Map<string, Job>()
  private draining = false
  private drainRequested = false
  private started = false

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }
  getSnapshot = () => this.state
  private set(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  /** Start watching for queued notes. Safe to call more than once. */
  start() {
    if (this.started) return
    this.started = true
    liveQuery(() => db.notes.where('status').equals('queued').count()).subscribe((count) => {
      if (count > 0) void this.drain()
    })
    window.addEventListener('online', () => {
      if (this.state.waitingForNetwork) {
        this.set({ waitingForNetwork: false })
        void this.drain()
      }
    })
    const markHidden = () => document.visibilityState === 'hidden' && updateWork({ hidden: true })
    document.addEventListener('visibilitychange', markHidden)
    window.addEventListener('pagehide', () => updateWork({ hidden: true }))
    // Picks up notes left mid-transcription by a reload or crash, even if nothing is queued.
    void this.drain()
  }

  /** Download and load the model without transcribing anything (the Settings button). */
  async preload(model: ModelSize) {
    const settings = await getSettings()
    this.set({ error: null })
    writeWork({ kind: 'load', model, engine: null, noteId: null, hidden: false })
    this.post({ type: 'load', model, allowGpu: settings.useGpu })
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('../workers/transcriber.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onMessage(e.data)
    worker.onerror = (e) => {
      // The worker script failed to load (offline) or the worker died (usually out of memory).
      e.preventDefault?.()
      const offline = !navigator.onLine
      const message = offline
        ? 'No connection: the speech model needs to download once.'
        : 'The speech model crashed, most likely out of memory.'
      const work = readWork()
      writeWork(null)
      worker.terminate()
      this.worker = null
      this.set({ status: 'error', error: message, download: null })
      void (async () => {
        const safer = !offline && work ? await this.makeSafer(work) : false
        for (const job of this.jobs.values()) job.reject(new TranscriptionError(message, offline, safer))
        this.jobs.clear()
      })()
    }
    this.worker = worker
    return worker
  }

  private post(msg: WorkerRequest, transfer: Transferable[] = []) {
    this.getWorker().postMessage(msg, transfer)
  }

  private onMessage(msg: WorkerResponse) {
    switch (msg.type) {
      case 'model':
        updateWork({ engine: msg.engine })
        if (msg.status === 'ready' && readWork()?.kind === 'load') writeWork(null)
        this.set({
          model: msg.model,
          engine: msg.engine,
          status: msg.status === 'ready' ? 'ready' : 'loading',
          download: msg.status === 'ready' ? null : this.state.download,
          error: null,
        })
        break
      case 'download':
        this.set({ download: { loaded: msg.loaded, total: msg.total } })
        break
      case 'progress':
        this.jobs.get(msg.jobId)?.onProgress(msg.ratio, msg.segments, msg.language)
        break
      case 'done': {
        const job = this.jobs.get(msg.jobId)
        this.jobs.delete(msg.jobId)
        job?.resolve(msg)
        break
      }
      case 'error': {
        if (!msg.jobId && readWork()?.kind === 'load') writeWork(null)
        if (msg.jobId) {
          const job = this.jobs.get(msg.jobId)
          this.jobs.delete(msg.jobId)
          job?.reject(new TranscriptionError(msg.message, msg.network))
        }
        this.set({
          status: 'error',
          download: null,
          error: msg.network ? 'No connection: the speech model needs to download once.' : msg.message,
        })
        break
      }
    }
  }

  private run(noteId: string, audio: Float32Array, model: ModelSize, language: string, allowGpu: boolean, onProgress: Job['onProgress']) {
    return new Promise<{ segments: Segment[]; language: string | null; engine: Engine }>((resolve, reject) => {
      const jobId = `${noteId}:${Date.now()}`
      this.jobs.set(jobId, { resolve, reject, onProgress })
      this.post({ type: 'transcribe', jobId, audio, model, language, allowGpu }, [audio.buffer])
    })
  }

  /** Process queued notes one at a time. Only one tab does this, guarded by a Web Lock. */
  private async drain() {
    if (this.state.waitingForNetwork) return
    if (this.draining) {
      // Something was queued while the loop was finishing; go round again afterwards.
      this.drainRequested = true
      return
    }
    this.draining = true
    this.drainRequested = false
    try {
      const work = async () => {
        await this.recoverFromCrash()
        await this.resetInterrupted()
        for (;;) {
          if (this.state.waitingForNetwork) break
          const [next] = await db.notes.where('status').equals('queued').sortBy('createdAt')
          if (!next) break
          await this.process(next)
        }
      }
      if (navigator.locks) await navigator.locks.request('transcriber', { ifAvailable: true }, (lock) => (lock ? work() : undefined))
      else await work()
    } finally {
      this.draining = false
      if (this.drainRequested) void this.drain()
    }
  }

  /** If the last session died during heavy work, switch to lighter settings and retry the note. */
  private async recoverFromCrash() {
    const work = readWork()
    writeWork(null)
    if (!work || work.hidden) return
    if ((await this.makeSafer(work)) && work.noteId) await updateNote(work.noteId, { transcribeAttempts: 0, requestedModel: undefined })
  }

  /** GPU → CPU first, then small → base. Returns false when nothing lighter is left. */
  private async makeSafer(work: HeavyWork): Promise<boolean> {
    const settings = await getSettings()
    if (work.engine === 'gpu' && settings.useGpu) {
      await saveSettings({ useGpu: false })
      showToast(
        { tone: 'warning', message: 'Transcription crashed on the GPU (probably out of memory), so it now runs on the CPU. Retrying. You can change this in Settings → Transcription.' },
        12_000,
      )
      return true
    }
    if (work.model === 'small') {
      if (settings.model === 'small') await saveSettings({ model: 'base' })
      showToast({ tone: 'warning', message: 'whisper-small ran out of memory, so the app switched to whisper-base. Retrying.' }, 12_000)
      return true
    }
    return false
  }

  /** Notes stuck in "transcribing" were cut off by a reload or crash; queue them again, but not forever. */
  private async resetInterrupted() {
    const stuck = await db.notes.where('status').equals('transcribing').toArray()
    for (const note of stuck) {
      if (note.transcribeAttempts >= MAX_ATTEMPTS) {
        await this.fail(
          note,
          note.requestedModel === 'small' || (await getSettings()).model === 'small'
            ? 'The app closed twice while transcribing this note, most likely because whisper-small ran out of memory. Retry with the base model.'
            : 'The app closed twice while transcribing this note, most likely out of memory. Try again with the app in the foreground.',
        )
      } else {
        await updateNote(note.id, { status: 'queued', progress: 0 })
      }
    }
  }

  private async fail(note: Note, message: string) {
    if (note.statusBeforeRetry) {
      // A re-transcription failed: keep the old text and status.
      await updateNote(note.id, {
        status: note.statusBeforeRetry,
        statusBeforeRetry: undefined,
        requestedModel: undefined,
        progress: 0,
        error: `Re-transcription failed: ${message} The previous text is unchanged.`,
      })
    } else {
      await updateNote(note.id, { status: 'failed', progress: 0, error: message })
    }
  }

  private async process(note: Note) {
    const settings = await getSettings()
    const model = note.requestedModel ?? settings.model
    await updateNote(note.id, {
      status: 'transcribing',
      progress: 0,
      error: undefined,
      transcribeAttempts: note.transcribeAttempts + 1,
    })

    writeWork({ kind: 'job', model, engine: null, noteId: note.id, hidden: document.visibilityState === 'hidden' })
    let audio: Float32Array
    try {
      const blob = await getNoteAudio(note.id)
      if (!blob) throw new Error('The audio for this note has been deleted.')
      audio = await decodeToMono16k(blob)
    } catch (err) {
      writeWork(null)
      await this.fail(note, (err as Error).message)
      return
    }
    const decodedMs = Math.round((audio.length / WHISPER_SAMPLE_RATE) * 1000)
    if (!note.durationMs && decodedMs) await updateNote(note.id, { durationMs: decodedMs })

    let lastWrite = 0
    this.set({ live: { noteId: note.id, segments: [] } })
    try {
      const result = await this.run(note.id, audio, model, settings.language, settings.useGpu, (ratio, segments) => {
        this.set({ live: { noteId: note.id, segments: cleanSegments(segments) } })
        const now = performance.now()
        if (now - lastWrite > 400 || ratio >= 1) {
          lastWrite = now
          void updateNote(note.id, { progress: Math.min(0.99, ratio) })
        }
      })
      const fresh = await db.notes.get(note.id)
      if (!fresh) return // deleted while transcribing
      const segments = cleanSegments(result.segments)
      const text = segmentsToText(segments)
      await updateNote(note.id, {
        status: 'ready',
        progress: 1,
        segments,
        text,
        language: result.language ?? undefined,
        model: `whisper-${model}`,
        transcribedAt: Date.now(),
        title: fresh.titleEdited ? fresh.title : titleFromText(text) || fresh.title,
        requestedModel: undefined,
        statusBeforeRetry: undefined,
        transcribeAttempts: 0,
        error: segments.length ? undefined : 'No speech was detected in this recording.',
      })
    } catch (err) {
      const e = err as TranscriptionError
      const fresh = (await db.notes.get(note.id)) ?? note
      if (e.retry) {
        // Lighter settings were chosen after a crash: try this note again with them.
        await updateNote(note.id, { status: 'queued', progress: 0, transcribeAttempts: 0, requestedModel: undefined, error: undefined })
      } else if (e.network) {
        // Model not downloaded yet and we're offline: wait for a connection, keep the note queued.
        await updateNote(note.id, {
          status: 'queued',
          progress: 0,
          transcribeAttempts: note.transcribeAttempts,
          error: 'Waiting for a connection to download the speech model (one time only).',
        })
        this.set({ waitingForNetwork: true })
      } else {
        await this.fail(fresh, e.message)
      }
    } finally {
      writeWork(null)
      this.set({ live: null })
    }
  }

  /** Queue a note again, optionally with a different model. Old text stays until the new one succeeds. */
  async retry(note: Note, model?: ModelSize) {
    const hasText = note.text.trim().length > 0 && note.status !== 'failed'
    await updateNote(note.id, {
      status: 'queued',
      progress: 0,
      error: undefined,
      transcribeAttempts: 0,
      requestedModel: model,
      statusBeforeRetry: hasText ? note.status : undefined,
    })
    if (this.state.waitingForNetwork && navigator.onLine) this.set({ waitingForNetwork: false })
    void this.drain()
  }
}

export const transcription = new TranscriptionService()

export function useTranscriptionState() {
  return useSyncExternalStore(transcription.subscribe, transcription.getSnapshot)
}

/** Whether the model files are already in the browser's cache (so it works offline). */
export async function isModelCached(model: ModelSize): Promise<boolean> {
  if (!('caches' in window)) return false
  try {
    const cache = await caches.open('transformers-cache')
    const keys = (await cache.keys()).map((r) => r.url)
    const id = `whisper-${model}/`
    return keys.some((u) => u.includes(id) && u.includes('encoder_model')) && keys.some((u) => u.includes(id) && u.includes('decoder_model_merged'))
  } catch {
    return false
  }
}

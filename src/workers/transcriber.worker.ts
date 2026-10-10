/// <reference lib="webworker" />
// Transformers.js is only ever imported here, so it stays out of the main bundle.
import {
  Tensor,
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
} from '@huggingface/transformers'
import type { ModelSize, Segment } from '../db/db'
import { planWindows, toOriginalTime, windowAudio, type Window } from '../lib/audio-plan'
import { MODEL_IDS, type Engine, type WorkerRequest, type WorkerResponse } from './protocol'

declare const self: DedicatedWorkerGlobalScope

env.allowLocalModels = false

const SAMPLE_RATE = 16000

// Both halves on one device. Splitting encoder (WebGPU) and decoder (WASM) was tried and
// silently dropped speech with the fp32 encoder, so the GPU path follows the upstream demo.
function engineOptions(engine: Engine, f16: boolean) {
  return engine === 'gpu'
    ? { device: 'webgpu', dtype: { encoder_model: f16 ? 'fp16' : 'fp32', decoder_model_merged: 'q4' } }
    : { device: 'wasm', dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' } }
}

interface Loaded {
  model: ModelSize
  engine: Engine
  pipe: AutomaticSpeechRecognitionPipeline
}

let current: Loaded | null = null
let gpuFailed = false

function post(msg: WorkerResponse) {
  self.postMessage(msg)
}

function isNetworkError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err)
  return !navigator.onLine || /fetch|network|load failed|ERR_INTERNET|Could not locate file|status 0/i.test(msg)
}

/** null when WebGPU is unusable; otherwise whether the GPU can do fp16 math. */
async function gpuSupport(): Promise<{ f16: boolean } | null> {
  if (gpuFailed || !('gpu' in navigator)) return null
  try {
    const adapter = await navigator.gpu.requestAdapter()
    return adapter ? { f16: adapter.features.has('shader-f16') } : null
  } catch {
    return null
  }
}

async function load(model: ModelSize, allowGpu: boolean): Promise<Loaded> {
  const gpu = allowGpu ? await gpuSupport() : null
  const engine: Engine = gpu ? 'gpu' : 'cpu'
  if (current?.model === model && current.engine === engine) return current
  if (current) {
    await current.pipe.dispose().catch(() => {})
    current = null
  }
  post({ type: 'model', model, status: 'loading', engine })
  try {
    const pipe = (await pipeline('automatic-speech-recognition', MODEL_IDS[model], {
      ...engineOptions(engine, gpu?.f16 ?? false),
      progress_callback: (info: ProgressInfo) => {
        if (info.status === 'progress_total') post({ type: 'download', model, loaded: info.loaded, total: info.total })
      },
    } as Parameters<typeof pipeline>[2])) as AutomaticSpeechRecognitionPipeline
    current = { model, engine, pipe }
  } catch (err) {
    if (engine === 'gpu' && !isNetworkError(err)) {
      console.warn('WebGPU failed, falling back to WASM:', err)
      gpuFailed = true
      return load(model, false)
    }
    throw err
  }
  post({ type: 'model', model, status: 'ready', engine })
  return current
}

/** Whisper's language guess: one decoder step from <|startoftranscript|>, best language token wins. */
async function detectLanguage(pipe: AutomaticSpeechRecognitionPipeline, samples: Float32Array): Promise<string> {
  const { input_features } = await pipe.processor(samples)
  const config = (pipe.model as unknown as { generation_config: { decoder_start_token_id: number; lang_to_id: Record<string, number> } })
    .generation_config
  const decoder_input_ids = new Tensor('int64', BigInt64Array.from([BigInt(config.decoder_start_token_id)]), [1, 1])
  const { logits } = (await (pipe.model as unknown as (inputs: object) => Promise<{ logits: Tensor }>)({
    input_features,
    decoder_input_ids,
  })) as { logits: Tensor }
  const scores = logits.data as Float32Array
  let best = 'en'
  let bestScore = -Infinity
  for (const [token, id] of Object.entries(config.lang_to_id)) {
    if (scores[id] > bestScore) {
      bestScore = scores[id]
      best = token.slice(2, -2)
    }
  }
  return best
}

interface WhisperOutput {
  text: string
  chunks?: { timestamp: [number | null, number | null]; text: string }[]
}

async function transcribeWindows(
  loaded: Loaded,
  jobId: string,
  audio: Float32Array,
  windows: Window[],
  language: string,
): Promise<{ segments: Segment[]; language: string }> {
  const { pipe } = loaded
  let lang = language
  if (lang === 'auto') {
    // Guess from the window with the most audio among the first few.
    const sample = windows.slice(0, 3).reduce((a, b) => (b.length > a.length ? b : a))
    lang = await detectLanguage(pipe, windowAudio(audio, sample))
  }
  const total = windows.reduce((s, w) => s + w.length, 0)
  const segments: Segment[] = []
  let done = 0
  post({ type: 'progress', jobId, ratio: 0.02, segments, language: lang })
  for (const window of windows) {
    const samples = windowAudio(audio, window)
    const seconds = window.length / SAMPLE_RATE
    const out = (await pipe(samples, { return_timestamps: true, language: lang, task: 'transcribe' })) as WhisperOutput
    const chunks = out.chunks?.length ? out.chunks : [{ timestamp: [0, seconds] as [number, number], text: out.text }]
    for (const chunk of chunks) {
      const start = Math.min(chunk.timestamp[0] ?? 0, seconds)
      const end = Math.min(chunk.timestamp[1] ?? seconds, seconds)
      segments.push({
        start: toOriginalTime(window, start, SAMPLE_RATE),
        end: toOriginalTime(window, Math.max(start, end), SAMPLE_RATE),
        text: chunk.text.trim(),
      })
    }
    done += window.length
    post({ type: 'progress', jobId, ratio: Math.max(0.02, done / total), segments, language: lang })
  }
  return { segments, language: lang }
}

async function handle(req: WorkerRequest) {
  if (req.type === 'load') {
    try {
      await load(req.model, req.allowGpu)
    } catch (err) {
      post({ type: 'error', message: String((err as Error)?.message ?? err), network: isNetworkError(err) })
    }
    return
  }

  const { jobId, audio, model, language, allowGpu } = req
  try {
    const windows = planWindows(audio, SAMPLE_RATE)
    if (windows.length === 0) {
      post({ type: 'done', jobId, segments: [], language: null, engine: current?.engine ?? 'cpu' })
      return
    }
    let loaded = await load(model, allowGpu)
    let result
    try {
      result = await transcribeWindows(loaded, jobId, audio, windows, language)
    } catch (err) {
      if (loaded.engine !== 'gpu') throw err
      // Some GPUs load the model but fail at run time; redo the job on WASM.
      console.warn('WebGPU transcription failed, retrying on WASM:', err)
      gpuFailed = true
      loaded = await load(model, false)
      result = await transcribeWindows(loaded, jobId, audio, windows, language)
    }
    post({ type: 'done', jobId, segments: result.segments, language: result.language, engine: loaded.engine })
  } catch (err) {
    post({ type: 'error', jobId, message: String((err as Error)?.message ?? err), network: isNetworkError(err) })
  }
}

// One request at a time: the pipeline is a singleton and ONNX sessions can't run concurrently.
let queue = Promise.resolve()
self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  queue = queue.then(() => handle(e.data))
}

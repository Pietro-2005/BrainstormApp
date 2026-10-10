import type { ModelSize, Segment } from '../db/db'

/** 'gpu' = WebGPU (fp16/fp32 encoder, 4-bit decoder); 'cpu' = WebAssembly (8-bit). */
export type Engine = 'gpu' | 'cpu'

export const MODEL_IDS: Record<ModelSize, string> = {
  base: 'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small',
}

/** Approximate one-time download in MB (encoder + decoder files on Hugging Face; GPU assumes fp16). */
export const DOWNLOAD_MB: Record<ModelSize, Record<Engine, number>> = {
  base: { cpu: 77, gpu: 165 },
  small: { cpu: 249, gpu: 410 },
}

export type WorkerRequest =
  | { type: 'load'; model: ModelSize; allowGpu: boolean }
  | { type: 'transcribe'; jobId: string; audio: Float32Array; model: ModelSize; language: string; allowGpu: boolean }

export type WorkerResponse =
  | { type: 'model'; model: ModelSize; status: 'loading' | 'ready'; engine: Engine }
  | { type: 'download'; model: ModelSize; loaded: number; total: number }
  | { type: 'progress'; jobId: string; ratio: number; segments: Segment[]; language: string | null }
  | { type: 'done'; jobId: string; segments: Segment[]; language: string | null; engine: Engine }
  | { type: 'error'; jobId?: string; message: string; network: boolean }

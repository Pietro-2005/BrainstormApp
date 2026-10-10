export const WHISPER_SAMPLE_RATE = 16000

/**
 * Decode any audio the browser understands (WebM/Opus, MP4/AAC, MP3, WAV…) to mono 16 kHz.
 * Decoding through an OfflineAudioContext at 16 kHz resamples during decode, which keeps
 * memory low for long recordings; we never assume a container format.
 */
export async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const data = await blob.arrayBuffer()
  const ctx = new OfflineAudioContext(1, 1, WHISPER_SAMPLE_RATE)
  let buffer: AudioBuffer
  try {
    buffer = await ctx.decodeAudioData(data)
  } catch (err) {
    throw new Error(
      `This browser can't decode the audio (${blob.type || 'unknown format'}). ${(err as Error)?.message ?? ''}`.trim(),
    )
  }
  const length = buffer.length
  const mono = new Float32Array(length)
  if (buffer.numberOfChannels === 1) {
    buffer.copyFromChannel(mono, 0)
    return mono
  }
  const channel = new Float32Array(length)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    buffer.copyFromChannel(channel, c)
    for (let i = 0; i < length; i++) mono[i] += channel[i] / buffer.numberOfChannels
  }
  return mono
}

import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate'
import { db, getNoteAudio } from '../db/db'
import { getSettings } from '../db/settings'
import { fileExtensionForMime } from './format'
import { noteFilename, renderNote } from './template'

/**
 * Everything in one .zip: a Markdown file per note, its audio, and voice-notes.json
 * (all note data, for a full backup). Audio is stored uncompressed — it already is.
 */
export async function exportAll(onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const [notes, settings] = await Promise.all([db.notes.orderBy('createdAt').toArray(), getSettings()])
  const parts: Uint8Array[] = []
  const finished = new Promise<Blob>((resolve, reject) => {
    const zip = new Zip((err, data, final) => {
      if (err) return reject(err)
      parts.push(data)
      if (final) resolve(new Blob(parts as BlobPart[], { type: 'application/zip' }))
    })
    void (async () => {
      try {
        // One base name per note, shared by its .md and audio, so they pair up.
        const used = new Set<string>()
        const uniqueStem = (stem: string) => {
          let candidate = stem
          for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${stem} (${i})`
          used.add(candidate.toLowerCase())
          return candidate
        }
        const addFile = (name: string, data: Uint8Array, compress: boolean) => {
          const file = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name)
          zip.add(file)
          file.push(data, true)
        }
        for (const [i, note] of notes.entries()) {
          const stem = uniqueStem(noteFilename(note, '').replace(/\.$/, ''))
          addFile(`notes/${stem}.md`, strToU8(renderNote(settings.template, note)), true)
          const audio = note.hasAudio ? await getNoteAudio(note.id) : null
          if (audio) addFile(`audio/${stem}.${fileExtensionForMime(audio.type)}`, new Uint8Array(await audio.arrayBuffer()), false)
          onProgress?.(i + 1, notes.length)
        }
        const backup = { app: 'voice-notes', exportedAt: new Date().toISOString(), notes }
        addFile('voice-notes.json', strToU8(JSON.stringify(backup, null, 2)), true)
        zip.end()
      } catch (err) {
        reject(err)
      }
    })()
  })
  return finished
}

export function exportFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `voice-notes-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`
}

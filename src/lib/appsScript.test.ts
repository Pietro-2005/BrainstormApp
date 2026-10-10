import { describe, expect, it } from 'vitest'
import { SCRIPT_URL_RE, scriptSource } from './appsScript'
import { inboxEntry, inboxIntro } from './send'

/** Run the generated Apps Script with fake Google services standing in for DocumentApp & co. */
function loadScript(secret: string) {
  const docs = new Map<string, { id: string; title: string; paragraphs: string[] }>()
  const props = new Map<string, string>()
  let nextId = 1
  const makeDoc = (doc: { id: string; title: string; paragraphs: string[] }) => ({
    getId: () => doc.id,
    getUrl: () => `https://docs.google.com/document/d/${doc.id}/edit`,
    saveAndClose: () => {},
    getBody: () => ({
      getParagraphs: () => doc.paragraphs.map((text, i) => ({ getText: () => text, setText: (t: string) => (doc.paragraphs[i] = t) })),
      appendParagraph: (t: string) => doc.paragraphs.push(t),
    }),
  })
  const globals = {
    DocumentApp: {
      create: (title: string) => {
        const doc = { id: `doc${nextId++}`, title, paragraphs: [''] }
        docs.set(doc.id, doc)
        return makeDoc(doc)
      },
      openById: (id: string) => {
        const doc = docs.get(id)
        if (!doc) throw new Error('not found')
        return makeDoc(doc)
      },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => props.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => JSON.parse(s) }) },
  }
  const run = new Function(...Object.keys(globals), `${scriptSource(secret)}\nreturn { doPost, doGet };`)
  const { doPost, doGet } = run(...Object.values(globals))
  const post = (body: object) => doPost({ postData: { contents: JSON.stringify(body) } })
  return { post, doGet, docs }
}

const note = { title: 'Call the dentist', createdAt: new Date(2026, 9, 11, 9, 0).getTime(), durationMs: 12_000, tags: [], text: 'Call the dentist.' }

describe('generated Apps Script', () => {
  it('rejects the wrong secret', () => {
    const { post, docs } = loadScript('s3cret')
    expect(post({ secret: 'nope', title: 'Inbox', text: 'x' })).toMatchObject({ ok: false })
    expect(docs.size).toBe(0)
  })

  it('creates the doc once with the intro, then appends notes to it', () => {
    const { post, docs } = loadScript('s3cret')
    const first = post({ secret: 's3cret', title: 'Voice Notes Inbox', intro: inboxIntro('Voice Notes Inbox'), text: inboxEntry('## {title}\n\n{text}', note) })
    expect(first).toMatchObject({ ok: true, created: true, docId: 'doc1' })
    const second = post({ secret: 's3cret', title: 'Voice Notes Inbox', intro: 'ignored', text: inboxEntry('## {title}\n\n{text}', { ...note, title: 'Second' }) })
    expect(second).toMatchObject({ ok: true, created: false, docId: 'doc1' })
    const paragraphs = docs.get('doc1')!.paragraphs
    expect(paragraphs[0]).toBe('Voice Notes Inbox') // no blank first line
    expect(paragraphs.filter((p) => p === '---')).toHaveLength(3) // intro + two notes
    expect(paragraphs).toContain('## Call the dentist')
    expect(paragraphs.join('\n')).toContain('## Second')
  })

  it('a test ping creates the doc without adding a note, and a deleted doc is replaced', () => {
    const { post, docs } = loadScript('k')
    expect(post({ secret: 'k', title: 'Inbox 2026-10', intro: 'Intro', text: '' })).toMatchObject({ ok: true, created: true })
    expect(docs.get('doc1')!.paragraphs).toEqual(['Intro'])
    docs.clear()
    expect(post({ secret: 'k', title: 'Inbox 2026-10', intro: 'Intro', text: 'Note' })).toMatchObject({ ok: true, created: true, docId: 'doc2' })
  })

  it('answers GET so the URL can be checked in a browser', () => {
    expect(loadScript('k').doGet()).toEqual({ ok: true, app: 'voice-notes-inbox' })
  })

  it('recognises web app URLs', () => {
    expect(SCRIPT_URL_RE.test('https://script.google.com/macros/s/AKfycbx_abc-123/exec')).toBe(true)
    expect(SCRIPT_URL_RE.test('https://script.google.com/a/macros/school.edu/s/AKfy/exec')).toBe(true)
    expect(SCRIPT_URL_RE.test('https://script.google.com/home/projects/123/edit')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { SCRIPT_URL_RE, SCRIPT_VERSION, scriptSource } from './appsScript'
import { inboxEntry, inboxIntro } from './send'

interface FakeParagraph {
  text: string
}

/** A small model of DocumentApp: a body of paragraphs plus named ranges over them. */
function fakeGoogle() {
  const docs = new Map<string, { id: string; title: string; body: FakeParagraph[]; named: { name: string; items: FakeParagraph[] }[] }>()
  const props = new Map<string, string>()
  let nextId = 1

  const wrapParagraph = (doc: { body: FakeParagraph[] }, p: FakeParagraph) => ({
    __p: p,
    getText: () => p.text,
    setText: (t: string) => (p.text = t),
    asParagraph() {
      return this
    },
    removeFromParent: () => {
      if (doc.body.length === 1) throw new Error("Can't remove the last paragraph in a document section.")
      doc.body.splice(doc.body.indexOf(p), 1)
    },
  })

  const wrapDoc = (doc: { id: string; body: FakeParagraph[]; named: { name: string; items: FakeParagraph[] }[] }) => ({
    getId: () => doc.id,
    getUrl: () => `https://docs.google.com/document/d/${doc.id}/edit`,
    saveAndClose: () => {},
    getBody: () => ({
      getParagraphs: () => doc.body.map((p) => wrapParagraph(doc, p)),
      getNumChildren: () => doc.body.length,
      getChildIndex: (el: { __p: FakeParagraph }) => doc.body.indexOf(el.__p),
      appendParagraph: (text: string) => {
        const p = { text }
        doc.body.push(p)
        return wrapParagraph(doc, p)
      },
      insertParagraph: (index: number, text: string) => {
        const p = { text }
        doc.body.splice(index, 0, p)
        return wrapParagraph(doc, p)
      },
    }),
    newRange: () => {
      const items: FakeParagraph[] = []
      const builder = { addElement: (el: { __p: FakeParagraph }) => (items.push(el.__p), builder), build: () => ({ items }) }
      return builder
    },
    addNamedRange: (name: string, range: { items: FakeParagraph[] }) => doc.named.push({ name, items: range.items }),
    getNamedRanges: (name: string) =>
      doc.named
        .filter((n) => n.name === name)
        .map((n) => ({
          getRange: () => ({
            getRangeElements: () => n.items.filter((p) => doc.body.includes(p)).map((p) => ({ getElement: () => wrapParagraph(doc, p) })),
          }),
          remove: () => doc.named.splice(doc.named.indexOf(n), 1),
        })),
  })

  const globals = {
    DocumentApp: {
      create: (title: string) => {
        const doc = { id: `doc${nextId++}`, title, body: [{ text: '' }], named: [] }
        docs.set(doc.id, doc)
        return wrapDoc(doc)
      },
      openById: (id: string) => {
        const doc = docs.get(id)
        if (!doc) throw new Error('not found')
        return wrapDoc(doc)
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => props.get(k) ?? null,
        setProperty: (k: string, v: string) => props.set(k, v),
        getProperties: () => Object.fromEntries(props),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => JSON.parse(s) }) },
  }
  return { globals, docs }
}

function loadScript(secret: string) {
  const { globals, docs } = fakeGoogle()
  const run = new Function(...Object.keys(globals), `${scriptSource(secret)}\nreturn { doPost, doGet };`)
  const { doPost, doGet } = run(...Object.values(globals))
  const post = (body: object) => doPost({ postData: { contents: JSON.stringify({ secret, ...body }) } })
  const text = (id: string) => docs.get(id)!.body.map((p) => p.text).join('\n')
  return { post, doPost, doGet, docs, text }
}

const TEMPLATE = '## {title}\n\n{text}'
const note = (title: string, text: string) => ({ title, createdAt: new Date(2026, 9, 11, 9, 0).getTime(), durationMs: 12_000, tags: [], text })
const send = (title: string, text: string, noteId: string, docId?: string) => ({
  action: 'upsert',
  title: 'Voice Notes Inbox',
  intro: inboxIntro('Voice Notes Inbox'),
  text: inboxEntry(TEMPLATE, note(title, text)),
  noteId,
  docId,
})

describe('generated Apps Script', () => {
  it('rejects the wrong secret', () => {
    const { doPost, docs } = loadScript('s3cret')
    expect(doPost({ postData: { contents: JSON.stringify({ secret: 'nope', title: 'Inbox', text: 'x' }) } })).toMatchObject({ ok: false })
    expect(docs.size).toBe(0)
  })

  it('creates the doc once with the intro, then appends notes', () => {
    const { post, docs, text } = loadScript('k')
    expect(post(send('First', 'One.', 'n1'))).toMatchObject({ ok: true, created: true, docId: 'doc1', version: SCRIPT_VERSION })
    expect(post(send('Second', 'Two.', 'n2'))).toMatchObject({ ok: true, created: false, docId: 'doc1' })
    expect(docs.get('doc1')!.body[0].text).toBe('Voice Notes Inbox') // no blank first line
    expect(text('doc1')).toMatch(/## First\n\nOne\.\n\n---\n\n## Second\n\nTwo\.\n\n---\n$/)
  })

  it('re-sending a note replaces it in place instead of adding a copy', () => {
    const { post, text } = loadScript('k')
    post(send('First', 'One.', 'n1'))
    post(send('Second', 'Two.', 'n2'))
    post(send('First (edited)', 'One, fixed.', 'n1', 'doc1'))
    const t = text('doc1')
    expect(t).not.toContain('## First\n')
    expect(t.indexOf('## First (edited)')).toBeLessThan(t.indexOf('## Second'))
    expect(t.match(/---/g)).toHaveLength(3)
  })

  it('deleting a note removes exactly its text, including the last one in the doc', () => {
    const { post, text } = loadScript('k')
    post(send('First', 'One.', 'n1'))
    post(send('Second', 'Two.', 'n2'))
    post(send('Third', 'Three.', 'n3'))
    expect(post({ action: 'delete', noteId: 'n2', docId: 'doc1' })).toMatchObject({ ok: true, removed: 1, version: SCRIPT_VERSION })
    expect(text('doc1')).not.toContain('Second')
    expect(text('doc1')).toContain('## First')
    expect(post({ action: 'delete', noteId: 'n3' })).toMatchObject({ ok: true, removed: 1 }) // found without a doc id
    expect(text('doc1')).not.toContain('Third')
    expect(post({ action: 'delete', noteId: 'n3' })).toMatchObject({ ok: true, removed: 0 })
    // Removing everything still leaves a valid doc.
    post({ action: 'delete', noteId: 'n1' })
    expect(text('doc1')).toContain('Voice Notes Inbox')
  })

  it('a test ping creates the doc without adding a note, and a deleted doc is replaced', () => {
    const { post, docs } = loadScript('k')
    expect(post({ action: 'upsert', title: 'Inbox 2026-10', intro: 'Intro', text: '' })).toMatchObject({ ok: true, created: true })
    expect(docs.get('doc1')!.body.map((p) => p.text)).toEqual(['Intro'])
    docs.clear()
    expect(post({ action: 'upsert', title: 'Inbox 2026-10', intro: 'Intro', text: 'Note', noteId: 'x' })).toMatchObject({ ok: true, created: true, docId: 'doc2' })
  })

  it('answers GET with its version so the app can spot an outdated script', () => {
    expect(loadScript('k').doGet()).toEqual({ ok: true, app: 'voice-notes-inbox', version: SCRIPT_VERSION })
  })

  it('recognises web app URLs', () => {
    expect(SCRIPT_URL_RE.test('https://script.google.com/macros/s/AKfycbx_abc-123/exec')).toBe(true)
    expect(SCRIPT_URL_RE.test('https://script.google.com/a/macros/school.edu/s/AKfy/exec')).toBe(true)
    expect(SCRIPT_URL_RE.test('https://script.google.com/home/projects/123/edit')).toBe(false)
  })
})

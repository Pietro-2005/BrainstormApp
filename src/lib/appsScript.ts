/**
 * Google Doc inbox through a Google Apps Script web app the user deploys in their own account.
 * Free with any Gmail account and needs no Google Cloud project, OAuth client or billing.
 * The script runs as the user, so the doc lands in their Drive.
 */

/** Bump when the script changes; Settings asks the user to redeploy older scripts. */
export const SCRIPT_VERSION = 2

// Personal accounts: /macros/s/<id>/exec; Google Workspace: /a/macros/<domain>/s/<id>/exec
export const SCRIPT_URL_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/

export class ScriptError extends Error {}

export const WRONG_SECRET =
  'Wrong secret: the deployed script has a different key from this app. Either the script was copied on another device or browser, or an older version is still deployed. Fix: tap Copy script here, paste it over the code in Apps Script, save, then Deploy → Manage deployments → ✏️ → Version: New version → Deploy, and tap Test again. Or paste the key from the script into Secret key below.'

export interface ScriptResult {
  docId: string
  docUrl: string
  created: boolean
  /** 1 for scripts deployed before versioning. */
  version: number
  /** Delete only: how many entries were removed. */
  removed?: number
}

export type ScriptRequest =
  | { action: 'upsert'; title: string; intro: string; text: string; noteId?: string; docId?: string }
  | { action: 'delete'; noteId: string; docId?: string }

export function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * POST to the script. The body is sent as text/plain so the browser makes a "simple"
 * request with no CORS preflight (Apps Script can't answer OPTIONS); its reply allows any origin.
 */
export async function postToScript(url: string, secret: string, request: ScriptRequest): Promise<ScriptResult> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 60_000)
  let res: Response
  try {
    res = await fetch(url.trim(), { method: 'POST', body: JSON.stringify({ secret, ...request }), signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
  const body = await res.text()
  let data: Partial<ScriptResult> & { ok?: boolean; error?: string }
  try {
    data = JSON.parse(body)
  } catch {
    throw new ScriptError(
      res.ok
        ? 'The script answered with a web page instead of data. In Apps Script, check Deploy → Manage deployments: “Execute as: Me” and “Who has access: Anyone”.'
        : `The script returned an error (${res.status}). Check that the web app URL is the latest deployment.`,
    )
  }
  if (data.error?.startsWith('Wrong secret')) throw new ScriptError(WRONG_SECRET)
  if (!data.ok) throw new ScriptError(data.error || 'The script reported an error.')
  const version = data.version ?? 1
  if (request.action === 'delete' && version < 2)
    throw new ScriptError('Your Apps Script is out of date, so it can’t remove notes from the doc. Update it from Settings → Google Doc inbox.')
  return { docId: data.docId ?? '', docUrl: data.docUrl ?? '', created: !!data.created, version, removed: data.removed }
}

/** Ask the deployed script for its version (GET needs no secret). Null if it can't be reached. */
export async function scriptVersionAt(url: string): Promise<number | null> {
  try {
    const res = await fetch(url.trim())
    const data = (await res.json()) as { ok?: boolean; version?: number }
    return data.ok ? (data.version ?? 1) : null
  } catch {
    return null
  }
}

/** The Apps Script source the user pastes into script.google.com, with their secret filled in. */
export function scriptSource(secret: string): string {
  return `/**
 * Voice Notes inbox (version ${SCRIPT_VERSION}): receives notes from the Voice Notes app and
 * keeps them in a Google Doc in your Drive. Each note is wrapped in an invisible named
 * range, so sending it again updates it in place and deleting it in the app removes it.
 * Deploy → New deployment → Web app, Execute as "Me", Who has access "Anyone".
 * The secret stops anyone else who finds the URL from writing to your doc.
 */
const SECRET = '${secret}';
const VERSION = ${SCRIPT_VERSION};

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'Bad request.' });
  }
  if (req.secret !== SECRET) {
    return reply({ ok: false, error: 'Wrong secret. Copy the script again from the app Settings and redeploy.' });
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return reply(req.action === 'delete' ? removeNote(req) : upsertNote(req));
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return reply({ ok: true, app: 'voice-notes-inbox', version: VERSION });
}

/** Add a note, or replace it in place if this note was sent before. */
function upsertNote(req) {
  const name = req.noteId ? 'vn:' + req.noteId : null;
  let doc = req.docId && name ? openDoc(req.docId) : null;
  let created = false;
  // Re-sends update the doc the note first went to (e.g. last month's), if it's still there.
  if (!doc || doc.getNamedRanges(name).length === 0) {
    const found = docForTitle(String(req.title || 'Voice Notes Inbox').slice(0, 200), req.intro);
    doc = found.doc;
    created = found.created;
  }
  if (req.text) {
    const old = name ? doc.getNamedRanges(name) : [];
    const at = old.length ? removeRanges(doc, old) : -1;
    const paragraphs = insertLines(doc, req.text, at);
    if (name && paragraphs.length) {
      const range = doc.newRange();
      paragraphs.forEach(function (p) {
        range.addElement(p);
      });
      doc.addNamedRange(name, range.build());
    }
  }
  doc.saveAndClose();
  return { ok: true, version: VERSION, docId: doc.getId(), docUrl: doc.getUrl(), created: created };
}

/** Remove a note from the doc it was sent to (or from any inbox doc if that's unknown). */
function removeNote(req) {
  const name = 'vn:' + req.noteId;
  const ids = req.docId ? [req.docId] : inboxDocIds();
  let removed = 0;
  ids.forEach(function (id) {
    const doc = openDoc(id);
    if (!doc) return;
    const ranges = doc.getNamedRanges(name);
    if (ranges.length) {
      removeRanges(doc, ranges);
      removed += ranges.length;
      doc.saveAndClose();
    }
  });
  return { ok: true, version: VERSION, removed: removed };
}

function docForTitle(title, intro) {
  const props = PropertiesService.getScriptProperties();
  const key = 'doc:' + title;
  const id = props.getProperty(key);
  let doc = id ? openDoc(id) : null;
  if (doc) return { doc: doc, created: false };
  doc = DocumentApp.create(title);
  props.setProperty(key, doc.getId());
  if (intro) insertLines(doc, intro, -1);
  return { doc: doc, created: true };
}

function inboxDocIds() {
  const all = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(all)
    .filter(function (k) {
      return k.indexOf('doc:') === 0;
    })
    .map(function (k) {
      return all[k];
    });
}

function openDoc(id) {
  try {
    return DocumentApp.openById(id);
  } catch (err) {
    return null; // deleted or trashed
  }
}

/** Delete the paragraphs in these named ranges; returns the body index where they started. */
function removeRanges(doc, ranges) {
  const body = doc.getBody();
  let at = -1;
  ranges.forEach(function (named) {
    named.getRange().getRangeElements().forEach(function (re) {
      const el = re.getElement();
      const index = body.getChildIndex(el);
      if (at < 0 || index < at) at = index;
      try {
        el.removeFromParent();
      } catch (err) {
        el.asParagraph().setText(''); // a doc must keep its last paragraph
      }
    });
    named.remove();
  });
  return at;
}

/** Insert text as paragraphs at a body index (or at the end when index < 0); returns them. */
function insertLines(doc, text, index) {
  const body = doc.getBody();
  const lines = String(text).replace(/\\n+$/, '\\n').split('\\n');
  const added = [];
  // A new doc starts with one empty paragraph: fill it instead of leaving a blank first line.
  const paragraphs = body.getParagraphs();
  if (index < 0 && paragraphs.length === 1 && paragraphs[0].getText() === '') {
    paragraphs[0].setText(lines.shift());
    added.push(paragraphs[0]);
  }
  lines.forEach(function (line, i) {
    added.push(index < 0 ? body.appendParagraph(line) : body.insertParagraph(Math.min(index + i, body.getNumChildren()), line));
  });
  return added;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
`
}

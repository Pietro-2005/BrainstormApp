/**
 * Google Doc inbox through a Google Apps Script web app the user deploys in their own account.
 * Free with any Gmail account and needs no Google Cloud project, OAuth client or billing.
 * The script runs as the user, so the doc lands in their Drive.
 */

// Personal accounts: /macros/s/<id>/exec; Google Workspace: /a/macros/<domain>/s/<id>/exec
export const SCRIPT_URL_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/

export class ScriptError extends Error {}

export interface ScriptResult {
  docId: string
  docUrl: string
  created: boolean
}

export function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * POST a note to the script. The body is sent as text/plain so the browser makes a "simple"
 * request with no CORS preflight (Apps Script can't answer OPTIONS); its reply allows any origin.
 */
export async function postToScript(
  url: string,
  payload: { secret: string; title: string; intro: string; text: string },
): Promise<ScriptResult> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 60_000)
  let res: Response
  try {
    res = await fetch(url.trim(), { method: 'POST', body: JSON.stringify(payload), signal: controller.signal })
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
  if (!data.ok || !data.docId) throw new ScriptError(data.error || 'The script reported an error.')
  return { docId: data.docId, docUrl: data.docUrl ?? '', created: !!data.created }
}

/** The Apps Script source the user pastes into script.google.com, with their secret filled in. */
export function scriptSource(secret: string): string {
  return `/**
 * Voice Notes inbox: receives notes from the Voice Notes app and appends them to a
 * Google Doc in your Drive.
 * Deploy → New deployment → Web app, Execute as "Me", Who has access "Anyone".
 * The secret stops anyone else who finds the URL from writing to your doc.
 */
const SECRET = '${secret}';

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
  const title = String(req.title || 'Voice Notes Inbox').slice(0, 200);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const key = 'doc:' + title;
    let doc = null;
    let created = false;
    const id = props.getProperty(key);
    if (id) {
      try {
        doc = DocumentApp.openById(id);
      } catch (err) {
        doc = null; // deleted or trashed: make a new one
      }
    }
    if (!doc) {
      doc = DocumentApp.create(title);
      created = true;
      props.setProperty(key, doc.getId());
      if (req.intro) append(doc, req.intro);
    }
    if (req.text) append(doc, req.text);
    doc.saveAndClose();
    return reply({ ok: true, docId: doc.getId(), docUrl: doc.getUrl(), created: created });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return reply({ ok: true, app: 'voice-notes-inbox' });
}

function append(doc, text) {
  const body = doc.getBody();
  const lines = String(text).replace(/\\n+$/, '\\n').split('\\n');
  // A new doc starts with one empty paragraph: fill it instead of leaving a blank first line.
  const paragraphs = body.getParagraphs();
  if (paragraphs.length === 1 && paragraphs[0].getText() === '') paragraphs[0].setText(lines.shift());
  lines.forEach(function (line) {
    body.appendParagraph(line);
  });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
`
}

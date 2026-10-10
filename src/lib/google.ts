/**
 * Google Identity Services (token model) + Google Docs API, straight from the browser.
 * Scope drive.file lets the app see only the docs it created. The access token lives in
 * memory only; when it expires the user taps Connect again.
 */

export const DOCS_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GIS_SRC = 'https://accounts.google.com/gsi/client'

interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback?: (error: { type: string; message?: string }) => void
  }): TokenClient
  revoke(token: string, done?: () => void): void
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } }
  }
}

let gisPromise: Promise<GoogleOAuth2> | null = null

/** Load the Google sign-in script. Call this before the user taps Connect, so the popup isn't blocked. */
export function loadGoogleIdentity(): Promise<GoogleOAuth2> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2)
  if (gisPromise) return gisPromise
  gisPromise = new Promise<GoogleOAuth2>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error('Google sign-in did not load.')))
    script.onerror = () => reject(new Error('Could not load Google sign-in. Check your connection.'))
    document.head.appendChild(script)
  }).catch((err) => {
    gisPromise = null
    throw err
  })
  return gisPromise
}

let token: { value: string; expiresAt: number } | null = null
const listeners = new Set<() => void>()

export function onTokenChange(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setToken(next: typeof token) {
  token = next
  for (const l of listeners) l()
}

/** A token that is still good for at least a minute, or null. */
export function currentToken(): string | null {
  return token && token.expiresAt - Date.now() > 60_000 ? token.value : null
}

export function tokenExpiresAt(): number | null {
  return token?.expiresAt ?? null
}

export function clearToken() {
  setToken(null)
}

/**
 * Ask Google for an access token. Must run inside a tap/click handler (it opens a popup),
 * and the script must already be loaded — call loadGoogleIdentity() on screen mount.
 */
export function requestToken(clientId: string): Promise<string> {
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) return Promise.reject(new Error('Google sign-in is still loading. Try again in a moment.'))
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DOCS_SCOPE,
      callback: (res) => {
        if (res.error || !res.access_token) {
          reject(new Error(res.error_description || res.error || 'Google did not return a token.'))
          return
        }
        setToken({ value: res.access_token, expiresAt: Date.now() + Number(res.expires_in ?? 3600) * 1000 })
        resolve(res.access_token)
      },
      error_callback: (err) =>
        reject(new Error(err.type === 'popup_closed' ? 'Sign-in was closed before finishing.' : err.message || `Sign-in failed (${err.type}).`)),
    })
    client.requestAccessToken({ prompt: '' })
  })
}

export function revokeToken() {
  const value = token?.value
  setToken(null)
  if (value) window.google?.accounts?.oauth2?.revoke(value)
}

export class GoogleApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function docsFetch<T>(path: string, accessToken: string, body: unknown): Promise<T> {
  const res = await fetch(`https://docs.googleapis.com/v1/documents${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = ''
    try {
      detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? ''
    } catch {
      // Body was not JSON.
    }
    throw new GoogleApiError(res.status, detail || `Google Docs returned ${res.status}.`)
  }
  return (await res.json()) as T
}

export async function createDoc(accessToken: string, title: string, intro: string): Promise<string> {
  const { documentId } = await docsFetch<{ documentId: string }>('', accessToken, { title })
  if (intro) await appendToDoc(accessToken, documentId, intro)
  return documentId
}

export async function appendToDoc(accessToken: string, documentId: string, text: string): Promise<void> {
  await docsFetch(`/${encodeURIComponent(documentId)}:batchUpdate`, accessToken, {
    requests: [{ insertText: { endOfSegmentLocation: {}, text } }],
  })
}

export function docUrl(documentId: string): string {
  return `https://docs.google.com/document/d/${documentId}/edit`
}

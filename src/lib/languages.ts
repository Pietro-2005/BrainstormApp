/** Common Whisper languages offered in Settings; detection covers all 99. */
const CODES = [
  'en', 'it', 'es', 'fr', 'de', 'pt', 'nl', 'pl', 'sv', 'da', 'no', 'fi', 'el', 'cs', 'ro', 'hu', 'ru', 'uk',
  'tr', 'ar', 'he', 'hi', 'id', 'vi', 'th', 'zh', 'ja', 'ko', 'ca',
]

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames([navigator.language, 'en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

export function languageOptions(): { code: string; name: string }[] {
  return CODES.map((code) => ({ code, name: languageName(code) })).sort((a, b) => a.name.localeCompare(b.name))
}

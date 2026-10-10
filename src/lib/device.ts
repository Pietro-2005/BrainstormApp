const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent

export const isIOS =
  /iP(hone|ad|od)/.test(ua) ||
  // iPadOS reports itself as a Mac but has a touch screen.
  (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)

/** Safari, or any iOS browser (they all use WebKit's MediaRecorder). */
export const isWebKit = isIOS || (/Safari/.test(ua) && !/Chrome|Chromium|CriOS|Android|Edg|OPR|Firefox/.test(ua))

export const isMobile =
  isIOS ||
  /Android|Mobile/.test(ua) ||
  (typeof navigator !== 'undefined' &&
    (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile === true)

export const isStandalone =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true)

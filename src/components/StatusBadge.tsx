import type { Note } from '../db/db'

const styles: Record<Note['status'], string> = {
  recording: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  queued: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  transcribing: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  ready: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  sent: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
}

export function statusLabel(note: Pick<Note, 'status' | 'progress' | 'sendPending'>): string {
  switch (note.status) {
    case 'recording':
      return 'Recording'
    case 'queued':
      return 'Queued'
    case 'transcribing':
      return `Transcribing ${Math.round(note.progress * 100)}%`
    case 'ready':
      return note.sendPending ? 'Sending' : 'Ready'
    case 'sent':
      return 'Sent'
    case 'failed':
      return 'Failed'
  }
}

export function StatusBadge({ note }: { note: Pick<Note, 'status' | 'progress' | 'sendPending'> }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${styles[note.status]}`}>
      {statusLabel(note)}
    </span>
  )
}

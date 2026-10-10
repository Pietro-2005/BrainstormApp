import { useId, useState } from 'react'
import { normalizeTag } from '../lib/template'
import { Icon } from './Icon'

export function TagEditor({
  tags,
  suggestions,
  onChange,
}: {
  tags: string[]
  suggestions: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const listId = useId()

  const add = (raw: string) => {
    const next = raw
      .split(/[,\n]/)
      .map(normalizeTag)
      .filter((t) => t && !tags.includes(t))
    if (next.length) onChange([...tags, ...new Set(next)])
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pr-1 pl-2.5 text-sm text-accent-strong dark:bg-accent/20 dark:text-orange-200"
        >
          #{tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            aria-label={`Remove tag ${tag}`}
            className="rounded-full p-0.5 hover:bg-black/10"
          >
            <Icon name="x" className="size-3.5" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        list={listId}
        onChange={(e) => {
          const v = e.target.value
          if (/[,\n]/.test(v)) add(v)
          else setDraft(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(draft)
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={() => draft && add(draft)}
        placeholder={tags.length ? 'Add tag' : 'Add tags…'}
        enterKeyHint="done"
        autoCapitalize="none"
        className="min-w-24 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-stone-400"
        aria-label="Add tag"
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  )
}

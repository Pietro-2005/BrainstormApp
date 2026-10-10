import { Screen } from '../components/Layout'
import { Icon } from '../components/Icon'

export function RecordScreen() {
  return (
    <Screen title="Record">
      <div className="flex flex-col items-center gap-6 pt-16">
        <button
          type="button"
          disabled
          className="flex size-40 items-center justify-center rounded-full bg-accent text-white opacity-60 shadow-lg"
          aria-label="Record"
        >
          <Icon name="mic" className="size-16" />
        </button>
        <p className="text-sm text-stone-500 dark:text-stone-400">Recording arrives in the next update.</p>
      </div>
    </Screen>
  )
}

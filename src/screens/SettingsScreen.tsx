import { Screen } from '../components/Layout'

export function SettingsScreen() {
  return (
    <Screen title="Settings">
      <p className="text-stone-500 dark:text-stone-400">Voice Notes v{__APP_VERSION__}</p>
    </Screen>
  )
}

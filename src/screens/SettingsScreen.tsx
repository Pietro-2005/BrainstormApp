import { Screen } from '../components/Layout'
import { ModelSettings } from '../components/ModelSettings'
import { useSettings } from '../db/settings'

export function SettingsScreen() {
  const settings = useSettings()
  return (
    <Screen title="Settings">
      {settings && (
        <div className="space-y-8">
          <ModelSettings settings={settings} />
          <p className="text-center text-xs text-stone-400">Voice Notes v{__APP_VERSION__}</p>
        </div>
      )}
    </Screen>
  )
}

import { Screen } from '../components/Layout'
import { ModelSettings } from '../components/ModelSettings'
import { GoogleSettings, ProjectSettings, TemplateSettings } from '../components/SendSettings'
import { useSettings } from '../db/settings'
import { InstallSection, StorageSettings } from '../components/StorageSettings'

export function SettingsScreen() {
  const settings = useSettings()
  return (
    <Screen title="Settings">
      {settings && (
        <div className="space-y-8">
          <InstallSection />
          <GoogleSettings settings={settings} />
          <ProjectSettings settings={settings} />
          <ModelSettings settings={settings} />
          <TemplateSettings settings={settings} />
          <StorageSettings />
          <p className="text-center text-xs text-stone-400">Voice Notes v{__APP_VERSION__}</p>
        </div>
      )}
    </Screen>
  )
}

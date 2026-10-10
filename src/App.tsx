import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { TabBar } from './components/Layout'
import { Toasts } from './components/Toasts'
import { RecordScreen } from './screens/RecordScreen'
import { NotesScreen } from './screens/NotesScreen'
import { NoteDetailScreen } from './screens/NoteDetailScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { recoverUnfinishedRecordings } from './lib/recorder'
import { showToast } from './lib/toast'

let started = false

/** One-time work when the app opens: rescue recordings cut off by a crash or closed tab. */
async function onAppStart() {
  if (started) return
  started = true
  const recovered = await recoverUnfinishedRecordings()
  if (recovered > 0) {
    showToast(
      {
        tone: 'warning',
        message: `Recovered ${recovered} unfinished recording${recovered > 1 ? 's' : ''} from last time.`,
        link: { to: '/notes', label: 'Open notes' },
      },
      10_000,
    )
  }
}

// Hash routing keeps deep links working on GitHub Pages, which has no SPA fallback.
export default function App() {
  useEffect(() => {
    void onAppStart()
  }, [])
  return (
    <HashRouter>
      <Toasts />
      <Routes>
        <Route path="/" element={<RecordScreen />} />
        <Route path="/notes" element={<NotesScreen />} />
        <Route path="/notes/:id" element={<NoteDetailScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<RecordScreen />} />
      </Routes>
      <TabBar />
    </HashRouter>
  )
}

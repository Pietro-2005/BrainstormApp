import { useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router'
import { TabBar } from './components/Layout'
import { Toasts } from './components/Toasts'
import { RecordScreen } from './screens/RecordScreen'
import { NotesScreen } from './screens/NotesScreen'
import { NoteDetailScreen } from './screens/NoteDetailScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { recoverUnfinishedRecordings } from './lib/recorder'
import { showToast } from './lib/toast'
import { transcription } from './lib/transcription'
import { sendQueue } from './lib/send'
import { requestPersistentStorage } from './lib/storage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdatePrompt } from './components/UpdatePrompt'
import './lib/install'

let started = false

/** One-time work when the app opens: rescue recordings cut off by a crash or closed tab. */
async function onAppStart() {
  if (started) return
  started = true
  void requestPersistentStorage()
  const recovered = await recoverUnfinishedRecordings()
  transcription.start()
  sendQueue.start()
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

function AppRoutes() {
  const location = useLocation()
  // Keyed by path so an error on one screen doesn't block the others.
  return (
    <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/" element={<RecordScreen />} />
        <Route path="/notes" element={<NotesScreen />} />
        <Route path="/notes/:id" element={<NoteDetailScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<RecordScreen />} />
      </Routes>
    </ErrorBoundary>
  )
}

// Hash routing keeps deep links working on GitHub Pages, which has no SPA fallback.
export default function App() {
  useEffect(() => {
    void onAppStart()
  }, [])
  return (
    <HashRouter>
      <Toasts />
      <UpdatePrompt />
      <AppRoutes />
      <TabBar />
    </HashRouter>
  )
}

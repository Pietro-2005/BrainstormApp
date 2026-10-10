import { HashRouter, Route, Routes } from 'react-router'
import { TabBar } from './components/Layout'
import { RecordScreen } from './screens/RecordScreen'
import { NotesScreen } from './screens/NotesScreen'
import { NoteDetailScreen } from './screens/NoteDetailScreen'
import { SettingsScreen } from './screens/SettingsScreen'

// Hash routing keeps deep links working on GitHub Pages, which has no SPA fallback.
export default function App() {
  return (
    <HashRouter>
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

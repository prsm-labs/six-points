import './weekView.js' // 2026-10-23: 📅 week picker -- installs the past-week fetch layer before anything loads data
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { startNoteCollapse } from './noteCollapse.js' // 2026-10-28 collapsible explanation boxes
import './noteCollapse.css'
import { startTableCards } from './tableCards.js' // 2026-11-03 phone cards for list tables
import './tableCards.css'
import { PlayerDirectoryProvider } from './PlayerDirectory.jsx'
import { MatchupProvider } from './MatchupContext.jsx'
import './index.css'
import { bootOffline } from './offline.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PlayerDirectoryProvider>
      <MatchupProvider>
        <App />
      </MatchupProvider>
    </PlayerDirectoryProvider>
  </StrictMode>,
)

startNoteCollapse()
startTableCards()
bootOffline() // 2026-11-02 📦 keeps the offline worker only for viewers who saved a snapshot

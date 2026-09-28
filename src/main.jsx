import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { PlayerDirectoryProvider } from './PlayerDirectory.jsx'
import { MatchupProvider } from './MatchupContext.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PlayerDirectoryProvider>
      <MatchupProvider>
        <App />
      </MatchupProvider>
    </PlayerDirectoryProvider>
  </StrictMode>,
)

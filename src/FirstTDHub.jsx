import { useState } from 'react'
import FirstTDTab from './FirstTDTab.jsx'
import KingOfEndZone from './KingOfEndZone.jsx'

// 🥇 1st TD tab (Slap Shot's First Goal tab layout, 2026-10-18 revamp): the First TD predictor / tracker, plus
// 👑 King of the End Zone in the slot Slap Shot uses for its Ice Breaker view.
export default function FirstTDHub() {
  const [view, setView] = useState('first')
  return (
    <div>
      <div className="pill-row hub-row">
        <button className={`pill-btn ${view === 'first' ? 'active' : ''}`} onClick={() => setView('first')}>🥇 First TD</button>
        <button className={`pill-btn ${view === 'kote' ? 'active' : ''}`} onClick={() => setView('kote')}>👑 King of the End Zone</button>
      </div>
      {view === 'first' ? <FirstTDTab /> : <KingOfEndZone />}
    </div>
  )
}

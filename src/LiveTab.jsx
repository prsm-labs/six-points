import { useState } from 'react'
import LiveThemes from './LiveThemes.jsx'
import BoxScoreTab from './BoxScoreTab.jsx'
import InactivesTab from './InactivesTab.jsx'

// Mirrors Going Yard's real LiveTab() sub-nav shape (Gameday/Bat Tracking/Live Sim/Live
// Games/Lineups/Themes/Ball Carry/xHR Conversion) -- scoped down to what's actually realistic
// for football per the response doc §7: Themes (clustering, already built), Box Scores (the
// real achievable core of Gameday), Inactives (the real equivalent of Lineups). Live Sim
// (bigger lift, lower priority) and Bat Tracking (no NFL equivalent at all) are not built.
export default function LiveTab() {
  const [sub, setSub] = useState('themes')

  return (
    <div>
      <div className="sub-tabs">
        <button className={sub === 'themes' ? 'active' : ''} onClick={() => setSub('themes')}>
          Themes
        </button>
        <button className={sub === 'boxscores' ? 'active' : ''} onClick={() => setSub('boxscores')}>
          Box Scores
        </button>
        <button className={sub === 'inactives' ? 'active' : ''} onClick={() => setSub('inactives')}>
          Inactives
        </button>
      </div>
      {sub === 'themes' && <LiveThemes />}
      {sub === 'boxscores' && <BoxScoreTab />}
      {sub === 'inactives' && <InactivesTab />}
    </div>
  )
}

import { useState } from 'react'
import ViewPicker from './ViewPicker.jsx'
import AllMatchupsTab from './AllMatchupsTab.jsx'
import PaydirtLab from './PaydirtLab.jsx'
import YardageLab from './YardageLab.jsx'
import PairsTab from './PairsTab.jsx'
import LadderTab from './LadderTab.jsx'
import RedZoneTab from './RedZoneTab.jsx'
import RoleReportTab from './RoleReportTab.jsx'
import FadeLab from './FadeLab.jsx'
import BounceLab from './BounceLab.jsx'
import RiskSliderTab from './RiskSliderTab.jsx'
import RadarLab from './RadarLab.jsx'
import LongshotLab from './LongshotLab.jsx'

// "Scouting" top-level tab (Slap Shot's tabs/MatchupsHubTab.jsx, 2026-10-18 revamp): All Matchups (the default
// view) plus every lab, switched by a button row in the page instead of one top-level tab each.
// Slap Shot -> Six Points: Lamp Lab -> Paydirt Lab (TDs), Apple Lab -> Yardage Lab, Crease Lab -> Red Zone.
const VIEWS = [
  { key: 'board', label: '🏈 All Matchups', Component: AllMatchupsTab },
  { key: 'risk', label: '🎚️ Risk Slider', Component: RiskSliderTab },  // 2026-10-27: safe -> long shot over every RB / WR / TE ladder
  { key: 'radar', label: '🔦 Under the radar', Component: RadarLab },  // 2026-11-02: quiet TD scorers the model likes
  { key: 'longshot', label: '🎯 Long-shot creators', Component: LongshotLab },  // 2026-11-07: 12-30% TD chances ranked by recent red-zone touches
  { key: 'paydirt', label: '💰 Paydirt Lab', Component: PaydirtLab },
  { key: 'yardage', label: '💨 Yardage Lab', Component: YardageLab },
  { key: 'pairs', label: '🤝 Pairs', Component: PairsTab },
  { key: 'ladder', label: '🪜 Game Ladder', Component: LadderTab },
  { key: 'redzone', label: '🔴 Red Zone', Component: RedZoneTab },
  { key: 'role', label: '🧩 Role Report', Component: RoleReportTab },
  // 2026-11-05 (user: fewer views): 🧊 Fade + 📈 Bounce-back are one view, two pills -- both "his projection vs his recent games"
  { key: 'move', label: '📉📈 Due to move', Component: DueToMove },
]

function DueToMove() {
  const [side, setSide] = useState('bounce')
  return (
    <>
      <div className="pill-row">
        <button type="button" className={`pill-btn ${side === 'bounce' ? 'active' : ''}`} onClick={() => setSide('bounce')}>📈 Bounce-back · above his recent games</button>
        <button type="button" className={`pill-btn ${side === 'fade' ? 'active' : ''}`} onClick={() => setSide('fade')}>🧊 Fade · below his recent games</button>
      </div>
      {side === 'bounce' ? <BounceLab /> : <FadeLab />}
    </>
  )
}

export default function ScoutingHub() {
  const [view, setView] = useState('board')
  const Active = (VIEWS.find((v) => v.key === view) || VIEWS[0]).Component
  return (
    <div>
      <ViewPicker options={VIEWS.map((v) => [v.key, v.label])} value={view} onChange={setView} pillClass="pill-btn" rowClass="pill-row hub-row" label="Scouting" />
      <Active />
    </div>
  )
}

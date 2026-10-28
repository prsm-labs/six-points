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

// "Scouting" top-level tab (Slap Shot's tabs/MatchupsHubTab.jsx, 2026-10-18 revamp): All Matchups (the default
// view) plus every lab, switched by a button row in the page instead of one top-level tab each.
// Slap Shot -> Six Points: Lamp Lab -> Paydirt Lab (TDs), Apple Lab -> Yardage Lab, Crease Lab -> Red Zone.
const VIEWS = [
  { key: 'board', label: '🏈 All Matchups', Component: AllMatchupsTab },
  { key: 'risk', label: '🎚️ Risk Slider', Component: RiskSliderTab },  // 2026-10-27: safe -> long shot over every RB / WR / TE ladder
  { key: 'paydirt', label: '💰 Paydirt Lab', Component: PaydirtLab },
  { key: 'yardage', label: '💨 Yardage Lab', Component: YardageLab },
  { key: 'pairs', label: '🤝 Pairs', Component: PairsTab },
  { key: 'ladder', label: '🪜 Game Ladder', Component: LadderTab },
  { key: 'redzone', label: '🔴 Red Zone', Component: RedZoneTab },
  { key: 'role', label: '🧩 Role Report', Component: RoleReportTab },
  { key: 'fade', label: '🧊 Fade', Component: FadeLab },
  { key: 'bounce', label: '📈 Bounce-back', Component: BounceLab },  // 2026-10-27: Fade's mirror
]

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

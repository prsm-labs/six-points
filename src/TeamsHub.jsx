import { useState } from 'react'
import ViewPicker from './ViewPicker.jsx'
import RankingsTab from './RankingsTab.jsx'
import NFLTab from './NFLTab.jsx'
import DepthChartTab from './DepthChartTab.jsx'

// 🏟️ Teams (2026-11-05, user: fewer pages): the team reference pages on one menu item -- 🏅 Rankings (offense / defense by category),
// 🏟️ Standings (the old NFL tab) and 🧭 Depth Charts.
const VIEWS = [['rankings', '🏅 Rankings'], ['nfl', '🏟️ Standings'], ['depth', '🧭 Depth Charts']]

export default function TeamsHub() {
  const [view, setView] = useState('rankings')
  return (
    <div>
      <ViewPicker options={VIEWS} value={view} onChange={setView} pillClass="pill-btn" rowClass="pill-row hub-row" label="Teams" />
      {view === 'rankings' && <RankingsTab />}
      {view === 'nfl' && <NFLTab />}
      {view === 'depth' && <DepthChartTab />}
    </div>
  )
}

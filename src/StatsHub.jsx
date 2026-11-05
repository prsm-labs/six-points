import { useState } from 'react'
import ViewPicker from './ViewPicker.jsx'
import StatsTab from './StatsTab.jsx'
import SplitsTab from './SplitsTab.jsx'
import PrimetimeSplitsTab from './PrimetimeSplitsTab.jsx'
import ScoutingTab from './ScoutingTab.jsx'

// 📊 Stats hub (2026-11-05, user: fewer pages). Stats (every player / team, game by game) with the old 📊 Splits, 🌙 Primetime and
// 🔍 Matchup Lookup pages folded in as views -- splits, primetime and head-to-head all tested as context only (no edge on our
// chances; primetime nothing, 2026-10-19), and the player slideout carries the splits, so they no longer get menu items.
const VIEWS = [['stats', '📊 Stats'], ['splits', '📊 Splits'], ['primetime', '🌙 Primetime'], ['lookup', '🔍 Matchup Lookup']]

export default function StatsHub() {
  const [view, setView] = useState('stats')
  return (
    <div>
      <ViewPicker options={VIEWS} value={view} onChange={setView} pillClass="pill-btn" rowClass="pill-row hub-row" label="Stats" />
      {view === 'stats' && <StatsTab />}
      {view === 'splits' && <SplitsTab />}
      {view === 'primetime' && <PrimetimeSplitsTab />}
      {view === 'lookup' && <ScoutingTab />}
    </div>
  )
}

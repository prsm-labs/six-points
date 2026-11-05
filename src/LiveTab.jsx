import { useEffect, useState, useSyncExternalStore } from 'react'
import ViewPicker from './ViewPicker.jsx'
import TDTracker from './TDTracker.jsx'
import WeatherTab from './WeatherTab.jsx'
import { liveFocus } from './nav.js'
import LiveThemes from './LiveThemes.jsx'
import BoxScoreTab from './BoxScoreTab.jsx'
import InactivesTab from './InactivesTab.jsx'
import ScheduleTab from './ScheduleTab.jsx'
import LiveUsageTab from './LiveUsageTab.jsx'

// Live sub-nav: Schedule (item 9 -- a forward-looking week-by-week browse of the full real
// schedule), Themes (gap-based scoring-play clustering), Box Scores (real ESPN team + player
// box scores), Inactives (the weekly injury report), Heating Up (real live high-usage/TD
// badges, GoingYardParity.md follow-up request). Live Sim was scoped out as a bigger lift,
// lower priority than the rest of this batch.
// 2026-10-25: Themes -> 📡 This week so far (LiveThemes.jsx rewritten: the week vs our projections, context only).
// 2026-11-05 📺 Scores (user: merge Live and Schedule -- one place for this week, past weeks and the weeks ahead; fewer pages): Games
// (Box Scores with a week rail on top), Week list (Schedule), So far, plus the old 🏈 TD Tracker and 🌬️ Weather pages as views.
// The TD ticker opens TD Tracker (showScoresView).
const VIEWS = [['boxscores', '🏈 Games'], ['schedule', '📅 Week list'], ['themes', '📡 So far'], ['tdtracker', '🏈 TD Tracker'],
  ['inactives', '🚑 Inactives'], ['heatingup', '🔥 Heating Up'], ['weather', '🌬️ Weather']]
let want = null
const subs = new Set()
export function showScoresView(v) { want = { v, at: Date.now() }; subs.forEach((f) => f()) }
const useWant = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => want, () => want)

export default function LiveTab() {
  const [sub, setSub] = useState(() => want?.v || 'boxscores') // 2026-10-22: Live opens on the games / box scores, like CourtIQ
  // 2026-10-23: a tapped Schedule game / slideout matchup opens on Box Scores (BoxScoreTab picks the game)
  const focus = liveFocus.use()
  const asked = useWant()
  useEffect(() => { if (focus) setSub('boxscores') }, [focus?.at]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (asked) setSub(asked.v) }, [asked?.at]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="section-head"><h2>📺 Scores</h2><p className="meta-line">This week, past weeks and the weeks ahead — pick a week, then a game for its box score (or lineups before kickoff)</p></div>
      <ViewPicker options={VIEWS} value={sub} onChange={setSub} pillClass="pill-btn" rowClass="pill-row hub-row" label="Scores" />
      {sub === 'schedule' && <ScheduleTab />}
      {sub === 'themes' && <LiveThemes />}
      {sub === 'boxscores' && <BoxScoreTab />}
      {sub === 'inactives' && <InactivesTab />}
      {sub === 'heatingup' && <LiveUsageTab />}
      {sub === 'tdtracker' && <TDTracker />}
      {sub === 'weather' && <WeatherTab />}
    </div>
  )
}

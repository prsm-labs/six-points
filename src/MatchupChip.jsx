import { useEffect, useState } from 'react'
import { TeamLogo } from './BoxScoreTab.jsx'
import { openGame } from './nav.js'

// 2026-10-23 (user): the player's game this week in the slideout -- kickoff day + time, or the live score + clock, or the
// final -- and in a bye week (or off the slate) his most recent game. Tap it for the box score (Live > Box Scores).
let sched = null
const loadSchedule = () => (sched = sched || fetch('/data/season_schedule.json').then((r) => (r.ok ? r.json() : null)).catch(() => null))
const kickoff = (g) => {
  if (!g?.gameday) return ''
  const day = new Date(`${g.gameday}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  if (!g.gametime) return day
  const [h, m] = g.gametime.split(':').map(Number)
  return `${day} · ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'} ET`
}

export default function MatchupChip({ player, weekRow, t, gameLog }) {
  const [s, setS] = useState(null)
  useEffect(() => { loadSchedule().then(setS) }, [])
  const team = weekRow?.team || player?.team
  if (!s || !team) return null
  const findGame = (week, tm) => s.games.find((g) => g.week === week && (g.home_team === tm || g.away_team === tm))
  const g = weekRow?.week ? findGame(weekRow.week, team) : null
  if (g) {
    const final = g.home_score != null || t?.done
    const live = !final && t?.live
    const as = g.away_score ?? t?.score?.away, hs = g.home_score ?? t?.score?.home
    const started = final || live
    return (
      <button className={`matchup-chip ${live ? 'live' : ''}`} onClick={() => openGame({ week: g.week, gameId: g.game_id })} title="Open the box score">
        <span className="mc-status">{live ? `● ${t.detail || 'Live'}` : final ? 'Final' : `Week ${g.week} · ${kickoff(g)}`}</span>
        <span><TeamLogo team={g.away_team} size={14} /> {g.away_team}{started && as != null ? ` ${as}` : ''}</span>
        <span className="mc-at">{started ? '–' : '@'}</span>
        <span>{started && hs != null ? `${hs} ` : ''}{g.home_team} <TeamLogo team={g.home_team} size={14} /></span>
        <span className="mc-go">Box score ›</span>
      </button>
    )
  }
  const last = (gameLog || []).slice(-1)[0]
  const lg = last ? findGame(last.week, last.team) : null
  if (!lg) return null
  return (
    <button className="matchup-chip" onClick={() => openGame({ week: lg.week, gameId: lg.game_id })} title="Open that game's box score">
      <span className="mc-status">Last game · Week {lg.week}</span>
      <span>{lg.away_team} {lg.away_score ?? ''} – {lg.home_score ?? ''} {lg.home_team}</span>
      <span className="mc-go">Box score ›</span>
    </button>
  )
}

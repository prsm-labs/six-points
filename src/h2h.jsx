import { useEffect, useState } from 'react'

// 🆚 H2H + 🏠 home / away history and grades for this week's slate (public/data/h2h_today.json, nfl_project/build_h2h.py;
// Slap Shot / CourtIQ twins). CONTEXT ONLY: in the 2023-25 held-out test neither the H2H nor the home / away grade predicted
// yards beyond Est. Yards (correlation about 0), so neither touches a grade or a pick. Tracked weekly so we can see it live.
const GRADE_CLASS = { 'A+': 'g-aplus', A: 'g-a', B: 'g-b', C: 'g-c', D: 'g-d', F: 'g-f' } // same colors as gradeUi.jsx
let cache = null
export function useH2H() {
  const [d, setD] = useState(null)
  useEffect(() => {
    let alive = true
    if (!cache) cache = fetch('/data/h2h_today.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    cache.then((x) => alive && setD(x))
    return () => { alive = false }
  }, [])
  return d
}
export const h2hFor = (d, m) => (d && m && d.players?.[m.player_id]?.opp === m.opponent ? d.players[m.player_id] : null)
export const venueFor = (d, m) => (d && m ? d.venue?.[m.player_id] || null : null)
export const H2H_NOTE = 'H2H = his games vs this opponent since 2022, yards above or below his own normal at the time. Context only — it did not predict yards in the 2023-25 backtest.'
export const VENUE_NOTE = 'H/A = his home (or road, whichever this week is) games over last season + this, yards vs his own normal. Context only — no predictive value in the 2023-25 backtest.'
export function H2HBadge({ h }) {
  if (!h?.letter) return <span className="meta-line small">—</span>
  return <span className={`grade-badge ${GRADE_CLASS[h.letter] || ''}`} title={`${h.letter}${h.small ? ' (small sample)' : ''}: ${h.text}. Context, not a prediction.`}>{h.letter}{h.small ? '*' : ''}</span>
}

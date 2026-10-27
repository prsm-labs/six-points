import { useEffect, useState } from 'react'

// 🎚️ Risk slider (2026-10-27): the week's line board from nfl_project/build_line_board.py -- line_board.json (this week + the
// calibration backtest + the live record) and lines/<season>-wk<N>.json (each week's ladders, frozen at kickoff, graded).
// Also the L7 strips in Paydirt / Yardage Lab (each player's last 7 games, as of that week).
const cache = {}
function getJson(url) {
  if (!cache[url]) cache[url] = fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  return cache[url]
}

// { meta: line_board.json, week: that week's archive } for the slate on screen (a past week from the 📅 picker too)
export function useLineWeek(slate) {
  const [state, setState] = useState({ meta: undefined, week: undefined })
  const key = slate?.season && slate?.week ? `${slate.season}-wk${slate.week}` : null
  useEffect(() => {
    if (!key) return undefined
    let alive = true
    Promise.all([getJson('/data/line_board.json'), getJson(`/data/lines/${key}.json`)]).then(([meta, week]) => alive && setState({ meta, week }))
    return () => { alive = false }
  }, [key])
  return state
}

// [[date or '2025', opp, scrim, td]] -> the strip's games
export const recentOf = (rows) => (rows || []).map(([d, o, y, t]) => ({ d: d === '2025' ? '' : d, o: d === '2025' ? '' : o, label: d === '2025' ? 'last season' : null, v: { YDS: y, TD: t, TD2: t } }))

export function useRecentById(slate) {
  const { week } = useLineWeek(slate)
  const [map, setMap] = useState(new Map())
  useEffect(() => { setMap(new Map((week?.players || []).map((p) => [p.id, recentOf(p.recent)]))) }, [week])
  return map
}

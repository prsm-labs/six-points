import { useEffect, useState } from 'react'

// 2026-10-28 hit-rate card adapter (HitRateCard.jsx, same card as CourtIQ / Slap Shot): this season's game logs
// (stats_book.json, the Stats tab file) + last season's (stats_book_2025.json, written once by build_stats.py --out), one
// row per game he played, with his team's previous game (after a win / loss, days of rest) and that season's defenses
// (per game allowed for the stat, ranked: 10 softest / 10 stingiest of 32).
const cache = {}
const load = (f) => (cache[f] = cache[f] || fetch(`/data/${f}`).then((r) => (r.ok ? r.json() : null)).catch(() => null))
// which defensive number each stat is judged against (yards / TDs the defense allowed per game)
const DEF = { PYDS: 'pyds', RYDS: 'ryds', RECYDS: 'pyds', SCRIM: 'yds', REC: 'pyds', TD: 'tds' }
const day = (d) => Date.parse(`${d}T12:00:00Z`) / 864e5

const seasonCache = new Map()
function prepSeason(S) {
  if (seasonCache.has(S)) return seasonCache.get(S)
  const tix = Object.fromEntries(S.team_cols.map((c, i) => [c, i]))
  const sched = {}
  const allowed = {}
  for (const [team, rows] of Object.entries(S.teams || {})) {
    sched[team] = rows.map((r) => ({ d: r.d, lost: r.pf < r.pa })).sort((a, b) => (a.d < b.d ? -1 : 1))
    allowed[team] = Object.fromEntries(Object.entries(DEF).map(([k, c]) => [k, rows.reduce((s, r) => s + Number(r.x?.[tix[c]] || 0), 0) / (rows.length || 1)]))
  }
  const teams = Object.keys(allowed)
  const tier = {}
  for (const k of Object.keys(DEF)) {
    const order = [...teams].sort((a, b) => allowed[b][k] - allowed[a][k]) // most allowed first = softest
    order.forEach((t, i) => { (tier[t] ||= {})[k] = i < 10 ? 'soft' : i >= order.length - 10 ? 'tough' : 'avg' })
  }
  const out = { sched, tier, pix: Object.fromEntries(S.game_cols.map((c, i) => [c, i])) }
  seasonCache.set(S, out)
  return out
}

function rowsFor(S, id, which) {
  const rows = S?.players?.[id]?.g
  if (!rows) return []
  const { sched, tier, pix } = prepSeason(S)
  return rows.map((r) => {
    const d = r[pix.d], team = r[pix.team], opp = r[pix.opp]
    const sc = sched[team] || []
    const i = sc.findIndex((x) => x.d === d)
    const prev = i > 0 ? sc[i - 1] : null
    const v = (c) => Number(r[pix[c]] || 0)
    return {
      date: d, season: which, opp, home: r[pix.ha] === 'vs', played: r[pix.snap] == null ? null : v('snap'),
      v: { PYDS: v('pyds'), RYDS: v('ryds'), RECYDS: v('recyds'), SCRIM: v('scrim'), REC: v('rec'), TD: v('td') },
      afterLoss: prev ? prev.lost : null, rest: prev ? Math.round(day(d) - day(prev.d)) - 1 : null, tier: tier[opp] || {},
    }
  })
}

export function useHitGames(playerId) {
  const [state, setState] = useState({ games: null, ready: false })
  useEffect(() => {
    let alive = true
    setState({ games: null, ready: false })
    if (!playerId) return undefined
    Promise.all([load('stats_book.json'), load('stats_book_2025.json')]).then(([cur, prev]) => {
      if (alive) setState({ games: [...rowsFor(cur, playerId, 'cur'), ...rowsFor(prev, playerId, 'prev')], ready: true })
    })
    return () => { alive = false }
  }, [playerId])
  return state
}

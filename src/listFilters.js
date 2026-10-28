// Shared list filters for All Matchups / Paydirt Lab / Yardage Lab / Game Ladder (Slap Shot's lib/listFilters.js,
// 2026-10-18 revamp) -- one app-wide selection (like the matchup and position filters), so narrowing the list on one
// page carries to the others.
// 2026-10-25 (user: tag filters -- listed Top / PRISM Pick, Data limited, B2B-style rest tags -- and a grade SCALE instead
// of "A, B or C or better", in every app; open / close): groups drawn by FilterPanel.jsx. Within a group a player needs any
// of the letters / picks chosen; tags match all (or any); across groups he has to pass every one. The NFL has no
// back-to-backs: its rest tags are 🗓️ Short week (5 or fewer days since his team's last game) and 😴 Off a bye.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { matchesSearch } from './teamSearch.js'
import { startedTeams, topPicks } from './topPicks.js'
import { applyGroups } from './FilterPanel.jsx'
import { DEF_TIERS, oppDefTier } from './oppDef.jsx'

export const TD_OPTIONS = [null, 10, 20, 30, 40]
const LETTERS = ['A+', 'A', 'A-', 'B', 'C', 'D', 'F']
const H2H_LETTERS = ['A+', 'A', 'B', 'C', 'D', 'F']

const DEFAULTS = { minTd: null, tags: [], tagsNot: [], tagsMode: 'all', top: [], prism: [], grades: [], h2h: [], venue: [], oppd: [], search: '' }
let state = { ...DEFAULTS }
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn())

export function setListFilter(key, value) {
  state = { ...state, [key]: value }
  notify()
}
export function clearListFilters() {
  state = { ...DEFAULTS, search: state.search }
  notify()
}
export function useListFilters() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, () => state, () => state)
}

// The week on screen: Top Picks (the Sunday lock, else the live selection like the Top Picks page) + PRISM Picks (every
// level) -> Map player_id -> { top: [tier ...], prism: [level ...] }; plus each team's rest (short week / off a bye).
const jsonCache = {}
const getJson = (url) => (jsonCache[url] = jsonCache[url] || fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null))
export function useFilterContext(slate) {
  const season = slate?.season
  const week = slate?.week
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let alive = true
    if (!week) return undefined
    Promise.all([getJson('/data/top_picks/index.json'), getJson('/data/prism_picks.json'), getJson('/data/season_schedule.json')])
      .then(async ([idx, pp, schedule]) => {
        const l = idx?.locks?.find((x) => x.season === season && x.week === week)
        const lock = l ? await getJson(`/data/top_picks/${l.file}`) : null
        if (alive) setSrc({ week, lock, pp, schedule })
      })
    return () => { alive = false }
  }, [season, week])
  return useMemo(() => {
    const picks = new Map()
    const rest = new Map()
    if (!slate?.matchups || !src || src.week !== week) return { picks, rest }
    const add = (id, k, v) => { if (id == null) return; const e = picks.get(id) || { top: [], prism: [] }; if (!e[k].includes(v)) e[k].push(v); picks.set(id, e) }
    const top = src.lock?.picks?.map((p) => ({ tier: p.tier, id: p.player?.player_id }))
      || (slate.past || slate.replay ? [] : topPicks(slate.matchups, { excludeTeams: startedTeams(src.schedule, week) }).map((t) => ({ tier: t.tier, id: t.m?.player_id })))
    for (const t of top) add(t.id, 'top', t.tier)
    const w = src.pp?.weeks?.find((x) => x.week === week)
    for (const c of w?.picks || []) add(c.player_id, 'prism', 'safe')
    for (const lv of ['mid', 'long']) for (const c of w?.tiers?.[lv] || []) add(c.player_id, 'prism', lv)
    const games = (src.schedule?.games || []).filter((g) => g.season == null || g.season === season)
    const day = (d) => Date.parse(`${d}T12:00:00Z`)
    for (const g of games.filter((x) => x.week === week)) {
      for (const t of [g.home_team, g.away_team]) {
        const prev = games.filter((x) => x.week < week && (x.home_team === t || x.away_team === t)).sort((a, b) => b.week - a.week)[0]
        if (!prev) continue
        rest.set(t, { days: Math.round((day(g.gameday) - day(prev.gameday)) / 864e5), bye: prev.week < week - 1 })
      }
    }
    return { picks, rest }
  }, [slate, src, week, season])
}

// ctx: useFilterContext(slate). Rows carry h2h / ha (All Matchups adds them from h2h.jsx).
export function buildGroups(ctx = {}) {
  const { picks, rest } = ctx
  const tagKeys = (m) => {
    const t = []
    const r = rest?.get(m.team)
    if (r && r.days <= 5) t.push('short')
    if (r?.bye) t.push('bye')
    if (m.thin_sample) t.push('limited')
    if (m.def_tier === 'soft') t.push('soft')
    if (m.hotHand) t.push('hot')
    if (m.breakout) t.push('breakout')
    if ((m.role_gain ?? 0) >= 1) t.push('role')
    if ((m.edge ?? -99) >= 3) t.push('value')
    if (m.roleFlag) t.push('rolecheck')
    if (!m.roleFlag && m.teamGp === 0) t.push('first')
    if (m.starterBack) t.push('starterback')
    if (m.week_status) t.push('injury')
    return t
  }
  const tops = [...new Set([...(picks?.values() || [])].flatMap((e) => e.top))]
  const EMOJI = { Chalk: '🎯', Yards: '💨', Breakout: '🚀' }
  return [
    { key: 'minTd', label: 'TD %', chip: '', type: 'one', test: (m, v) => (m.p_td ?? 0) * 100 >= v, anyLabel: 'Any TD %',
      options: TD_OPTIONS.filter(Boolean).map((g) => ({ v: g, label: `TD ${g}%+` })) },
    { key: 'top', label: 'Top Picks', chip: 'Top Pick', type: 'multi', get: (m) => { const t = picks?.get(m.player_id)?.top || []; return t.length ? [...t, '*'] : t },
      options: [{ v: '*', label: '🏆 Any Top Pick' }, ...tops.map((k) => ({ v: k, label: `${EMOJI[k] || ''} ${k}`.trim() }))],
      hint: "Players listed on this week's Top Picks (one per tier, locked Sunday 11:50 AM ET)" },
    { key: 'prism', label: 'PRISM Picks', chip: 'PRISM', type: 'multi', get: (m) => picks?.get(m.player_id)?.prism || [],
      options: [{ v: 'safe', label: '💎 PRISM Pick' }, { v: 'mid', label: '⚖️ Mid-range' }, { v: 'long', label: '🌠 Long shot' }] },
    { key: 'tags', label: 'Tags', chip: '', type: 'tags', get: tagKeys, options: [
      { v: 'short', label: '🗓️ Short week', title: "5 or fewer days since his team's last game (Thursday after Sunday, etc.) — the NFL's back-to-back; context, not in the grade" },
      { v: 'bye', label: '😴 Off a bye', title: 'His team had a bye last week — context, not in the grade' },
      { v: 'limited', label: '⚠️ Data limited', title: 'Thin sample — few games of usage behind his numbers' },
      { v: 'hot', label: '🔥 Hot hand', title: 'Scored a TD in his last 3 games and NOT a top-25% TD chance this week -- this group scored 1.33x what the model said in 2023-25 (every season)' },
      { v: 'breakout', label: '🚀 Breakout Watch', title: "Touches last 3 games 1.2x+ his season rate, outside the week's top 15% -- backtested lift" },
      { v: 'role', label: '+ Role gain', title: 'Inherits 1+ touch a game from an injured / inactive teammate' },
      { v: 'value', label: '📖 Above book', title: 'Our TD % at least 3 points above the chance the best sportsbook price implies. Context, not value: where we and the book disagree, the book has been closer (never a grade input)' },
      { v: 'rolecheck', label: '🪑? Role check', title: 'Under 3 games for his team and lower on the ESPN depth chart than his usage — kept out of Top Picks / PRISM Picks' },
      { v: 'first', label: '📅 New to team', title: 'No games with his team yet' },
      { v: 'starterback', label: '🔙 Starter back', title: "His recent usage came while the lead at his position was out, and the lead is back (or Questionable) — proceed with caution; kept out of Top Picks / PRISM Picks" },
      { v: 'injury', label: '🩹 Injury tag', title: 'Questionable / Doubtful this week — tap twice to hide them' },
    ] },
    { key: 'grades', label: 'Grade', type: 'multi', get: (m) => m.grade, options: LETTERS.map((l) => ({ v: l, label: l })),
      hint: 'Pick the exact letters — the backtested grade model' },
    { key: 'h2h', label: 'H2H grade', chip: 'H2H', type: 'multi', get: (m) => m.h2h?.letter, options: H2H_LETTERS.map((l) => ({ v: l, label: l })),
      hint: 'His history vs this opponent against his own normal — context, tracked' },
    { key: 'venue', label: 'Home / away', chip: 'H/A', type: 'multi', get: (m) => m.ha?.letter, options: H2H_LETTERS.map((l) => ({ v: l, label: l })),
      hint: 'How he does at home (or on the road, whichever this week is) vs his own normal — context' },
    // 2026-10-28 Opp D (user): replaces the '▲ Soft TD defense' tag with all three bands (oppDef.jsx)
    { key: 'oppd', label: 'Opponent defense', chip: 'Opp D', type: 'multi', get: oppDefTier, options: DEF_TIERS,
      hint: "This week's opponent among the week's TD defenses (the factor inside the grade) — Soft = softest third, Tough = stingiest third" },
  ]
}

export function applyListFilters(list, f, ctx) {
  if (!list) return list
  return applyGroups(list.filter((m) => matchesSearch(f.search, [m.player_name], [m.team, m.opponent])), buildGroups(ctx), f)
}

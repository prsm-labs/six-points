import { useEffect, useState, useSyncExternalStore } from 'react'
import { PAIR_CORR } from './pairs.js'

// 🪙 Degen Picks (2026-11-09, user: CourtIQ's play-money mini game in Six Points too). Every browser starts with 1,000 free coins,
// picks this week's lines (nfl_project/build_line_board.py -> public/data/lines/<season>-wk<N>.json, the Risk Slider's numbers:
// scrimmage yards 10-150, anytime TD, 2+ TDs), wins / loses coins by our own chance, resets any time. No real money, no book odds,
// nothing to buy or cash out. Saved in this browser.
//   payout: a hit returns stake / chance (kept between 3% and 97%); if our chances are right, picks break even over time.
//   lock:   picks close at kickoff (season_schedule.json, Eastern time) and settle from the same line file once the pipeline grades
//           the game (final_teams + actual, a few hours after it ends); didn't play = void.
//   parlay: 2-6 legs, one per player; chance = legs multiplied x the measured factor (pairs.js PAIR_CORR, 2023-25: TD + 100 yds on
//           opposite sides of one game 1.07, everything else 1.00). Any miss loses; a leg who doesn't play drops out, the rest re-priced.
// Same rules as CourtIQ / Slap Shot. Guardrails (Operation Move): never sold, never redeemable, no prizes, not tied to Pro.
export const START = 1000
export const SIGNUP_START = 10000 // signed-in accounts (login step, Operation Move E)
export const STAKES = [10, 25, 50, 100, 250]
export const MAX_LEGS = 6
// 2026-11-09 (user): separate rushing / receiving yards (RB rush, RB / WR / TE rec, starting-QB rush; line board 'split' ladders)
export const STATS = [['TD', 'Touchdowns'], ['YDS', 'Scrimmage yards'], ['RUSH', 'Rushing yards'], ['REC', 'Receiving yards']]
export const STAT_LABEL = Object.fromEntries(STATS)
export const STAT_SHORT = { TD: 'TD', YDS: 'Scrim', RUSH: 'Rush', REC: 'Rec' }
export const legLabel = (l) => (l.stat === 'TD' ? (l.line === 1 ? 'Anytime TD' : `${l.line}+ TDs`) : `${l.line}+ ${{ YDS: 'scrim', RUSH: 'rush', REC: 'rec' }[l.stat] || ''} yds`)
export const clampChance = (c) => Math.min(0.97, Math.max(0.03, Number(c) || 0))
const clampParlay = (c) => Math.min(0.97, Math.max(0.002, Number(c) || 0))
export const payoutFor = (stake, chance) => Math.round(stake / clampChance(chance))
export const parlayPayout = (stake, chance) => Math.round(stake / clampParlay(chance))

const KEY = 'sixpoints.coins.v1'
const fresh = (run = 1, start = START) => ({ v: 1, run, start, startedAt: new Date().toISOString(), balance: start, bets: [] })
const listeners = new Set()
let state = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    return v && Array.isArray(v.bets) && typeof v.balance === 'number' ? v : fresh()
  } catch { return fresh() }
})()
function commit(next) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* private window: this visit only */ }
  listeners.forEach((fn) => fn())
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    try { state = JSON.parse(e.newValue || 'null') || fresh() } catch { state = fresh() }
    listeners.forEach((fn) => fn())
  })
}
export const useCoins = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => state, () => state)

export const betKey = (b) => `${b.date}|${b.playerId}|${b.stat}|${b.line}`
export const isOpenPick = (t) => !t || Date.now() < Date.parse(t)
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// ---- this week's lines + kickoffs --------------------------------------------------------------------------------
const getJson = (u) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
// kickoff in UTC from the schedule's Eastern date + time (DST-safe: find the offset New York had at that moment)
export function kickoffUTC(day, time) {
  if (!day || !time) return null
  const guess = Date.parse(`${day}T${time}:00Z`) // the Eastern clock reading, as if it were UTC
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess)).map((x) => [x.type, x.value]))
  const nyAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute)
  return new Date(guess + (guess - nyAsUtc)).toISOString() // offset = UTC - New York at that moment
}
let weekPromise = null
export function loadWeek() {
  return (weekPromise = weekPromise || (async () => {
    const [slate, sched] = await Promise.all([getJson('/data/all_matchups_latest.json'), getJson('/data/season_schedule.json')])
    if (!slate?.season || !slate?.week) return null
    const lines = await getJson(`/data/lines/${slate.season}-wk${slate.week}.json`)
    const games = (sched?.games || []).filter((g) => g.week === slate.week && (sched.season == null || sched.season === slate.season))
      .map((g) => ({ gameId: g.game_id, day: g.gameday, away: g.away_team, home: g.home_team, kickoff: kickoffUTC(g.gameday, g.gametime), final: g.home_score != null }))
    const active = new Set((slate.matchups || []).map((m) => m.player_id))
    // 2026-11-09 (user: Josh Allen wasn't an option for TDs): the line board prices RBs / WRs / TEs only (no QB yards projection), so each
    // team's starting QB (its highest TD chance) gets the grade model's own anytime / 2+ TD chances -- the numbers the Cheat Sheets show.
    // Settled from ESPN's box score (src 'espn'): the line file has no QB results.
    const qb = {}
    for (const m of slate.matchups || []) if (m.position === 'QB' && m.p_td != null && !(qb[m.team]?.p_td >= m.p_td)) qb[m.team] = m
    // the line file has the starting QBs' rushing ladders (RUSH); their TD lines come from the slate (tdEspn: settled from ESPN)
    const lineQb = new Map((lines?.players || []).filter((p) => p.pos === 'QB').map((p) => [p.id, p]))
    const qbs = Object.values(qb).filter((m) => m.p_td >= 0.03).map((m) => {
      const base = lineQb.get(m.player_id) || { id: m.player_id, name: m.player_name, team: m.team, opp: m.opponent, pos: 'QB', n: 0, lines: {} }
      return { ...base, status: base.status || m.injury_status || m.status || null, tdEspn: true,
        lines: { ...base.lines, TD: [[1, m.p_td, null]], ...(m.p_td2 != null ? { TD2: [[2, m.p_td2, null]] } : {}) } }
    })
    const qbIds = new Set(qbs.map((p) => p.id))
    const withQbs = lines ? { ...lines, players: [...(lines.players || []).filter((p) => !qbIds.has(p.id)), ...qbs] } : null
    return { season: slate.season, week: slate.week, key: `${slate.season}-wk${slate.week}`, games, lines: withQbs, active }
  })())
}
export function useWeek() {
  const [d, setD] = useState(undefined)
  useEffect(() => { let alive = true; loadWeek().then((x) => alive && setD(x)); return () => { alive = false } }, [])
  return d
}
// one ladder per stat: TD = anytime (1+) and 2+ TDs from the line file's TD / TD2
export function laddersOf(lp) {
  if (!lp?.lines) return {}
  const out = {}
  if (lp.lines.YDS?.length) out.YDS = lp.lines.YDS
  if (lp.lines.RUSH?.length) out.RUSH = lp.lines.RUSH
  if (lp.lines.REC?.length) out.REC = lp.lines.REC
  const td = [...(lp.lines.TD || []), ...(lp.lines.TD2 || [])]
  if (td.length) out.TD = td
  return out
}
export const gameOfTeam = (wk, team) => (wk?.games || []).find((g) => g.away === team || g.home === team) || null
export function ticket(wk, lp, stat, line, chance) {
  const g = gameOfTeam(wk, lp.team)
  if (!g || line == null || chance == null) return null
  return { date: wk.key, season: wk.season, week: wk.week, gameId: g.gameId, tip: g.kickoff, playerId: lp.id, name: lp.name, team: lp.team, opp: lp.opp,
    stat, statLabel: STAT_LABEL[stat], line, chance, ...(lp.tdEspn && stat === 'TD' ? { src: 'espn', day: g.day, home: g.home, away: g.away } : {}) }
}

// ---- parlay pricing ----------------------------------------------------------------------------------------------
const corrKey = (stat) => (stat === 'TD' ? 't' : 'y')
export function pairFactor(a, b) {
  if (a.gameId !== b.gameId) return 1
  return PAIR_CORR[a.team === b.team ? 'team' : 'opp']?.[[corrKey(a.stat), corrKey(b.stat)].sort().join('')] ?? 1
}
export function parlayChance(legs) {
  let p = legs.reduce((s, l) => s * clampChance(l.chance), 1)
  const indep = p
  for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) p *= pairFactor(legs[i], legs[j])
  return { chance: clampParlay(p), indep, sameGame: legs.some((l, i) => legs.some((m, j) => j > i && m.gameId === l.gameId)) }
}
export function parlayProblem(legs) {
  if (legs.length < 2) return 'A parlay needs 2+ legs'
  if (legs.length > MAX_LEGS) return `Up to ${MAX_LEGS} legs`
  if (new Set(legs.map((l) => `${l.date}|${l.playerId}`)).size < legs.length) return 'One leg per player in a parlay'
  return null
}

export function placeBet(t, stake) {
  stake = Math.floor(Number(stake))
  if (!(stake > 0) || stake > state.balance) return 'Not enough coins'
  if (!isOpenPick(t.tip)) return 'This game has started'
  if (state.bets.some((b) => b.type !== 'parlay' && betKey(b) === betKey(t))) return 'Already picked'
  const chance = clampChance(t.chance)
  commit({ ...state, balance: state.balance - stake, bets: [...state.bets, { ...t, id: newId(), chance, stake, payout: payoutFor(stake, chance), placedAt: new Date().toISOString(), status: 'open' }] })
  return null
}
export function placeParlay(legs, stake) {
  stake = Math.floor(Number(stake))
  if (!(stake > 0) || stake > state.balance) return 'Not enough coins'
  const bad = parlayProblem(legs)
  if (bad) return bad
  if (legs.some((l) => !isOpenPick(l.tip))) return "A leg's game has started"
  const { chance } = parlayChance(legs)
  const tip = legs.map((l) => l.tip).filter(Boolean).sort()[0] || null
  const bet = { type: 'parlay', id: newId(), date: legs[0].date, season: legs[0].season, week: legs[0].week, tip,
    legs: legs.map((l) => ({ ...l, chance: clampChance(l.chance), status: 'open' })), chance, stake, payout: parlayPayout(stake, chance), placedAt: new Date().toISOString(), status: 'open' }
  commit({ ...state, balance: state.balance - stake, bets: [...state.bets, bet] })
  return null
}
export function cancelBet(id) {
  const b = state.bets.find((x) => x.id === id)
  if (!b || b.status !== 'open' || !isOpenPick(b.tip)) return
  commit({ ...state, balance: state.balance + b.stake, bets: state.bets.filter((x) => x.id !== id) })
}
export function resetCoins() { commit(fresh((state.run || 1) + 1, state.start || START)) }

// ---- settling (from the graded line file; QB legs from ESPN's box score) -------------------------------------------
const normName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '')
let teamsPromise = null
const espnCache = {}
async function espnTds(l) {
  teamsPromise = teamsPromise || getJson('/data/team_stats.json')
  const ts = (await teamsPromise) || {}
  const ab = (t) => String(ts[t]?.espn_abbr || t).toUpperCase()
  if (!l.day) return null
  const sb = await getJson(`/api/scoreboard?dates=${l.day.replaceAll('-', '')}`)
  const ev = (sb?.events || []).find((e) => { const cs = (e.competitions?.[0]?.competitors || []).map((c) => String(c.team?.abbreviation || '').toUpperCase()); return cs.includes(ab(l.home)) && cs.includes(ab(l.away)) })
  if (!ev || ev.status?.type?.state !== 'post') return null
  espnCache[ev.id] = espnCache[ev.id] || getJson(`/api/summary?event=${ev.id}&full=1`)
  const s = await espnCache[ev.id]
  const team = (s?.boxscore?.players || []).find((t) => String(t.team?.abbreviation || '').toUpperCase() === ab(l.team))
  if (!team) return null
  let seen = false, td = 0
  for (const st of team.statistics || []) {
    const a = (st.athletes || []).find((x) => normName(x.athlete?.displayName) === normName(l.name))
    if (!a) continue
    seen = true
    const ix = (st.labels || []).indexOf('TD')
    if ((st.name === 'rushing' || st.name === 'receiving') && ix >= 0) td += Number(a.stats?.[ix]) || 0
  }
  return seen ? { status: td >= l.line ? 'won' : 'lost', actual: td } : { status: 'void', actual: null }
}
function rollUp(b) {
  const legs = b.legs
  if (legs.some((l) => l.status === 'lost')) return { status: 'lost' }
  if (legs.some((l) => l.status === 'open')) return { status: 'open' }
  const live = legs.filter((l) => l.status === 'won')
  if (!live.length) return { status: 'void' }
  if (live.length === legs.length) return { status: 'won' }
  const ch = live.length === 1 ? clampChance(live[0].chance) : parlayChance(live).chance
  return { status: 'won', chance: ch, payout: parlayPayout(b.stake, ch), repriced: true }
}
let running = false
export async function settleOpen() {
  const todo = []
  for (const b of state.bets) {
    if (b.status !== 'open') continue
    if (b.type === 'parlay') b.legs.forEach((l, i) => { if (l.status === 'open' && !isOpenPick(l.tip)) todo.push([b.id, i, l]) })
    else if (!isOpenPick(b.tip)) todo.push([b.id, null, b])
  }
  if (!todo.length || running) return
  running = true
  try {
    const files = {}
    const results = new Map()
    for (const [id, i, l] of todo) {
      if (l.src === 'espn') { const r = await espnTds(l); if (r) results.set(`${id}|${i}`, r); continue }
      if (!(l.date in files)) files[l.date] = await getJson(`/data/lines/${l.date}.json`)
      const f = files[l.date]
      if (!f || !(f.final_teams || []).includes(l.team)) continue
      const lp = (f.players || []).find((x) => x.id === l.playerId)
      if (lp && lp.actual === undefined) continue // final, not graded yet
      const v = lp?.actual ? lp.actual[l.stat] : null
      if (lp?.actual && v === undefined) continue // graded before the split columns existed: wait for the next grade
      results.set(`${id}|${i}`, v == null ? { status: 'void', actual: null } : { status: v >= l.line ? 'won' : 'lost', actual: v })
    }
    if (!results.size) return
    const now = new Date().toISOString()
    let balance = state.balance
    const bets = state.bets.map((b) => {
      if (b.status !== 'open') return b
      if (b.type !== 'parlay') {
        const r = results.get(`${b.id}|null`)
        if (!r) return b
        if (r.status === 'won') balance += b.payout
        if (r.status === 'void') balance += b.stake
        return { ...b, ...r, settledAt: now }
      }
      const legs = b.legs.map((l, i) => { const r = results.get(`${b.id}|${i}`); return r ? { ...l, ...r } : l })
      const u = rollUp({ ...b, legs })
      if (u.status === 'open') return { ...b, legs }
      const out = { ...b, legs, ...u, settledAt: now }
      if (out.status === 'won') balance += out.payout
      if (out.status === 'void') balance += out.stake
      return out
    })
    commit({ ...state, balance, bets })
  } finally { running = false }
}
export function useCoinSettler() {
  const coins = useCoins()
  const started = (b) => (b.type === 'parlay' ? b.legs.some((l) => l.status === 'open' && !isOpenPick(l.tip)) : !isOpenPick(b.tip))
  const waiting = coins.bets.some((b) => b.status === 'open' && started(b))
  const anyOpen = coins.bets.some((b) => b.status === 'open')
  useEffect(() => {
    if (!anyOpen) return undefined
    settleOpen()
    const t = setInterval(settleOpen, waiting ? 5 * 60 * 1000 : 60 * 1000)
    const vis = () => { if (document.visibilityState === 'visible') settleOpen() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [anyOpen, waiting])
}

export function summarize(coins) {
  const done = coins.bets.filter((b) => b.status === 'won' || b.status === 'lost')
  const won = done.filter((b) => b.status === 'won').length
  const open = coins.bets.filter((b) => b.status === 'open')
  const par = done.filter((b) => b.type === 'parlay')
  return {
    done: done.length, won, lost: done.length - won, void: coins.bets.filter((b) => b.status === 'void').length, said: done.reduce((s, b) => s + b.chance, 0),
    parlays: par.length, parlaysWon: par.filter((b) => b.status === 'won').length, parlaysSaid: par.reduce((s, b) => s + b.chance, 0),
    openN: open.length, inPlay: open.reduce((s, b) => s + b.stake, 0), pnl: coins.balance + open.reduce((s, b) => s + b.stake, 0) - (coins.start || START),
  }
}

// ---- the slip (shared by the Degen Picks page and the player slideout's 🪙 section) -------------------------------
const SLIP_KEY = 'sixpoints.coins.slip'
const slipSubs = new Set()
let slip = (() => { try { const v = JSON.parse(localStorage.getItem(SLIP_KEY) || '[]'); return Array.isArray(v) ? v.filter((t) => isOpenPick(t.tip)) : [] } catch { return [] } })()
export function setSlip(next) {
  slip = typeof next === 'function' ? next(slip) : next
  try { localStorage.setItem(SLIP_KEY, JSON.stringify(slip)) } catch { /* this visit only */ }
  slipSubs.forEach((f) => f())
}
export const useSlip = () => useSyncExternalStore((f) => { slipSubs.add(f); return () => slipSubs.delete(f) }, () => slip, () => slip)
export const toggleSlip = (t) => setSlip((cur) => (cur.some((x) => betKey(x) === betKey(t)) ? cur.filter((x) => betKey(x) !== betKey(t)) : [...cur, t]))

// Gambly text, same wording as the app's other Gambly buttons (gambly.js)
export const gamblyLeg = (l) => `${l.name}${l.team ? ` (${l.team})` : ''} — ${l.stat === 'TD' ? (l.line === 1 ? 'Anytime Touchdown Scorer' : `${l.line}+ Touchdowns`) : `${l.line}+ ${{ YDS: 'Rushing + Receiving Yards', RUSH: 'Rushing Yards', REC: 'Receiving Yards' }[l.stat]}`}`

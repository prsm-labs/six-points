// 👑 King of the End Zone (2026-10-18 revamp) -- DraftKings' NFL promo, Slap Shot's Ice Breaker equivalent.
//
// The promo: opt in, place a $5+ single on any TD-scorer market with the token; if that player scores the game's
// LONGEST touchdown (rushing, receiving or return -- a QB gets no credit for a passing TD), everyone who picked him
// splits the bonus-bet pool (usually $2M). Ties split; a defense / special-teams TD pays that team's D/ST pickers.
//
// Our chance: each promo game is simulated (SIMS runs): every player's TD count ~ Poisson from his grade-model TD %,
// each TD's length from his POSITION's real TD-length distribution (kote_model.json, build_kote.py: 4 seasons of
// play-by-play), plus each team's D/ST / return TDs at the league rate; the longest TD wins. Backtest 2023-25 (every
// game, held out): beats "share of TD chance" every season (log-lik -2.81 / -2.88 / -2.91 vs -2.92 / -2.92 / -2.94);
// our favorite won 13-15% of games vs 10-13%.
//
// Payout: bettors on a player = B x (TD %)^k, fit to the two 2026 payouts DraftKings published with bettor counts
// (Palmer 7,003 bettors / $286; Bijan 26,158 / $77; $2M pools). Two points -> a rough guide; pool editable.
import { useEffect, useState, useSyncExternalStore } from 'react'

export const SIMS = 20000

function poisson(lam) {
  if (lam <= 0) return 0
  const L = Math.exp(-lam)
  let k = 0
  let p = 1
  do { k += 1; p *= Math.random() } while (p > L && k < 10)
  return k - 1
}

// Explosive-play split (2026-10-19, user: the longest TD is about explosive-play potential, at any position): his TD
// chance is split into long (20+ yd) and short TDs by P(long | TD) = logistic(position + his own 20+ yd plays per
// touch, kote_model.json long / x20); each kind's length comes from the position's long / short table. Backtest
// 2023-25 held out: better at naming the actual longest-TD scorer every season (build_kote.py docstring).
const sigmoid = (x) => 1 / (1 + Math.exp(-x))
export function longShare(m, model) {
  const L = model?.long
  if (!L || !(m.position in L.pos)) return null
  const rate = model.x20?.[m.player_id] ?? L.x20_league
  return sigmoid(L.pos[m.position] + L.b * (Math.log(Math.max(rate, 1e-4)) - L.mu) / L.sd)
}
const draw = (tab, k) => tab[Math.min(tab.length - 1, Math.floor(Math.random() ** (1 / k) * tab.length))] // max of k draws

// players: slate rows of the two teams ({player_id, position, p_td}); teams: [away, home]. Returns Map id -> row.
export function simulateGame(players, teams, model, sims = SIMS) {
  if (!model) return new Map()
  const L = model.long
  const ents = players
    .filter((m) => m.p_td != null && m.p_td > 0)
    .map((m) => {
      const pos = ['RB', 'WR', 'TE', 'QB'].includes(m.position) ? m.position : 'OTH'
      const lam = -Math.log(1 - Math.min(0.95, m.p_td))
      const pl = longShare(m, model)
      return { id: m.player_id, m, pos, lam, pLong: pl, x20: model.x20?.[m.player_id] ?? null,
        lamLong: pl != null ? lam * pl : null, lamShort: pl != null ? lam * (1 - pl) : null }
    })
  for (const t of teams) ents.push({ id: `DST:${t}`, dst: t, pos: 'DST', lam: model.lam_dst })
  const n = ents.length
  const wins = new Float64Array(n)
  const anyTd = new Float64Array(n)
  const longTd = new Float64Array(n)
  const lens = new Float64Array(n)
  let noTd = 0
  for (let s = 0; s < sims; s += 1) {
    let best = -1
    for (let j = 0; j < n; j += 1) {
      const e = ents[j]
      let len = -1
      if (e.lamLong != null) {
        const kl = poisson(e.lamLong)
        const ks = poisson(e.lamShort)
        if (kl > 0) { len = draw(L.tables_long[e.pos], kl); longTd[j] += 1 }
        if (ks > 0) len = Math.max(len, draw(L.tables_short[e.pos], ks))
      } else {
        const k = poisson(e.lam)
        if (k > 0) len = draw(model.tables[e.pos] || model.tables.OTH, k)
      }
      lens[j] = len
      if (len >= 0) {
        anyTd[j] += 1
        if (len > best) best = len
      }
    }
    if (best < 0) { noTd += 1; continue }
    let tied = 0
    for (let j = 0; j < n; j += 1) if (lens[j] === best) tied += 1
    for (let j = 0; j < n; j += 1) if (lens[j] === best) wins[j] += 1 / tied
  }
  const out = new Map()
  ents.forEach((e, j) => out.set(e.id, { ...e, king: wins[j] / sims, scores: anyTd[j] / sims, longTd: longTd[j] / sims }))
  out.noTd = noTd / sims
  return out
}

export function projectedPayout(pTd, pool, model) {
  const pay = model?.payout
  if (!pay || !(pTd > 0)) return null
  const bettors = Math.max(1, pay.B * pTd ** pay.k)
  return Math.min(pool, pool / bettors)
}

export const decimalOf = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / -a)

let modelPromise = null
export function useKoteModel() {
  const [m, setM] = useState(null)
  useEffect(() => {
    if (!modelPromise) modelPromise = fetch('/data/kote_model.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)
    let alive = true
    modelPromise.then((v) => alive && setM(v))
    return () => { alive = false }
  }, [])
  return m
}

// ---- promo status per date (api/kote.js) + a per-date viewer override (saved in this browser) -------------------
const KEY = 'sixpoints.kote.v1'
let overrides = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } })()
const listeners = new Set()
export function setKoteOverride(gameId, on) {
  overrides = { ...overrides, [gameId]: on }
  try { localStorage.setItem(KEY, JSON.stringify(overrides)) } catch { /* this visit only */ }
  listeners.forEach((fn) => fn())
}
export const useKoteOverrides = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => overrides, () => overrides)

const statusCache = new Map()
export function useKoteStatus(dates) {
  const [byDate, setByDate] = useState({})
  const key = (dates || []).join(',')
  useEffect(() => {
    if (!key) return undefined
    let alive = true
    for (const d of key.split(',')) {
      if (statusCache.has(d)) { setByDate((p) => ({ ...p, [d]: statusCache.get(d) })); continue }
      fetch(`/api/kote?date=${d}`).then((r) => (r.ok ? r.json() : null)).then((s) => {
        if (!s) return
        statusCache.set(d, s)
        if (alive) setByDate((p) => ({ ...p, [d]: s }))
      }).catch(() => {})
    }
    return () => { alive = false }
  }, [key])
  return byDate
}

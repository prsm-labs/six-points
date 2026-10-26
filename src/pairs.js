// 🤝 Pairs (Scouting > Pairs; Slap Shot's lib/pairs.js, 2026-10-18 revamp) -- auto-built 2-leg parlays from this
// week's slate. Legs: anytime TD (grade-model TD % + sportsbook price) and 100+ scrimmage yards (grade model).
// Pair chance = leg A x leg B x correlation for how the two legs relate. Correlations measured on 2023-25 (each
// week's top 60 by TD chance, held-out chances, scratch pair_corr.py) as actual P(both) / sum of the products:
//   different games    TD+TD 0.98   TD+100 1.01   100+100 1.03   -> independent (1.00)
//   teammates          TD+TD 1.01   TD+100 1.03   100+100 0.99   (seasons swing 0.75-1.30) -> 1.00
//   opponents          TD+TD 0.98   TD+100 1.07 (1.08 / 1.13 / 1.01: the shootout link)   100+100 1.01
// Ranked by the model's chance that both legs hit (grade, matchup and form are already in each leg's chance). Only
// the "Value vs book" mode (and 2 of Balanced's slots) rank by expected return at the book, with the market check chance. Book parlay price = TD + TD legs in
// different games, decimal A x decimal B at one book where both are listed; same-game pairs get our fair price only.
// Locked at the Sunday lock (scripts/lock_pairs.mjs) and graded in Track Record > Pairs.
import { marketPct } from './market.js'

export const PAIR_CORR = {
  diff: { tt: 1, ty: 1, yy: 1 },
  team: { tt: 1, ty: 1, yy: 1 },
  opp: { tt: 1, ty: 1.07, yy: 1 },
}

// Levels (2026-10-23, user: mid-range + long-shot pairs, data-backed): All = the board as before (default); 🛡️ Safe = both-hit
// 25%+; ⚖️ Mid-range = 10-25% (two strong TD legs); 🌠 Long shot = 3-10% (two longer-shot TDs, about +900 to +3200). Same legs
// and measured factors at every level (graded by chance band in Track Record). Mid / long lead with the one measured
// rise-together link: TD + 100 yds on opposite sides of one game (+7%, the shootout).
export const LEVELS = [
  { key: 'all', label: 'All levels', min: 0, max: 1.01, blurb: 'Every chance band — the board as before' },
  { key: 'safe', label: '🛡️ Safe', min: 0.25, max: 1.01, blurb: 'Both-hit 25% or better' },
  { key: 'mid', label: '⚖️ Mid-range', min: 0.1, max: 0.25, blurb: 'Both-hit 10-25% (about +300 to +900 fair)' },
  { key: 'long', label: '🌠 Long shot', min: 0.03, max: 0.1, blurb: 'Both-hit 3-10% — the stars-align pairs (about +900 to +3200 fair)' },
]
export const LEVEL_KEYS = LEVELS.map((l) => l.key)
export const MAX_PAIRS = 10
const LEGS_PER_PROP = 40
const MAX_PER_PLAYER = { balanced: 1, default: 2 }

export const PROPS = {
  td: { key: 'td', short: 'TD', label: 'Anytime TD', emoji: '🏈' },
  yds: { key: 'yds', short: '100', label: '100+ scrimmage yards', emoji: '💨' },
}

export const MODES = [
  { key: 'balanced', label: '⚖️ Balanced', blurb: 'Strongest TD pairs by the model, best value TD pairs, soft matchups, hot hands, a same-game stack and a yards pair' },
  { key: 'value', label: '💰 Value vs book', blurb: 'TD + TD pairs, different games, ranked by expected return at the best book, using the market check chance (half ours, half the book)' },
  { key: 'safest', label: '🛡️ Safest', blurb: 'Highest chance both legs hit, any prop' },
  { key: 'hot', label: '🔥 Hot hands', blurb: 'At least one leg is a 🔥 hot hand (scored in his last 3 games, outside the top 25%) or on Breakout Watch' },
  { key: 'soft', label: '▲ Soft matchups', blurb: "Both legs face one of this week's softest TD defenses (top third)" },
  { key: 'stacks', label: '🔗 Same game', blurb: 'Both legs in one game — teammates or opponents (TD + 100 yds across a game is the one real link: +7%)' },
]
export const MODE_KEYS = MODES.map((m) => m.key)
export const STAR_TOP = 5
export const PROP_FILTERS = [
  { key: null, label: 'All props' },
  { key: 'td', label: '🏈 TD pairs' },
  { key: 'yds', label: '💨 Yards pairs' },
]

export const toDecimal = (am) => (am > 0 ? 1 + am / 100 : 1 + 100 / -am)
export const toAmerican = (dec) => (dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1)))
const fairAmerican = (p) => toAmerican(1 / p)

function legOf(m, prop) {
  const chance = prop === 'td' ? m.p_td : m.p_100
  if (chance == null || !(chance > 0)) return null
  if (prop === 'yds' && m.position === 'QB') return null
  return { m, prop, chance, book: prop === 'td' ? m.book || null : null }
}

function relation(a, b) {
  if (a.m.team === b.m.team) return 'team'
  return a.m.opponent === b.m.team ? 'opp' : 'diff'
}
const corrKey = (a, b) => ({ 'td+td': 'tt', 'td+yds': 'ty', 'yds+yds': 'yy' })[[a.prop, b.prop].sort().join('+')]

function bookParlay(a, b, boost) {
  if (!a.book?.books || !b.book?.books) return null
  let best = null
  for (const [bk, am] of Object.entries(a.book.books)) {
    const bm = b.book.books[bk]
    if (am == null || bm == null) continue
    const dec = toDecimal(am) * toDecimal(bm)
    if (!best || dec > best.dec) best = { book: bk, dec, legs: [am, bm] }
  }
  if (!best) return null
  const boosted = 1 + (best.dec - 1) * (1 + boost)
  return { ...best, american: toAmerican(best.dec), boostedDec: boosted, boostedAmerican: toAmerican(boosted) }
}

// Expected return uses the market check chance (2026-10-26; Slap Shot's lib/pairs.js): each priced TD leg's chance is
// moved to half ours, half the book (market.js). With our chance alone the "value" pairs were just the ones we rated above
// the book -- and where we disagreed, the book was closer.
function marketPairChance(chance, legs) {
  let c = chance
  for (const l of legs) {
    const mk = l.prop === 'td' && l.book ? marketPct(l.chance * 100, l.book) : null
    if (mk != null && l.chance > 0) c *= mk / 100 / l.chance
  }
  return Math.min(0.99, c)
}

function makePair(a, b, boost) {
  const rel = relation(a, b)
  const corr = PAIR_CORR[rel][corrKey(a, b)]
  const chance = Math.min(0.99, a.chance * b.chance * corr)
  const sameGame = rel !== 'diff'
  const parlay = !sameGame && a.prop === 'td' && b.prop === 'td' ? bookParlay(a, b, boost) : null
  const ev = parlay ? marketPairChance(chance, [a, b]) * parlay.boostedDec - 1 : null
  const [x, y] = a.m.player_id < b.m.player_id ? [a, b] : [b, a]
  return { key: `${x.m.player_id}:${x.prop}|${y.m.player_id}:${y.prop}`, legs: [a, b], rel, corr, chance, fair: fairAmerican(chance), sameGame, parlay, ev }
}

function allPairs(legs, filter, boost) {
  const out = []
  for (let i = 0; i < legs.length; i += 1) {
    for (let j = i + 1; j < legs.length; j += 1) {
      const a = legs[i]
      const b = legs[j]
      if (a.m.player_id === b.m.player_id || !filter(a, b)) continue
      out.push(makePair(a, b, boost))
    }
  }
  return out
}

function take(sorted, n, state) {
  const got = []
  for (const pr of sorted) {
    if (got.length >= n) break
    if (state.keys.has(pr.key) || pr.chance < (state.min ?? 0) || pr.chance >= (state.max ?? 1.01)) continue
    const ids = pr.legs.map((l) => l.m.player_id)
    if (ids.some((id) => (state.uses.get(id) || 0) >= state.cap)) continue
    state.keys.add(pr.key)
    ids.forEach((id) => state.uses.set(id, (state.uses.get(id) || 0) + 1))
    got.push(pr)
  }
  return got
}

export const comboOf = (pr) => pr.legs.map((l) => l.prop).sort().join('+')
function pctBelow(sorted, v) {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m }
  return sorted.length > 1 ? (lo - 1) / (sorted.length - 1) : 1
}
function starUniverse(td, yds) {
  const by = {}
  for (const pr of allPairs([...td, ...yds], () => true, 0)) (by[comboOf(pr)] = by[comboOf(pr)] || []).push(pr.chance)
  for (const k of Object.keys(by)) by[k].sort((a, b) => a - b)
  return by
}
// ★ Best pairs (Slap Shot's star score): strength = percentile of the both-hit chance among every valid pair this week
// with the same props; + 0.3 x expected return at the book (TD + TD with a price; clipped -50%..+100%).
export function starScore(pr, universe) {
  const strength = Math.max(0, pctBelow(universe[comboOf(pr)] || [pr.chance], pr.chance))
  const value = pr.ev != null ? 0.3 * Math.min(1, Math.max(-0.5, pr.ev)) : 0
  return { score: strength + value, strength, value }
}
function withStars(list, universe) {
  const scored = list.map((pr) => ({ ...pr, star: starScore(pr, universe) }))
  const order = [...scored].sort((a, b) => b.star.score - a.star.score)
  const rank = new Map(order.slice(0, STAR_TOP).map((pr, i) => [pr.key, i + 1]))
  return scored.map((pr) => ({ ...pr, starRank: rank.get(pr.key) ?? null }))
}

const isOut = (m) => Boolean(m.absent_reason) || m.week_status === 'Out'

// players: this week's slate rows (slate.js). excludeTeams: teams whose game already kicked off (left out of a lock).
export function buildPairs(players, { mode = 'balanced', boost = 0, prop = null, excludeTeams = new Set(), level = 'all' } = {}) {
  const live = players.filter((m) => !excludeTeams.has(m.team) && !isOut(m))
  const top = (k) => live.map((m) => legOf(m, k)).filter(Boolean).sort((a, b) => b.chance - a.chance).slice(0, LEGS_PER_PROP)
  const allTd = top('td')
  const allYds = top('yds')
  const td = prop && prop !== 'td' ? [] : allTd
  const yds = prop && prop !== 'yds' ? [] : allYds
  // hot hands / breakouts sit outside the top by design -- give them their own candidate legs
  const hotLegs = live.filter((m) => m.hotHand || m.breakout).flatMap((m) => [legOf(m, 'td'), legOf(m, 'yds')]).filter(Boolean)
    .filter((l) => !prop || l.prop === prop)
  const LV = LEVELS.find((l) => l.key === level) || LEVELS[0]
  return withStars(pickPairs({ td, yds, hotLegs, mode, boost, prop, band: { min: LV.min, max: LV.max }, level }), starUniverse(allTd, allYds))
}

function pickPairs({ td, yds, hotLegs, mode, boost, prop, band = { min: 0, max: 1.01 }, level = 'all' }) {
  const byChance = (a, b) => b.chance - a.chance
  const byEv = (a, b) => b.ev - a.ev
  const state = { keys: new Set(), uses: new Map(), cap: MAX_PER_PLAYER[mode] ?? MAX_PER_PLAYER.default, ...band }
  const tag = (list, section) => list.map((pr) => ({ ...pr, section }))
  const tdPairs = allPairs(td, (a, b) => relation(a, b) === 'diff', boost).sort(byChance)
  const valuePairs = allPairs(td.filter((l) => l.book), (a, b) => relation(a, b) === 'diff', boost).filter((pr) => pr.ev != null && pr.ev > 0).sort(byEv)
  const stacks = allPairs([...td, ...yds], (a, b) => relation(a, b) !== 'diff', boost).sort(byChance)
  const ydsPairs = allPairs(yds, (a, b) => relation(a, b) === 'diff', boost).sort(byChance)
  const isHot = (l) => l.m.hotHand || l.m.breakout
  const seen = new Set([...td, ...yds].map((l) => `${l.m.player_id}:${l.prop}`))
  const pool = [...td, ...yds, ...hotLegs.filter((l) => !seen.has(`${l.m.player_id}:${l.prop}`))]
  const hotPairs = allPairs(pool, (a, b) => isHot(a) || isHot(b), boost).sort(byChance)
  const isSoft = (l) => l.m.def_tier === 'soft'
  const softPairs = allPairs([...td, ...yds].filter(isSoft), () => true, boost).sort(byChance)
  const any = () => allPairs([...td, ...yds], () => true, boost).sort(byChance)

  if (mode === 'value') return tag(take(valuePairs, MAX_PAIRS, state), '💰 Value')
  if (prop && mode === 'balanced') return tag(take(any(), MAX_PAIRS, state), prop === 'td' ? '🏈 TDs' : '💨 Yards')
  if (mode === 'safest') return tag(take(any(), MAX_PAIRS, state), '🛡️ Safest')
  if (mode === 'hot') return tag(take(hotPairs, MAX_PAIRS, state), '🔥 Hot hand')
  if (mode === 'soft') return tag(take(softPairs, MAX_PAIRS, state), '▲ Soft matchup')
  if (mode === 'stacks') return stacks.length ? tag(take(stacks, MAX_PAIRS, state), '🔗 Same game').map((pr) => ({ ...pr, section: pr.rel === 'team' ? '🔗 Teammates' : '⚔️ Opponents' })) : []
  const together = level === 'mid' || level === 'long' ? tag(take(stacks.filter((pr) => pr.corr > 1.03), 2, state), '✨ Stars align: shootout') : []
  const out = [
    ...together,
    ...tag(take(tdPairs, 2, state), '🏈 TDs'),
    ...tag(take(valuePairs, 2, state), '💰 Value'),
    ...tag(take(softPairs, 2, state), '▲ Soft matchup'),
    ...tag(take(hotPairs, 2, state), '🔥 Hot hand'),
    ...tag(take(stacks, 1, state), '🔗 Same game'),
    ...tag(take(ydsPairs, 1, state), '💨 Yards'),
  ]
  if (out.length < MAX_PAIRS) out.push(...tag(take(tdPairs, MAX_PAIRS - out.length, state), '🏈 TDs'))
  return out
}

// Blind spots: notable players this week who aren't in any shown pair (Slap Shot's notInPairs).
export function notInPairs(players, pairs, { excludeTeams = new Set() } = {}) {
  const used = new Set(pairs.flatMap((pr) => pr.legs.map((l) => l.m.player_id)))
  const out = []
  for (const m of players) {
    if (used.has(m.player_id) || excludeTeams.has(m.team) || isOut(m) || m.p_td == null) continue
    const why = []
    if ((m.grade || '').startsWith('A')) why.push(`${m.grade} grade`)
    if (m.hotHand) why.push('🔥 hot hand')
    if (m.breakout) why.push('🚀 breakout')
    if (m.def_tier === 'soft' && /^[AB]/.test(m.grade || '')) why.push('▲ soft D')
    if ((m.role_gain ?? 0) >= 2) why.push(`+${Number(m.role_gain).toFixed(1)} role`)
    if (!why.length) continue
    out.push({ m, why, score: why.length * 100 + (m.p_td || 0) * 100 })
  }
  return out.sort((a, b) => b.score - a.score)
}

// What gets frozen into public/data/pairs/<season>-wk<week>.json (scripts/lock_pairs.mjs) and graded.
const r1 = (v) => (v == null ? null : Math.round(v * 1000) / 10)
export function pairRecord(pr) {
  return {
    key: pr.key, section: pr.section, rel: pr.rel, corr: pr.corr, chancePct: r1(pr.chance), fair: pr.fair,
    starRank: pr.starRank ?? null, star: pr.star ? Math.round(pr.star.score * 1000) / 1000 : null,
    parlay: pr.parlay ? { book: pr.parlay.book, legs: pr.parlay.legs, american: pr.parlay.american, dec: Math.round(pr.parlay.dec * 1000) / 1000 } : null,
    evPct: pr.ev == null ? null : Math.round(pr.ev * 1000) / 10,
    legs: pr.legs.map(({ m, prop, chance, book }) => ({
      player_id: m.player_id, name: m.player_name, team: m.team, opp: m.opponent, position: m.position, prop,
      chancePct: r1(chance), grade: m.grade ?? null, softD: m.def_tier === 'soft', hot: Boolean(m.hotHand),
      book: book ? { best: book.best, bestBook: book.bestBook, books: book.books } : null, edge: prop === 'td' ? m.edge ?? null : null,
    })),
  }
}

export const relText = (pr) =>
  pr.rel === 'diff' ? 'Different games — independent'
    : pr.rel === 'team' ? 'Teammates — no measurable link (they also compete for the same TDs)'
      : `Opponents, same game — ${pr.corr > 1 ? `+${Math.round((pr.corr - 1) * 100)}% (shootout link)` : 'no measurable link'}`

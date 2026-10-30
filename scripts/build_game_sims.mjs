// build_game_sims.mjs -- the Game Sim's 15,000 play-by-play simulations per game (2026-10-29, user: RotoBot-style "we simulated
// this game 15,000 times" with a full box score and QBs). Run from nfl_project after build_sim_teams.py / build_sim_players.py:
//   node six-points/scripts/build_game_sims.mjs
// For each game of the slate week: the play-by-play engine (src/sim/nflSim.js) runs 2,000 games on our own inputs, each offense is
// then scaled so its average lands halfway between that and the market's implied total (the Game Sim's 50/50 own / market blend,
// user 2026-10-12; own-only when no line is posted), and 15,000 games are run. Writes public/data/sims/<game_id>.json (averages,
// player box score, and the most typical game play by play for the replay) + sims/index.json. A game that has kicked off keeps
// its pre-kickoff file. Backtest (2024-25 held out): see nfl_project/claude/CLAUDE.md 2026-10-29.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { runMany, calibrateEff, winProb } from '../src/sim/nflSim.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.resolve(HERE, '../public/data')
const ROOT = path.resolve(HERE, '../..')
const OUTDIR = path.join(DATA, 'sims')
const N = 15000
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))

const L = read(path.join(ROOT, 'sim_league.json'))
const TP = read(path.join(ROOT, 'output', 'sim_teams.json'))
const SIM = read(path.join(DATA, 'game_sim_inputs.json'))
const SCHED = read(path.join(DATA, 'season_schedule.json'))
const DIR = read(path.join(DATA, 'players.json'))
fs.mkdirSync(OUTDIR, { recursive: true })

const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) % 1000000 }
// kickoff in ET -> UTC (EDT until 11/1/2026, EST after)
function kickoffUtc(g) {
  if (!g.gameday) return null
  const [y, m, d] = g.gameday.split('-').map(Number)
  const [hh, mm] = (g.gametime || '13:00').split(':').map(Number)
  const edt = new Date(Date.UTC(y, m - 1, d)) < new Date(Date.UTC(2026, 10, 1, 6))
  return Date.UTC(y, m - 1, d, hh + (edt ? 4 : 5), mm)
}

function lastNames(ids) {
  const out = {}
  const seen = {}
  for (const id of ids) {
    const full = DIR[id]?.name || id
    const parts = full.replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, '').split(' ')
    const last = parts.slice(1).join(' ') || full
    out[id] = { full, last, first: parts[0] }
    seen[last] = (seen[last] || 0) + 1
  }
  for (const id of ids) if (seen[out[id].last] > 1) out[id].last = `${out[id].first[0]}. ${out[id].last}`
  return out
}

function teamInput(team) {
  const tp = TP.teams[team] || { off: {}, def: {} }
  const rows = Object.entries(SIM.players).filter(([, p]) => p.team === team).map(([id, p]) => ({ id, ...p, pos: DIR[id]?.position || '' }))
  const names = lastNames(rows.map((r) => r.id))
  const qbRow = rows.filter((r) => r.pos === 'QB').sort((a, b) => (b.carries + b.targets) - (a.carries + a.targets))[0]
  const qb = qbRow ? { id: qbRow.id, name: names[qbRow.id].last, f: TP.qbs[qbRow.id] || { n: 0 } } : null
  let rushers = rows.filter((r) => r.carry_share > 0).map((r) => ({ id: r.id, name: names[r.id].last, pos: r.pos,
    w: r.carry_share * (r.pos === 'QB' ? 0.6 : 1), ypc: r.yards_per_carry || 4.3 }))
  let targets = rows.filter((r) => r.target_share > 0 && r.pos !== 'QB').map((r) => ({ id: r.id, name: names[r.id].last, pos: r.pos,
    w: r.target_share, catch: Math.max(0.3, Math.min(0.92, r.catch_rate || 0.65)), ypr: (r.yards_per_target || 7) / Math.max(0.3, r.catch_rate || 0.65) }))
  // player efficiency relative to the team's own mix, so the team factors keep the team's level
  const rw = rushers.reduce((a, x) => a + x.w, 0) || 1
  const mr = rushers.reduce((a, x) => a + x.w * x.ypc, 0) / rw || 4.3
  rushers = rushers.map((x) => ({ ...x, ypcF: Math.max(0.7, Math.min(1.35, x.ypc / mr)) }))
  const tw = targets.reduce((a, x) => a + x.w, 0) || 1
  const mc = targets.reduce((a, x) => a + x.w * x.catch, 0) / tw
  const my = targets.reduce((a, x) => a + x.w * x.ypr, 0) / tw
  const lg = (p) => Math.log(p / (1 - p))
  targets = targets.map((x) => ({ ...x, catchOff: lg(x.catch) - lg(mc), yprF: Math.max(0.6, Math.min(1.6, x.ypr / my)) }))
  if (!rushers.length) rushers = [{ id: `${team}-RB`, name: `${team} RB`, w: 1, ypcF: 1 }]
  if (!targets.length) targets = [{ id: `${team}-WR`, name: `${team} WR`, w: 1, catchOff: 0, yprF: 1 }]
  return {
    team, off: tp.off || {}, def: tp.def || {}, pace: tp.pace || 1, qb, rushers, targets,
    kicker: tp.kicker?.name ? tp.kicker.name.replace(/^[A-Z]\./, '').trim() : null, names, pos: Object.fromEntries(rows.map((r) => [r.id, r.pos])),
  }
}

const r1 = (v) => Math.round(v * 10) / 10
const r2 = (v) => Math.round(v * 100) / 100
const now = Date.now()
const week = SIM.week
const games = SCHED.games.filter((g) => g.week === week)
const index = []
for (const g of games) {
  const file = path.join(OUTDIR, `${g.game_id}.json`)
  const ko = kickoffUtc(g)
  if (ko && now >= ko) {
    if (fs.existsSync(file)) {
      const old = read(file)
      if (!old.frozen) { old.frozen = true; fs.writeFileSync(file, JSON.stringify(old)) }
      index.push(old.indexRow)
    }
    continue
  }
  const home = teamInput(g.home_team), away = teamInput(g.away_team)
  const th = SIM.teams[g.home_team] || {}, ta = SIM.teams[g.away_team] || {}
  const hasLine = th.implied_total != null && ta.implied_total != null
  const game = { home, away, spread: hasLine ? th.spread || 0 : 0, total: hasLine ? th.implied_total + ta.implied_total : null }
  const seed = hash(g.game_id)
  // own-model pass, then the 50/50 blend with the market
  const own = runMany(L, game, 2000, seed + 500000)
  let target = null
  if (hasLine) {
    target = { home: (own.home.mean + th.implied_total) / 2, away: (own.away.mean + ta.implied_total) / 2 }
    const e = calibrateEff(L, game, target)
    home.eff = e.home; away.eff = e.away
  }
  // the replay's win-probability line starts at the sims' own win % (the league WP model reads a spread; find the one that matches)
  const pre = runMany(L, game, 1500, seed + 700000)
  const wantHome = pre.homeWin + pre.tie / 2
  let lo = -30, hi = 30
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const a = winProb(L, { sd: 0, gameSec: 3600, spread: mid, yl: 75, down: 1, togo: 10, home: true })
    const b = 1 - winProb(L, { sd: 0, gameSec: 3600, spread: -mid, yl: 75, down: 1, togo: 10, home: false })
    if ((a + b) / 2 < wantHome) lo = mid; else hi = mid
  }
  game.wpSpread = (lo + hi) / 2
  const res = runMany(L, game, N, seed)
  const players = []
  for (const side of ['home', 'away']) {
    const T = side === 'home' ? home : away
    for (const [id, p] of Object.entries(res.players)) {
      if (!T.names[id]) continue
      players.push({ id, side, team: T.team, name: T.names[id].full, short: T.names[id].last, pos: T.pos[id] || '',
        pa: r1(p.pa), pc: r1(p.pc), py: r1(p.py), ptd: r2(p.ptd), pint: r2(p.pint), sk: r1(p.sk), ra: r1(p.ra), ry: r1(p.ry), rtd: r2(p.rtd),
        tg: r1(p.tg), rec: r1(p.rec), rcy: r1(p.rcy), rctd: r2(p.rctd), td_pct: r1(p.td_pct) })
    }
  }
  const t = res.typical
  const plays = t.log.map((e) => ({ q: e.q, c: e.clock, p: e.poss, d: e.down, tg: e.togo, yl: e.yl, sy: e.startYl, sd: e.startDown, st: e.startTogo,
    t: e.type, x: e.text, y: e.yards, w: e.who, td: e.td ? 1 : undefined, sc: e.scoring ? 1 : undefined, s: e.score, wp: Math.round(e.wpHome * 1000) / 1000,
    af: e.after?.kind, pr: e.pre ? [e.pre.p, e.pre.yl] : undefined, ey: e.endYl }))
  // the typical game's own box score (for the replay's end state)
  const indexRow = { game_id: g.game_id, home: g.home_team, away: g.away_team, homeWin: r2(res.homeWin + res.tie / 2),
    median: [res.home.median, res.away.median], typical: t.score }
  const out = {
    game_id: g.game_id, week, season: SIM.season, home: g.home_team, away: g.away_team, gameday: g.gameday, gametime: g.gametime,
    generated_at: new Date().toISOString(), n: N, frozen: false, indexRow,
    market: hasLine ? { spread: th.spread, total: r1(th.implied_total + ta.implied_total), home: th.implied_total, away: ta.implied_total } : null,
    own: { home: r1(own.home.mean), away: r1(own.away.mean) }, target: target && { home: r1(target.home), away: r1(target.away) },
    summary: { homeWin: r2(res.homeWin), tie: r2(res.tie), home: { mean: r1(res.home.mean), median: res.home.median, p10: res.home.p10, p90: res.home.p90 },
      away: { mean: r1(res.away.mean), median: res.away.median, p10: res.away.p10, p90: res.away.p90 }, medMargin: res.medMargin, medTotal: res.medTotal },
    team: { home: Object.fromEntries(Object.entries(res.home.team).map(([k, v]) => [k, r1(v)])), away: Object.fromEntries(Object.entries(res.away.team).map(([k, v]) => [k, r1(v)])) },
    kicker: { home: home.kicker, away: away.kicker }, qb: { home: home.qb?.id || null, away: away.qb?.id || null },
    players, typical: { index: res.typicalIndex, score: t.score, team: t.team, plays },
  }
  fs.writeFileSync(file, JSON.stringify(out))
  index.push(indexRow)
  console.log(`${g.away_team} @ ${g.home_team}: avg ${r1(res.away.mean)}-${r1(res.home.mean)} (own ${r1(own.away.mean)}-${r1(own.home.mean)}${hasLine ? `, market ${ta.implied_total}-${th.implied_total}` : ''}), ${g.home_team} wins ${Math.round(100 * res.homeWin)}%, typical ${t.score[1]}-${t.score[0]} (${plays.length} plays)`)
}
fs.writeFileSync(path.join(OUTDIR, 'index.json'), JSON.stringify({ week, season: SIM.season, generated_at: new Date().toISOString(), games: index }))
console.log(`sims: ${index.length} games, week ${week}`)

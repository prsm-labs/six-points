// Play-by-play NFL game simulator (Six Points Game Sim, 2026-10-29).
// Every snap is drawn from league tables fitted on 2022-26 nflverse play-by-play (sim_league.json: run / pass calls by
// down, distance, field position, score and clock; 4th-down go / FG / punt; field-goal make by distance; run, completion,
// sack and scramble yards by field zone; penalties; clock run-off; kickoffs, punts, interception returns), shifted by
// each team's own offense and the opponent's defense this season (sim_teams.json) and handed to players by their usage.
// Shared by the app's worker and the Node backtest -- no browser APIs here.

export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const sig = (x) => 1 / (1 + Math.exp(-x))
const logit = (p) => Math.log(Math.max(1e-4, Math.min(1 - 1e-4, p)) / (1 - Math.max(1e-4, Math.min(1 - 1e-4, p))))
const BUCKETS = [2, 5, 10, 20, 100]
const bucketOf = (yl) => { for (let i = 0; i < BUCKETS.length; i++) if (yl <= BUCKETS[i]) return i; return 4 }

// cumulative tables once per league object
function prepare(L) {
  if (L._prep) return L._prep
  const cum = (h) => { let s = 0; const c = h.p.map((p) => (s += p)); return { lo: h.lo, c } }
  const P = {
    run: L.run.map((r) => ({ ...r, cy: cum(r.yards) })),
    pass: L.pass.map((p) => ({ ...p, cc: cum(p.comp_yards), cs: cum(p.sack_yards), cr: cum(p.scr_yards) })),
    kick: cum(L.kick_start), pen: cum(L.penalty.delta), intRet: cum(L.int_return),
    punt: L.punt_net.map((h) => (h ? cum(h) : null)),
  }
  L._prep = P
  return P
}
function draw(c, r) {
  const u = r() * c.c[c.c.length - 1]
  let lo = 0, hi = c.c.length - 1
  while (lo < hi) { const m = (lo + hi) >> 1; if (c.c[m] < u) lo = m + 1; else hi = m }
  return lo + c.lo
}
function pick(list, r) {
  let tot = 0
  for (const x of list) tot += x.w
  let u = r() * tot
  for (const x of list) { u -= x.w; if (u <= 0) return x }
  return list[list.length - 1]
}
// scale only the positive part of a yardage draw (losses stay as drawn)
const scaleYds = (y, f) => (y > 0 ? Math.max(0, Math.round(y * f)) : y)

function callLogit(L, s) {
  const w = L.call.w
  const sd = Math.max(-28, Math.min(28, s.sd)) / 14
  const hs = s.halfSec / 1800, gs = s.gameSec / 3600
  const tg = Math.log(Math.max(1, Math.min(40, s.togo)))
  const two = hs < 0.067 ? 1 : 0
  return L.call.b0 + w.d2 * (s.down === 2) + w.d3 * (s.down === 3) + w.logtogo * tg + w.logtogo_d3 * tg * (s.down === 3) +
    w.yl * (s.yl / 100) + w.goalline * (s.yl <= 5) + w.sd * sd + w.sd_q4 * sd * (gs < 0.25) + w.two_min * two +
    w.sd_two_min * sd * two + w.leading_last5 * (gs < 0.083 && sd > 0)
}
function fourthProbs(L, s) {
  const F = L.fourth
  const tg = Math.log(Math.max(1, Math.min(40, s.togo)))
  const yl = s.yl / 100
  const sd = Math.max(-28, Math.min(28, s.sd)) / 14
  const x = [tg, yl, yl * yl, s.yl <= 40, s.yl <= 35, sd, sd * (s.gameSec / 3600 < 0.25), s.gameSec < 300 && s.sd < 0, s.gameSec / 3600]
  const z = F.b0.map((b, k) => b + F.W[k].reduce((a, w, i) => a + w * x[i], 0))
  const m = Math.max(...z)
  const e = z.map((v) => Math.exp(v - m))
  const t = e.reduce((a, b) => a + b, 0)
  return e.map((v) => v / t) // go, fg, punt
}
export function winProb(L, s) {
  // s: sd (posteam lead), gameSec, spread (posteam favored +), yl, down, togo, home (posteam is home)
  const W = L.wp
  const gs = s.gameSec / 3600
  const x = [s.sd / 10, s.sd / 10 / Math.sqrt(gs + 0.02), (s.spread / 10) * gs, ((100 - s.yl) / 100) * (1 - gs), s.down === 3, s.down === 4,
    Math.log(Math.max(1, Math.min(30, s.togo))), gs, s.home]
  return sig(W.b0 + W.w.reduce((a, w, i) => a + w * x[i], 0))
}
const fgProb = (L, dist) => (dist > 66 ? 0 : sig(L.fg.b0 + L.fg.w[0] * dist + L.fg.w[1] * dist * dist / 100))

// per-matchup combined factors for one offense vs one defense
function matchup(L, O, D) {
  const qf = O.qb?.f || {}
  const useQb = (qf.n || 0) >= 1
  return {
    passOe: (O.off.pass_oe || 0),
    ypc: (O.off.ypc || 1) * (D.def.ypc || 1) * (O.eff || 1) * (L.tune?.yds ?? 1),
    comp: (useQb ? qf.comp ?? O.off.comp : O.off.comp || 0) + (D.def.comp || 0) + (O.qbAdj || 0) + (L.tune?.comp ?? 0),
    ypcomp: (useQb ? qf.ypcomp ?? O.off.ypcomp : O.off.ypcomp || 1) * (D.def.ypcomp || 1) * (O.eff || 1) * (L.tune?.yds ?? 1),
    sack: (useQb ? qf.sack ?? O.off.sack : O.off.sack || 1) * (D.def.sack || 1),
    int: (useQb ? qf.int ?? O.off.int : O.off.int || 1) * (D.def.int || 1),
    scr: useQb ? qf.scr ?? 1 : 1,
    pace: O.pace || 1,
  }
}

function blankLine() {
  return { pa: 0, pc: 0, py: 0, ptd: 0, pint: 0, sk: 0, ra: 0, ry: 0, rtd: 0, tg: 0, rec: 0, rcy: 0, rctd: 0, fum: 0 }
}

/**
 * game: { home: TeamIn, away: TeamIn, spread (home favored +, optional), log (bool) }
 * TeamIn: { team, off, def, pace, eff, qb: {id, name, f}, rushers: [{id, w, ypcF}], targets: [{id, w, catchOff, yprF}] }
 */
export function simulateGame(L, game, r, wantLog = false) {
  const P = prepare(L)
  const T = [game.home, game.away]
  const M = [matchup(L, T[0], T[1]), matchup(L, T[1], T[0])]
  const score = [0, 0]
  const stats = {}
  const team = [{ plays: 0, yds: 0, pyds: 0, ryds: 0, to: 0, fgm: 0, fga: 0, xpm: 0, xpa: 0, punts: 0, sacks: 0, td: 0, fd: 0, poss: 0, top: 0 },
    { plays: 0, yds: 0, pyds: 0, ryds: 0, to: 0, fgm: 0, fga: 0, xpm: 0, xpa: 0, punts: 0, sacks: 0, td: 0, fd: 0, poss: 0, top: 0 }]
  const log = wantLog ? [] : null
  let pre = null // state before the event being logged (possession, yards to the opponent's goal), for the replay's ball flight
  const line = (id) => stats[id] || (stats[id] = blankLine())
  // win-probability line: the pre-game edge comes from wpSpread (set so kickoff matches the sims' own win %), else the market spread
  const spread = game.wpSpread ?? game.spread ?? 0

  let qtr = 1, clock = 900
  let poss = r() < 0.5 ? 0 : 1
  const firstRecv = poss
  let yl = 75, down = 1, togo = 10
  let otPoss = null
  let over = false

  const gameSec = () => (qtr <= 4 ? (4 - qtr) * 900 + clock : clock)
  const halfSec = () => (qtr === 1 || qtr === 3 ? 900 + clock : clock)
  const push = (o) => {
    if (!log) return
    const s = { sd: score[poss] - score[1 - poss], gameSec: Math.max(0, gameSec()), spread: poss === 0 ? spread : -spread, yl, down, togo, home: poss === 0 }
    const wpPoss = qtr > 4 ? 0.5 + (score[poss] - score[1 - poss]) * 0.45 : winProb(L, s)
    log.push({ q: qtr, clock: Math.max(0, Math.round(clock)), poss, down, togo, yl, score: [score[0], score[1]],
      wpHome: Math.max(0.001, Math.min(0.999, poss === 0 ? wpPoss : 1 - wpPoss)), pre, ...o })
  }

  function newPossession(p, startYl) {
    poss = p
    yl = Math.max(1, Math.min(99, startYl))
    down = 1
    togo = Math.min(10, yl)
    team[p].poss++
    if (otPoss) otPoss[p]++
  }
  function kickoff(kicking) {
    const recv = 1 - kicking
    pre = { p: kicking, yl: 65 }
    if (r() < L.kick_return_td) {
      poss = recv
      yl = 0
      push({ type: 'kickoff', text: `${T[kicking].team} kicks off -- returned for a TOUCHDOWN by ${T[recv].team}`, yards: 0, endYl: 0, td: true })
      score[recv] += 6
      team[recv].td++
      afterTd(recv, true)
      return
    }
    const st = draw(P.kick, r)
    newPossession(recv, st)
    push({ type: 'kickoff', text: `${T[kicking].team} kicks off, ${T[recv].team} starts at its own ${100 - st}`, yards: 0 })
  }
  function afterTd(p, viaReturn = false) {
    // PAT or 2-pt; trailing by 2 / 5 / 9 / 12 late -> go for 2
    const diff = score[p] - score[1 - p]
    const late = gameSec() < 900
    const go2 = (late && [-2, -5, -9, -12, 1, -10].includes(diff)) || r() < L.two_pt_rate * 0.6
    pre = { p, yl: go2 ? 2 : 15 }
    if (go2) {
      const ok = r() < L.two_pt_success
      if (ok) score[p] += 2
      push({ type: 'two_pt', text: `${T[p].team} two-point try ${ok ? 'GOOD' : 'no good'}`, yards: 0, scoring: ok, endYl: ok ? 0 : 1 })
    } else {
      team[p].xpa++
      const ok = r() < L.xp_make
      if (ok) { score[p] += 1; team[p].xpm++ }
      push({ type: 'xp', text: `${T[p].kicker || T[p].team} extra point is ${ok ? 'good' : 'NO GOOD'}`, yards: 0, scoring: ok, endYl: -8 })
    }
    if (checkOtEnd()) return
    kickoff(p)
  }
  function checkOtEnd() {
    if (qtr <= 4 || !otPoss) return false
    if (otPoss[0] >= 1 && otPoss[1] >= 1 && score[0] !== score[1]) { over = true; return true }
    return false
  }
  function turnover(newPoss, newYl, text, kind) {
    if (kind !== 'downs') team[poss].to++
    const old = poss
    newPossession(newPoss, newYl)
    if (log) log[log.length - 1].after = { poss, yl, kind }
    return old
  }
  function advanceClock(sec) {
    clock -= sec
    team[poss].top += sec
  }
  function endQuarterIfNeeded() {
    if (clock > 0) return
    if (qtr === 2) {
      // halftime: the team that kicked first receives
      qtr = 3; clock = 900
      push({ type: 'period', text: 'Halftime', yards: 0 })
      kickoff(firstRecv)
    } else if (qtr === 4 || qtr === 5) {
      if (qtr === 4 && score[0] === score[1]) {
        qtr = 5; clock = 600
        otPoss = [0, 0]
        push({ type: 'period', text: 'End of regulation -- overtime', yards: 0 })
        kickoff(r() < 0.5 ? 0 : 1)
      } else {
        over = true
      }
    } else {
      qtr++; clock = 900
      push({ type: 'period', text: `End of Q${qtr - 1}`, yards: 0 })
    }
  }

  kickoff(1 - poss)
  let guard = 0
  while (!over && guard++ < 700) {
    if (clock <= 0) { endQuarterIfNeeded(); continue }
    pre = { p: poss, yl }
    const O = T[poss], m = M[poss]
    const sd = score[poss] - score[1 - poss]
    const gs = gameSec(), hs = halfSec()
    const hurry = hs < 120 && sd <= 0
    const clk = (k) => (hurry ? (L.clock_hurry[k] || 8) : (L.clock[k] || 30) * m.pace)
    // victory formation
    if (qtr >= 4 && sd > 0 && gs <= 42 * (4 - down) && qtr === 4) {
      advanceClock(Math.min(clock, 42))
      push({ type: 'kneel', text: `${O.qb?.name || O.team} kneels`, yards: -1 })
      yl = Math.min(99, yl + 1); down++
      if (down > 4) { turnover(1 - poss, 100 - yl, '', 'downs'); }
      continue
    }
    // end-of-half / end-of-game field goal
    const dist = yl + 17
    if ((hs <= 8 || (qtr === 4 && gs <= 8 && sd >= -3 && sd <= 0)) && dist <= 60 && !(qtr === 4 && sd > 0)) {
      fieldGoal(dist)
      advanceClock(clock)
      continue
    }
    if (down === 4) {
      let [pGo, pFg, pPunt] = fourthProbs(L, { togo, yl, sd, gameSec: gs })
      if (dist > 63) pFg = 0
      pFg *= L.tune?.fg ?? 1
      pGo *= L.tune?.go ?? 1
      if (qtr >= 4 && gs < 240 && sd < -3) { pGo += pPunt + (sd < -3 ? pFg : 0); pPunt = 0; if (sd < -3) pFg = 0 }
      const t = pGo + pFg + pPunt
      const u = r() * t
      if (u < pFg) { fieldGoal(dist); advanceClock(L.clock.field_goal || 5); endQuarterIfNeeded(); continue }
      if (u < pFg + pPunt) { punt(); advanceClock(L.clock.punt || 9); endQuarterIfNeeded(); continue }
    }
    // penalty on the snap
    if (r() < L.penalty.rate) {
      const dl = draw(P.pen, r)
      if (dl !== 0) {
        const before = yl
        yl = Math.max(1, Math.min(99, yl - dl))
        const gained = before - yl
        if (gained > 0 && (gained >= togo || r() < L.penalty.first_down_if_gain)) { down = 1; togo = Math.min(10, yl) } else togo = Math.max(1, togo - gained)
        push({ type: 'penalty', text: gained > 0 ? `Penalty on ${T[1 - poss].team}, ${gained} yards -- ${O.team} ball` : `Penalty on ${O.team}, ${-gained} yards back`, yards: gained })
        advanceClock(L.clock.no_play ? Math.min(15, L.clock.no_play * 0.5) : 6)
        endQuarterIfNeeded()
        continue
      }
    }
    team[poss].plays++
    const b = bucketOf(yl)
    const rzF = yl <= 20 ? (L.tune?.rz ?? 1) : 1
    const st = { down: Math.min(down, 3), togo, yl, sd, halfSec: hs, gameSec: gs }
    const passP = down === 4 ? (togo >= 4 ? 0.8 : 0.45) : sig(callLogit(L, st) + m.passOe)
    const startYl = yl, startDown = down, startTogo = togo
    let gained = 0, kind = '', text = '', who = {}
    let td = false, lost = false
    if (r() < passP) {
      const pt = P.pass[b]
      const qb = O.qb || { id: O.team + '-QB', name: O.team + ' QB' }
      const ql = line(qb.id)
      const pSack = Math.min(0.25, pt.sack * m.sack)
      const pScr = Math.min(0.2, pt.scramble * m.scr)
      const u = r()
      if (u < pSack) {
        gained = draw(pt.cs, r)
        kind = 'sack'
        ql.sk++
        team[1 - poss].sacks++
        if (r() < pt.sack_fumble) { lost = true; ql.fum++ }
        text = `${qb.name} sacked for ${gained}${lost ? ', FUMBLE lost' : ''}`
        who = { qb: qb.id }
      } else if (u < pSack + pScr) {
        gained = scaleYds(draw(pt.cr, r), m.ypc)
        kind = 'scramble'
        ql.ra++
        text = `${qb.name} scrambles for ${gained}`
        who = { carrier: qb.id, qb: qb.id }
      } else {
        const tg = pick(O.targets, r)
        const tl = line(tg.id)
        ql.pa++
        tl.tg++
        who = { qb: qb.id, target: tg.id }
        if (r() < Math.min(0.08, pt.int * m.int)) {
          kind = 'int'
          ql.pint++
          const air = Math.max(1, Math.min(yl - 1, 8 + Math.round(r() * 14)))
          const spot = yl - air
          let ret = draw(P.intRet, r)
          const defYl0 = 100 - spot
          if (r() < L.int_td) {
            advanceClock(clk('int'))
            team[poss].to++
            poss = 1 - poss
            yl = 0
            push({ type: 'int', text: `${qb.name} INTERCEPTED intended for ${tg.name} -- returned for a TOUCHDOWN`, yards: 0, who, td: true, endYl: 0 })
            score[poss] += 6
            team[poss].td++
            afterTd(poss)
            endQuarterIfNeeded()
            continue
          }
          const defYl = Math.max(1, Math.min(99, defYl0 - ret))
          push({ type: 'int', text: `${qb.name} INTERCEPTED intended for ${tg.name}`, yards: 0, who, endYl: spot })
          advanceClock(clk('int'))
          turnover(1 - poss, defYl, '', 'int')
          endQuarterIfNeeded()
          continue
        }
        const pc = sig(logit(pt.comp) + m.comp + (tg.catchOff || 0) + (yl <= 20 ? (L.tune?.rzComp ?? 0) : 0))
        if (r() < pc) {
          gained = scaleYds(draw(pt.cc, r), m.ypcomp * (tg.yprF || 1) * rzF)
          kind = 'complete'
          ql.pc++
          tl.rec++
          if (r() < pt.fumble_after_catch) { lost = true; tl.fum++ }
          text = `${qb.name} to ${tg.name} for ${gained}`
        } else {
          kind = 'incomplete'
          text = `${qb.name} incomplete to ${tg.name}`
        }
      }
    } else {
      const rt = P.run[b]
      const ru = pick(O.rushers, r)
      const rl = line(ru.id)
      gained = scaleYds(draw(rt.cy, r), m.ypc * (ru.ypcF || 1) * rzF)
      kind = 'run'
      rl.ra++
      if (r() < rt.fumble) { lost = true; rl.fum++ }
      text = `${ru.name} runs for ${gained}`
      who = { carrier: ru.id }
    }
    if (gained >= yl) { gained = yl; td = true }
    // credit yards
    const qid = O.qb?.id || O.team + '-QB'
    if (kind === 'complete') { line(qid).py += gained; line(who.target).rcy += gained; team[poss].pyds += gained }
    if (kind === 'sack') { line(qid).py += 0; team[poss].pyds += gained }
    if (kind === 'run' || kind === 'scramble') { line(who.carrier).ry += gained; team[poss].ryds += gained }
    team[poss].yds += gained
    yl -= gained
    advanceClock(Math.min(clock, clk(kind)))
    if (td) {
      text = text.replace(/for \d+$/, `for ${gained}`) + ' -- TOUCHDOWN'
      if (kind === 'complete') { line(qid).ptd++; line(who.target).rctd++ }
      if (kind === 'run' || kind === 'scramble') line(who.carrier).rtd++
      score[poss] += 6
      team[poss].td++
      push({ type: kind, text, yards: gained, who, td: true, startYl, startDown, startTogo })
      afterTd(poss)
      endQuarterIfNeeded()
      continue
    }
    if (yl >= 100) {
      // safety
      score[1 - poss] += 2
      push({ type: kind, text: text + ' -- SAFETY', yards: gained, who, startYl, startDown, startTogo })
      newPossession(1 - poss, draw(P.kick, r) - 10)
      endQuarterIfNeeded()
      continue
    }
    if (lost) {
      push({ type: kind, text: text + (text.includes('FUMBLE') ? '' : ', FUMBLE lost'), yards: gained, who, startYl, startDown, startTogo })
      turnover(1 - poss, 100 - yl, '', 'fumble')
      endQuarterIfNeeded()
      continue
    }
    if (gained >= togo) { down = 1; togo = Math.min(10, yl); team[poss].fd++ } else { down++; togo -= gained }
    push({ type: kind, text, yards: gained, who, startYl, startDown, startTogo })
    if (down > 4) {
      push({ type: 'downs', text: `Turnover on downs`, yards: 0 })
      turnover(1 - poss, 100 - yl, '', 'downs')
    }
    endQuarterIfNeeded()
  }

  function fieldGoal(dist) {
    const O = T[poss]
    team[poss].fga++
    const ok = r() < fgProb(L, dist)
    if (ok) {
      score[poss] += 3
      team[poss].fgm++
      push({ type: 'fg', text: `${O.kicker || O.team + ' kicker'} ${dist}-yd field goal is GOOD`, yards: 0, scoring: true, dist, endYl: -8 })
      if (checkOtEnd()) return
      kickoff(poss)
    } else {
      push({ type: 'fg', text: `${O.kicker || O.team + ' kicker'} ${dist}-yd field goal is NO GOOD`, yards: 0, dist, endYl: -8 })
      newPossession(1 - poss, Math.min(80, 100 - (yl + 7)))
    }
  }
  function punt() {
    const O = T[poss]
    team[poss].punts++
    const c = P.punt[Math.min(9, Math.floor(yl / 10))] || P.punt.find(Boolean)
    if (r() < L.punt_return_td) {
      poss = 1 - poss
      yl = 0
      push({ type: 'punt', text: `${O.team} punts -- returned for a TOUCHDOWN`, yards: 0, endYl: 0, td: true })
      score[poss] += 6
      team[poss].td++
      afterTd(poss)
      return
    }
    const net = draw(c, r)
    let spot = yl - net
    const start = spot <= 0 ? 80 : 100 - spot
    push({ type: 'punt', text: `${O.team} punts, ${T[1 - poss].team} starts at its own ${100 - start}`, yards: 0, endYl: spot <= 0 ? 20 : spot })
    newPossession(1 - poss, start)
  }

  return { score, stats, team, log }
}

// ---------- many sims + the "most typical" game -----------------------------------------------------------------------
export function runMany(L, game, n = 10000, seed0 = 1) {
  const homeIds = new Set(), awayIds = new Set()
  for (const x of [...game.home.rushers, ...game.home.targets]) homeIds.add(x.id)
  for (const x of [...game.away.rushers, ...game.away.targets]) awayIds.add(x.id)
  if (game.home.qb) homeIds.add(game.home.qb.id)
  if (game.away.qb) awayIds.add(game.away.qb.id)
  const ids = [...homeIds, ...awayIds]
  const KEYS = ['pa', 'pc', 'py', 'ptd', 'pint', 'sk', 'ra', 'ry', 'rtd', 'tg', 'rec', 'rcy', 'rctd']
  const sums = Object.fromEntries(ids.map((id) => [id, Object.fromEntries(KEYS.map((k) => [k, 0]))]))
  const tdAny = Object.fromEntries(ids.map((id) => [id, 0]))
  const H = new Float32Array(n), A = new Float32Array(n)
  const keyStat = [] // per sim: [qbYdsH, qbYdsA]
  const tsum = [{}, {}]
  for (let i = 0; i < n; i++) {
    const g = simulateGame(L, game, rng(seed0 + i), false)
    H[i] = g.score[0]; A[i] = g.score[1]
    for (const id of ids) {
      const s = g.stats[id]
      if (!s) continue
      const o = sums[id]
      for (const k of KEYS) o[k] += s[k]
      if (s.rtd + s.rctd > 0) tdAny[id]++
    }
    keyStat.push([g.stats[game.home.qb?.id]?.py || 0, g.stats[game.away.qb?.id]?.py || 0])
    for (let t = 0; t < 2; t++) for (const [k, v] of Object.entries(g.team[t])) tsum[t][k] = (tsum[t][k] || 0) + v
  }
  const med = (arr) => { const s = Array.from(arr).sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
  let homeWins = 0, ties = 0
  for (let i = 0; i < n; i++) { if (H[i] > A[i]) homeWins++; else if (H[i] === A[i]) ties++ }
  const medH = med(H), medA = med(A)
  const margins = Array.from(H, (h, i) => h - A[i]), totals = Array.from(H, (h, i) => h + A[i])
  const medMargin = med(margins), medTotal = med(totals)
  const sd = (arr, m) => Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length)
  const qbH = keyStat.map((k) => k[0]), qbA = keyStat.map((k) => k[1])
  const mqH = mean(qbH), mqA = mean(qbA), sqH = sd(qbH, mqH) || 1, sqA = sd(qbA, mqA) || 1
  // typical game: the winner most sims pick, on the side of the line / total most sims land, closest to the median score
  const favHome = homeWins >= n - homeWins - ties
  const lineSide = (i) => (game.spread == null ? 0 : Math.sign(H[i] - A[i] - game.spread))
  const totSide = (i) => (game.total == null ? 0 : Math.sign(H[i] + A[i] - game.total))
  const mode = (f) => { const c = {}; for (let i = 0; i < n; i++) { const v = f(i); c[v] = (c[v] || 0) + 1 } return +Object.entries(c).sort((a, b) => b[1] - a[1])[0][0] }
  const ls = mode(lineSide), ts = mode(totSide)
  let best = -1, bestD = Infinity
  for (let i = 0; i < n; i++) {
    if ((H[i] > A[i]) !== favHome || H[i] === A[i]) continue
    if (lineSide(i) !== ls || totSide(i) !== ts) continue
    const d = Math.abs(H[i] - medH) / 7 + Math.abs(A[i] - medA) / 7 + Math.abs(qbH[i] - mqH) / sqH * 0.5 + Math.abs(qbA[i] - mqA) / sqA * 0.5
    if (d < bestD) { bestD = d; best = i }
  }
  if (best < 0) best = 0
  const typical = simulateGame(L, game, rng(seed0 + best), true)
  const players = {}
  for (const id of ids) {
    const o = sums[id]
    players[id] = Object.fromEntries(KEYS.map((k) => [k, o[k] / n]))
    players[id].td_pct = (100 * tdAny[id]) / n
  }
  const pct = (arr, q) => { const s = Array.from(arr).sort((a, b) => a - b); return s[Math.floor(q * (s.length - 1))] }
  return {
    n, homeWin: homeWins / n, tie: ties / n,
    home: { mean: mean(H), median: medH, p10: pct(H, 0.1), p90: pct(H, 0.9), team: Object.fromEntries(Object.entries(tsum[0]).map(([k, v]) => [k, v / n])) },
    away: { mean: mean(A), median: medA, p10: pct(A, 0.1), p90: pct(A, 0.9), team: Object.fromEntries(Object.entries(tsum[1]).map(([k, v]) => [k, v / n])) },
    medMargin, medTotal, players, typicalIndex: best, typical,
  }
}

// Scale each offense's efficiency so its average points land on a target (the app's 50/50 own-sim / market blend).
// Three short passes; returns the multipliers to put on game.home.eff / game.away.eff.
export function calibrateEff(L, game, target, n = 500) {
  let eh = game.home.eff || 1, ea = game.away.eff || 1
  for (let it = 0; it < 3; it++) {
    const G = { ...game, home: { ...game.home, eff: eh }, away: { ...game.away, eff: ea } }
    let sh = 0, sa = 0
    for (let i = 0; i < n; i++) { const g = simulateGame(L, G, rng(900000 + it * n + i), false); sh += g.score[0]; sa += g.score[1] }
    sh /= n; sa /= n
    if (target.home != null && sh > 0) eh *= Math.pow(target.home / sh, 0.55)
    if (target.away != null && sa > 0) ea *= Math.pow(target.away / sa, 0.55)
  }
  return { home: eh, away: ea }
}

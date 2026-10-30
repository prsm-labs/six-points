import { useCallback, useMemo } from 'react'
import SimShell from './SimShell.jsx'

// 🏈 The Game Sim's replay (2026-10-29): the most typical of the 10,000 simulated games (public/data/sims/<game>.json, built by
// scripts/build_game_sims.mjs), drawn play by play on a tilted field like RotoBot's. Away team attacks right (same as the
// Game Tracker), the blue line is the line of scrimmage and the gold one the first-down marker; the 22 dots are a stock
// formation (not real alignments) -- the ball, the ball carrier and the yards are the sim's.

export const NFL_TEAMS = {
  ARI: ['Cardinals', '#97233F'], ATL: ['Falcons', '#A71930'], BAL: ['Ravens', '#5B3FA8'], BUF: ['Bills', '#00338D'],
  CAR: ['Panthers', '#0085CA'], CHI: ['Bears', '#C83803'], CIN: ['Bengals', '#FB4F14'], CLE: ['Browns', '#FF3C00'],
  DAL: ['Cowboys', '#4F7DC9'], DEN: ['Broncos', '#FB4F14'], DET: ['Lions', '#0076B6'], GB: ['Packers', '#FFB612'],
  HOU: ['Texans', '#C8102E'], IND: ['Colts', '#2B6CC4'], JAX: ['Jaguars', '#00A0B0'], KC: ['Chiefs', '#E31837'],
  LV: ['Raiders', '#A5ACAF'], LAC: ['Chargers', '#0080C6'], LA: ['Rams', '#FFA300'], MIA: ['Dolphins', '#008E97'],
  MIN: ['Vikings', '#7B4FC9'], NE: ['Patriots', '#C60C30'], NO: ['Saints', '#D3BC8D'], NYG: ['Giants', '#2F5BD3'],
  NYJ: ['Jets', '#1E8C5A'], PHI: ['Eagles', '#1C8C93'], PIT: ['Steelers', '#FFB612'], SF: ['49ers', '#AA0000'],
  SEA: ['Seahawks', '#69BE28'], TB: ['Buccaneers', '#D50A0A'], TEN: ['Titans', '#4B92DB'], WAS: ['Commanders', '#B8323C'],
}
const LOGO = (t) => `https://a.espncdn.com/i/teamlogos/nfl/500/${String(t === 'LA' ? 'lar' : t || '').toLowerCase()}.png`

// absolute field position 0..100 from the left goal line: away (poss 1) attacks right, home (poss 0) attacks left
const ABS = (poss, yl) => (poss === 1 ? 100 - yl : yl)
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const QL = (q) => (q > 4 ? 'OT' : `Q${q}`)
const clockTxt = (q, c) => `${QL(q)} ${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`
const ORD = ['', '1ST', '2ND', '3RD', '4TH']
const SCRIM = new Set(['run', 'complete', 'incomplete', 'sack', 'scramble', 'int', 'kneel'])

function spotText(teams, poss, yl) {
  if (yl === 50) return '50'
  const own = yl > 50
  const team = own ? (poss === 0 ? teams.home : teams.away) : (poss === 0 ? teams.away : teams.home)
  return `${team} ${own ? 100 - yl : yl}`
}

// stock formation, relative to the line of scrimmage: [yards behind (+ = offense backfield), lateral 0..53.3]
const OFF = [[1, 22.6], [1, 24.6], [1, 26.65], [1, 28.7], [1, 30.7], [1.2, 32.6], [5, 26.65], [6.5, 24.2], [1.2, 6], [1.2, 47], [1.5, 40]]
const DEF = [[-1, 23.5], [-1, 25.8], [-1, 27.6], [-1, 29.9], [-5, 21], [-5, 26.6], [-5, 32], [-7, 7], [-7, 46], [-13, 18], [-13, 35]]
const QB_I = 6, RB_I = 7, WR_I = 8, TE_I = 5

export function buildNflFrames(sim) {
  const plays = sim.typical.plays
  const total = plays.some((p) => p.q > 4) ? 4200 : 3600
  const elapsed = (q, c) => (q <= 4 ? (q - 1) * 900 + (900 - c) : 3600 + (600 - c))
  const teams = { home: sim.home, away: sim.away }
  let prevEnd = null
  return plays.map((p, i) => {
    const pre = p.pr || [p.p, p.sy ?? p.yl]
    let x0 = ABS(pre[0], pre[1])
    let x1 = ABS(p.p, p.ey ?? p.yl)
    if (p.t === 'period' || p.t === 'downs') { x0 = x1 = prevEnd ?? x1 }
    if (p.t === 'kickoff') x1 = ABS(p.p, p.ey ?? p.yl)
    prevEnd = p.t === 'xp' || p.t === 'two_pt' || (p.t === 'fg' && p.sc) ? null : x1
    const scrim = SCRIM.has(p.t)
    const chip = scrim && p.sd ? `${ORD[Math.min(4, p.sd)]} & ${p.sy <= p.st ? 'GOAL' : p.st} · ${spotText(teams, p.p, p.sy)}`
      : p.t === 'kickoff' ? 'KICKOFF' : p.t === 'punt' ? 'PUNT' : p.t === 'fg' ? 'FIELD GOAL' : p.t === 'xp' ? 'EXTRA POINT'
        : p.t === 'two_pt' ? '2-PT TRY' : p.t === 'penalty' ? 'FLAG' : p.t === 'period' ? 'END OF PERIOD' : p.t === 'downs' ? 'TURNOVER ON DOWNS' : ''
    const dur = p.t === 'period' || p.t === 'downs' ? 700 : p.t === 'penalty' ? 900 : p.t === 'kickoff' || p.t === 'punt' ? 1700
      : p.t === 'fg' || p.t === 'xp' || p.t === 'two_pt' ? 1200 : 1500
    return {
      i, play: p, x0, x1, poss: p.p === 0 ? 'home' : 'away', score: p.s, wp: p.wp, clock: clockTxt(p.q, p.c), chip,
      text: p.x, dur, scoring: !!(p.td || p.sc), t: elapsed(p.q, p.c) / total, period: p.q,
    }
  })
}

function Field({ idx, t, frames, teams, names }) {
  const f = frames[idx]
  if (!f) return null
  const p = f.play
  const H = 53.3
  const X = (pos) => 10 + pos
  const dir = p.p === 1 ? 1 : -1 // offense attack direction on screen
  const offColor = p.p === 0 ? teams.home.color : teams.away.color
  const defColor = p.p === 0 ? teams.away.color : teams.home.color
  const e = ease(Math.max(0, Math.min(1, (t - 0.18) / 0.82)))
  const scrim = SCRIM.has(p.t) || p.t === 'penalty' || p.t === 'two_pt'
  const los = f.x0
  let ball = { x: f.x0 + (f.x1 - f.x0) * e, y: H / 2, h: 0 }
  let carrier = null
  let label = null
  // who moves
  const off = OFF.map(([b, y]) => ({ x: los - dir * b, y }))
  const de = DEF.map(([b, y]) => ({ x: los - dir * b, y }))
  if (scrim) {
    if (p.t === 'complete' || p.t === 'incomplete' || p.t === 'int') {
      const air = p.t === 'complete' ? Math.min(Math.abs(f.x1 - f.x0), 9 + (f.i % 6)) * Math.sign(f.x1 - f.x0 || dir) : dir * 12
      const catchX = los + air
      const catchY = p.t === 'incomplete' ? 12 + (f.i * 7) % 30 : 10 + (f.i * 11) % 34
      const qbX = los - dir * 6
      if (t < 0.45) {
        const k = ease(Math.max(0, (t - 0.18) / 0.27))
        ball = { x: los + (qbX - los) * k, y: H / 2, h: 0 }
        off[QB_I] = { x: los - dir * (5 + k), y: 26.65 }
      } else {
        const k = Math.min(1, (t - 0.45) / 0.3)
        ball = { x: qbX + (catchX - qbX) * k, y: H / 2 + (catchY - H / 2) * k, h: Math.sin(Math.PI * k) * 6 }
        off[QB_I] = { x: qbX, y: 26.65 }
        if (p.t === 'complete' && t > 0.75) {
          const k2 = ease((t - 0.75) / 0.25)
          ball = { x: catchX + (f.x1 - catchX) * k2, y: catchY + (H / 2 - catchY) * k2 * 0.5, h: 0 }
        }
      }
      const tx = t < 0.45 ? los + dir * 3 + (catchX - los - dir * 3) * ease(t / 0.45) : (p.t === 'complete' && t > 0.75 ? ball.x : catchX)
      const ty = t < 0.45 ? 6 + (catchY - 6) * ease(t / 0.45) : (p.t === 'complete' && t > 0.75 ? ball.y : catchY)
      off[WR_I] = { x: tx, y: ty }
      carrier = p.t === 'complete' ? off[WR_I] : null
      label = p.w?.target ? { ...off[WR_I], id: p.w.target } : null
      if (p.t === 'int') { de[9] = { x: catchX + dir * 1.5, y: catchY + 1 }; label = { ...de[9], text: 'INT' } }
    } else if (p.t === 'sack') {
      off[QB_I] = { x: ball.x, y: H / 2 }
      carrier = off[QB_I]
      label = p.w?.qb ? { ...off[QB_I], id: p.w.qb } : null
      de[1] = { x: ball.x + dir * 1.2 * (1 - e) + dir * 0.8, y: H / 2 - 1 }
      de[2] = { x: ball.x + dir * 1, y: H / 2 + 1.2 }
    } else if (p.t === 'run' || p.t === 'scramble' || p.t === 'kneel') {
      const who = p.t === 'run' ? RB_I : QB_I
      const start = off[who]
      const k = e
      off[who] = { x: start.x + (f.x1 - start.x) * k, y: start.y + (H / 2 + ((f.i * 5) % 14) - 7 - start.y) * Math.sin(Math.PI * k) * 0.6 + (H / 2 - start.y) * k * 0.4 }
      ball = { x: off[who].x, y: off[who].y, h: 0 }
      carrier = off[who]
      label = p.w?.carrier ? { ...off[who], id: p.w.carrier } : null
    }
    // everyone drifts toward the ball as the play develops
    const pull = (pt, s) => ({ x: pt.x + (ball.x - pt.x) * s * e, y: pt.y + (ball.y - pt.y) * s * e })
    for (let k = 0; k < de.length; k++) if (!(p.t === 'int' && k === 9) && !(p.t === 'sack' && (k === 1 || k === 2))) de[k] = pull(de[k], k < 4 ? 0.35 : 0.55)
    for (let k = 0; k < off.length; k++) if (off[k] !== carrier && k !== QB_I && k !== WR_I) off[k] = { x: off[k].x + dir * 2 * e, y: off[k].y }
  } else {
    // kicks: the ball sails from the start spot to the end spot
    const k = ease(Math.max(0, Math.min(1, t / 0.9)))
    const endX = p.t === 'fg' || p.t === 'xp' ? (dir > 0 ? 112 : -12) : f.x1
    ball = { x: f.x0 + (endX - f.x0) * k, y: H / 2, h: Math.sin(Math.PI * k) * (p.t === 'fg' || p.t === 'xp' ? 8 : 12) }
  }
  const first = scrim && p.sd && p.sy > p.st ? f.x0 + dir * p.st : null
  const showDots = scrim && p.t !== 'penalty'
  return (
    <div className="nfs-wrap">
      <svg viewBox="-2 -6 124 64" className="nfs-field" role="img" aria-label="Simulated play">
        <defs>
          <linearGradient id="nfsTurf" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#2e4a3f" /><stop offset="1" stopColor="#24392f" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={120} height={H} fill="url(#nfsTurf)" />
        {[...Array(10)].map((_, i) => <rect key={i} x={X(i * 10)} y={0} width={5} height={H} fill="rgba(255,255,255,.025)" />)}
        <rect x={0} y={0} width={10} height={H} fill={teams.away.color} opacity=".55" />
        <rect x={110} y={0} width={10} height={H} fill={teams.home.color} opacity=".55" />
        <text x={5} y={H / 2} textAnchor="middle" dominantBaseline="middle" fontSize="4.6" fontWeight="900" fill="rgba(255,255,255,.75)" transform={`rotate(-90 5 ${H / 2})`}>{teams.away.abbr}</text>
        <text x={115} y={H / 2} textAnchor="middle" dominantBaseline="middle" fontSize="4.6" fontWeight="900" fill="rgba(255,255,255,.75)" transform={`rotate(90 115 ${H / 2})`}>{teams.home.abbr}</text>
        {[...Array(21)].map((_, i) => <line key={i} x1={X(i * 5)} x2={X(i * 5)} y1={0} y2={H} stroke="rgba(255,255,255,.55)" strokeWidth={i % 2 ? 0.12 : 0.3} />)}
        {[...Array(99)].map((_, i) => ((i + 1) % 5 ? <g key={i}><line x1={X(i + 1)} x2={X(i + 1)} y1={22.4} y2={23.2} stroke="rgba(255,255,255,.4)" strokeWidth=".12" /><line x1={X(i + 1)} x2={X(i + 1)} y1={30.1} y2={30.9} stroke="rgba(255,255,255,.4)" strokeWidth=".12" /></g> : null))}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => (
          <text key={v} x={X(v)} y={H - 4} textAnchor="middle" fontSize="3.4" fontWeight="800" fill="rgba(255,255,255,.55)">{v <= 50 ? v : 100 - v}</text>
        ))}
        <ellipse cx={60} cy={H / 2} rx={22} ry={11} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth=".4" />
        {/* goalposts */}
        <line x1={0} x2={0} y1={H / 2 - 3} y2={H / 2 + 3} stroke="#f4c542" strokeWidth=".7" />
        <line x1={120} x2={120} y1={H / 2 - 3} y2={H / 2 + 3} stroke="#f4c542" strokeWidth=".7" />
        {scrim && <line x1={X(los)} x2={X(los)} y1={0} y2={H} stroke="#4aa3df" strokeWidth=".55" />}
        {first != null && first > 0 && first < 100 && <line x1={X(first)} x2={X(first)} y1={0} y2={H} stroke="#f4c542" strokeWidth=".55" />}
        {showDots && de.map((d, k) => <circle key={`d${k}`} cx={X(d.x)} cy={d.y} r={1.05} fill={defColor} stroke="#0b0f14" strokeWidth=".25" />)}
        {showDots && off.map((d, k) => <circle key={`o${k}`} cx={X(d.x)} cy={d.y} r={1.05} fill={offColor} stroke="#fff" strokeWidth=".25" />)}
        {/* ball + shadow */}
        <ellipse cx={X(ball.x)} cy={ball.y + 0.6} rx={1.1} ry={0.45} fill="rgba(0,0,0,.35)" />
        <ellipse cx={X(ball.x)} cy={ball.y - ball.h} rx={1.15} ry={0.75} fill="#8a5527" stroke="#3b2210" strokeWidth=".2" />
        {label && (
          <g>
            <rect x={X(label.x) - 7} y={label.y - 6.2} width={14} height={3.6} rx={1.8} fill="rgba(10,14,20,.85)" stroke="rgba(255,255,255,.5)" strokeWidth=".15" />
            <text x={X(label.x)} y={label.y - 3.7} textAnchor="middle" fontSize="2.3" fontWeight="800" fill="#fff">{label.text || names[label.id] || ''}</text>
          </g>
        )}
      </svg>
    </div>
  )
}

export default function NflSimReplay({ sim }) {
  const frames = useMemo(() => buildNflFrames(sim), [sim])
  const names = useMemo(() => Object.fromEntries(sim.players.map((p) => [p.id, p.short])), [sim])
  const teams = useMemo(() => ({
    away: { abbr: sim.away, name: NFL_TEAMS[sim.away]?.[0] || sim.away, color: NFL_TEAMS[sim.away]?.[1] || '#888', logo: LOGO(sim.away) },
    home: { abbr: sim.home, name: NFL_TEAMS[sim.home]?.[0] || sim.home, color: NFL_TEAMS[sim.home]?.[1] || '#888', logo: LOGO(sim.home) },
  }), [sim])
  const Surface = useCallback((props) => <Field {...props} teams={teams} names={names} />, [teams, names])

  const panels = useCallback((done) => {
    const acc = { home: { qb: {}, ru: {}, re: {} }, away: { qb: {}, ru: {}, re: {} } }
    for (let i = 0; i <= done; i++) {
      const p = frames[i].play
      const side = p.p === 0 ? 'home' : 'away'
      const a = acc[side]
      const w = p.w || {}
      const q = w.qb && (a.qb[w.qb] ||= { c: 0, a: 0, y: 0, td: 0, int: 0 })
      if (p.t === 'complete') { q.c++; q.a++; q.y += p.y; if (p.td) q.td++; const r = (a.re[w.target] ||= { n: 0, y: 0, td: 0 }); r.n++; r.y += p.y; if (p.td) r.td++ }
      if (p.t === 'incomplete') q.a++
      if (p.t === 'int' && q) { q.a++; q.int++ }
      if (p.t === 'run' || p.t === 'scramble') { const r = (a.ru[w.carrier] ||= { n: 0, y: 0, td: 0 }); r.n++; r.y += p.y; if (p.td) r.td++ }
    }
    const nm = (id) => names[id] || '—'
    const out = {}
    for (const side of ['away', 'home']) {
      const a = acc[side]
      const qbs = Object.entries(a.qb).sort((x, y) => y[1].a - x[1].a)
      out[side] = [
        { title: 'Passing', rows: qbs.slice(0, 1).flatMap(([id, s]) => [[nm(id), ''], [`${s.c}/${s.a} · ${s.y} yds${s.td ? ` · ${s.td} TD` : ''}${s.int ? ` · ${s.int} INT` : ''}`, '']]) },
        { title: 'Rushing', rows: Object.entries(a.ru).sort((x, y) => y[1].y - x[1].y).slice(0, 3).map(([id, s]) => [nm(id), `${s.n} car · ${s.y} yds${s.td ? ` · ${s.td} TD` : ''}`]) },
        { title: 'Receiving', rows: Object.entries(a.re).sort((x, y) => y[1].y - x[1].y).slice(0, 6).map(([id, s]) => [nm(id), `${s.n} rec · ${s.y} yds${s.td ? ` · ${s.td} TD` : ''}`]) },
      ]
    }
    return out
  }, [frames, names])

  const periods = useMemo(() => {
    const total = frames.some((f) => f.period > 4) ? 4200 : 3600
    return [900, 1800, 2700, ...(total > 3600 ? [3600] : [])].map((s) => s / total)
  }, [frames])

  return (
    <SimShell teams={teams} frames={frames} Surface={Surface} panels={panels} periods={periods}
      footnote={`Simulated game, not a prediction · sim ${(sim.typical.index + 1).toLocaleString()} of ${sim.n.toLocaleString()}`} />
  )
}

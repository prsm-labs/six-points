import { useEffect, useMemo, useState } from 'react'
import { resolveEventIds } from './espnGameResolver.js'
import { usePlayerDirectory, PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide } from './slideouts.js'
import { gameFraction } from './LiveProjection.jsx'
import { isSelectedGame, useMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'

// 📡 This week so far (2026-10-25, user: the old Live > Themes -- meant to find the slate's common theme -- becomes a "so far"
// page; the old 2025-finale replay is gone). Context only: this week's finished + live games against our pre-game numbers --
// TDs and RB / WR / TE scrimmage yards vs expected, TD scorers (lowest chance first), top TD chances still looking, yards running
// hot / cold, how the locked Top Picks and PRISM Picks stand, and scoring flurries (2+ scores within 3 game-minutes, the old
// Themes rule). Projections are NOT adjusted: the 10/25 backtest (2023-25 held out, 8,897 late player-games) found Sunday's 1 PM
// games don't predict the 4 PM / night games (TD nudges hurt held out, yards +-0.04%).
// "Expected so far" = his pre-game number x the share of his game played (gameFraction, final = all of it).
const POLL_MS = 30000
const CLUSTER_GAP_SECONDS = 180
const mean = (p) => (p == null ? 0 : -Math.log(1 - Math.min(0.97, p))) // P(1+ TD) -> expected TDs
const share = (a, e) => (e > 0 ? `${a >= e ? '+' : ''}${Math.round((a / e - 1) * 100)}%` : '—')
const getJson = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null)

async function fetchDetail(eventId) {
  const r = await fetch(`/api/summary?event=${eventId}&full=1`).catch(() => null)
  if (!r || !r.ok) return null
  const d = await r.json()
  return { boxscore: d.boxscore, drives: d.drives || [], status: d.status || null, score: d.score || null }
}

function statOf(cat, id, label) {
  const i = cat?.labels?.indexOf(label) ?? -1
  const a = cat?.athletes?.find((x) => x.athlete?.id === id)
  const n = Number(i >= 0 ? a?.stats?.[i] : 0)
  return Number.isFinite(n) ? n : 0
}

// every rusher / receiver in a box score: espn id -> { td, yds, car, tgt }
function boxLines(boxscore) {
  const out = new Map()
  for (const t of boxscore?.players || []) {
    const ru = t.statistics?.find((c) => c.name === 'rushing'), re = t.statistics?.find((c) => c.name === 'receiving')
    for (const a of [...(ru?.athletes || []), ...(re?.athletes || [])]) {
      const id = a.athlete?.id
      if (!id || out.has(id)) continue
      out.set(id, { td: statOf(ru, id, 'TD') + statOf(re, id, 'TD'), yds: statOf(ru, id, 'YDS') + statOf(re, id, 'YDS'), rushYds: statOf(ru, id, 'YDS'), recYds: statOf(re, id, 'YDS') })
    }
  }
  return out
}

function flurries(drives) {
  const plays = (drives || []).flatMap((d) => (d.plays || []).filter((p) => p.scoringPlay).map((p) => {
    const [m, s] = String(p.clock || '0:00').split(':').map(Number)
    return { ...p, team: d.team, elapsed: ((p.period || 1) - 1) * 900 + (900 - (m * 60 + (s || 0))) }
  })).sort((a, b) => a.elapsed - b.elapsed)
  const out = []
  let cur = null
  for (const p of plays) {
    if (cur && p.elapsed - cur.last <= CLUSTER_GAP_SECONDS) { cur.plays.push(p); cur.last = p.elapsed }
    else { cur = { plays: [p], last: p.elapsed }; out.push(cur) }
  }
  return out.filter((c) => c.plays.length >= 2)
}

function useWeek() {
  const [state, setState] = useState(null)
  useEffect(() => {
    let alive = true, timer = null
    const ids = {}
    ;(async () => {
      const [m, sched, teamStats, top, pp] = await Promise.all([getJson('/data/all_matchups_latest.json'), getJson('/data/season_schedule.json'),
        getJson('/data/team_stats.json'), getJson('/data/top_picks/index.json'), getJson('/data/prism_picks.json')])
      if (!alive || !m || !sched) { if (alive) setState({ error: true }); return }
      const lock = top?.locks?.find((l) => l.season === m.season && l.week === m.week)
      const topPicks = lock ? await getJson(`/data/top_picks/${lock.file}`) : null
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const games = sched.games.filter((g) => g.week === m.week)
      const started = games.filter((g) => g.gameday <= today)
      Object.assign(ids, await resolveEventIds(started, teamStats || {}))
      const details = {}
      const load = async () => {
        await Promise.all(started.map(async (g) => {
          if (!ids[g.game_id] || details[g.game_id]?.status?.state === 'post') return
          const d = await fetchDetail(ids[g.game_id])
          if (d) details[g.game_id] = d
        }))
        if (!alive) return
        setState({ m, games, details: { ...details }, topPicks, pp })
        if (Object.values(details).some((d) => d.status?.state === 'in') || started.some((g) => !details[g.game_id] || details[g.game_id].status?.state === 'pre'))
          timer = setTimeout(load, POLL_MS)
      }
      load()
    })()
    return () => { alive = false; clearTimeout(timer) }
  }, [])
  return state
}

function Row({ p, name, team, sub, right, color }) {
  return (
    <div className="sofar-row" onClick={() => p && openPlayerSlide(p)}>
      {p ? <PlayerAvatar playerId={p.player_id} name={name} /> : <span />}
      <span className="sofar-name">{name} <span className="muted">{team}</span>{sub && <span className="sofar-sub">{sub}</span>}</span>
      <b style={{ color }}>{right}</b>
    </div>
  )
}

export default function LiveThemes() {
  const w = useWeek()
  const directory = usePlayerDirectory()
  const { selectedMatchup } = useMatchup()
  const espnToId = useMemo(() => {
    const map = new Map()
    for (const [playerId, info] of Object.entries(directory)) { const mm = info.stats_url?.match(/\/id\/(\d+)\//); if (mm) map.set(mm[1], playerId) }
    return map
  }, [directory])

  if (!w) return <p className="empty-state">Loading this week's games…</p>
  if (w.error) return <p className="empty-state">Couldn't load this week's slate.</p>
  const games = w.games.filter((g) => !selectedMatchup || isSelectedGame(selectedMatchup, g.home_team, g.away_team))
  const lines = new Map() // our player_id -> box line
  const gameOfTeam = new Map()
  for (const g of games) {
    const d = w.details[g.game_id]
    if (!d) continue
    const f = gameFraction(d)
    for (const tri of [g.home_team, g.away_team]) gameOfTeam.set(tri, { g, d, f })
    for (const [eid, l] of boxLines(d.boxscore)) { const id = espnToId.get(eid); if (id) lines.set(id, l) }
  }
  const state = (tri) => gameOfTeam.get(tri)?.d?.status?.state || 'pre'
  const rows = w.m.matchups.flatMap((p) => {
    const gt = gameOfTeam.get(p.team)
    if (!gt || !gt.f) return []
    const l = lines.get(p.player_id) || { td: 0, yds: 0 }
    const skill = ['RB', 'WR', 'TE'].includes(p.position)
    return [{ p, l, f: gt.f, st: gt.d.status?.state, eTd: mean(p.p_td) * gt.f, eYds: skill && p.est_yards != null ? p.est_yards * gt.f : 0, skill }]
  })
  const n = { post: games.filter((g) => state(g.home_team) === 'post').length, in: games.filter((g) => state(g.home_team) === 'in').length }
  n.pre = games.length - n.post - n.in
  const sum = (list, f) => list.reduce((s, r) => s + f(r), 0)
  const byPos = ['RB', 'WR', 'TE', 'QB'].map((pos) => { const l = rows.filter((r) => r.p.position === pos); return [pos, sum(l, (r) => r.l.td), sum(l, (r) => r.eTd)] })
  const skill = rows.filter((r) => r.skill)
  const scorers = rows.filter((r) => r.l.td > 0).sort((a, b) => (a.p.p_td ?? 0) - (b.p.p_td ?? 0))
  const looking = rows.filter((r) => r.l.td === 0 && r.st === 'in').sort((a, b) => (b.p.p_td ?? 0) - (a.p.p_td ?? 0)).slice(0, 8)
  const yd = skill.filter((r) => r.f >= 0.25 && r.p.est_yards != null).map((r) => ({ ...r, d: r.l.yds - r.eYds })).sort((a, b) => b.d - a.d)
  const slot = (p) => ({ player_id: p.player_id, player_name: p.player_name, team: p.team, position: p.position })
  const icon = (hit, tri) => (hit ? ['✅', 'var(--good, #2fae5c)'] : state(tri) === 'post' ? ['❌', 'var(--red, #e5584b)'] : [state(tri) === 'in' ? '⏳' : '🕒', 'var(--muted)'])
  const topPicks = (w.topPicks?.picks || []).filter((t) => t.player)
  const week = w.pp?.weeks?.find((x) => x.week === w.m.week)
  const prism = week ? [['💎', week.picks || []], ['⚖️', week.tiers?.mid || []], ['🌠', week.tiers?.long || []]].flatMap(([e, l]) => l.map((x) => ({ ...x, e }))) : []
  // biggest flurries first (most scores, then most recent game), 8 at most; play text cut to its first sentence
  const fl = games.flatMap((g, gi) => flurries(w.details[g.game_id]?.drives).map((c) => ({ g, c, gi })))
    .sort((a, b) => b.c.plays.length - a.c.plays.length || b.gi - a.gi).slice(0, 8)
  const short = (t) => String(t || '').replace(/^\([^)]*\)\s*/, '').split(/(?<=TOUCHDOWN|is GOOD)/)[0]
  const pct = (x) => `${Math.round((x ?? 0) * 100)}%`

  return (
    <div>
      <MatchupFilterNote message={selectedMatchup && 'Showing only the selected game(s)'} />
      <p className="meta-line">
        Week {w.m.week}: {n.post} final · {n.in} live · {n.pre} still to play. Refreshes every 30 seconds while games are on. Context only — we tested
        reacting to it (10/25, three seasons held out): Sunday's 1 PM games don't tell us how the later games go, so it's shown, not used.
      </p>
      {rows.length === 0 && <p className="empty-state">No game this week has kicked off yet.</p>}
      {rows.length > 0 && (
        <>
          <div className="sofar-tiles">
            <div className="sofar-tile"><span className="muted">Touchdowns</span><b className={sum(rows, (r) => r.l.td) >= sum(rows, (r) => r.eTd) ? 'up' : 'down'}>{share(sum(rows, (r) => r.l.td), sum(rows, (r) => r.eTd))}</b>
              <span className="muted">{sum(rows, (r) => r.l.td)} so far vs {sum(rows, (r) => r.eTd).toFixed(1)} expected</span></div>
            <div className="sofar-tile"><span className="muted">RB / WR / TE scrimmage yards</span><b className={sum(skill, (r) => r.l.yds) >= sum(skill, (r) => r.eYds) ? 'up' : 'down'}>{share(sum(skill, (r) => r.l.yds), sum(skill, (r) => r.eYds))}</b>
              <span className="muted">{Math.round(sum(skill, (r) => r.l.yds))} so far vs {Math.round(sum(skill, (r) => r.eYds))} expected</span></div>
            {byPos.map(([pos, a, e]) => (
              <div key={pos} className="sofar-tile"><span className="muted">{pos === 'QB' ? 'QB rushing TDs' : `${pos} TDs`}</span><b className={a >= e ? 'up' : 'down'}>{a} <small className="muted">vs {e.toFixed(1)}</small></b></div>
            ))}
          </div>
          <div className="sofar-grid">
            <div className="sofar-card">
              <h4>🏈 TD scorers <span className="muted">lowest chance first</span></h4>
              {scorers.slice(0, 14).map((r) => <Row key={r.p.player_id} p={slot(r.p)} name={r.p.player_name} team={r.p.team} sub={`${r.p.position} · ${r.l.td} TD · ${Math.round(r.l.yds)} yds`} right={`${pct(r.p.p_td)} TD`} color={(r.p.p_td ?? 0) < 0.2 ? 'var(--accent)' : undefined} />)}
              {!scorers.length && <p className="muted">No touchdowns yet.</p>}
            </div>
            <div className="sofar-card">
              <h4>🔎 Top TD chances still looking <span className="muted">games on now</span></h4>
              {looking.map((r) => <Row key={r.p.player_id} p={slot(r.p)} name={r.p.player_name} team={r.p.team} sub={`${Math.round(r.l.yds)} yds · ${Math.round(r.f * 100)}% of the game played`} right={pct(r.p.p_td)} />)}
              {!looking.length && <p className="muted">No games on right now.</p>}
            </div>
            <div className="sofar-card">
              <h4>📈 Yards vs expected so far <span className="muted">RB / WR / TE</span></h4>
              {[...yd.slice(0, 6), ...yd.slice(-4).reverse()].filter((r, i, a) => a.findIndex((x) => x.p.player_id === r.p.player_id) === i).map((r) => (
                <Row key={r.p.player_id} p={slot(r.p)} name={r.p.player_name} team={r.p.team} sub={`${Math.round(r.l.yds)} yds vs ${Math.round(r.eYds)} expected`} right={`${r.d >= 0 ? '+' : ''}${Math.round(r.d)}`} color={r.d >= 0 ? 'var(--good, #2fae5c)' : 'var(--red, #e5584b)'} />
              ))}
            </div>
          </div>
        </>
      )}
      {(topPicks.length > 0 || prism.length > 0) && (
        <div className="sofar-grid">
          {topPicks.length > 0 && (
            <div className="sofar-card">
              <h4>🏆 Top Picks <span className="muted">locked</span></h4>
              {topPicks.map((t) => {
                const l = lines.get(t.player.player_id) || { td: 0, yds: 0 }
                const hit = t.stat === '100' ? l.yds >= 100 : l.td >= 1
                const [ic, color] = icon(hit, t.player.team)
                return <Row key={t.tier} p={slot(t.player)} name={t.player.player_name} team={t.player.team} sub={`${t.tier} · ${t.stat === '100' ? `100+ yds · ${Math.round(l.yds)} so far` : `anytime TD · ${l.td} so far`}`} right={ic} color={color} />
              })}
            </div>
          )}
          {prism.length > 0 && (
            <div className="sofar-card">
              <h4>💎 PRISM Picks <span className="muted">💎 safe · ⚖️ mid · 🌠 long</span></h4>
              {prism.map((x) => {
                const l = lines.get(x.player_id) || { td: 0, yds: 0 }
                const td = x.stat === 'TD' || x.stat === 'TD2' // stat: YDS (scrimmage yards) | TD (anytime) | TD2 (2+ TDs)
                const v = td ? l.td : Math.round(l.yds)
                const [ic, color] = icon(v >= x.line, x.team)
                return <Row key={`${x.e}${x.player_id}`} p={{ player_id: x.player_id, player_name: x.name, team: x.team, position: x.pos }} name={x.name} team={x.team} sub={`${x.e} ${x.label} · ${v}${td ? ' TD' : ' yds'} so far`} right={ic} color={color} />
              })}
            </div>
          )}
        </div>
      )}
      {fl.length > 0 && (
        <div className="sofar-card" style={{ marginTop: 12 }}>
          <h4>⚡ Scoring flurries <span className="muted">2+ scores within 3 game-minutes</span></h4>
          {fl.map(({ g, c }, i) => (
            <div key={i} className="sofar-flurry">
              <b>{g.away_team} @ {g.home_team} · {c.plays.length} scores</b>
              {c.plays.map((p, j) => <div key={j} className="muted">Q{p.period} {p.clock} · {p.team} · {short(p.text)}</div>)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

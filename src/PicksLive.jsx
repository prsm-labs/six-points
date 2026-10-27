import { useEffect, useMemo, useState } from 'react'
import { resolveEventIds } from './espnGameResolver.js'
import { usePlayerDirectory, PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide } from './slideouts.js'
import { PICK_TYPE } from './picks.js'
import { gameFraction } from './LiveProjection.jsx'
import { restOfGame, ratio } from './liveModel.js'

// 📡 My Picks live (2026-10-26, user: a "my players" box score inside My Picks -- how my picks are doing live, measured
// against OUR projections, not the pick category's line). One row per picked player on this week's slate, box-score style:
// each stat cell = what he has now (big) and pre-game projection → live projected final (small, ▲ / ▼ when the live
// projection is 10%+ above / below pre-game). Live projection = the 📈 Live projection model (liveModel.js, held out by
// season): now + a normal rest of the game from his pre-game rate, nudged by his usage so far and the score; hot / cold
// efficiency is not carried forward. Pre-game carries / targets = his per-game rates, yards = Est. Yds, TDs = expected TDs
// from his TD chance. QBs have no pre-game projection (rushing / receiving only, shown as-is). Box scores every 25 s.
const POLL_MS = 25000
const getJson = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null)
const lam = (p) => (p == null ? null : -Math.log(Math.max(1e-6, 1 - Math.min(p, 0.999))))
const fx = (v, d) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(d))
// "Mon 8:15 PM" from the schedule's gameday + gametime (ET)
const kickLabel = (g) => {
  if (!g?.gameday) return ''
  const day = new Date(`${g.gameday}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  const [h, mi] = String(g.gametime || '').split(':').map(Number)
  return Number.isFinite(h) ? `${day} ${((h + 11) % 12) + 1}:${String(mi || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'} ET` : day
}
const STATS = [['car', 'CAR', 1], ['tgt', 'TGT', 1], ['yds', 'YDS', 0], ['td', 'TD', 2]]

function statOf(cat, id, label) {
  const i = cat?.labels?.indexOf(label) ?? -1
  const a = cat?.athletes?.find((x) => x.athlete?.id === id)
  const n = Number(i >= 0 ? a?.stats?.[i] : 0)
  return Number.isFinite(n) ? n : 0
}

// the picked teams' games this week: ESPN summary for each, polled while any is live or still to start today
function useGames(week, teams) {
  const [state, setState] = useState({})
  const key = `${week}|${[...teams].sort().join(',')}`
  useEffect(() => {
    if (!week || !teams.size) return undefined
    let alive = true, timer = null
    ;(async () => {
      const [sched, teamStats] = await Promise.all([getJson('/data/season_schedule.json'), getJson('/data/team_stats.json')])
      if (!alive || !sched) return
      const games = sched.games.filter((g) => g.week === week && (teams.has(g.home_team) || teams.has(g.away_team)))
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const ids = await resolveEventIds(games.filter((g) => g.gameday <= today), teamStats || {})
      const details = {}
      const load = async () => {
        await Promise.all(games.map(async (g) => {
          if (!ids[g.game_id] || details[g.game_id]?.status?.state === 'post') return
          const r = await fetch(`/api/summary?event=${ids[g.game_id]}&full=1`).catch(() => null)
          const d = r && r.ok ? await r.json() : null
          if (d) details[g.game_id] = { boxscore: d.boxscore, drives: d.drives || [], status: d.status || null, score: d.score || null }
        }))
        if (!alive) return
        setState({ games, details: { ...details } })
        const pending = games.some((g) => g.gameday <= today && details[g.game_id]?.status?.state !== 'post')
        if (pending) timer = setTimeout(load, POLL_MS)
      }
      load()
    })()
    return () => { alive = false; clearTimeout(timer) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

function Cell({ r, k, d }) {
  const pre = r.pre[k]
  if (!r.now) return <td className="num pl-cell"><b className="meta-line" style={{ margin: 0 }}>—</b><span className="pl-sub">{fx(pre, d)}</span></td>
  const now = r.now[k], proj = r.proj?.[k]
  if (proj == null) return <td className="num pl-cell"><b>{now}</b><span className="pl-sub">no projection</span></td>
  const up = pre > 0 && proj >= pre * 1.1, down = pre > 0 && proj <= pre * 0.9
  return (
    <td className="num pl-cell">
      <b>{now}</b>
      <span className="pl-sub">{fx(pre, d)} → <span className={up ? 'lp-up' : down ? 'lp-down' : ''}>{fx(proj, d)}{up ? ' ▲' : down ? ' ▼' : ''}</span></span>
    </td>
  )
}

export default function PicksLive({ slate, picks }) {
  const directory = usePlayerDirectory()
  const espnOf = useMemo(() => {
    const map = new Map()
    for (const [playerId, info] of Object.entries(directory)) { const mm = info.stats_url?.match(/\/id\/(\d+)\//); if (mm) map.set(playerId, mm[1]) }
    return map
  }, [directory])
  const byId = useMemo(() => new Map([...(slate?.matchups || []), ...(slate?.not_playing || [])].map((m) => [m.player_id, m])), [slate])
  const mine = picks.map((k) => ({ k, m: byId.get(k.player_id) })).filter((x) => x.m && x.m.week === slate.week)
  const off = picks.length - mine.length
  const teams = useMemo(() => new Set(mine.map((x) => x.m.team)), [mine.map((x) => x.m.team).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const { games = [], details = {} } = useGames(slate?.week, teams)

  const rows = mine.map(({ k, m }) => {
    const g = games.find((x) => x.home_team === m.team || x.away_team === m.team)
    const d = g && details[g.game_id]
    const state = d?.status?.state || 'pre'
    const qb = !['RB', 'WR', 'TE'].includes(m.position)
    const pre = qb ? { car: null, tgt: null, yds: null, td: null } : { car: m.ca_pg ?? null, tgt: m.tg_pg ?? null, yds: m.est_yards ?? null, td: lam(m.p_td) }
    let now = null, proj = null, rec = null
    if (d && state !== 'pre') {
      const id = espnOf.get(m.player_id)
      const team = d.boxscore?.players?.find((t) => [t.statistics?.find((c) => c.name === 'rushing'), t.statistics?.find((c) => c.name === 'receiving')]
        .some((c) => c?.athletes?.some((a) => a.athlete?.id === id)))
      const ru = team?.statistics?.find((c) => c.name === 'rushing'), re = team?.statistics?.find((c) => c.name === 'receiving')
      now = { car: statOf(ru, id, 'CAR'), tgt: statOf(re, id, 'TGTS'), yds: statOf(ru, id, 'YDS') + statOf(re, id, 'YDS'), td: statOf(ru, id, 'TD') + statOf(re, id, 'TD') }
      rec = statOf(re, id, 'REC')
      if (!qb) {
        const f = gameFraction(d)
        const home = g.home_team === m.team
        const margin = Number(d.score?.[home ? 'home' : 'away'] ?? 0) - Number(d.score?.[home ? 'away' : 'home'] ?? 0)
        const touchPre = m.tg_pg != null || m.ca_pg != null ? (m.tg_pg || 0) + (m.ca_pg || 0) : null
        const zt = { z_vol: ratio(now.car + now.tgt, f, touchPre, 3), z_m: margin / 7 }
        proj = {
          car: now.car + restOfGame('car', pre.car, f, { z_vol: ratio(now.car, f, pre.car, 2), z_m: margin / 7 }).mean,
          tgt: now.tgt + restOfGame('tgt', pre.tgt, f, { z_vol: ratio(now.tgt, f, pre.tgt, 2), z_m: margin / 7 }).mean,
          yds: now.yds + restOfGame('scrim', pre.yds, f, zt).mean,
          td: now.td + restOfGame('td', pre.td, f, zt).mean,
        }
      }
    }
    return { k, m, g, d, state, pre, now, proj, rec, qb }
  })
  const ORDER = { in: 0, pre: 1, post: 2 }
  rows.sort((a, b) => ORDER[a.state] - ORDER[b.state] || String(a.g?.gameday || '').localeCompare(String(b.g?.gameday || '')) || (b.pre.yds || 0) - (a.pre.yds || 0))
  const withP = rows.filter((r) => r.proj && r.pre.yds > 0)
  const ahead = withP.filter((r) => r.proj.yds >= r.pre.yds * 1.05).length
  const behind = withP.filter((r) => r.proj.yds <= r.pre.yds * 0.95).length
  const n = (s) => rows.filter((r) => r.state === s).length

  if (!rows.length) return <p className="empty-state">None of your picks are on week {slate?.week}'s slate.{off ? ` (${off} from other weeks — see By category.)` : ''}</p>
  return (
    <div className="card pl-card">
      <div className="pl-summary">
        <span><b>{n('in')}</b> live</span><span><b>{n('pre')}</b> to kick off</span><span><b>{n('post')}</b> final</span>
        {withP.length > 0 && <><span className="lp-up"><b>{ahead}</b> ▲ ahead</span><span><b>{withP.length - ahead - behind}</b> on track</span><span className="lp-down"><b>{behind}</b> ▼ behind</span></>}
      </div>
      <div className="table-wrap">
        <table className="pl-table">
          <thead>
            <tr><th className="sticky-col">Player</th>{STATS.map(([k, l]) => <th key={k}>{l}</th>)}<th title="Receptions">REC</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const t = PICK_TYPE[r.k.category]
              const kick = kickLabel(r.g)
              return (
                <tr key={r.k.player_id}>
                  <td className="sticky-col">
                    <div className="player-cell" onClick={() => openPlayerSlide(r.m)}>
                      <PlayerAvatar playerId={r.m.player_id} name={r.m.player_name} />
                      <span className="pl-name">{r.m.player_name}
                        <span className="pl-sub">{r.m.team} vs {r.m.opponent} · {r.m.position}{t ? ` · ${t.emoji} ${t.label}` : ''}</span>
                        <span className="pl-sub pl-gameline">{r.state === 'pre' ? kick || 'this week'
                          : <><b>{r.g.away_team} {r.d.score?.away ?? 0}–{r.d.score?.home ?? 0} {r.g.home_team}</b> · {r.state === 'post' ? 'Final' : r.d.status?.detail || 'Live'}</>}</span>
                        {r.m.absent_reason && <span className="pl-sub lp-down">OUT · {r.m.absent_reason}</span>}</span>
                    </div>
                  </td>
                  {STATS.map(([k, , d]) => <Cell key={k} r={r} k={k} d={d} />)}
                  <td className="num">{r.rec ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="meta-line small">
        Each stat: <b>now</b>, then pre-game projection → live projected final (▲ / ▼ = live 10%+ above / below pre-game). Pre-game CAR / TGT
        are his per-game rates, YDS his Est. Yds, TD his expected TDs (from his TD chance). Ahead / behind counts use yards (5%). The live
        projection is what he has + a normal rest of the game, nudged by his usage and the score; hot or cold efficiency isn't carried forward.
        QBs have no pre-game projection, so their rushing / receiving line shows as-is.
        {off > 0 && ` ${off} pick${off === 1 ? '' : 's'} not on this week's slate (see By category).`}
      </p>
    </div>
  )
}

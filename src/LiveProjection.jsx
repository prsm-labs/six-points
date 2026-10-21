import { useEffect, useState } from 'react'
import { openPlayerSlide } from './slideouts.js'
import { restOfGame, ratio, chanceAtLeast, chanceAtLeastYards } from './liveModel.js'

// 2026-10-20 📈 Live projection (user): each RB / WR / TE's projected final line from where the game stands = what he has now +
// a normal rest of the game (his pre-game Est. Yds / TD chance x time left, nudged by his touches so far vs his usual and the
// score -- trailing teams throw more, leading teams run more). Hot / cold efficiency (yards per carry / target, catch rate) is
// NOT carried forward: tested 2021-25, held out by season, 5-8% of a 1st-half efficiency carries into the 2nd half, and
// projecting from the current pace was worse than ignoring the game. Team line: Six Points' own expected TDs (not Vegas) x 9.4
// points per TD (league 2021-25), x time left, with the same score term. Weights: claude/REPORT_LiveRegression_2026-10-20.md.
// QBs aren't projected (Six Points has no pre-game passing projection).
const PTS_PER_TD = 9.4
// This week's slate (all_matchups_latest + game_sim_inputs) when it is the game's week; otherwise that week's frozen
// pre-kickoff snapshot (snapshots/<season>-wk<N>.json: TD %, 100+ %, Est. Yds -- no usual touches, so no touches nudge and
// no team line).
const cache = {}
const getJson = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null)
function usePreGame(season, week) {
  const key = `${season}-${week}`
  const [d, setD] = useState(cache[key] || null)
  useEffect(() => {
    if (cache[key]) { setD(cache[key]); return }
    let alive = true
    Promise.all([getJson('/data/all_matchups_latest.json'), getJson('/data/game_sim_inputs.json')]).then(async ([m, s]) => {
      let out
      if (m && m.week === week && m.season === season) out = { rows: m.matchups, sim: s?.week === week ? s : null, source: 'slate' }
      else {
        const snap = await getJson(`/data/snapshots/${season}-wk${week}.json`)
        out = { rows: snap?.players || [], sim: null, source: snap ? 'snapshot' : 'none' }
      }
      cache[key] = out
      if (alive) setD(out)
    })
    return () => { alive = false }
  }, [key])
  return d
}

const ORD = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4 }
export function gameFraction(detail) {
  const st = detail?.status
  if (st?.state === 'post') return 1
  if (st?.state !== 'in') return 0
  const txt = st.detail || ''
  if (/halftime/i.test(txt)) return 0.5
  const end = txt.match(/end of (?:the )?(1st|2nd|3rd|4th)/i)
  if (end) return ORD[end[1].toLowerCase()] / 4
  let q = null, clk = null
  const m = txt.match(/(\d+):(\d+)\s*-\s*(1st|2nd|3rd|4th|OT)/i)
  if (m) { q = /ot/i.test(m[3]) ? 5 : ORD[m[3].toLowerCase()]; clk = Number(m[1]) + Number(m[2]) / 60 }
  if (q == null) {
    const plays = (detail.drives || []).flatMap((d) => d.plays || [])
    const last = plays[plays.length - 1]
    const c = String(last?.clock || '').match(/(\d+):(\d+)/)
    if (last?.period && c) { q = last.period; clk = Number(c[1]) + Number(c[2]) / 60 }
  }
  if (q == null) return 0
  if (q > 4) return 0.99
  return Math.min(1, Math.max(0, ((q - 1) * 15 + (15 - clk)) / 60))
}

const stat = (cat, id, label) => {
  const i = cat?.labels?.indexOf(label) ?? -1
  const a = cat?.athletes?.find((x) => x.athlete?.id === id)
  const n = Number(i >= 0 ? a?.stats?.[i] : 0)
  return Number.isFinite(n) ? n : 0
}
const pctTxt = (p) => (p == null ? '—' : p >= 0.995 ? '✓' : `${Math.round(p * 100)}%`)

function rowsFor(teamEntry, team, f, margin, byId, espnIdToPlayer) {
  const ru = teamEntry.statistics?.find((c) => c.name === 'rushing'), re = teamEntry.statistics?.find((c) => c.name === 'receiving')
  const ids = new Set([...(ru?.athletes || []), ...(re?.athletes || [])].map((a) => a.athlete?.id).filter(Boolean))
  const out = []
  for (const id of ids) {
    const who = espnIdToPlayer.get(id)
    const p = who && byId.get(who.playerId)
    if (!p || !['RB', 'WR', 'TE'].includes(p.position)) continue
    const car = stat(ru, id, 'CAR'), tgt = stat(re, id, 'TGTS'), yds = stat(ru, id, 'YDS') + stat(re, id, 'YDS')
    const td = stat(ru, id, 'TD') + stat(re, id, 'TD'), rec = stat(re, id, 'REC')
    const touchPre = p.tg_pg != null || p.ca_pg != null ? (p.tg_pg || 0) + (p.ca_pg || 0) : null
    const z = { z_vol: ratio(car + tgt, f, touchPre, 3), z_m: margin / 7 }
    const ry = restOfGame('scrim', p.est_yards, f, z)
    const lam = p.p_td != null ? -Math.log(Math.max(1e-6, 1 - Math.min(p.p_td, 0.999))) : null
    const rt = restOfGame('td', lam, f, z)
    out.push({
      id, p, team, car, tgt, rec, yds, td, touchPre,
      projYds: yds + ry.mean, preYds: p.est_yards,
      tdNow: td > 0 ? 1 : chanceAtLeast(1, rt), tdPre: p.p_td,
      y100: chanceAtLeastYards(100 - yds, ry), y100Pre: p.p_100,
    })
  }
  return out.sort((a, b) => b.projYds - a.projYds)
}

export default function LiveProjection({ game, detail, espnIdToPlayer, espnAbbrToNflverse }) {
  const season = Number(String(game.game_id || '').slice(0, 4)) || null
  const pg = usePreGame(season, game.week)
  if (!pg) return <p className="meta-line small">Loading pre-game projections…</p>
  const f = gameFraction(detail)
  const awayScore = Number(detail.score?.away ?? 0), homeScore = Number(detail.score?.home ?? 0)
  const byId = new Map(pg.rows.filter((x) => x.team === game.away_team || x.team === game.home_team).map((x) => [x.player_id, x]))
  const stale = pg.source === 'none'
  const teams = (detail.boxscore?.players || []).map((t) => {
    const ab = espnAbbrToNflverse.get(t.team?.abbreviation?.toUpperCase()) || t.team?.abbreviation
    const margin = ab === game.home_team ? homeScore - awayScore : awayScore - homeScore
    return { ab, rows: rowsFor(t, ab, f, margin, byId, espnIdToPlayer) }
  })
  const teamLine = (ab, score, margin) => {
    const td = pg.sim?.teams?.[ab]?.own_td_mean
    if (td == null) return null
    const pre = td * PTS_PER_TD
    return { pre, proj: score + restOfGame('team_pts', pre, f, { z_m: margin / 7 }).mean }
  }
  const a = teamLine(game.away_team, awayScore, awayScore - homeScore), h = teamLine(game.home_team, homeScore, homeScore - awayScore)
  return (
    <div style={{ marginTop: 10 }}>
      {stale && <p className="meta-line small">No pre-game projections on file for week {game.week}, so there's nothing to project from.</p>}
      {pg.source === 'snapshot' && <p className="meta-line small" style={{ marginTop: 0 }}>Using week {game.week}'s frozen pre-kickoff projections (no team line or touches nudge for past weeks).</p>}
      {a && h && (
        <div className="lp-team">
          <span className="meta-line small" style={{ margin: 0 }}>PROJECTED FINAL</span>
          <strong>{game.away_team} {a.proj.toFixed(0)} – {game.home_team} {h.proj.toFixed(0)}</strong>
          <span className="meta-line small" style={{ margin: 0 }}>total {(a.proj + h.proj).toFixed(0)} · pre-game {a.pre.toFixed(0)} – {h.pre.toFixed(0)} (Six Points' own expected TDs × 9.4)</span>
        </div>
      )}
      {!stale && teams.map(({ ab, rows }) => (
        <div key={ab} style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 800 }}>{ab}</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="sticky-col">Player</th>
                  <th title="Carries + targets now (his usual per game)">Touches</th>
                  <th title="Scrimmage yards now → projected final (pre-game Est. Yds)">Yards</th>
                  <th title="Chance of 100+ scrimmage yards: now (pre-game)">100+</th>
                  <th title="TDs now · chance of a TD: now (pre-game)">TD</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="sticky-col">
                      <button className="team-link" onClick={() => openPlayerSlide({ player_id: r.p.player_id, player_name: r.p.player_name, team: r.team, position: r.p.position })}>{r.p.player_name}</button>
                      <span className="meta-line small" style={{ margin: 0 }}> {r.p.position}</span>
                    </td>
                    <td>{r.car + r.tgt} <span className="meta-line small" style={{ margin: 0 }}>({r.touchPre != null ? r.touchPre.toFixed(1) : '—'})</span></td>
                    <td>{r.yds} → <b className={r.projYds >= r.preYds * 1.1 ? 'lp-up' : r.projYds <= r.preYds * 0.9 ? 'lp-down' : ''}>{r.projYds.toFixed(0)}</b> <span className="meta-line small" style={{ margin: 0 }}>({r.preYds?.toFixed(0) ?? '—'})</span></td>
                    <td><b>{pctTxt(r.y100)}</b> <span className="meta-line small" style={{ margin: 0 }}>({pctTxt(r.y100Pre)})</span></td>
                    <td style={r.td > 0 ? { color: 'var(--green, #2ecc71)' } : undefined}>{r.td} · <b>{pctTxt(r.tdNow)}</b> <span className="meta-line small" style={{ margin: 0 }}>({pctTxt(r.tdPre)})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="meta-line small">
        {detail.status?.state === 'post' ? 'Final — the projection is the final line. ' : `${Math.round(f * 100)}% of the game played. `}
        Projected final = what he has now + a normal rest of the game: his pre-game Est. Yds / TD chance × time left, nudged by his touches
        so far and the score (trailing teams throw more, leading teams run more). Hot or cold efficiency isn't carried forward — 2021-25,
        only 5-8% of a 1st-half yards-per-touch / catch rate carried into the 2nd half. RB / WR / TE with a pre-game projection; QBs aren't projected.
      </p>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { useMatchup } from './MatchupContext.jsx'
import NflSimReplay, { NFL_TEAMS } from './NflSimReplay.jsx'
import './NflSimReplay.css'

// 🔮 Game Sim, rebuilt 2026-10-29 (user: RotoBot's "we simulated this game 15,000 times" -- the old page only had rushing and
// receiving averages, no full box score and no QBs). Every game of the week is played 15,000 times snap by snap
// (scripts/build_game_sims.mjs + src/sim/nflSim.js; league play tables from 2022-26 play-by-play, each offense and defense's own
// 2026 rates, each QB's own passing, the players' usage). The page shows the most typical of those games as a replay, then the
// 15,000-game averages as a full box score. Backtest 2024-25 held out: see nfl_project/claude/CLAUDE.md 2026-10-29.

const LOGO = (t) => `https://a.espncdn.com/i/teamlogos/nfl/500/${String(t === 'LA' ? 'lar' : t || '').toLowerCase()}.png`
const f1 = (v) => (v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1))
const f0 = (v) => (v == null ? '—' : Math.round(v))

function BoxTables({ sim, side }) {
  const team = side === 'home' ? sim.home : sim.away
  const rows = sim.players.filter((p) => p.side === side)
  const qbId = sim.qb?.[side]
  const qb = rows.find((p) => p.id === qbId)
  const rush = rows.filter((p) => p.ra >= 0.3).sort((a, b) => b.ry - a.ry)
  const rec = rows.filter((p) => p.tg >= 0.3).sort((a, b) => b.rcy - a.rcy)
  const t = sim.team[side]
  const open = (p) => openPlayerSlide({ player_id: p.id, player_name: p.name, team: p.team, position: p.pos })
  const Name = ({ p }) => (
    <td className="sticky-col">
      <div className="player-cell" onClick={() => open(p)}><PlayerAvatar playerId={p.id} name={p.name} />{p.name}</div>
    </td>
  )
  return (
    <div className="gs-box" style={{ '--tc': NFL_TEAMS[team]?.[1] || 'var(--accent)' }}>
      <div className="gs-box-h">
        <img src={LOGO(team)} alt="" width={22} height={22} />
        <button className="team-link" onClick={() => openTeamSlide({ team })}>{NFL_TEAMS[team]?.[0] || team}</button>
        <span className="meta-line small" style={{ margin: 0 }}>avg {f1(sim.summary[side].mean)} pts · {f0(t.yds)} yds · {f1(t.to)} TO</span>
      </div>
      {qb && (
        <div className="table-wrap"><table className="gs-t">
          <thead><tr><th className="sticky-col">Passing</th><th>Cmp/Att</th><th>Yds</th><th>TD</th><th>INT</th><th>Sacked</th><th>Rush</th></tr></thead>
          <tbody><tr><Name p={qb} /><td>{f1(qb.pc)}/{f1(qb.pa)}</td><td><b>{f0(qb.py)}</b></td><td>{f1(qb.ptd)}</td><td>{f1(qb.pint)}</td><td>{f1(qb.sk)}</td>
            <td>{f1(qb.ra)} / {f0(qb.ry)}</td></tr></tbody>
        </table></div>
      )}
      <div className="table-wrap"><table className="gs-t">
        <thead><tr><th className="sticky-col">Rushing</th><th>Car</th><th>Yds</th><th>TD</th><th>Any TD</th></tr></thead>
        <tbody>{rush.map((p) => <tr key={p.id}><Name p={p} /><td>{f1(p.ra)}</td><td><b>{f0(p.ry)}</b></td><td>{f1(p.rtd)}</td><td>{f0(p.td_pct)}%</td></tr>)}</tbody>
      </table></div>
      <div className="table-wrap"><table className="gs-t">
        <thead><tr><th className="sticky-col">Receiving</th><th>Tgt</th><th>Rec</th><th>Yds</th><th>TD</th><th>Any TD</th></tr></thead>
        <tbody>{rec.map((p) => <tr key={p.id}><Name p={p} /><td>{f1(p.tg)}</td><td>{f1(p.rec)}</td><td><b>{f0(p.rcy)}</b></td><td>{f1(p.rctd)}</td><td>{f0(p.td_pct)}%</td></tr>)}</tbody>
      </table></div>
      <div className="gs-team">
        <span>Kicking{sim.kicker?.[side] ? ` (${sim.kicker[side]})` : ''}: <b>{f1(t.fgm)}/{f1(t.fga)} FG</b> · {f1(t.xpm)} XP</span>
        <span>Plays <b>{f0(t.plays)}</b> · pass {f0(t.pyds)} / rush {f0(t.ryds)} yds · 1st downs {f0(t.fd)}</span>
        <span>Punts {f1(t.punts)} · sacks made {f1(t.sacks)} · possession {Math.floor(t.top / 60)}:{String(Math.round(t.top % 60)).padStart(2, '0')}</span>
      </div>
    </div>
  )
}

export default function GameSimTab() {
  const [index, setIndex] = useState(null)
  const [error, setError] = useState(null)
  const [gid, setGid] = useState(null)
  const [sim, setSim] = useState(null)
  const [loading, setLoading] = useState(false)
  const { selectedMatchup } = useMatchup()

  useEffect(() => {
    fetch('/data/sims/index.json').then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      return r.json()
    }).then(setIndex).catch((e) => setError(e.message))
  }, [])

  const games = index?.games || []
  // the header's game pick drives this page too
  useEffect(() => {
    if (!games.length) return
    const want = selectedMatchup ? games.find((g) => g.home === selectedMatchup.home && g.away === selectedMatchup.away) : null
    if (want) setGid(want.game_id)
    else if (!gid) setGid(games[0].game_id)
  }, [selectedMatchup, games])

  useEffect(() => {
    if (!gid) return
    setLoading(true)
    fetch(`/data/sims/${gid}.json`).then((r) => r.json()).then((d) => { setSim(d); setLoading(false) }).catch((e) => { setError(e.message); setLoading(false) })
  }, [gid])

  const homeWin = sim ? sim.summary.homeWin + sim.summary.tie / 2 : null
  const fav = sim ? (homeWin >= 0.5 ? sim.home : sim.away) : null
  const favPct = sim ? Math.round(100 * Math.max(homeWin, 1 - homeWin)) : null
  const marketTxt = useMemo(() => {
    if (!sim?.market) return null
    const m = sim.market
    const f = m.spread >= 0 ? sim.home : sim.away
    return `${sim.away} ${m.away} @ ${sim.home} ${m.home} (${f} -${Math.abs(m.spread)}, total ${m.total})`
  }, [sim])

  if (error) return <p className="empty-state">No game simulations yet ({error}).</p>
  if (!index) return <p className="empty-state">Loading...</p>

  return (
    <div>
      <p className="note">
        Every game this week is played 15,000 times, snap by snap: run or pass, sacks, scrambles, completions, interceptions, fumbles,
        penalties, 4th-down calls, field goals, punts and the clock, drawn from five seasons of NFL play-by-play and shifted by each
        offense's and defense's own 2026 numbers, each quarterback's own passing and each player's share of the carries and targets.
        Each offense is then nudged halfway toward the betting market's team total (the same 50/50 blend this page has always used).
        The replay is the most typical of the 15,000 games -- the winner most of them pick, on the side of the spread and total most
        of them land, closest to the median score -- and the tables below it are the averages of all 15,000. Tested on 2024-25 games
        it never saw: scores within 0.1 point of the market's accuracy, QB passing yards 15% closer than the season average, and TD
        chances and scrimmage yards about even with our grade model -- the grades stay the official numbers. Simulated games, not
        predictions; games lock at kickoff.
      </p>
      <div className="gs-games">
        {games.map((g) => {
          const hw = g.homeWin
          const fv = hw >= 0.5 ? g.home : g.away
          return (
            <button key={g.game_id} className={`gs-game${gid === g.game_id ? ' active' : ''}`} onClick={() => setGid(g.game_id)}>
              <span className="gs-game-t"><img src={LOGO(g.away)} alt="" width={16} height={16} />{g.away} @ {g.home}<img src={LOGO(g.home)} alt="" width={16} height={16} /></span>
              <span className="gs-game-s">{fv} {Math.round(100 * Math.max(hw, 1 - hw))}% · typ. {g.typical[1]}-{g.typical[0]}</span>
            </button>
          )
        })}
      </div>
      {loading && !sim && <p className="empty-state">Loading the simulation...</p>}
      {sim && (
        <>
          <div className="slate-status gs-sum">
            <span><strong>{(sim.n || 15000).toLocaleString('en-US')} games:</strong> {sim.away} {f1(sim.summary.away.mean)} @ {sim.home} {f1(sim.summary.home.mean)} on average
              · {fav} wins {favPct}% · median total {sim.summary.medTotal}</span>
            <span>Usual range (80% of sims): {sim.away} {sim.summary.away.p10}-{sim.summary.away.p90}, {sim.home} {sim.summary.home.p10}-{sim.summary.home.p90}</span>
            <span>Our own sim alone: {sim.away} {sim.own.away} - {sim.home} {sim.own.home}{marketTxt ? ` · market: ${marketTxt}` : ' · no market line yet, own sim only'}</span>
            {sim.frozen && <span>🔒 Locked at kickoff -- this is the pre-game simulation.</span>}
            {!sim.frozen && <span>👥 Rebuilt with every injury refresh, including the game-day inactives runs (~90 min before kickoff) -- last built {new Date(sim.generated_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.</span>}
          </div>
          <NflSimReplay sim={sim} />
          <h3 className="gs-h">📊 {(sim.n || 15000).toLocaleString('en-US')}-game box score (averages)</h3>
          <div className="gs-boxes">
            <BoxTables sim={sim} side="away" />
            <BoxTables sim={sim} side="home" />
          </div>
          <p className="meta-line small">Averages over all 15,000 games (a player's TD and yards here are the sim's; his grade, TD % and Est. Yards on
            the other pages come from the grade model, which is the official number). "Any TD" = share of the 15,000 games he scored at least once.
            Passing yards are the QB's; sacks are yards lost by the team. Updated {new Date(sim.generated_at).toLocaleString()}.</p>
        </>
      )}
    </div>
  )
}

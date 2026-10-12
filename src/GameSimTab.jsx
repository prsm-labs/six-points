import { useEffect, useMemo, useState } from 'react'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { useMatchup } from './MatchupContext.jsx'

// Click-a-matchup simulated box score -- the real v1 from PROMPT_SixPoints_GameSimulation_
// Scope.md, built after that doc's own recommended order: real team pace + real team TD-rate
// blend + real per-player touch shares, Monte Carlo'd client-side (gameSimWorker.js) the same
// way Paydirt/Yardage Lab already do. See the worker's own comment for the full model and what's
// deliberately NOT included yet (FG/PAT/D-ST scoring, drive-level sequencing).
//
// This is a real, disclosed v1, not a finished product: every input is a verified real signal
// (see matchup_engine.py's build_team_pace/build_team_scoring_and_efficiency docstrings for the
// actual validation numbers), but the simulation itself hasn't been backtested end-to-end
// against real final box scores yet -- that's the next real step before trusting the output at
// face value, same standing rule every score in this app has followed since session 1.

export default function GameSimTab() {
  const [simInputs, setSimInputs] = useState(null)
  const [schedule, setSchedule] = useState(null)
  const [matchups, setMatchups] = useState(null)
  const [teamStats, setTeamStats] = useState(null)
  const [directory, setDirectory] = useState(null)
  const [error, setError] = useState(null)
  const [selectedGameId, setSelectedGameId] = useState(null)
  const [result, setResult] = useState(null)
  const [simRunning, setSimRunning] = useState(false)
  const { selectedMatchup } = useMatchup()

  useEffect(() => {
    Promise.all([
      fetch('/data/game_sim_inputs.json').then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      }),
      fetch('/data/season_schedule.json').then((r) => r.json()),
      fetch('/data/all_matchups_latest.json').then((r) => r.json()),
      fetch('/data/team_stats.json').then((r) => (r.ok ? r.json() : {})),
      fetch('/data/players.json').then((r) => (r.ok ? r.json() : {})),
    ])
      .then(([sim, sched, mu, ts, dir]) => {
        setSimInputs(sim)
        setSchedule(sched)
        setMatchups(mu)
        setTeamStats(ts)
        setDirectory(dir)
      })
      .catch((e) => setError(e.message))
  }, [])

  const games = useMemo(() => {
    if (!schedule || !simInputs) return []
    return schedule.games.filter((g) => g.week === simInputs.week)
  }, [schedule, simInputs])

  const usageSigByPlayer = useMemo(() => {
    if (!matchups) return {}
    const map = {}
    for (const m of matchups.matchups) map[m.player_id] = m.usage_sig
    return map
  }, [matchups])

  function runSim(game) {
    if (!simInputs) return
    setSimRunning(true)
    setResult(null)
    setSelectedGameId(game.game_id)

    const buildRoster = (team) =>
      Object.entries(simInputs.players)
        .filter(([, p]) => p.team === team)
        .map(([playerId, p]) => ({
          player_id: playerId,
          ...p,
          usage_sig: usageSigByPlayer[playerId] || 0,
        }))

    const home = { teamInfo: simInputs.teams[game.home_team] || {}, players: buildRoster(game.home_team) }
    const away = { teamInfo: simInputs.teams[game.away_team] || {}, players: buildRoster(game.away_team) }

    if (!home.teamInfo.plays_per_game || !away.teamInfo.plays_per_game) {
      setError(`Missing real pace data for ${game.home_team} or ${game.away_team} -- run the pipeline once more.`)
      setSimRunning(false)
      return
    }

    const worker = new Worker(new URL('./workers/gameSimWorker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      setResult({ ...e.data, homeTeam: game.home_team, awayTeam: game.away_team })
      setSimRunning(false)
      worker.terminate()
    }
    worker.postMessage({ home, away, leagueYpc: simInputs.league_ypc, vegasTdPerPoint: simInputs.vegas_td_per_point })
  }

  // A real global matchup selection auto-runs this game's sim, so switching tabs after picking
  // a matchup elsewhere doesn't require re-selecting it here too.
  useEffect(() => {
    if (!selectedMatchup || games.length === 0) return
    const match = games.find((g) => g.home_team === selectedMatchup.home && g.away_team === selectedMatchup.away)
    if (match && match.game_id !== selectedGameId) runSim(match)
  }, [selectedMatchup, games])

  function playerName(playerId) {
    return directory?.[playerId]?.name || playerId
  }
  function playerPosition(playerId) {
    return directory?.[playerId]?.position || ''
  }

  function primaryQb(team) {
    if (!simInputs || !directory) return null
    let best = null
    let bestUsage = -1
    for (const [playerId, p] of Object.entries(simInputs.players)) {
      if (p.team !== team) continue
      if (directory[playerId]?.position !== 'QB') continue
      const usage = usageSigByPlayer[playerId] || 0
      if (usage > bestUsage) {
        bestUsage = usage
        best = playerId
      }
    }
    return best
  }

  // Market projection (2026-10-11): our own point-in-time team scoring model lost to the Vegas line
  // in all 5 held-out seasons 2021-25, so the projected score / win % shown here IS the market's,
  // converted with the real spread error (margin vs spread std 12.6 pts, 2021-25).
  function MarketLine({ homeTeam, awayTeam }) {
    const h = simInputs?.teams?.[homeTeam]
    const a = simInputs?.teams?.[awayTeam]
    if (h?.implied_total == null || a?.implied_total == null) {
      return <p className="meta-line small">No Vegas line posted for this game yet, so TD counts use each team's trailing scoring rates.</p>
    }
    const sigma = simInputs.margin_sigma || 12.6
    const z = (h.spread || 0) / sigma
    // standard normal CDF (Abramowitz-Stegun 7.1.26)
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
    const homeWin = z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf)
    const fav = (h.spread || 0) >= 0 ? homeTeam : awayTeam
    const favWin = fav === homeTeam ? homeWin : 1 - homeWin
    return (
      <div className="slate-status" style={{ marginBottom: 12 }}>
        <span><strong>Market projection:</strong> {awayTeam} {a.implied_total.toFixed(1)} @ {homeTeam} {h.implied_total.toFixed(1)}</span>
        <span>{fav} favored by {Math.abs(h.spread || 0).toFixed(1)} &middot; {fav} wins {(favWin * 100).toFixed(0)}%</span>
        <span>
          Projected TDs (drive the sim below): {awayTeam} {result?.away?.team?.td_mean ?? '…'}, {homeTeam} {result?.home?.team?.td_mean ?? '…'}
        </span>
      </div>
    )
  }

  function ResultTable({ team, side }) {
    if (!result) return null
    const rows = result[side].players
    const qbId = primaryQb(team)
    const t = result[side].team
    return (
      <div style={{ flex: '1 1 340px', minWidth: 300 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          <button className="team-link" onClick={() => openTeamSlide({ team })}>{team}</button>
        </div>
        <p className="meta-line small" style={{ margin: '0 0 8px' }}>
          Projected {t.mean_plays} plays ({t.mean_pass_plays} pass) &middot; team passing
          {qbId && <> ({playerName(qbId)})</>}: {t.mean_completions}/{t.mean_pass_plays}, {t.mean_pass_yards} yds,
          {' '}{t.mean_sacks} sacks taken
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="sticky-col">Player</th>
                <th>Pos</th>
                <th>Car</th>
                <th>Rush Yd</th>
                <th>Tgt</th>
                <th>Rec</th>
                <th>Rec Yd</th>
                <th>TD%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.player_id}>
                  <td className="sticky-col">
                    <div className="player-cell" onClick={() => openPlayerSlide({ player_id: r.player_id, player_name: playerName(r.player_id), team, position: playerPosition(r.player_id) })}>
                      <PlayerAvatar playerId={r.player_id} name={playerName(r.player_id)} />
                      {playerName(r.player_id)}
                    </div>
                  </td>
                  <td>{playerPosition(r.player_id)}</td>
                  <td>{r.carries || '—'}</td>
                  <td>{r.rush_yards || '—'}</td>
                  <td>{r.targets || '—'}</td>
                  <td>{r.receptions || '—'}</td>
                  <td>{r.rec_yards || '—'}</td>
                  <td className={r.td_pct >= 40 ? 'zone-score' : undefined}>{r.td_pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <p className="empty-state">
        No game simulation data yet ({error}). Run <code>python matchup_engine.py --season 2026</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!simInputs || !schedule) return <p className="empty-state">Loading...</p>

  return (
    <div>
      <p className="meta-line">
        Week {simInputs.week} &middot; click a matchup for a Monte Carlo projected box score (3,000
        iterations: team pace, per-player touch shares, and a team TD count driven by the Vegas
        implied total) &middot; backtested 2023-2025: the Vegas-driven TD count beat the old
        trailing-rate one in every season, and the projected score / win % come straight from the
        market because our own team model lost to it in all 5 seasons tested &middot; still no
        field goals, PATs, defense/special-teams scoring or drive sequencing in the box score
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {games.map((g) => (
          <button
            key={g.game_id}
            className={selectedGameId === g.game_id ? 'active' : ''}
            style={{ padding: '8px 14px' }}
            onClick={() => runSim(g)}
          >
            {g.away_team} @ {g.home_team}
          </button>
        ))}
      </div>

      {simRunning && <p className="empty-state">Simulating...</p>}
      {result && <MarketLine homeTeam={result.homeTeam} awayTeam={result.awayTeam} />}
      {result && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <ResultTable team={result.awayTeam} side="away" />
          <ResultTable team={result.homeTeam} side="home" />
        </div>
      )}
    </div>
  )
}

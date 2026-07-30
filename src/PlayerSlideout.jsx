import { useEffect, useMemo, useState } from 'react'
import { subscribePlayerSlide, closePlayerSlide, openTeamSlide } from './slideouts.js'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import L7Chart, { defaultCategory } from './L7Chart.jsx'
import GameLogTable from './GameLogTable.jsx'

// Section order per spec §3: header, season stat line, matchup context, L7 chart, recent game
// log, vs-opponent history. A picks button and dot timeline are explicitly skipped per spec
// §3/§8 -- no picks system exists yet, and the dot timeline is optional.

function seasonTotals(games, position) {
  const sum = (key) => games.reduce((a, g) => a + (g[key] || 0), 0)
  if (position === 'QB') {
    const att = sum('pass_att')
    const cmp = sum('pass_cmp')
    return [
      { label: 'Comp/Att', value: `${cmp}/${att}` },
      { label: 'Pass Yds', value: sum('pass_yards') },
      { label: 'Pass TD', value: sum('pass_td') },
      { label: 'INT', value: sum('interceptions') },
      { label: 'Rush Yds', value: sum('rush_yards') },
      { label: 'Rush TD', value: sum('rush_td') },
    ]
  }
  if (position === 'RB') {
    return [
      { label: 'Carries', value: sum('rush_att') },
      { label: 'Rush Yds', value: sum('rush_yards') },
      { label: 'Rush TD', value: sum('rush_td') },
      { label: 'Receptions', value: sum('receptions') },
      { label: 'Rec Yds', value: sum('rec_yards') },
      { label: 'Rec TD', value: sum('rec_td') },
    ]
  }
  // WR/TE
  const targets = sum('targets')
  const receptions = sum('receptions')
  const recYards = sum('rec_yards')
  return [
    { label: 'Targets', value: targets },
    { label: 'Receptions', value: receptions },
    { label: 'Rec Yds', value: recYards },
    { label: 'Rec TD', value: sum('rec_td') },
    { label: 'Yds/Catch', value: receptions ? (recYards / receptions).toFixed(1) : '0.0' },
  ]
}

export default function PlayerSlideout() {
  const [player, setPlayer] = useState(null)
  const [gameLog, setGameLog] = useState(null)
  const [directoryEntry, setDirectoryEntry] = useState(null)

  useEffect(() => subscribePlayerSlide(setPlayer), [])

  useEffect(() => {
    if (!player) return
    setGameLog(null)
    Promise.all([
      fetch('/data/player_game_logs.json').then((r) => (r.ok ? r.json() : {})),
      fetch('/data/players.json').then((r) => (r.ok ? r.json() : {})),
    ]).then(([logs, directory]) => {
      setGameLog(logs[player.player_id] || [])
      setDirectoryEntry(directory[player.player_id] || null)
    })
  }, [player?.player_id])

  const vsOpponent = useMemo(() => {
    if (!gameLog || !player?.opponent) return []
    return gameLog.filter((g) => g.opponent === player.opponent)
  }, [gameLog, player])

  if (!player) return null

  const name = player.player_name || directoryEntry?.name || ''
  const position = player.position || directoryEntry?.position || ''
  const recentTargets = gameLog && gameLog.length ? gameLog.slice(-3).reduce((a, g) => a + g.targets, 0) / Math.min(3, gameLog.length) : 0

  return (
    <>
      <div className="slideout-backdrop" onClick={closePlayerSlide} />
      <div className="slideout-panel">
        <div className="slideout-header">
          <PlayerAvatar playerId={player.player_id} name={name} />
          <div className="slideout-header-info">
            <h2>{name}</h2>
            <div className="sub">
              {position} &middot;{' '}
              <button className="team-link" onClick={() => player.team && openTeamSlide({ team: player.team })}>
                {player.team}
              </button>
            </div>
            {directoryEntry?.stats_url && (
              <a href={directoryEntry.stats_url} target="_blank" rel="noopener noreferrer" className="external-link">
                View on ESPN &rarr;
              </a>
            )}
          </div>
          <button className="slideout-close" onClick={closePlayerSlide} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="slideout-body">
          {!gameLog ? (
            <p className="empty-state">Loading...</p>
          ) : (
            <>
              <div className="slideout-section">
                <h3>2025 Season</h3>
                <div className="stat-grid">
                  {seasonTotals(gameLog, position).map((s) => (
                    <div className="stat-tile" key={s.label}>
                      <div className="value">{s.value}</div>
                      <div className="label">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {player.opponent && (
                <div className="slideout-section">
                  <h3>This Week's Matchup</h3>
                  <p className="meta-line">
                    {player.home_or_away === '@' ? '@' : 'vs'} {player.opponent}
                    {player.opp_def_rank_pct != null && (
                      <> &middot; opponent defense ranks in the {Math.round(player.opp_def_rank_pct)}th
                        percentile of yards allowed vs {position === 'RB' ? 'RB' : 'WR'} (higher = weaker
                        defense, better matchup)</>
                    )}
                    {player.script_component != null && (
                      <> &middot; game-script component {Number(player.script_component).toFixed(1)}
                        (Vegas-implied, 50 = neutral)</>
                    )}
                  </p>
                </div>
              )}

              <div className="slideout-section">
                <h3>Last 7 Games</h3>
                <L7Chart
                  gameLog={gameLog}
                  position={position}
                  initialCategory={defaultCategory(position, recentTargets)}
                />
              </div>

              <div className="slideout-section">
                <h3>Recent Game Log</h3>
                <GameLogTable games={gameLog} />
              </div>

              {player.opponent && (
                <div className="slideout-section">
                  <h3>Vs. {player.opponent} (season)</h3>
                  {vsOpponent.length === 0 ? (
                    <p className="empty-state">No games played against {player.opponent} yet this season.</p>
                  ) : (
                    <>
                      {vsOpponent.length <= 2 && (
                        <p className="meta-line small">
                          Only {vsOpponent.length} game{vsOpponent.length > 1 ? 's' : ''} of history against this
                          specific opponent -- treat this as a curiosity, not a signal.
                        </p>
                      )}
                      <GameLogTable games={vsOpponent} />
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

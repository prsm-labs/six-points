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

// Scheme Fit grade tiles -- real per-player man/zone/blitz performance splits, requested
// directly against Going Yard's own "Arsenal Fit." See matchup_engine.py's
// compute_player_scheme_splits() docstring for the real derivation and the disclosed A+/A/B/C/D
// tier convention (Going Yard itself doesn't use letter grades for this -- verified in its real
// source -- so this scale is this app's own, not a port).
const SPLIT_LABELS = { man: 'vs Man', zone: 'vs Zone', blitz: 'vs Blitz', no_blitz: 'vs No Blitz' }

function SchemeFitSection({ splits, sourceIsPrior, position }) {
  if (!splits) return null
  const order = ['man', 'zone', 'blitz', 'no_blitz']
  const present = order.filter((k) => splits[k])
  if (present.length === 0) return null
  return (
    <div className="slideout-section">
      <h3>Scheme Fit</h3>
      <p className="meta-line small" style={{ margin: '0 0 8px' }}>
        Real {sourceIsPrior ? '2025 season' : 'season-to-date'} performance split by coverage/pass-rush
        look, graded by percentile vs. other {position}s in that same split (A+ = top 10%, D = bottom
        25%) &middot; not a prediction -- a real historical tendency
      </p>
      <div className="stat-grid">
        {present.map((k) => (
          <div className="stat-tile" key={k}>
            <div className="value">{splits[k].grade}</div>
            <div className="label">
              {SPLIT_LABELS[k]}
              <div className="meta-line small" style={{ margin: '2px 0 0' }}>
                {(splits[k].td_rate * 100).toFixed(1)}% TD/play &middot; {splits[k].ypt} yd/play &middot; n={splits[k].plays}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PlayerSlideout() {
  const [player, setPlayer] = useState(null)
  const [gameLog, setGameLog] = useState(null)
  const [directoryEntry, setDirectoryEntry] = useState(null)
  const [schemeSplits, setSchemeSplits] = useState(null)

  useEffect(() => subscribePlayerSlide(setPlayer), [])

  useEffect(() => {
    if (!player) return
    setGameLog(null)
    Promise.all([
      fetch('/data/player_game_logs.json').then((r) => (r.ok ? r.json() : {})),
      fetch('/data/players.json').then((r) => (r.ok ? r.json() : {})),
      fetch('/data/scheme_splits.json').then((r) => (r.ok ? r.json() : null)),
    ]).then(([logs, directory, scheme]) => {
      setGameLog(logs[player.player_id] || [])
      setDirectoryEntry(directory[player.player_id] || null)
      setSchemeSplits(scheme)
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

              <SchemeFitSection
                splits={schemeSplits?.splits?.[player.player_id]}
                sourceIsPrior={schemeSplits?.source_is_prior_season}
                position={position}
              />

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

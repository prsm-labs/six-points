import { useEffect, useMemo, useState } from 'react'
import { subscribePlayerSlide, closePlayerSlide, openTeamSlide } from './slideouts.js'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import L7Chart, { defaultCategory } from './L7Chart.jsx'
import GameLogTable from './GameLogTable.jsx'
import PickButton from './PickButton.jsx'
import { BreakoutBadge, fmtPct, GradeBadge, LiveStatusTag } from './gradeUi.jsx'
import { DepthTag, MatchupCell, fmtYds, leakSummary, muTier, roleSummary } from './matchupUi.jsx'
import { loadSlate } from './slate.js'
import { DVP_NOTE, ROLE_NOTE, matchupText, whoScoresText } from './gradeUi.jsx'
import { AllBookLinks, StatePicker } from './BetLink.jsx'
import { edgeClass, edgeText, fmtEdge } from './bookOdds.js'
import GamblyButton from './GamblyButton.jsx'
import { betLine } from './gambly.js'
import { HotHandTag } from './revampUi.jsx'

// Section order per spec §3: header, season stat line, matchup context, L7 chart, recent game
// log, vs-opponent history. The dot timeline is skipped per spec
// §3/§8 -- the dot timeline is optional. (Picks button added 2026-10-11 with My Picks, picks.js.)

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

// Route Profile -- real official NFL Next Gen Stats (own separation/cushion, not a split vs.
// this game's specific opponent -- that per-opponent blend lives in ScoutingTab's Route Edge
// card, which also has the defense side). This is the player's own season-to-date real
// route-running signal, same spirit as Scheme Fit but WR/TE only (see matchup_engine.py's
// build_route_profiles docstring: NGS receiving doesn't track RBs at all, and RB rushing
// efficiency isn't a stable real per-player skill at available sample sizes -- so RBs
// deliberately get nothing here rather than an invented grade).
function RouteProfileSection({ profile, position }) {
  if ((position !== 'WR' && position !== 'TE') || !profile) return null
  return (
    <div className="slideout-section">
      <h3>Route Profile</h3>
      <p className="meta-line small" style={{ margin: '0 0 8px' }}>
        Real NFL Next Gen Stats, season-to-date &middot; graded by percentile vs. other {position}s
        on average separation &middot; real-validated to predict this player's own future catch
        rate, NOT touchdown probability
      </p>
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="value">{profile.grade}</div>
          <div className="label">
            Separation
            <div className="meta-line small" style={{ margin: '2px 0 0' }}>
              {profile.avg_separation} yds avg &middot; n={profile.targets} targets
            </div>
          </div>
        </div>
        <div className="stat-tile">
          <div className="value">{(profile.catch_pct * 100).toFixed(0)}%</div>
          <div className="label">
            Catch Rate
            <div className="meta-line small" style={{ margin: '2px 0 0' }}>
              {profile.avg_cushion} yds avg cushion given
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PlayerSlideout() {
  const [player, setPlayer] = useState(null)
  const [gameLog, setGameLog] = useState(null)
  const [directoryEntry, setDirectoryEntry] = useState(null)
  const [schemeSplits, setSchemeSplits] = useState(null)
  const [routeProfiles, setRouteProfiles] = useState(null)
  const [weekRow, setWeekRow] = useState(null)

  useEffect(() => subscribePlayerSlide(setPlayer), [])

  useEffect(() => {
    if (!player) return
    setGameLog(null)
    Promise.all([
      fetch('/data/player_game_logs.json').then((r) => (r.ok ? r.json() : {})),
      fetch('/data/players.json').then((r) => (r.ok ? r.json() : {})),
      fetch('/data/scheme_splits.json').then((r) => (r.ok ? r.json() : null)),
      fetch('/data/route_profiles.json').then((r) => (r.ok ? r.json() : null)),
      loadSlate(), // 2026-10-18: the shared slate (book odds, edge, hot hand merged in)
    ]).then(([logs, directory, scheme, routes, latest]) => {
      // this week's grade-model row, so the header shows it (and picks save it) from any tab
      setWeekRow(latest?.matchups?.find((m) => m.player_id === player.player_id) || null)
      setGameLog(logs[player.player_id] || [])
      setDirectoryEntry(directory[player.player_id] || null)
      setSchemeSplits(scheme)
      setRouteProfiles(routes)
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
              {position}<DepthTag m={weekRow || player} /> &middot;{' '}
              <button className="team-link" onClick={() => player.team && openTeamSlide({ team: player.team })}>
                {player.team}
              </button>
            </div>
            {weekRow?.grade && (
              <div className="sub slideout-grade">
                Week {weekRow.week}: <GradeBadge grade={weekRow.grade} m={weekRow} /> TD {fmtPct(weekRow.p_td)}
                {weekRow.p_td2 != null && <> &middot; 2+ TDs {fmtPct(weekRow.p_td2)}</>} &middot; 100+ {fmtPct(weekRow.p_100)}
                {' '}<BreakoutBadge m={weekRow} /> <HotHandTag m={weekRow} /> <LiveStatusTag m={weekRow} />
              </div>
            )}
            {(weekRow || player.player_id) && (
              <div style={{ margin: '4px 0' }}><PickButton player={weekRow || player} /></div>
            )}
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
              {weekRow && (
                // This week (2026-10-18 revamp, Slap Shot's slideout): the model's chances, the matchup line,
                // recent TDs, every sportsbook's anytime-TD price (tap to bet) and Gambly for each prop.
                <div className="slideout-section">
                  <h3>Week {weekRow.week} vs {weekRow.opponent}</h3>
                  <div className="slideout-lines">
                    <div>Model: TD {fmtPct(weekRow.p_td, 1)}{weekRow.p_td2 != null && <> · 2+ TDs {fmtPct(weekRow.p_td2, 1)}</>} · 100+ yds {fmtPct(weekRow.p_100, 1)}{weekRow.est_yards != null && <> · est. {Math.round(weekRow.est_yards)} yds</>}</div>
                    {matchupText(weekRow) && <div title={DVP_NOTE}>{matchupText(weekRow)} <span className="meta-line small">(the defense factor in the grade)</span></div>}
                    {whoScoresText(weekRow) && <div title={ROLE_NOTE}>{whoScoresText(weekRow)} <span className="meta-line small">(context — not in the grade)</span></div>}
                    {weekRow.td_l3 != null && <div>TDs in his last 3 games: {weekRow.td_l3} (last game {weekRow.td_last ?? 0}){weekRow.hotHand ? ' · 🔥 hot hand outside the top 25%' : ''}</div>}
                    <div>Anytime TD: <AllBookLinks book={weekRow.book} /> <StatePicker /></div>
                    {weekRow.edge != null && <div title={edgeText(weekRow)}>Edge vs best price: <span className={edgeClass(weekRow.edge)}>{fmtEdge(weekRow.edge)} pts</span> <span className="meta-line small">(context — not in the grade)</span></div>}
                    <div className="slideout-gambly">Send to Gambly:
                      <GamblyButton compact={false} label="Anytime TD" text={betLine(weekRow, 'td')} />
                      <GamblyButton compact={false} label="2+ TDs" text={betLine(weekRow, 'td2')} />
                      <GamblyButton compact={false} label="First TD" text={betLine(weekRow, 'first')} />
                      {weekRow.position !== 'QB' && <GamblyButton compact={false} label="100+ yds" text={betLine(weekRow, 'yds100')} />}
                    </div>
                  </div>
                </div>
              )}
              <div className="slideout-section">
                <h3>{player.season ? `${player.season} Season` : 'Season to date'}</h3>
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
                    {player.mu_pct != null ? (
                      <> &middot; <MatchupCell m={player} /> {muTier(player)?.toLowerCase()} matchup for his role
                        ({Math.round(player.mu_pct)}th percentile vs {player.position}s this week)
                        {player.est_yards != null && <> &middot; Est. Yards {Number(player.est_yards).toFixed(0)}
                          {' '}({fmtYds(player.mu_yds)} from the matchup)</>}</>
                    ) : player.opp_def_rank_pct != null && (
                      <> &middot; opponent defense ranks in the {Math.round(player.opp_def_rank_pct)}th
                        percentile of yards allowed vs {position === 'RB' ? 'RB' : 'WR'} (higher = weaker
                        defense, better matchup)</>
                    )}
                    {player.script_component != null && (
                      <> &middot; game-script component {Number(player.script_component).toFixed(1)}
                        (Vegas-implied, 50 = neutral)</>
                    )}
                  </p>
                  {player.mu_pct != null && <p className="meta-line small">{leakSummary(player)}.</p>}
                  {roleSummary(player) && <p className="meta-line small">{roleSummary(player)}.</p>}
                </div>
              )}

              <SchemeFitSection
                splits={schemeSplits?.splits?.[player.player_id]}
                sourceIsPrior={schemeSplits?.source_is_prior_season}
                position={position}
              />

              <RouteProfileSection
                profile={routeProfiles?.players?.[player.player_id]}
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

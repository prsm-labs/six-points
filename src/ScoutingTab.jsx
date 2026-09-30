import { useEffect, useMemo, useState } from 'react'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import GameLogTable from './GameLogTable.jsx'
import { openTeamSlide } from './slideouts.js'
import { useMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'

// Player-vs-Defense matchup analysis. Originally built (2026-07-30) leading with literal
// head-to-head history -- redesigned 2026-09-28 per direct user feedback: literal history is
// "somewhat irrelevant if they've never faced them or if the defense changed," and a player/
// opponent who've never met produced an empty page with nothing else to say. History is now a
// secondary reference section; the lead is a real, computed Matchup Edge Score.
//
// Edge Score is NOT a port of anything -- it's this app's own disclosed blend of two already-
// validated real signals, computed client-side from data both already exported for other tabs:
// - Scheme Fit (matchup_engine.py's compute_player_scheme_splits, powers PlayerSlideout's own
//   Scheme Fit section): the player's own real td_rate-based percentile (0-1) within their
//   position, split by man coverage / zone coverage (receivers only) and blitz / no-blitz
//   (every pass-play participant including QBs). Min 8-play real sample per split, or the split
//   is simply absent -- no invented number fills the gap.
// - Defense Profile (build_defense_profile): the opponent's own real zone_rate/man_rate/
//   blitz_rate this season.
// edgeScore = the player's percentile in each split, WEIGHTED by how often this specific real
// opponent actually plays that style -- e.g. a player who's elite vs. man (pct 0.95) gets no
// credit for it against a defense that plays 85% zone; a player who's merely average vs. zone
// (pct 0.55) gets full weight if the opponent plays zone 85% of the time. This is a real,
// disclosed "does this player's own demonstrated style-specific performance line up with what
// THIS opponent actually does," not a prediction and not a port of Going Yard's Arsenal
// Fit/Hand Match (that's pitcher-handedness-specific; football's real analogue -- coverage
// scheme + pressure -- is architecturally different, so this is this app's own convention).
//
// Explicitly not built: a true coverage-scheme matchup (which defender covers which receiver)
// -- no per-route/per-receiver assignment data source has been identified, same real gap
// PairsPage already discloses. QBs get a blitz-only edge score (real, well-defined) -- man/zone
// splits are receiving-only by definition, so there's no real per-QB coverage-type signal to
// blend in without inventing one.
//
// Route Edge (added 2026-09-30, after the user pointed out a real breakout the app's usage-only
// grading had missed -- a receiver whose real route-running was winning against a defense
// playing real loose coverage, invisible anywhere in this app until now) -- real official NFL
// Next Gen Stats (matchup_engine.py's build_route_profiles/build_run_funnel_profile, see their
// own docstrings for the full validation). Kept as its own separate card, NOT folded into the
// Matchup Edge Score above, because it measures a genuinely different thing: real-validated
// against the full 2025 season, a player's own trailing route-running separation predicts their
// OWN future catch rate (real signal, corr 0.184) but does NOT add real incremental touchdown-
// predictive value beyond raw target volume (t=-1.44, not significant) -- so Route Edge is
// framed honestly as a catch-volume/efficiency signal, not a scoring-probability one, unlike the
// td_rate-based Matchup Edge Score above.
//
// RBs get NO individual route/rushing-skill grade -- real check first: a runner's own trailing
// per-touch NGS efficiency (rush_yards_over_expected_per_att) does NOT persist week to week
// (corr -0.058, essentially noise) at real available sample sizes, unlike a receiver's own real
// separation skill (corr 0.315). Grading individual RBs on this would present noise as a
// confident-looking letter grade -- the real, validated signal for RBs is DEFENSE-side only
// (Run Funnel: box_rate_allowed real+strongly persistent at corr 0.443, ryoe_allowed real but
// weaker at corr 0.185), shown in the Defense Profile card below instead.

const SPLIT_LABEL = { man: 'vs Man', zone: 'vs Zone', blitz: 'vs Blitz', no_blitz: 'vs No Blitz' }

function edgeLabel(score) {
  if (score == null) return null
  if (score >= 70) return { text: 'Strong Edge', cls: 'tier-lock' }
  if (score >= 58) return { text: 'Slight Edge', cls: 'tier-lean' }
  if (score >= 42) return { text: 'Even Matchup', cls: 'tier-fringe' }
  return { text: 'Tough Matchup', cls: 'tier-fade' }
}

// Returns { score (0-100), components: [{label, weight, pct}] } or null if neither real
// component (coverage or blitz) has a qualifying sample for this player.
function computeEdgeScore(position, splits, defenseProfile) {
  if (!splits || !defenseProfile) return null
  const components = []
  if (position !== 'QB' && (splits.man || splits.zone)) {
    const manPct = splits.man?.pct
    const zonePct = splits.zone?.pct
    if (manPct != null) components.push({ label: 'vs Man', weight: defenseProfile.man_rate, pct: manPct })
    if (zonePct != null) components.push({ label: 'vs Zone', weight: defenseProfile.zone_rate, pct: zonePct })
  }
  if (splits.blitz || splits.no_blitz) {
    const blitzPct = splits.blitz?.pct
    const noBlitzPct = splits.no_blitz?.pct
    if (blitzPct != null) components.push({ label: 'vs Blitz', weight: defenseProfile.blitz_rate, pct: blitzPct })
    if (noBlitzPct != null) components.push({ label: 'vs No Blitz', weight: 1 - defenseProfile.blitz_rate, pct: noBlitzPct })
  }
  if (!components.length) return null
  const totalWeight = components.reduce((a, c) => a + c.weight, 0)
  if (totalWeight <= 0) return null
  const score = components.reduce((a, c) => a + c.weight * c.pct, 0) / totalWeight
  return { score: score * 100, components }
}

const TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND',
  'JAX', 'KC', 'LA', 'LAC', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA',
  'SF', 'TB', 'TEN', 'WAS',
]

function pct(x) {
  return x == null ? '—' : `${(x * 100).toFixed(1)}%`
}

function DefenseProfileCard({ team, profile }) {
  if (!profile) return <p className="empty-state">No defense profile for {team} yet.</p>
  return (
    <div className="weather-card">
      <div className="weather-card-header">
        <div>
          <strong>{team}</strong> defense profile
        </div>
        <div className="meta-line" style={{ margin: 0 }}>
          {profile.style_tags.join(' · ') || 'No strong tendencies'}
        </div>
      </div>
      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table>
          <tbody>
            <tr>
              <td>Coverage mix</td>
              <td>{pct(profile.zone_rate)} zone / {pct(profile.man_rate)} man</td>
            </tr>
            <tr>
              <td>Blitz rate (5+ rushers)</td>
              <td>{pct(profile.blitz_rate)} (#{profile.blitz_rank} blitziest of 32)</td>
            </tr>
            <tr>
              <td>Pressure rate</td>
              <td>{pct(profile.pressure_rate)} (#{profile.pressure_rank} of 32)</td>
            </tr>
            <tr>
              <td>Explosive pass allowed (20+ yd)</td>
              <td>{pct(profile.explosive_pass_rate_allowed)}</td>
            </tr>
            <tr>
              <td>Explosive rush allowed (15+ yd)</td>
              <td>{pct(profile.explosive_rush_rate_allowed)}</td>
            </tr>
            <tr>
              <td>Overall explosive rate allowed</td>
              <td>
                {pct(profile.explosive_rate_allowed)} &middot; #{profile.explosive_rate_allowed_rank} of 32
                stingiest &middot; tier: <strong>{profile.explosive_tier}</strong>
              </td>
            </tr>
            {profile.coverage_tightness && (
              <tr>
                <td>Cushion allowed (NGS)</td>
                <td>
                  {profile.coverage_tightness.cushion_allowed.toFixed(2)} yds &middot; #{profile.coverage_tightness.cushion_allowed_rank} of 32 loosest
                  {profile.coverage_tightness.tag && <> &middot; <strong>{profile.coverage_tightness.tag}</strong></>}
                </td>
              </tr>
            )}
            {profile.run_funnel && (
              <tr>
                <td>Run funnel (NGS)</td>
                <td>
                  {(profile.run_funnel.box_rate_allowed * 100).toFixed(1)}% 8+ box &middot; RYOE allowed{' '}
                  {profile.run_funnel.ryoe_allowed >= 0 ? '+' : ''}{profile.run_funnel.ryoe_allowed.toFixed(2)}/att
                  {profile.run_funnel.tags.length > 0 && <> &middot; <strong>{profile.run_funnel.tags.join(', ')}</strong></>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Returns { score (0-100), separationPct, cushionAllowed, cushionTag } or null if no qualifying
// real sample exists (min 10 trailing targets for the player, per build_route_profiles).
function computeRouteEdge(position, routeProfile, coverageTightness) {
  if (position !== 'WR' && position !== 'TE') return null
  if (!routeProfile || !coverageTightness) return null
  // Both are real 0-1-ish inputs on the same "higher = more separation-friendly" direction:
  // the player's own separation percentile, and how loose this defense's coverage tends to be
  // (its own rank inverted to a 0-1 scale, 32 teams).
  const cushionPct = 1 - (coverageTightness.cushion_allowed_rank - 1) / 31
  const score = (routeProfile.pct * 0.6 + cushionPct * 0.4) * 100
  return { score, separationPct: routeProfile.pct, cushionAllowed: coverageTightness.cushion_allowed, cushionTag: coverageTightness.tag }
}

function RouteEdgeCard({ playerName, opponent, position, routeEdge, hasRouteProfile }) {
  if (position !== 'WR' && position !== 'TE') {
    return (
      <p className="meta-line">
        No individual route/rushing-skill grade for {position || 'this position'} -- real check
        found a runner's own per-touch NGS efficiency isn't a stable enough real signal to grade
        (see the Defense Profile's real Run Funnel numbers above instead for the run-game side of
        this matchup).
      </p>
    )
  }
  if (!routeEdge) {
    return (
      <p className="empty-state">
        {hasRouteProfile === false
          ? `Not enough real trailing target sample (min 10) for ${playerName} yet.`
          : `No real NGS coverage-tightness data for ${opponent} yet.`}
      </p>
    )
  }
  const label = edgeLabel(routeEdge.score)
  return (
    <div className="weather-card">
      <div className="weather-card-header">
        <div>
          <strong>{playerName}</strong> Route Edge vs <strong>{opponent}</strong>
        </div>
        <span className={`tier ${label.cls}`}>{label.text}</span>
      </div>
      <p className="meta-line" style={{ margin: '4px 0 0' }}>
        Route Edge {routeEdge.score.toFixed(0)}/100 -- {playerName}'s real separation percentile
        ({(routeEdge.separationPct * 100).toFixed(0)}th at position) blended with how much real
        cushion {opponent} tends to give receivers ({routeEdge.cushionAllowed.toFixed(2)} yds
        {routeEdge.cushionTag && <>, <strong>{routeEdge.cushionTag}</strong></>}). This predicts
        real catch volume/efficiency, NOT touchdown probability -- validated separately, that's
        what the Matchup Edge Score above is for.
      </p>
    </div>
  )
}

function EdgeScoreCard({ playerName, opponent, position, edge }) {
  if (!edge) {
    return (
      <p className="empty-state">
        Not enough real per-play sample (min 8 plays per split) for {playerName} yet to compute a
        Matchup Edge Score.
      </p>
    )
  }
  const label = edgeLabel(edge.score)
  return (
    <div className="weather-card">
      <div className="weather-card-header">
        <div>
          <strong>{playerName}</strong> vs <strong>{opponent}</strong> Matchup Edge
        </div>
        <span className={`tier ${label.cls}`}>{label.text}</span>
      </div>
      <p className="meta-line" style={{ margin: '4px 0 10px' }}>
        Edge Score {edge.score.toFixed(0)}/100 -- {playerName}'s own real style-specific
        percentile (min 8-play sample, graded within position), weighted by how often {opponent}
        actually plays each style this season. Not a prediction -- a real "does this player's
        demonstrated strength match what this opponent does" read.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Style</th>
              <th>{opponent}'s real usage</th>
              <th>{playerName}'s real percentile</th>
            </tr>
          </thead>
          <tbody>
            {edge.components.map((c) => (
              <tr key={c.label}>
                <td>{c.label}</td>
                <td>{pct(c.weight)}</td>
                <td>{pct(c.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ScoutingTab() {
  const [gameLogs, setGameLogs] = useState(null)
  const [directory, setDirectory] = useState(null)
  const [teamStats, setTeamStats] = useState(null)
  const [situationalSplits, setSituationalSplits] = useState(null)
  const [schemeSplits, setSchemeSplits] = useState(null)
  const [routeProfiles, setRouteProfiles] = useState(null)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)
  const [opponent, setOpponent] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/data/player_game_logs.json').then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      }),
      fetch('/data/players.json').then((r) => (r.ok ? r.json() : {})),
      fetch('/data/team_stats.json').then((r) => (r.ok ? r.json() : {})),
      fetch('/data/player_situational_splits.json').then((r) => (r.ok ? r.json() : {})),
      fetch('/data/scheme_splits.json').then((r) => (r.ok ? r.json() : { splits: {} })),
      fetch('/data/route_profiles.json').then((r) => (r.ok ? r.json() : { players: {} })),
    ])
      .then(([logs, dir, stats, splits, scheme, routes]) => {
        setGameLogs(logs)
        setDirectory(dir)
        setTeamStats(stats)
        setSituationalSplits(splits)
        setSchemeSplits(scheme.splits || {})
        setRouteProfiles(routes.players || {})
      })
      .catch((e) => setError(e.message))
  }, [])

  const matches = useMemo(() => {
    if (!directory || !search.trim()) return []
    const q = search.toLowerCase()
    return Object.entries(directory)
      .filter(([, p]) => p.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [directory, search])

  const selectedPlayer = selectedPlayerId ? directory?.[selectedPlayerId] : null
  const games = selectedPlayerId ? gameLogs?.[selectedPlayerId] || [] : []

  // This tool is fundamentally single-player-vs-single-opponent, so "select both teams" can't
  // mean the same "filter the whole table" thing it does elsewhere -- the closest real
  // equivalent: auto-set Opponent to whichever of the two selected-matchup teams the current
  // player DOESN'T play for (using their most recent real game log entry for team, since the
  // player directory itself doesn't carry a team field), or to one side of the matchup if no
  // player is picked yet.
  const { selectedMatchup } = useMatchup()
  useEffect(() => {
    if (!selectedMatchup) return
    const playerTeam = games.length ? games[games.length - 1].team : null
    if (playerTeam === selectedMatchup.home) setOpponent(selectedMatchup.away)
    else if (playerTeam === selectedMatchup.away) setOpponent(selectedMatchup.home)
    else setOpponent(selectedMatchup.home)
  }, [selectedMatchup, selectedPlayerId])
  const vsOpponent = useMemo(
    () => (opponent ? games.filter((g) => g.opponent === opponent) : []),
    [games, opponent]
  )

  const opponentProfile = opponent ? teamStats?.[opponent]?.defense_profile : null
  const playerSchemeSplits = selectedPlayerId ? schemeSplits?.[selectedPlayerId] : null
  const edge = useMemo(
    () => computeEdgeScore(selectedPlayer?.position, playerSchemeSplits, opponentProfile),
    [selectedPlayer, playerSchemeSplits, opponentProfile]
  )
  const playerRouteProfile = selectedPlayerId ? routeProfiles?.[selectedPlayerId] : null
  const routeEdge = useMemo(
    () => computeRouteEdge(selectedPlayer?.position, playerRouteProfile, opponentProfile?.coverage_tightness),
    [selectedPlayer, playerRouteProfile, opponentProfile]
  )
  const explosiveTouch = selectedPlayerId ? situationalSplits?.[selectedPlayerId]?.touches?.explosive : null
  const explosivePass = selectedPlayerId ? situationalSplits?.[selectedPlayerId]?.passing?.explosive : null

  // League-average explosive-play rate for context (min 20 touches so backups with 2 carries
  // don't distort it) -- computed client-side from the same real per-player rates rather than
  // recomputing in Python, since this is display-only context, not something else consumes.
  const leagueAvgExplosive = useMemo(() => {
    if (!situationalSplits) return null
    const rates = Object.values(situationalSplits)
      .map((s) => s.touches?.explosive)
      .filter((e) => e && e.plays >= 20)
      .map((e) => e.rate)
    if (!rates.length) return null
    return rates.reduce((a, b) => a + b, 0) / rates.length
  }, [situationalSplits])

  const similarTierGames = useMemo(() => {
    if (!opponentProfile || !teamStats) return []
    return games.filter((g) => teamStats[g.opponent]?.defense_profile?.explosive_tier === opponentProfile.explosive_tier)
  }, [games, opponentProfile, teamStats])

  const similarTierSummary = useMemo(() => {
    if (!similarTierGames.length) return null
    const totalYards = similarTierGames.reduce((a, g) => a + (g.rush_yards || 0) + (g.rec_yards || 0) + (g.pass_yards || 0), 0)
    const totalTds = similarTierGames.reduce((a, g) => a + (g.any_td || 0), 0)
    return {
      games: similarTierGames.length,
      totalYards,
      totalTds,
      yardsPerGame: totalYards / similarTierGames.length,
      tdsPerGame: totalTds / similarTierGames.length,
    }
  }, [similarTierGames])

  if (error) {
    return (
      <p className="empty-state">
        No player data yet ({error}). Run <code>python matchup_engine.py --season 2025 --backtest</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!gameLogs || !directory) return <p className="empty-state">Loading...</p>

  return (
    <div>
      <MatchupFilterNote message={selectedMatchup && `Opponent auto-set to ${opponent} from the global matchup selection (${selectedMatchup.away} @ ${selectedMatchup.home})`} />
      <p className="meta-line">
        Pick any player and any opponent: a real computed Matchup Edge Score (the player's own
        real style-specific performance weighted by what this opponent actually does), the
        opponent's full real defense style (coverage mix, blitz/pressure rate, explosive-play
        rate allowed), and the player's own explosiveness -- literal head-to-head history is
        further down, clearly flagged when it's too small a sample to mean much (or nonexistent,
        if these two haven't played yet or the defense has changed since they last did)
      </p>

      <div className="calc-block" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, maxWidth: 'none', marginBottom: 16 }}>
        <label style={{ flex: 1, minWidth: 220, position: 'relative' }}>
          Player
          <input
            value={selectedPlayer ? selectedPlayer.name : search}
            onChange={(e) => {
              setSearch(e.target.value)
              setSelectedPlayerId(null)
            }}
            placeholder="Search player name..."
          />
          {matches.length > 0 && !selectedPlayerId && (
            <div className="table-wrap" style={{ position: 'absolute', zIndex: 5, background: 'var(--bg)', width: '100%' }}>
              {matches.map(([id, p]) => (
                <div
                  key={id}
                  className="player-cell"
                  style={{ padding: '6px 10px' }}
                  onClick={() => {
                    setSelectedPlayerId(id)
                    setSearch('')
                  }}
                >
                  <PlayerAvatar playerId={id} name={p.name} />
                  {p.name} <span className="meta-line" style={{ margin: '0 0 0 6px' }}>{p.position}</span>
                </div>
              ))}
            </div>
          )}
        </label>
        <label style={{ minWidth: 140 }}>
          Opponent
          <select value={opponent} onChange={(e) => setOpponent(e.target.value)}>
            <option value="">Select team...</option>
            {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      {selectedPlayer && opponent && (
        <div className="slideout-section">
          <EdgeScoreCard playerName={selectedPlayer.name} opponent={opponent} position={selectedPlayer.position} edge={edge} />
        </div>
      )}

      {selectedPlayer && opponent && (
        <div className="slideout-section">
          <RouteEdgeCard
            playerName={selectedPlayer.name}
            opponent={opponent}
            position={selectedPlayer.position}
            routeEdge={routeEdge}
            hasRouteProfile={playerRouteProfile != null}
          />
        </div>
      )}

      {opponent && (
        <div className="slideout-section">
          <DefenseProfileCard team={opponent} profile={opponentProfile} />
        </div>
      )}

      {selectedPlayer && (explosiveTouch || explosivePass) && (
        <div className="slideout-section">
          <h3>Is {selectedPlayer.name} explosive?</h3>
          <p className="meta-line">
            Explosive play = a rush of 15+ yards or a completed pass of 20+ yards, the same
            thresholds a defense's own explosive-rate-allowed is measured against, so these two
            numbers are directly comparable.
          </p>
          <div className="table-wrap">
            <table>
              <tbody>
                {explosiveTouch && (
                  <tr>
                    <td>Touches (rush + rec)</td>
                    <td>
                      {pct(explosiveTouch.rate)} explosive ({explosiveTouch.explosive_plays} of{' '}
                      {explosiveTouch.plays})
                      {leagueAvgExplosive != null && (
                        <span className="meta-line" style={{ margin: '0 0 0 8px' }}>
                          league avg {pct(leagueAvgExplosive)}
                        </span>
                      )}
                    </td>
                  </tr>
                )}
                {explosivePass && (
                  <tr>
                    <td>Passing</td>
                    <td>
                      {pct(explosivePass.rate)} explosive ({explosivePass.explosive_plays} of{' '}
                      {explosivePass.plays})
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedPlayer && opponent && (
        <div className="slideout-section">
          <h3>
            Reference: {selectedPlayer.name} vs{' '}
            <button className="team-link" onClick={() => openTeamSlide({ team: opponent, context: 'defense' })}>
              {opponent}
            </button>{' '}
            literal history (2025 season)
          </h3>
          <p className="meta-line">
            Secondary context, not the headline -- literal head-to-head is often irrelevant if
            they've rarely met or the opponent's scheme has changed since. The Edge Score above,
            built from real style-specific splits, is the primary matchup read on this page.
          </p>
          {vsOpponent.length === 0 ? (
            <p className="empty-state">
              No games played against {opponent} yet this season (or ever, or under this
              opponent's current defensive staff) -- exactly the case this section can't speak to.
              Rely on the Edge Score above instead.
            </p>
          ) : (
            <>
              {vsOpponent.length <= 2 && (
                <p className="meta-line small">
                  Only {vsOpponent.length} game{vsOpponent.length > 1 ? 's' : ''} of history against
                  this specific opponent -- treat this as a curiosity, not a signal.
                </p>
              )}
              <GameLogTable games={vsOpponent} />
            </>
          )}

          {opponentProfile && similarTierSummary && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: '0 0 4px' }}>
                Vs. all "{opponentProfile.explosive_tier}" defenses this season
              </h4>
              <p className="meta-line">
                {opponent}'s explosive-rate-allowed tier is <strong>{opponentProfile.explosive_tier}</strong>{' '}
                -- widening from the one literal {opponent} matchup (small sample) to every defense
                in that same tier gives a real, larger sample of how {selectedPlayer.name} does
                against defenses of this style.
              </p>
              <div className="table-wrap">
                <table>
                  <tbody>
                    <tr>
                      <td>Games</td>
                      <td>{similarTierSummary.games}</td>
                    </tr>
                    <tr>
                      <td>Total yards (rush + rec + pass)</td>
                      <td>{similarTierSummary.totalYards.toFixed(0)}</td>
                    </tr>
                    <tr>
                      <td>Yards / game</td>
                      <td>{similarTierSummary.yardsPerGame.toFixed(1)}</td>
                    </tr>
                    <tr>
                      <td>TDs</td>
                      <td>{similarTierSummary.totalTds}</td>
                    </tr>
                    <tr>
                      <td>TDs / game</td>
                      <td>{similarTierSummary.tdsPerGame.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

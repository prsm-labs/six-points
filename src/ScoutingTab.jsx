import { useEffect, useMemo, useState } from 'react'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import GameLogTable from './GameLogTable.jsx'
import { openTeamSlide } from './slideouts.js'

// A standalone "player vs this specific opponent" lookup -- the same vs-opponent logic the
// Player Slideout already has, but searchable for ANY player/opponent pair, not just today's
// real matchups. Reuses GameLogTable, doesn't duplicate it.
//
// Goes beyond the literal head-to-head history (which is often only 1-2 games, a real
// small-sample problem already disclosed below) with real defense-style context: the opponent's
// coverage/blitz/pressure tendencies and explosive-play rate allowed (matchup_engine.py's
// build_defense_profile -- verified live against real pbp: defense_coverage_type is 99.5%
// populated on real pass attempts), the player's own explosive-play rate for direct comparison
// (same explosive thresholds -- rush >=15, pass >=20 -- as the defense side, so the two numbers
// are actually comparable), and an aggregate of the player's games against every defense that
// shares the opponent's explosive-rate-allowed tier, not just this one literal opponent.
//
// A true coverage-scheme matchup tool (which defender covers which receiver) is NOT built here
// -- that's a different, deeper data-source gap than defense-level scheme tendency (which this
// tab does use): no per-route/per-receiver assignment data source has been identified, the same
// limitation PairsPage already discloses.

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
    ])
      .then(([logs, dir, stats, splits]) => {
        setGameLogs(logs)
        setDirectory(dir)
        setTeamStats(stats)
        setSituationalSplits(splits)
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
  const vsOpponent = useMemo(
    () => (opponent ? games.filter((g) => g.opponent === opponent) : []),
    [games, opponent]
  )

  const opponentProfile = opponent ? teamStats?.[opponent]?.defense_profile : null
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
      <p className="meta-line">
        Pick any player and any opponent: real head-to-head history, the opponent's real defense
        style (coverage mix, blitz/pressure rate, explosive-play rate allowed), the player's own
        explosiveness, and how the player does against every defense of that same style, not just
        today's real matchups
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

      {opponent && (
        <div className="slideout-section">
          <DefenseProfileCard team={opponent} profile={opponentProfile} />
        </div>
      )}

      {selectedPlayer && opponent && (
        <div className="slideout-section">
          <h3>
            {selectedPlayer.name} vs{' '}
            <button className="team-link" onClick={() => openTeamSlide({ team: opponent, context: 'defense' })}>
              {opponent}
            </button>{' '}
            (2025 season)
          </h3>
          {vsOpponent.length === 0 ? (
            <p className="empty-state">No games played against {opponent} yet this season.</p>
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

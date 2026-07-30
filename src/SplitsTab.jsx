import { useEffect, useMemo, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { buildLeaderboard } from './playerAggregates.js'

// A QB's stat line shares almost nothing with a WR's, so a single universal stat table isn't
// possible the way it would be for a position with one shared shape (same reason the Player
// Slideout's season stat line branches by position instead of being universal -- see
// PROMPT_SixPoints_PlayerTeamSlideouts.md §5). This leaderboard uses a position-agnostic common
// column set (Games/Yards/TDs) for browsing and ranking across everyone at once; the
// position-specific deep stat line is one click away via the Player Slideout every row opens.
//
// Role classification (Starter/Committee/Reserve) is display/filter-only -- it never feeds any
// score/grade formula.

const WINDOWS = [
  { key: 3, label: 'L3' },
  { key: 5, label: 'L5' },
  { key: 7, label: 'L7' },
  { key: 'season', label: 'Season' },
]

function useLeaderboardData() {
  const [gameLogs, setGameLogs] = useState(null)
  const [directory, setDirectory] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/data/player_game_logs.json').then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      }),
      fetch('/data/players.json').then((r) => (r.ok ? r.json() : {})),
    ])
      .then(([logs, dir]) => {
        setGameLogs(logs)
        setDirectory(dir)
      })
      .catch((e) => setError(e.message))
  }, [])

  return { gameLogs, directory, error }
}

function LeaderboardView({ gameLogs, directory }) {
  const [window, setWindowKey] = useState('season')
  const [position, setPosition] = useState('all')
  const [team, setTeam] = useState('all')
  const [search, setSearch] = useState('')
  const [minGames, setMinGames] = useState(4)

  const rows = useMemo(() => buildLeaderboard(gameLogs, directory, window), [gameLogs, directory, window])
  const teams = useMemo(() => [...new Set(rows.map((r) => r.team))].filter(Boolean).sort(), [rows])

  const filtered = rows
    .filter((r) => r.games >= minGames)
    .filter((r) => position === 'all' || r.position === position)
    .filter((r) => team === 'all' || r.team === team)
    .filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()))

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtered, 'total_yards', 'desc')
  const thProps = { sortKey, sortDir, onSort: toggleSort }

  return (
    <div>
      <div className="sub-tabs" style={{ marginBottom: 10 }}>
        {WINDOWS.map((w) => (
          <button key={w.key} className={window === w.key ? 'active' : ''} onClick={() => setWindowKey(w.key)}>
            {w.label}
          </button>
        ))}
      </div>
      <div className="calc-block" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, maxWidth: 'none', marginBottom: 12 }}>
        <label style={{ minWidth: 120 }}>
          Position
          <select value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="all">All</option>
            <option value="QB">QB</option>
            <option value="RB">RB</option>
            <option value="WR">WR</option>
            <option value="TE">TE</option>
          </select>
        </label>
        <label style={{ minWidth: 120 }}>
          Team
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="all">All</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label style={{ minWidth: 100 }}>
          Min games
          <input type="number" value={minGames} min={0} onChange={(e) => setMinGames(Number(e.target.value))} />
        </label>
        <label style={{ flex: 1, minWidth: 160 }}>
          Search
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Player name..." />
        </label>
      </div>

      <p className="meta-line">
        {sorted.length} players &middot; window: {window === 'season' ? 'full season' : `last ${window} games`} &middot;
        role is a display label only (touches/targets-per-game threshold) -- it never feeds Zone
        Score or any other formula
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <SortTh label="Team" sortKeyName="team" {...thProps} />
              <SortTh label="Pos" sortKeyName="position" {...thProps} />
              <th>Role</th>
              <SortTh label="G" sortKeyName="games" {...thProps} />
              <SortTh label="Yds" sortKeyName="total_yards" {...thProps} />
              <SortTh label="Yds/G" sortKeyName="yards_per_game" {...thProps} />
              <SortTh label="TD" sortKeyName="any_td" {...thProps} />
              <SortTh label="TD/G" sortKeyName="td_per_game" {...thProps} />
              <SortTh label="TD Streak" sortKeyName="streak" {...thProps} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i}>
                <td>
                  <div className="player-cell" onClick={() => openPlayerSlide({ player_id: r.playerId, player_name: r.name, team: r.team, position: r.position })}>
                    <PlayerAvatar playerId={r.playerId} name={r.name} />
                    {r.name}
                  </div>
                </td>
                <td>
                  <button className="team-link" onClick={() => openTeamSlide({ team: r.team })}>{r.team}</button>
                </td>
                <td>{r.position}</td>
                <td>{r.role}</td>
                <td>{r.games}</td>
                <td className="zone-score">{r.total_yards.toFixed(0)}</td>
                <td>{r.yards_per_game.toFixed(1)}</td>
                <td>{r.any_td}</td>
                <td>{r.td_per_game.toFixed(2)}</td>
                <td>{r.streak > 0 ? <span className="tier tier-lock">{r.streak}</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MomentumView({ gameLogs, directory }) {
  // "Who's scored in each of the last N games" -- a natural extension of the L7 Chart's own
  // "Any TD" category, aggregated across the whole league instead of one player at a time.
  //
  // QBs excluded on purpose, found while verifying this against real data: a competent starting
  // QB throws at least one TD in nearly every game, so "TD streak" is trivially met almost every
  // week and just produces a leaderboard of "which QBs started every game" -- not a real momentum
  // signal the way it is for RB/WR/TE, where red-zone touches/targets genuinely fluctuate week to
  // week. Verified: the actual 2025 top streak was two QBs at 17/17 (i.e. every game all season).
  const rows = useMemo(
    () => buildLeaderboard(gameLogs, directory, 3).filter((r) => r.position !== 'QB'),
    [gameLogs, directory]
  )
  const onStreak = rows.filter((r) => r.streak >= 2).sort((a, b) => b.streak - a.streak)

  return (
    <div>
      <p className="meta-line">
        RB/WR/TE who have scored a touchdown in at least 2 straight games (current active streak,
        most recent games first) &middot; {onStreak.length} players &middot; QBs excluded -- a
        starting QB throws a TD almost every week, so a TD streak isn't a meaningful momentum
        signal there the way it is for skill positions
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Team</th>
              <th>Pos</th>
              <th>TD Streak</th>
              <th>TD, Last 3</th>
            </tr>
          </thead>
          <tbody>
            {onStreak.map((r, i) => (
              <tr key={i}>
                <td>
                  <div className="player-cell" onClick={() => openPlayerSlide({ player_id: r.playerId, player_name: r.name, team: r.team, position: r.position })}>
                    <PlayerAvatar playerId={r.playerId} name={r.name} />
                    {r.name}
                  </div>
                </td>
                <td>
                  <button className="team-link" onClick={() => openTeamSlide({ team: r.team })}>{r.team}</button>
                </td>
                <td>{r.position}</td>
                <td><span className="tier tier-lock">{r.streak} games</span></td>
                <td>{r.any_td}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SplitsTab() {
  const [view, setView] = useState('leaderboard')
  const { gameLogs, directory, error } = useLeaderboardData()

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
      <div className="sub-tabs">
        <button className={view === 'leaderboard' ? 'active' : ''} onClick={() => setView('leaderboard')}>
          Leaderboard
        </button>
        <button className={view === 'momentum' ? 'active' : ''} onClick={() => setView('momentum')}>
          Momentum
        </button>
      </div>
      {view === 'leaderboard'
        ? <LeaderboardView gameLogs={gameLogs} directory={directory} />
        : <MomentumView gameLogs={gameLogs} directory={directory} />}
    </div>
  )
}

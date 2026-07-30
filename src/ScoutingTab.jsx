import { useEffect, useMemo, useState } from 'react'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import GameLogTable from './GameLogTable.jsx'
import { openTeamSlide } from './slideouts.js'

// A standalone "player vs this specific opponent" lookup -- the same vs-opponent logic the
// Player Slideout already has, but searchable for ANY player/opponent pair, not just today's
// real matchups. Reuses GameLogTable, doesn't duplicate it.
//
// A true coverage-scheme matchup tool is NOT built here -- that's the same open data-source gap
// PairsPage already discloses (no route-tree/coverage-scheme data source identified yet).

const TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND',
  'JAX', 'KC', 'LA', 'LAC', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA',
  'SF', 'TB', 'TEN', 'WAS',
]

export default function ScoutingTab() {
  const [gameLogs, setGameLogs] = useState(null)
  const [directory, setDirectory] = useState(null)
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
    ])
      .then(([logs, dir]) => {
        setGameLogs(logs)
        setDirectory(dir)
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
        Pick any player and any opponent to see their real history against that specific team this
        season -- not limited to this week's real matchups
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
        </div>
      )}
    </div>
  )
}

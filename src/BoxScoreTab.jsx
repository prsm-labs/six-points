import { useMemo, useState, useEffect } from 'react'
import { resolveEventIds } from './espnGameResolver.js'
import { openTeamSlide, openPlayerSlide } from './slideouts.js'
import { usePlayerDirectory } from './PlayerDirectory.jsx'

// Real box scores via ESPN's summary API. The week's games are a lightweight, always-visible
// list (scores already live in season_schedule.json, no ESPN call needed just to show them) --
// selecting one resolves its real ESPN event id and fetches its full detail (team box score,
// player/position box score, real play-by-play) on demand, not all 16 games at page load.

const CATEGORY_LABELS = {
  passing: 'Passing',
  rushing: 'Rushing',
  receiving: 'Receiving',
  fumbles: 'Fumbles',
  defensive: 'Defensive',
  interceptions: 'Interceptions',
  kickReturns: 'Kick Returns',
  puntReturns: 'Punt Returns',
  kicking: 'Kicking',
  punting: 'Punting',
}

async function fetchGameDetail(eventId) {
  const proxied = await fetch(`/api/summary?event=${eventId}&full=1`).catch(() => null)
  if (proxied && proxied.ok) {
    const data = await proxied.json()
    if (data.boxscore) return { boxscore: data.boxscore, drives: data.drives || [] }
  }
  const direct = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`
  )
  const data = await direct.json()
  const drives = (data.drives?.previous || []).map((d) => ({
    team: d.team?.abbreviation || '',
    description: d.description || '',
    result: d.result || '',
    displayResult: d.displayResult || '',
    isScore: !!d.isScore,
    plays: (d.plays || []).map((p) => ({
      text: p.text || '',
      period: p.period?.number ?? null,
      clock: p.clock?.displayValue || '',
      scoringPlay: !!p.scoringPlay,
    })),
  }))
  return { boxscore: data.boxscore, drives }
}

function PlayerBoxCategory({ category, espnIdToPlayer, team }) {
  if (!category.athletes || category.athletes.length === 0) return null

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 700, fontSize: '0.85rem', margin: '0 0 4px' }}>
        {CATEGORY_LABELS[category.name] || category.name}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              {category.labels.map((l, i) => (
                <th key={i}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {category.athletes.map((a, i) => {
              const match = espnIdToPlayer.get(a.athlete?.id)
              return (
                <tr key={i}>
                  <td>
                    {match ? (
                      <button
                        className="team-link"
                        onClick={() =>
                          openPlayerSlide({
                            player_id: match.playerId,
                            player_name: match.name,
                            team,
                            position: match.position,
                          })
                        }
                      >
                        {a.athlete?.displayName}
                      </button>
                    ) : (
                      a.athlete?.displayName
                    )}
                  </td>
                  {a.stats.map((s, j) => (
                    <td key={j}>{s}</td>
                  ))}
                </tr>
              )
            })}
            {category.totals && (
              <tr style={{ fontWeight: 700 }}>
                <td>Total</td>
                {category.totals.map((s, j) => (
                  <td key={j}>{s}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PlayerBoxTables({ boxscore, espnIdToPlayer, espnAbbrToNflverse }) {
  if (!boxscore?.players) return null

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 6 }}>
      {boxscore.players.map((teamEntry, i) => {
        const espnAbbr = teamEntry.team?.abbreviation?.toUpperCase()
        const nflverseAbbr = espnAbbrToNflverse.get(espnAbbr) || espnAbbr
        return (
          <div key={i} style={{ flex: '1 1 360px', minWidth: 300 }}>
            <button className="team-link" style={{ fontWeight: 800 }} onClick={() => openTeamSlide({ team: nflverseAbbr })}>
              {nflverseAbbr}
            </button>
            {teamEntry.statistics.map((cat) => (
              <PlayerBoxCategory key={cat.name} category={cat} espnIdToPlayer={espnIdToPlayer} team={nflverseAbbr} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function PlayByPlay({ drives, espnAbbrToNflverse }) {
  if (!drives || drives.length === 0) {
    return <p className="empty-state" style={{ margin: '8px 0 0' }}>No play-by-play available for this game.</p>
  }

  return (
    <div style={{ marginTop: 10 }}>
      {drives.map((d, i) => {
        const nflverseAbbr = espnAbbrToNflverse.get(d.team.toUpperCase()) || d.team
        return (
          <div
            key={i}
            style={{
              marginBottom: 12,
              paddingLeft: 10,
              borderLeft: `3px solid ${d.isScore ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
              <button className="team-link" onClick={() => openTeamSlide({ team: nflverseAbbr })}>
                {nflverseAbbr}
              </button>{' '}
              &middot; {d.displayResult}{' '}
              <span className="meta-line" style={{ margin: 0 }}>({d.description})</span>
            </div>
            <div style={{ marginTop: 4 }}>
              {d.plays.map((p, j) => (
                <div
                  key={j}
                  className="meta-line"
                  style={{
                    margin: '2px 0',
                    color: p.scoringPlay ? 'var(--accent)' : undefined,
                    fontWeight: p.scoringPlay ? 700 : 400,
                  }}
                >
                  Q{p.period} {p.clock} &mdash; {p.text}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function GameDetail({ game, detail, loading, espnIdToPlayer, espnAbbrToNflverse }) {
  const [showPlayers, setShowPlayers] = useState(false)
  const [showPlays, setShowPlays] = useState(false)

  if (loading) return <p className="empty-state" style={{ margin: '10px 0 0' }}>Loading box score...</p>
  if (!detail?.boxscore) return <p className="empty-state" style={{ margin: '10px 0 0' }}>Box score not available yet for this game.</p>

  const { boxscore, drives } = detail
  const [away, home] = boxscore.teams
  const statRows = away.statistics.map((s, i) => ({
    label: s.label,
    away: s.displayValue,
    home: home.statistics[i]?.displayValue ?? '—',
  }))

  return (
    <div style={{ marginTop: 10 }}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <button className="team-link" onClick={() => openTeamSlide({ team: game.away_team })}>
                  {game.away_team}
                </button>
              </th>
              <th></th>
              <th>
                <button className="team-link" onClick={() => openTeamSlide({ team: game.home_team })}>
                  {game.home_team}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {statRows.map((r, i) => (
              <tr key={i}>
                <td>{r.away}</td>
                <td className="meta-line" style={{ margin: 0, textAlign: 'center' }}>{r.label}</td>
                <td>{r.home}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
        {boxscore.players && (
          <button className="team-link" style={{ fontSize: '0.82rem', fontWeight: 700 }} onClick={() => setShowPlayers((v) => !v)}>
            {showPlayers ? 'Hide player box score ▲' : 'Show player box score ▼'}
          </button>
        )}
        <button className="team-link" style={{ fontSize: '0.82rem', fontWeight: 700 }} onClick={() => setShowPlays((v) => !v)}>
          {showPlays ? 'Hide play-by-play ▲' : 'Show play-by-play ▼'}
        </button>
      </div>

      {showPlayers && (
        <PlayerBoxTables boxscore={boxscore} espnIdToPlayer={espnIdToPlayer} espnAbbrToNflverse={espnAbbrToNflverse} />
      )}
      {showPlays && <PlayByPlay drives={drives} espnAbbrToNflverse={espnAbbrToNflverse} />}
    </div>
  )
}

function GameRow({ game, selected, onSelect, detail, loading, espnIdToPlayer, espnAbbrToNflverse }) {
  return (
    <div className="weather-card">
      <button
        onClick={onSelect}
        style={{
          all: 'unset',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          cursor: 'pointer',
        }}
      >
        <div>
          <strong>{game.away_team}</strong> {game.away_score} @ <strong>{game.home_team}</strong> {game.home_score}
        </div>
        <div className="meta-line" style={{ margin: 0 }}>
          {game.gameday} {selected ? '▲' : '▼'}
        </div>
      </button>
      {selected && (
        <GameDetail
          game={game}
          detail={detail}
          loading={loading}
          espnIdToPlayer={espnIdToPlayer}
          espnAbbrToNflverse={espnAbbrToNflverse}
        />
      )}
    </div>
  )
}

export default function BoxScoreTab() {
  const [schedule, setSchedule] = useState(null)
  const [teamStats, setTeamStats] = useState(null)
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [selectedGameId, setSelectedGameId] = useState(null)
  const [details, setDetails] = useState({})
  const [loadingGameId, setLoadingGameId] = useState(null)
  const [error, setError] = useState(null)
  const directory = usePlayerDirectory()

  useEffect(() => {
    Promise.all([
      fetch('/data/season_schedule.json').then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      }),
      fetch('/data/team_stats.json').then((r) => (r.ok ? r.json() : {})),
    ])
      .then(([sched, stats]) => {
        setSchedule(sched)
        setTeamStats(stats)
        setSelectedWeek(sched.latest_week)
      })
      .catch((e) => setError(e.message))
  }, [])

  // Our players.json stats_url already embeds each player's real ESPN athlete id
  // (espn.com/nfl/player/_/id/<id>/...), verified when the slideout external links were built --
  // reusing that instead of a name match to wire box-score rows to our own player slideout.
  const espnIdToPlayer = useMemo(() => {
    const map = new Map()
    for (const [playerId, info] of Object.entries(directory)) {
      const match = info.stats_url?.match(/\/id\/(\d+)\//)
      if (match) map.set(match[1], { playerId, name: info.name, position: info.position })
    }
    return map
  }, [directory])

  const espnAbbrToNflverse = useMemo(() => {
    const map = new Map()
    for (const [abbr, info] of Object.entries(teamStats || {})) {
      if (info.espn_abbr) map.set(info.espn_abbr.toUpperCase(), abbr)
    }
    return map
  }, [teamStats])

  const weekGames = useMemo(
    () => (schedule && selectedWeek ? schedule.games.filter((g) => g.week === selectedWeek) : []),
    [schedule, selectedWeek]
  )

  const weekOptions = useMemo(() => {
    if (!schedule) return []
    return [...new Set(schedule.games.map((g) => g.week))].sort((a, b) => b - a)
  }, [schedule])

  async function handleSelect(game) {
    if (selectedGameId === game.game_id) {
      setSelectedGameId(null)
      return
    }
    setSelectedGameId(game.game_id)
    if (details[game.game_id] || !teamStats) return
    setLoadingGameId(game.game_id)
    try {
      const eventIds = await resolveEventIds([game], teamStats)
      const eventId = eventIds[game.game_id]
      if (!eventId) throw new Error('no matching ESPN event found')
      const detail = await fetchGameDetail(eventId)
      setDetails((prev) => ({ ...prev, [game.game_id]: detail }))
    } catch {
      setDetails((prev) => ({ ...prev, [game.game_id]: null }))
    } finally {
      setLoadingGameId(null)
    }
  }

  if (error) {
    return (
      <p className="empty-state">
        No schedule data yet ({error}). Run <code>python matchup_engine.py --season 2025 --week N</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!schedule) return <p className="empty-state">Loading...</p>

  return (
    <div>
      <div className="calc-block" style={{ marginBottom: 12 }}>
        <label>
          Week
          <select
            value={selectedWeek || ''}
            onChange={(e) => {
              setSelectedWeek(Number(e.target.value))
              setSelectedGameId(null)
            }}
          >
            {weekOptions.map((w) => (
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="meta-line">
        Click a game for its real box score (1st downs, total yards, passing/rushing splits,
        turnovers, time of possession), a full player/position breakdown for both teams, and the
        real play-by-play, all via ESPN's summary API
      </p>
      {weekGames.map((g) => (
        <GameRow
          key={g.game_id}
          game={g}
          selected={selectedGameId === g.game_id}
          onSelect={() => handleSelect(g)}
          detail={details[g.game_id]}
          loading={loadingGameId === g.game_id}
          espnIdToPlayer={espnIdToPlayer}
          espnAbbrToNflverse={espnAbbrToNflverse}
        />
      ))}
    </div>
  )
}

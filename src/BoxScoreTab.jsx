import { useEffect, useMemo, useState } from 'react'
import { resolveEventIds } from './espnGameResolver.js'
import { openTeamSlide, openPlayerSlide } from './slideouts.js'
import { usePlayerDirectory } from './PlayerDirectory.jsx'

// Real box scores via ESPN's summary API: team stat lines (1st downs, total yards, turnovers,
// time of possession) plus a full player/position breakdown for both teams -- passing, rushing,
// receiving, defensive, interceptions, returns, kicking, punting -- whichever categories ESPN
// actually reports athletes for in that game.

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

async function fetchBoxscore(eventId) {
  const proxied = await fetch(`/api/summary?event=${eventId}&full=1`).catch(() => null)
  if (proxied && proxied.ok) {
    const data = await proxied.json()
    if (data.boxscore) return data.boxscore
  }
  const direct = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`
  )
  const data = await direct.json()
  return data.boxscore
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

function BoxScoreCard({ game, boxscore, loading, espnIdToPlayer, espnAbbrToNflverse }) {
  const [expanded, setExpanded] = useState(false)

  if (loading) {
    return (
      <div className="weather-card">
        <div className="weather-card-header">
          <div><strong>{game.away_team}</strong> @ <strong>{game.home_team}</strong></div>
        </div>
        <p className="empty-state" style={{ margin: '10px 0 0' }}>Loading box score...</p>
      </div>
    )
  }
  if (!boxscore) return null

  const [away, home] = boxscore.teams
  const statRows = away.statistics.map((s, i) => ({
    label: s.label,
    away: s.displayValue,
    home: home.statistics[i]?.displayValue ?? '—',
  }))

  return (
    <div className="weather-card">
      <div className="weather-card-header">
        <div>
          <strong>{game.away_team}</strong> {game.away_score} @ <strong>{game.home_team}</strong> {game.home_score}
        </div>
        <div className="meta-line" style={{ margin: 0 }}>{game.gameday}</div>
      </div>
      <div className="table-wrap" style={{ marginTop: 10 }}>
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

      {boxscore.players && (
        <button
          className="team-link"
          style={{ marginTop: 10, fontSize: '0.82rem', fontWeight: 700 }}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Hide player box score ▲' : 'Show player box score ▼'}
        </button>
      )}
      {expanded && (
        <PlayerBoxTables boxscore={boxscore} espnIdToPlayer={espnIdToPlayer} espnAbbrToNflverse={espnAbbrToNflverse} />
      )}
    </div>
  )
}

export default function BoxScoreTab() {
  const [schedule, setSchedule] = useState(null)
  const [teamStats, setTeamStats] = useState(null)
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [boxscores, setBoxscores] = useState({})
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

  useEffect(() => {
    if (!weekGames.length || !teamStats) return
    setBoxscores({})
    resolveEventIds(weekGames, teamStats).then(async (eventIds) => {
      for (const g of weekGames) {
        const eventId = eventIds[g.game_id]
        if (!eventId) continue
        try {
          const box = await fetchBoxscore(eventId)
          setBoxscores((prev) => ({ ...prev, [g.game_id]: box }))
        } catch {
          setBoxscores((prev) => ({ ...prev, [g.game_id]: null }))
        }
      }
    })
  }, [weekGames, teamStats])

  const weekOptions = useMemo(() => {
    if (!schedule) return []
    return [...new Set(schedule.games.map((g) => g.week))].sort((a, b) => b - a)
  }, [schedule])

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
          <select value={selectedWeek || ''} onChange={(e) => setSelectedWeek(Number(e.target.value))}>
            {weekOptions.map((w) => (
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="meta-line">
        Real box scores via ESPN's summary API &middot; team stat line (1st downs, total yards,
        passing/rushing splits, turnovers, time of possession) plus a full player/position
        breakdown for both teams -- click "Show player box score" on any game
      </p>
      {weekGames.map((g) => (
        <BoxScoreCard
          key={g.game_id}
          game={g}
          boxscore={boxscores[g.game_id]}
          loading={boxscores[g.game_id] === undefined}
          espnIdToPlayer={espnIdToPlayer}
          espnAbbrToNflverse={espnAbbrToNflverse}
        />
      ))}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { resolveEventIds } from './espnGameResolver.js'
import { openTeamSlide } from './slideouts.js'

// Real achievable core of Going Yard's GamedayTab, per the response doc §7: team stat-line box
// scores. The pitch-by-pitch play visualization GamedayTab also has has no real NFL equivalent
// (a football play is already the atomic unit -- no sub-play granularity to visualize the way a
// strike-zone plot works), so that part is explicitly NOT attempted here.

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

function BoxScoreCard({ game, boxscore, loading }) {
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
    </div>
  )
}

export default function BoxScoreTab() {
  const [schedule, setSchedule] = useState(null)
  const [teamStats, setTeamStats] = useState(null)
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [boxscores, setBoxscores] = useState({})
  const [error, setError] = useState(null)

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
        Real box scores (1st downs, total yards, passing/rushing splits, turnovers, time of
        possession) via ESPN's summary API &middot; the pitch-by-pitch-style play visualization
        Going Yard's Gameday tab has isn't attempted here -- a football play is already the
        atomic unit, there's no sub-play granularity to visualize the way a strike-zone plot works
      </p>
      {weekGames.map((g) => (
        <BoxScoreCard
          key={g.game_id}
          game={g}
          boxscore={boxscores[g.game_id]}
          loading={boxscores[g.game_id] === undefined}
        />
      ))}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { openTeamSlide } from './slideouts.js'

// Item 9, PROMPT_SixPoints_SeasonKickoff_Prep.md: a real forward-looking "what's the full
// schedule for week N" browse page -- BoxScoreTab is built around resolving a completed/
// in-progress game's real box-score detail, there was no page that just lists a week's games.
// season_schedule.json already has every real game all season (game_id/week/teams/gameday/
// gametime/home_score/away_score) -- this is purely a frontend view, no new pipeline data.

const LIVE_POLL_INTERVAL_MS = 30000

async function fetchScoreboard(dateYYYYMMDD) {
  const proxied = await fetch(`/api/scoreboard?dates=${dateYYYYMMDD}`).catch(() => null)
  if (proxied && proxied.ok) return proxied.json()
  const direct = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dateYYYYMMDD}`
  )
  return direct.json()
}

function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Real "what week is it right now" -- deliberately NOT season_schedule.json's own `latest_week`
// (that reflects whichever week the engine happened to be run for, which can lag the real
// calendar -- see the doc's #5 staleness point). Computed straight from today's date against
// every real game's own scheduled date instead.
function computeCurrentWeek(games) {
  const today = todayYMD()
  const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b)
  for (const wk of weeks) {
    const weekGames = games.filter((g) => g.week === wk).map((g) => g.gameday).filter(Boolean).sort()
    if (!weekGames.length) continue
    const last = weekGames[weekGames.length - 1]
    if (today <= last) return wk
  }
  return weeks[weeks.length - 1] || 1
}

export default function ScheduleTab({ onViewBoxScore }) {
  const [schedule, setSchedule] = useState(null)
  const [error, setError] = useState(null)
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [liveStatus, setLiveStatus] = useState({})

  useEffect(() => {
    fetch('/data/season_schedule.json')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then((data) => {
        setSchedule(data)
        setSelectedWeek(computeCurrentWeek(data.games))
      })
      .catch((e) => setError(e.message))
  }, [])

  const weekGames = useMemo(
    () => (schedule && selectedWeek ? schedule.games.filter((g) => g.week === selectedWeek) : []),
    [schedule, selectedWeek]
  )
  const currentWeek = useMemo(() => (schedule ? computeCurrentWeek(schedule.games) : null), [schedule])
  const isCurrentWeek = selectedWeek === currentWeek

  // Only poll real live status for the actual current week -- a past/future week's games can't
  // be "in progress" regardless, so there's no reason to hit ESPN's scoreboard for those.
  useEffect(() => {
    if (!isCurrentWeek || !weekGames.length) {
      setLiveStatus({})
      return
    }
    let cancelled = false
    async function poll() {
      const dates = [...new Set(weekGames.map((g) => g.gameday).filter(Boolean).map((d) => d.replaceAll('-', '')))]
      const byGame = {}
      for (const ymd of dates) {
        try {
          const sb = await fetchScoreboard(ymd)
          for (const event of sb.events || []) {
            const abbrs = (event.competitions?.[0]?.competitors || []).map((c) => c.team?.abbreviation)
            const match = weekGames.find((g) => abbrs.includes(g.home_team) || abbrs.includes(g.away_team))
            if (match) byGame[match.game_id] = event.status?.type?.state || null
          }
        } catch {
          // one date's scoreboard failing shouldn't blank the whole week
        }
      }
      if (!cancelled) setLiveStatus(byGame)
    }
    poll()
    const timer = setInterval(poll, LIVE_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isCurrentWeek, weekGames])

  const weekOptions = useMemo(() => {
    if (!schedule) return []
    return [...new Set(schedule.games.map((g) => g.week))].sort((a, b) => a - b)
  }, [schedule])

  if (error) {
    return (
      <p className="empty-state">
        No schedule data yet ({error}). Run <code>python matchup_engine.py --season 2026 --week N</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!schedule) return <p className="empty-state">Loading...</p>

  return (
    <div>
      <div className="calc-block" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', maxWidth: 'none', marginBottom: 12 }}>
        <button className="team-link" onClick={() => setSelectedWeek((w) => Math.max(1, w - 1))}>&larr; Prev</button>
        <label style={{ minWidth: 140 }}>
          Week
          <select value={selectedWeek || ''} onChange={(e) => setSelectedWeek(Number(e.target.value))}>
            {weekOptions.map((w) => (
              <option key={w} value={w}>Week {w}{w === currentWeek ? ' (current)' : ''}</option>
            ))}
          </select>
        </label>
        <button className="team-link" onClick={() => setSelectedWeek((w) => Math.min(weekOptions[weekOptions.length - 1] || w, w + 1))}>Next &rarr;</button>
      </div>
      <p className="meta-line">
        {weekGames.length} games, Week {selectedWeek}{isCurrentWeek ? ' -- the real current week, live status polled every 30s' : ''}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Away</th>
              <th>Home</th>
              <th>Kickoff</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {weekGames.map((g) => {
              const isFinal = g.home_score != null
              const liveState = liveStatus[g.game_id]
              const isLive = !isFinal && liveState === 'in'
              const clickable = isFinal || isLive
              return (
                <tr
                  key={g.game_id}
                  style={clickable ? { cursor: 'pointer' } : undefined}
                  onClick={clickable ? onViewBoxScore : undefined}
                >
                  <td>
                    <button className="team-link" onClick={(e) => { e.stopPropagation(); openTeamSlide({ team: g.away_team }) }}>
                      {g.away_team}
                    </button>
                    {isFinal && <span className="meta-line" style={{ margin: '0 0 0 6px' }}>{g.away_score}</span>}
                  </td>
                  <td>
                    <button className="team-link" onClick={(e) => { e.stopPropagation(); openTeamSlide({ team: g.home_team }) }}>
                      {g.home_team}
                    </button>
                    {isFinal && <span className="meta-line" style={{ margin: '0 0 0 6px' }}>{g.home_score}</span>}
                  </td>
                  <td>{g.gameday}{g.gametime ? ` ${g.gametime}` : ''}</td>
                  <td>
                    {isFinal ? (
                      <span className="tier tier-fringe">Final</span>
                    ) : isLive ? (
                      <span className="tier tier-lock">Live</span>
                    ) : (
                      <span className="meta-line" style={{ margin: 0 }}>Scheduled</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

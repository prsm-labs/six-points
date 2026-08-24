import { useEffect, useMemo, useState } from 'react'
import { openTeamSlide } from './slideouts.js'
import { useLiveInactives } from './useLiveInactives.js'

// NFL's real pre-game lineup-confirmation equivalent is the inactives report -- released ~90
// min before kickoff, resolving on its own clock. Two views: the static Weekly Report (below,
// the same real injury data already powering Green Light Score's injury gate) and Live
// Confirmation (see useLiveInactives.js) -- a rolling poll of ESPN's real, currently-live
// per-game injury feed for any of today's real games, the NFL analog of Going Yard's
// LINEUP_STATUS live-confirmation cache.
//
// Uses the same real weekly injury report (Out/Doubtful/Questionable) already powering Green
// Light Score's injury gate in matchup_engine.py -- Out/Doubtful here is the closest real signal
// to "will not play," Questionable is the closest to "game-time decision."

const STATUS_ORDER = { Out: 0, Doubtful: 1, Questionable: 2 }

function LiveConfirmationView() {
  const [schedule, setSchedule] = useState(null)
  const [teamStats, setTeamStats] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/data/season_schedule.json').then((r) => (r.ok ? r.json() : null)),
      fetch('/data/team_stats.json').then((r) => (r.ok ? r.json() : {})),
    ]).then(([sched, stats]) => {
      setSchedule(sched)
      setTeamStats(stats)
    })
  }, [])

  const { rows, lastConfirmed, checking, error, gamesToday } = useLiveInactives(schedule, teamStats)

  if (!schedule || !teamStats) return <p className="empty-state">Loading...</p>
  if (error) return <p className="empty-state">Couldn't load live status ({error}).</p>
  if (gamesToday === 0) {
    return (
      <p className="empty-state">
        No games scheduled today -- live confirmation polls ESPN's real per-game injury feed
        every 60s once a real game is on today's schedule, closest to the real ~90-minute
        pre-kickoff window when status is still resolving.
      </p>
    )
  }

  const sorted = rows.slice().sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))

  return (
    <div>
      <p className="meta-line">
        {gamesToday} game{gamesToday > 1 ? 's' : ''} today &middot; polling ESPN's real live
        injury feed every 60s{checking ? ' -- checking now...' : ''}
        {lastConfirmed && ` -- last confirmed ${lastConfirmed.toLocaleTimeString()}`}
      </p>
      {sorted.length === 0 ? (
        <p className="empty-state">No injury-report players confirmed yet for today's games.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Player</th>
                <th>Pos</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i}>
                  <td>
                    <button className="team-link" onClick={() => openTeamSlide({ team: r.team })}>{r.team}</button>
                  </td>
                  <td>{r.name}</td>
                  <td>{r.position}</td>
                  <td>
                    <span className={r.status === 'Out' ? 'tier tier-fade' : r.status === 'Doubtful' ? 'tier tier-fringe' : 'tier tier-lean'}>
                      {r.status}
                    </span>
                  </td>
                  <td>{r.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function WeeklyReportView() {
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [teamFilter, setTeamFilter] = useState('all')

  useEffect(() => {
    fetch('/data/injury_report.json')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then((data) => {
        setReport(data)
        const weeks = Object.keys(data.weeks).map(Number).sort((a, b) => b - a)
        setSelectedWeek(weeks[0])
      })
      .catch((e) => setError(e.message))
  }, [])

  const weekRows = useMemo(() => {
    if (!report || !selectedWeek) return []
    return (report.weeks[selectedWeek] || [])
      .slice()
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
  }, [report, selectedWeek])

  const teams = useMemo(() => [...new Set(weekRows.map((r) => r.team))].sort(), [weekRows])
  const filtered = teamFilter === 'all' ? weekRows : weekRows.filter((r) => r.team === teamFilter)

  const weekOptions = useMemo(() => {
    if (!report) return []
    return Object.keys(report.weeks).map(Number).sort((a, b) => b - a)
  }, [report])

  if (error) {
    return (
      <p className="empty-state">
        No injury data yet ({error}). Run <code>python matchup_engine.py --season 2025 --backtest</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!report) return <p className="empty-state">Loading...</p>

  return (
    <div>
      <div className="calc-block" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, maxWidth: 'none', marginBottom: 12 }}>
        <label style={{ minWidth: 120 }}>
          Week
          <select value={selectedWeek || ''} onChange={(e) => setSelectedWeek(Number(e.target.value))}>
            {weekOptions.map((w) => <option key={w} value={w}>Week {w}</option>)}
          </select>
        </label>
        <label style={{ minWidth: 120 }}>
          Team
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="all">All</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <p className="meta-line">
        {filtered.length} players on the Week {selectedWeek} injury report &middot; Out/Doubtful is
        the closest real signal to "will not play," Questionable is a real game-time decision --
        this is the real data already driving Green Light Score's injury gate elsewhere in the app
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Player</th>
              <th>Pos</th>
              <th>Status</th>
              <th>Injury</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                <td>
                  <button className="team-link" onClick={() => openTeamSlide({ team: r.team })}>{r.team}</button>
                </td>
                <td>{r.name}</td>
                <td>{r.position}</td>
                <td>
                  <span className={r.status === 'Out' ? 'tier tier-fade' : r.status === 'Doubtful' ? 'tier tier-fringe' : 'tier tier-lean'}>
                    {r.status}
                  </span>
                </td>
                <td>{r.injury || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function InactivesTab() {
  const [view, setView] = useState('weekly')
  return (
    <div>
      <div className="sub-tabs" style={{ marginBottom: 10 }}>
        <button className={view === 'weekly' ? 'active' : ''} onClick={() => setView('weekly')}>
          Weekly Report
        </button>
        <button className={view === 'live' ? 'active' : ''} onClick={() => setView('live')}>
          Live Confirmation
        </button>
      </div>
      {view === 'weekly' ? <WeeklyReportView /> : <LiveConfirmationView />}
    </div>
  )
}

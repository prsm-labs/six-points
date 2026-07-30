import { useEffect, useMemo, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { useWeekTDs } from './useWeekTDs.js'

// TD Tracker is its own page, not a rename/extension of Live Themes -- Live Themes' job is
// clustering ("are TDs happening close together"), this page's job is a plain chronological
// list of every real TD for a selected week, with real box-score detail. Both share the same
// underlying ESPN scoring-play feed, same relationship Going Yard has between HRTrackerTab and
// LiveThemesTab.
//
// Known simplification: ESPN's play-by-play text has no player ID, only a display name, so
// there's no reliable crosswalk to our gsis_id-keyed player directory here -- scorer names are
// plain text, not clickable into the Player Slideout the way every other tab's player names are.

function TDRow({ td }) {
  return (
    <tr>
      <td>{td.game}</td>
      <td>Q{td.period} {td.clock}</td>
      <td>
        {td.teamLogo && <img src={td.teamLogo} alt={td.teamAbbr} className="avatar" style={{ marginRight: 6 }} />}
        {td.teamAbbr}
      </td>
      <td>{td.scorerName}</td>
      <td>{td.tdTypeLabel}</td>
      <td>{td.yards != null ? `${td.yards} yd` : '—'}</td>
      <td>{td.passerName || '—'}</td>
      <td>{td.awayScore}-{td.homeScore}</td>
    </tr>
  )
}

export default function TDTracker() {
  const [schedule, setSchedule] = useState(null)
  const [teamStats, setTeamStats] = useState(null)
  const [selectedWeek, setSelectedWeek] = useState(null)
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

  const { tds, error: tdError } = useWeekTDs(selectedWeek, schedule?.games, teamStats)
  const { sorted, sortKey, sortDir, toggleSort } = useSort(tds, 'gameday', 'desc')
  const thProps = { sortKey, sortDir, onSort: toggleSort }

  const weekOptions = useMemo(() => {
    if (!schedule) return []
    return [...new Set(schedule.games.map((g) => g.week))].sort((a, b) => b - a)
  }, [schedule])

  const summary = useMemo(() => {
    if (!tds || !tds.length) return null
    const longest = [...tds].sort((a, b) => (b.yards || 0) - (a.yards || 0))[0]
    const byType = {}
    tds.forEach((t) => { byType[t.tdTypeLabel] = (byType[t.tdTypeLabel] || 0) + 1 })
    return { total: tds.length, longest, byType }
  }, [tds])

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

      {tdError && <p className="empty-state">Couldn't load scoring plays ({tdError}).</p>}
      {!tds ? (
        <p className="empty-state">Resolving real ESPN game data and loading scoring plays...</p>
      ) : (
        <>
          {summary && (
            <div className="stat-grid" style={{ marginBottom: 14, maxWidth: 520 }}>
              <div className="stat-tile">
                <div className="value">{summary.total}</div>
                <div className="label">TDs this week</div>
              </div>
              {summary.longest && (
                <div className="stat-tile">
                  <div className="value">{summary.longest.yards}yd</div>
                  <div className="label">Longest ({summary.longest.scorerName})</div>
                </div>
              )}
            </div>
          )}
          <p className="meta-line">
            {tds.length} touchdowns, Week {selectedWeek} · click a column header to sort · scorer
            names are plain text here (ESPN's play-by-play has no player ID to cross-reference
            against our own player directory)
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Time</th>
                  <th>Team</th>
                  <SortTh label="Scorer" sortKeyName="scorerName" {...thProps} />
                  <th>Type</th>
                  <SortTh label="Yards" sortKeyName="yards" {...thProps} />
                  <th>Passer</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((td, i) => <TDRow td={td} key={i} />)}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

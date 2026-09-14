import { useEffect, useMemo, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { useWeekTDs } from './useWeekTDs.js'
import { usePlayerDirectory } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { formatETTime, etSlateDateStr } from './etTime.js'

// TD Tracker is its own page, not a rename/extension of Live Themes -- Live Themes' job is
// clustering ("are TDs happening close together"), this page's job is a plain chronological
// list of every real TD for a selected week, with real box-score detail. Both share the same
// underlying ESPN scoring-play feed.
//
// Known simplification: ESPN's scoring-play text has no player id, only a display name, so
// scorer/passer names are crosswalked to our own player directory by exact name match (not id
// match, unlike Box Score's athlete-id crosswalk) -- verified live against a real week's real
// scorer names. A handful of names may not match (suffix formatting differences, or the player
// is outside the app's scoped ~560-player directory, e.g. kickers/defense) -- those fall back to
// plain text rather than a broken link.
//
// Real chronological-ET ordering (PROMPT_SixPoints_GoingYardParity.md #5, mirroring Going
// Yard's HR Tracker): default sort is now `wallclock` (a real per-play absolute timestamp,
// api/summary.js joins it in from ESPN's drives data -- see scoringPlays.js's own comment) so
// every game's TDs merge into one true chronological feed across simultaneous games, not grouped
// by which game or sorted by calendar day alone. Same ET 4am-cutover slate-day convention as
// Going Yard (etTime.js) -- a TD past midnight ET on a late Sunday/Monday night game still shows
// as that night's slate, not the next calendar day.

// Elapsed-seconds-since-kickoff fallback for ordering two TDs when a real wallclock isn't
// available for one of them -- clock counts DOWN within a 15-minute quarter.
function elapsedSeconds(td) {
  const [mm, ss] = (td.clock || '0:00').split(':').map(Number)
  const remaining = (mm || 0) * 60 + (ss || 0)
  return ((td.period || 1) - 1) * 900 + (900 - remaining)
}

function PlayerLink({ name, nameToPlayer, team }) {
  if (!name) return '—'
  const match = nameToPlayer.get(name.toLowerCase())
  if (!match) return name
  return (
    <button
      className="team-link"
      onClick={() => openPlayerSlide({ player_id: match.playerId, player_name: match.name, team, position: match.position })}
    >
      {name}
    </button>
  )
}

function TDRow({ td, nameToPlayer, espnAbbrToNflverse }) {
  const nflverseAbbr = espnAbbrToNflverse.get(td.teamAbbr.toUpperCase()) || td.teamAbbr
  return (
    <tr>
      <td className="sticky-col">
        {td.isFirstTd && <span title="1st touchdown of the game" style={{ marginRight: 5 }}>🥇</span>}
        {td.game}
      </td>
      <td>
        {td.wallclock ? formatETTime(td.wallclock) : `Q${td.period} ${td.clock}`}
        <div className="meta-line small" style={{ margin: 0 }}>
          Q{td.period} {td.clock}
          {td.wallclock && etSlateDateStr(td.wallclock) !== td.gameday && ' · past midnight ET, same slate'}
        </div>
      </td>
      <td>
        <button className="team-link" onClick={() => openTeamSlide({ team: nflverseAbbr })}>
          {td.teamLogo && <img src={td.teamLogo} alt={td.teamAbbr} className="avatar" style={{ marginRight: 6 }} />}
          {td.teamAbbr}
        </button>
      </td>
      <td><PlayerLink name={td.scorerName} nameToPlayer={nameToPlayer} team={nflverseAbbr} /></td>
      <td>{td.tdTypeLabel}</td>
      <td>{td.yards != null ? `${td.yards} yd` : '—'}</td>
      <td><PlayerLink name={td.passerName} nameToPlayer={nameToPlayer} team={nflverseAbbr} /></td>
      <td>{td.awayScore}-{td.homeScore}</td>
    </tr>
  )
}

export default function TDTracker() {
  const [schedule, setSchedule] = useState(null)
  const [teamStats, setTeamStats] = useState(null)
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [error, setError] = useState(null)
  const directory = usePlayerDirectory()

  const nameToPlayer = useMemo(() => {
    const map = new Map()
    for (const [playerId, info] of Object.entries(directory)) {
      map.set(info.name.toLowerCase(), { playerId, name: info.name, position: info.position })
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

  const [team, setTeam] = useState('all')
  const [search, setSearch] = useState('')

  const tdsWithTeam = useMemo(() => {
    const withTeam = (tds || []).map((td) => ({ ...td, nflverseTeam: espnAbbrToNflverse.get(td.teamAbbr.toUpperCase()) || td.teamAbbr }))
    // Real 1st-TD-of-the-game badge (requested directly) -- earliest real wallclock timestamp
    // per gameId, falling back to elapsed game-clock (period + time remaining) for the rare row
    // missing a real wallclock (drives data unavailable for that game).
    const firstTdIdByGame = new Map()
    for (const td of withTeam) {
      const current = firstTdIdByGame.get(td.gameId)
      if (!current) {
        firstTdIdByGame.set(td.gameId, td)
        continue
      }
      const earlier = td.wallclock && current.wallclock
        ? td.wallclock < current.wallclock
        : elapsedSeconds(td) < elapsedSeconds(current)
      if (earlier) firstTdIdByGame.set(td.gameId, td)
    }
    const firstTdIds = new Set([...firstTdIdByGame.values()].map((td) => td.id))
    return withTeam.map((td) => ({ ...td, isFirstTd: firstTdIds.has(td.id) }))
  }, [tds, espnAbbrToNflverse])
  const teams = useMemo(() => [...new Set(tdsWithTeam.map((td) => td.nflverseTeam))].filter(Boolean).sort(), [tdsWithTeam])
  const filtered = useMemo(() => {
    return tdsWithTeam
      .filter((td) => team === 'all' || td.nflverseTeam === team)
      .filter((td) => !search || td.scorerName.toLowerCase().includes(search.toLowerCase()))
  }, [tdsWithTeam, team, search])

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtered, 'wallclock', 'desc')
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
      <div className="calc-block" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, maxWidth: 'none', marginBottom: 12 }}>
        <label style={{ minWidth: 110 }}>
          Week
          <select value={selectedWeek || ''} onChange={(e) => setSelectedWeek(Number(e.target.value))}>
            {weekOptions.map((w) => (
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>
        </label>
        <label style={{ minWidth: 110 }}>
          Team
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="all">All</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label style={{ flex: 1, minWidth: 160 }}>
          Scorer
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search scorer name..." />
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
            {sorted.length} of {tds.length} touchdowns, Week {selectedWeek} · sorted by real ET
            time by default, merging every simultaneous game into one true chronological feed ·
            🥇 marks the real 1st touchdown of that game · click a column header to sort · team
            and player names open their slideout where a match is found (a few scorers, mostly
            defense/special teams, sit outside the app's player directory and stay plain text)
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="sticky-col">Game</th>
                  <SortTh label="Time (ET)" sortKeyName="wallclock" {...thProps} />
                  <th>Team</th>
                  <SortTh label="Scorer" sortKeyName="scorerName" {...thProps} />
                  <th>Type</th>
                  <SortTh label="Yards" sortKeyName="yards" {...thProps} />
                  <th>Passer</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((td, i) => (
                  <TDRow td={td} key={i} nameToPlayer={nameToPlayer} espnAbbrToNflverse={espnAbbrToNflverse} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

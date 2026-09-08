import { useEffect, useMemo, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { useWeekTDs } from './useWeekTDs.js'

// First Touchdown -- the real NFL prop market (First TD Scorer / Team to Score First), not just
// "anytime TD" (already Paydirt Lab's job). Two real, distinct halves:
//
// Predictor: this week's players ranked by a real, disclosed-v1 first_td_pct from
// matchup_engine.py (real per-team trailing "who wins the race to score first" rate, shrunk
// toward a neutral 50% via K_FIRST_TD_TEAM, multiplied by the player's own real red-zone role
// share (usage_sig/14) -- reused, not a second parallel per-player signal built from a much
// thinner sample). team_first_td_pct is the same team-level rate shown as its own column (the
// "1st Team TD" ask). No first-TD Track Record exists yet to validate this against -- same
// first-guess-until-backtested posture as every other new v1 signal in this app.
//
// Tracker: real history of who ACTUALLY scored first each week -- reuses the exact same live
// ESPN scoring-play feed TD Tracker already has (useWeekTDs), just takes the first row per game
// instead of every row, since ESPN returns each game's scoring plays in real chronological order.

const PASS_DEPENDENT_NOTE = 'v1, unvalidated -- see the tab note above'

function PredictorTable() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [position, setPosition] = useState('all')
  const [team, setTeam] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/data/all_matchups_latest.json')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  const teams = useMemo(
    () => [...new Set((data?.matchups || []).map((m) => m.team))].filter(Boolean).sort(),
    [data]
  )
  const filtered = useMemo(() => {
    if (!data) return []
    return data.matchups
      .filter((m) => position === 'all' || m.position === position)
      .filter((m) => team === 'all' || m.team === team)
      .filter((m) => !search || m.player_name.toLowerCase().includes(search.toLowerCase()))
  }, [data, position, team, search])

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtered, 'first_td_pct', 'desc')
  const thProps = { sortKey, sortDir, onSort: toggleSort }

  if (error) {
    return (
      <p className="empty-state">
        No matchup data yet ({error}). Run <code>python matchup_engine.py --season 2025 --week N</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!data) return <p className="empty-state">Loading...</p>

  return (
    <div>
      <div className="calc-block" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, maxWidth: 'none', marginBottom: 12 }}>
        <label style={{ minWidth: 110 }}>
          Position
          <select value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="all">All</option>
            <option value="QB">QB</option>
            <option value="RB">RB</option>
            <option value="WR">WR</option>
            <option value="TE">TE</option>
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
          Player
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search player name..." />
        </label>
      </div>
      <p className="meta-line">
        Season {data.season}, Week {data.week} &middot; {sorted.length} of {data.matchups.length}{' '}
        players &middot; First TD % = real team first-scoring rate &times; this player's own
        red-zone role share ({PASS_DEPENDENT_NOTE}) &middot; 1st Team TD % is that same team rate
        shown on its own &middot; click a column header to sort
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh label="Player" sortKeyName="player_name" {...thProps} />
              <SortTh label="Team" sortKeyName="team" {...thProps} />
              <SortTh label="Opp" sortKeyName="opponent" {...thProps} />
              <SortTh label="Pos" sortKeyName="position" {...thProps} />
              <SortTh label="Usage Sig" sortKeyName="usage_sig" {...thProps} />
              <SortTh label="1st Team TD %" sortKeyName="team_first_td_pct" {...thProps} />
              <SortTh label="1st TD %" sortKeyName="first_td_pct" {...thProps} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, i) => (
              <tr key={i}>
                <td>
                  <div className="player-cell" onClick={() => openPlayerSlide(m)}>
                    <PlayerAvatar playerId={m.player_id} name={m.player_name} />
                    {m.player_name}
                  </div>
                </td>
                <td>
                  <button className="team-link" onClick={() => openTeamSlide({ team: m.team })}>{m.team}</button>
                </td>
                <td>
                  <button className="team-link" onClick={() => openTeamSlide({ team: m.opponent, context: 'defense' })}>
                    {m.opponent}
                  </button>
                </td>
                <td>{m.position}</td>
                <td>{Number(m.usage_sig).toFixed(1)}</td>
                <td>{Number(m.team_first_td_pct).toFixed(1)}%</td>
                <td className="zone-score">{Number(m.first_td_pct).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TrackerTable() {
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

  const firstTds = useMemo(() => {
    if (!tds) return null
    const seen = new Set()
    const firsts = []
    for (const td of tds) {
      if (seen.has(td.gameId)) continue
      seen.add(td.gameId)
      firsts.push(td)
    }
    return firsts
  }, [tds])

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
            {weekOptions.map((w) => <option key={w} value={w}>Week {w}</option>)}
          </select>
        </label>
      </div>
      {tdError && <p className="empty-state">Couldn't load scoring plays ({tdError}).</p>}
      {!firstTds ? (
        <p className="empty-state">Resolving real ESPN game data and loading scoring plays...</p>
      ) : (
        <>
          <p className="meta-line">
            {firstTds.length} games with a real first-TD scorer, Week {selectedWeek} &middot; the
            real first touchdown of each game, chronologically -- not a prediction, this already
            happened
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Time</th>
                  <th>1st Team TD</th>
                  <th>1st TD Scorer</th>
                  <th>Type</th>
                  <th>Yards</th>
                </tr>
              </thead>
              <tbody>
                {firstTds.map((td, i) => (
                  <tr key={i}>
                    <td>{td.game}</td>
                    <td>Q{td.period} {td.clock}</td>
                    <td>
                      {td.teamLogo && <img src={td.teamLogo} alt={td.teamAbbr} className="avatar" style={{ marginRight: 6 }} />}
                      {td.teamAbbr}
                    </td>
                    <td>{td.scorerName}</td>
                    <td>{td.tdTypeLabel}</td>
                    <td>{td.yards != null ? `${td.yards} yd` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default function FirstTDTab() {
  const [view, setView] = useState('predictor')
  return (
    <div>
      <div className="sub-tabs">
        <button className={view === 'predictor' ? 'active' : ''} onClick={() => setView('predictor')}>
          Predictor
        </button>
        <button className={view === 'tracker' ? 'active' : ''} onClick={() => setView('tracker')}>
          Tracker
        </button>
      </div>
      {view === 'predictor' ? <PredictorTable /> : <TrackerTable />}
    </div>
  )
}

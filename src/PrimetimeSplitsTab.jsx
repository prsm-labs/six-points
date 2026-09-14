import { useEffect, useMemo, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { usePlayerDirectory, PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'

// Real per-player primetime vs. non-primetime splits -- a lookup/comparison tool, NOT a
// predictor. Built after the "does usage shift away from stars in primetime" hypothesis was
// actually tested against the full real 2025 season (272 games, 55 primetime) and did NOT hold
// up: paired same-player usage-share deltas were small and not statistically significant for a
// team's top-2 touch leaders (t=-1.46 on usage share, t=-1.55 on yards/touch efficiency -- both
// under the ~1.96 threshold), and RB-only/WR-TE-only splits told the same story. Building a
// confident predictive feature on a non-significant signal would be exactly the kind of
// invented, untested weight this project's validation culture exists to avoid -- so this page
// just shows the real numbers side by side instead of predicting anything.
//
// "Primetime" is a real, derived flag (nflverse's schedule has no direct network/broadcast
// column) -- Thursday/Sunday/Monday/Saturday games with a real kickoff at or after 7:30pm local
// (the same weekday+gametime-based definition used in the analysis above). Saturday only
// applies in the late-season weeks it's actually used.
//
// Computed entirely client-side from data already being fetched elsewhere (season_schedule.json
// for the real weekday+gametime per game, player_game_logs.json for real per-game box scores) --
// no new pipeline work needed.

function isPrimetimeGame(gameday, gametime) {
  if (!gameday || !gametime) return false
  const [h, m] = gametime.split(':').map(Number)
  if (Number.isNaN(h)) return false
  const mins = h * 60 + (m || 0)
  // Parse as UTC so the weekday doesn't shift with the viewer's own timezone -- gameday is a
  // bare calendar date (no time component) and only the weekday matters here.
  const weekday = new Date(`${gameday}T00:00:00Z`).getUTCDay() // 0=Sun, 4=Thu, 1=Mon, 6=Sat
  const isPrimetimeWeekday = weekday === 0 || weekday === 1 || weekday === 4 || weekday === 6
  return isPrimetimeWeekday && mins >= 19 * 60 + 30
}

function emptySplit() {
  return { games: 0, touches: 0, yards: 0, tds: 0 }
}

function addGame(split, g) {
  split.games += 1
  split.touches += (g.rush_att || 0) + (g.targets || 0)
  split.yards += (g.rush_yards || 0) + (g.rec_yards || 0) + (g.pass_yards || 0)
  split.tds += g.any_td || 0
}

function perGame(split) {
  if (split.games === 0) return null
  return {
    games: split.games,
    touchesPg: split.touches / split.games,
    yardsPg: split.yards / split.games,
    tdRate: split.tds / split.games,
  }
}

export default function PrimetimeSplitsTab() {
  const [schedule, setSchedule] = useState(null)
  const [gameLogs, setGameLogs] = useState(null)
  const [error, setError] = useState(null)
  const directory = usePlayerDirectory()

  const [position, setPosition] = useState('all')
  const [team, setTeam] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/data/season_schedule.json').then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      }),
      fetch('/data/player_game_logs.json').then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      }),
    ])
      .then(([sched, logs]) => {
        setSchedule(sched)
        setGameLogs(logs)
      })
      .catch((e) => setError(e.message))
  }, [])

  // (team, week) -> is this real game primetime
  const primetimeByTeamWeek = useMemo(() => {
    if (!schedule) return new Map()
    const map = new Map()
    for (const g of schedule.games) {
      const primetime = isPrimetimeGame(g.gameday, g.gametime)
      map.set(`${g.home_team}:${g.week}`, primetime)
      map.set(`${g.away_team}:${g.week}`, primetime)
    }
    return map
  }, [schedule])

  const rows = useMemo(() => {
    if (!gameLogs) return []
    const out = []
    for (const [playerId, games] of Object.entries(gameLogs)) {
      const info = directory[playerId]
      if (!info) continue
      const pt = emptySplit()
      const nonPt = emptySplit()
      let lastTeam = null
      for (const g of games) {
        lastTeam = g.team
        const isPt = primetimeByTeamWeek.get(`${g.team}:${g.week}`)
        addGame(isPt ? pt : nonPt, g)
      }
      const ptStats = perGame(pt)
      if (!ptStats) continue // only players with at least 1 real primetime game
      const nonPtStats = perGame(nonPt)
      // Flat keys, not nested -- useSort's sort key is a direct property lookup (a[sortKey]),
      // it doesn't walk dotted paths like "pt.touchesPg" into a nested object.
      out.push({
        playerId,
        name: info.name,
        position: info.position,
        team: lastTeam,
        ptGames: ptStats.games,
        ptTouchesPg: ptStats.touchesPg,
        ptYardsPg: ptStats.yardsPg,
        ptTdRate: ptStats.tdRate,
        nonPtGames: nonPtStats ? nonPtStats.games : null,
        nonPtTouchesPg: nonPtStats ? nonPtStats.touchesPg : null,
        nonPtYardsPg: nonPtStats ? nonPtStats.yardsPg : null,
        touchesDelta: nonPtStats ? ptStats.touchesPg - nonPtStats.touchesPg : null,
      })
    }
    return out
  }, [gameLogs, directory, primetimeByTeamWeek])

  const teams = useMemo(() => [...new Set(rows.map((r) => r.team))].filter(Boolean).sort(), [rows])
  const filtered = useMemo(() => {
    return rows
      .filter((r) => position === 'all' || r.position === position)
      .filter((r) => team === 'all' || r.team === team)
      .filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()))
  }, [rows, position, team, search])

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtered, 'ptTouchesPg', 'desc')
  const thProps = { sortKey, sortDir, onSort: toggleSort }

  if (error) {
    return (
      <p className="empty-state">
        No game log data yet ({error}). Run <code>python matchup_engine.py --season 2026</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!schedule || !gameLogs) return <p className="empty-state">Loading...</p>

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
        {sorted.length} real players with at least 1 real primetime game (Thu/Sun/Mon/Sat kickoff
        at or after 7:30pm local) &middot; a lookup tool, not a predictor -- a full-season check
        found no statistically significant primetime usage or efficiency shift for a team's top
        players specifically, so this deliberately doesn't score or rank anyone by it &middot;
        players need only 1 primetime game to appear, so a small sample can swing wildly -- read
        the Games column before trusting a big delta
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh label="Player" sortKeyName="name" className="sticky-col" {...thProps} />
              <SortTh label="Team" sortKeyName="team" {...thProps} />
              <SortTh label="Pos" sortKeyName="position" {...thProps} />
              <SortTh label="PT Games" sortKeyName="ptGames" {...thProps} />
              <SortTh label="PT Touches/G" sortKeyName="ptTouchesPg" {...thProps} />
              <SortTh label="PT Yards/G" sortKeyName="ptYardsPg" {...thProps} />
              <SortTh label="PT TD/G" sortKeyName="ptTdRate" {...thProps} />
              <SortTh label="Non-PT Games" sortKeyName="nonPtGames" {...thProps} />
              <SortTh label="Non-PT Touches/G" sortKeyName="nonPtTouchesPg" {...thProps} />
              <SortTh label="Non-PT Yards/G" sortKeyName="nonPtYardsPg" {...thProps} />
              <SortTh label="Touches Δ" sortKeyName="touchesDelta" {...thProps} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.playerId}>
                <td className="sticky-col">
                  <div className="player-cell" onClick={() => openPlayerSlide({ player_id: r.playerId, player_name: r.name, team: r.team, position: r.position })}>
                    <PlayerAvatar playerId={r.playerId} name={r.name} />
                    {r.name}
                  </div>
                </td>
                <td><button className="team-link" onClick={() => openTeamSlide({ team: r.team })}>{r.team}</button></td>
                <td>{r.position}</td>
                <td>{r.ptGames}</td>
                <td className="zone-score">{r.ptTouchesPg.toFixed(1)}</td>
                <td>{r.ptYardsPg.toFixed(1)}</td>
                <td>{r.ptTdRate.toFixed(2)}</td>
                <td>{r.nonPtGames != null ? r.nonPtGames : '—'}</td>
                <td>{r.nonPtTouchesPg != null ? r.nonPtTouchesPg.toFixed(1) : '—'}</td>
                <td>{r.nonPtYardsPg != null ? r.nonPtYardsPg.toFixed(1) : '—'}</td>
                <td className={r.touchesDelta != null ? (r.touchesDelta > 0 ? 'zone-score' : undefined) : undefined}>
                  {r.touchesDelta != null ? `${r.touchesDelta > 0 ? '+' : ''}${r.touchesDelta.toFixed(1)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

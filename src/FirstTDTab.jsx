import { useEffect, useMemo, useState } from 'react'
import ViewPicker from './ViewPicker.jsx'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { useWeekTDs } from './useWeekTDs.js'
import { useMatchup, isInSelectedMatchup, selectedGames } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import { setPosition, usePosition } from './positionFilter.js'
import PickButton from './PickButton.jsx'
import { useMasterSearch, useMasterTeam } from './masterFilter.js'
import './RiskBoard.css' // the L5 strip reuses the L7 hit-strip squares

// First Touchdown -- the real NFL prop market (First TD Scorer / Team to Score First), not just
// "anytime TD" (already Paydirt Lab's job). Two real, distinct halves:
//
// 2026-10-26: first_td_pct is now matchup_engine.apply_first_td -- competing clocks from each player's backtested TD chance
// (rate -ln(1 - p_td) over every rate in the game x 0.93), held out 2023-25: first TDs said 233 / 236 / 240 vs 240 / 237 / 232
// (the old formula below said 18% too many), scorer log loss 3.03-3.21 -> 2.83-2.85; 1st Team TD % = the team's share.
// Old note -- Predictor: this week's players ranked by a real, disclosed-v1 first_td_pct from
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

const PASS_DEPENDENT_NOTE = 'backtested 2023-25 -- calibrated, beats the old team-race formula every season'

function PredictorTable() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const position = usePosition() // app-wide (positionFilter.js) -- this dropdown and the chip row share one value
  const team = useMasterTeam() || 'all' // 2026-10-23: from the header (MasterFilter); this page's picker retired
  const search = useMasterSearch() // 2026-10-23: the header search; this page's box retired

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
  const { selectedMatchup } = useMatchup()
  const filtered = useMemo(() => {
    if (!data) return []
    return data.matchups
      .filter((m) => position === 'all' || m.position === position)
      .filter((m) => selectedMatchup ? isInSelectedMatchup(selectedMatchup, m.team) : (team === 'all' || m.team === team))
      .filter((m) => !search || m.player_name.toLowerCase().includes(search.toLowerCase()))
  }, [data, position, team, search, selectedMatchup])

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
      {/* 2026-11-05: position comes from the app-wide Position dropdown under the game strip (this page's own copy removed) */}
      <MatchupFilterNote />
      <p className="meta-line">
        Season {data.season}, Week {data.week} &middot; {sorted.length} of {data.matchups.length}{' '}
        players &middot; First TD % = this player's share of every TD chance in his game (each player's
        TD % as a scoring rate; {PASS_DEPENDENT_NOTE}) &middot; 1st Team TD % = his team's share &middot; click a
        column header to sort
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh label="Player" sortKeyName="player_name" className="sticky-col" {...thProps} />
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
                <td className="sticky-col">
                  <div className="player-cell" onClick={() => openPlayerSlide(m)}>
                    <PlayerAvatar playerId={m.player_id} name={m.player_name} />
                    {m.player_name} <PickButton player={m} compact prop="first" />
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
  const { selectedMatchup } = useMatchup()

  const firstTds = useMemo(() => {
    if (!tds) return null
    const seen = new Set()
    const firsts = []
    for (const td of tds) {
      if (seen.has(td.gameId)) continue
      seen.add(td.gameId)
      firsts.push(td)
    }
    if (selectedMatchup) {
      return firsts.filter((td) => selectedGames(selectedMatchup).some((g) => td.game.includes(g.home) && td.game.includes(g.away)))
    }
    return firsts
  }, [tds, selectedMatchup])

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
      <MatchupFilterNote />
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
                  <th className="sticky-col">Game</th>
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
                    <td className="sticky-col">{td.game}</td>
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

// 2026-11-01 Stats (user: "a first touchdown stat table, listing all players and their touchdown totals, first touchdown and
// first team touchdown and a mini 1st TD L5 strip"). first_td_stats.json (build_first_td.py, nflverse play-by-play, daily):
// this season's games, TDs, the game's first TD, his team's first TD, and his last 5 games. Context only.
const L5_CLASS = (g) => (g.ftd ? 'y' : g.ftt ? 't' : 'n')
const L5_TEXT = (g) => (g.ftd ? 'first TD of the game' : g.ftt ? "his team's first TD" : g.td ? `${g.td} TD, not first` : 'no TD')

function FirstTdStrip({ games }) {
  if (!games?.length) return <span className="rb-muted">—</span>
  const n = games.filter((g) => g.ftd).length
  return (
    <span className="hit-strip ftd-strip" title={`Last ${games.length} games: ${n} first TD of the game`}>
      {games.map((g, i) => (
        <i key={i} className={L5_CLASS(g)} title={`Wk ${g.w} vs ${g.opp}: ${L5_TEXT(g)}`}
          style={L5_CLASS(g) === 't' ? { background: 'color-mix(in srgb, var(--rb-good) 38%, transparent)' } : undefined} />
      ))}
      <b>{n}/{games.length}</b>
    </span>
  )
}

function StatsTable() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const position = usePosition()
  const team = useMasterTeam() || 'all'
  const search = useMasterSearch()
  const { selectedMatchup } = useMatchup()
  useEffect(() => {
    fetch('/data/first_td_stats.json')
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json() })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])
  const rows = useMemo(() => (data?.players || [])
    .map((p) => ({ ...p, ftdPct: p.gp ? p.ftd / p.gp : 0, fttPct: p.gp ? p.ftt / p.gp : 0, l5: p.last5.filter((g) => g.ftd).length }))
    .filter((p) => position === 'all' || p.pos === position)
    .filter((p) => (selectedMatchup ? isInSelectedMatchup(selectedMatchup, p.team) : team === 'all' || p.team === team))
    .filter((p) => !search || `${p.name} ${p.team}`.toLowerCase().includes(search.toLowerCase())), [data, position, team, search, selectedMatchup])
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, 'ftd', 'desc')
  const thProps = { sortKey, sortDir, onSort: toggleSort }
  if (error) return <p className="empty-state">No first-TD stats yet ({error}).</p>
  if (!data) return <p className="empty-state">Loading...</p>
  const pct = (v) => `${Math.round(v * 100)}%`
  return (
    <div>
      <MatchupFilterNote />
      <p className="meta-line">
        {data.season} season through week {data.throughWeek} ({data.games} games) &middot; {sorted.length} players &middot;
        1st TD = scored his game's first touchdown &middot; 1st Team TD = scored his team's first touchdown (includes 1st TD games)
        &middot; L5: green = first TD of the game, light green = team's first, red = neither &middot; a passing TD counts for the
        receiver &middot; RZ = snaps at the opponent's 20 or closer: targets, rush attempts, and Usage = his share of his team's
        red zone targets + rushes in his games &middot; updated each morning from the play-by-play
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh label="Player" sortKeyName="name" className="sticky-col" {...thProps} />
              <SortTh label="Team" sortKeyName="team" {...thProps} />
              <SortTh label="Pos" sortKeyName="pos" {...thProps} />
              <SortTh label="GP" sortKeyName="gp" {...thProps} />
              <SortTh label="TDs" sortKeyName="tds" {...thProps} />
              <SortTh label="1st TD" sortKeyName="ftd" {...thProps} />
              <SortTh label="1st TD %" sortKeyName="ftdPct" {...thProps} />
              <SortTh label="1st Team TD" sortKeyName="ftt" {...thProps} />
              <SortTh label="1st Team TD %" sortKeyName="fttPct" {...thProps} />
              <SortTh label="L5 · 1st TD" sortKeyName="l5" {...thProps} />
              <SortTh label="RZ Tgt" sortKeyName="rzTgt" {...thProps} />
              <SortTh label="RZ Rush" sortKeyName="rzRush" {...thProps} />
              <SortTh label="RZ Usage" sortKeyName="rzShare" {...thProps} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.pid}>
                <td className="sticky-col">
                  <div className="player-cell" onClick={() => openPlayerSlide({ player_id: p.pid, player_name: p.name, team: p.team, position: p.pos })}>
                    <PlayerAvatar playerId={p.pid} name={p.name} />
                    {p.name}
                  </div>
                </td>
                <td><button className="team-link" onClick={() => openTeamSlide({ team: p.team })}>{p.team}</button></td>
                <td>{p.pos || '—'}</td>
                <td>{p.gp}</td>
                <td>{p.tds}</td>
                <td className="zone-score">{p.ftd}</td>
                <td>{pct(p.ftdPct)}</td>
                <td>{p.ftt}</td>
                <td>{pct(p.fttPct)}</td>
                <td><FirstTdStrip games={p.last5} /></td>
                <td>{p.rzTgt ?? '—'}</td>
                <td>{p.rzRush ?? '—'}</td>
                <td>{p.rzShare == null ? '—' : pct(p.rzShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function FirstTDTab() {
  const [view, setView] = useState('predictor')
  return (
    <div>
      <div>
        <ViewPicker pillClass="pill-btn" rowClass="pill-row hub-row" label="1st TD" value={view} onChange={setView}
          options={[['predictor', 'Predictor'], ['stats', 'Stats'], ['tracker', 'Tracker']]} />
      </div>
      {view === 'predictor' ? <PredictorTable /> : view === 'stats' ? <StatsTable /> : <TrackerTable />}
    </div>
  )
}

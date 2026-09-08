import { useEffect, useMemo, useState } from 'react'
import './App.css'
import PaydirtLab from './PaydirtLab.jsx'
import YardageLab from './YardageLab.jsx'
import PairsPage from './PairsPage.jsx'
import LiveTab from './LiveTab.jsx'
import WeatherTab from './WeatherTab.jsx'
import TDTracker from './TDTracker.jsx'
import TDMarquee from './TDMarquee.jsx'
import SplitsTab from './SplitsTab.jsx'
import CheatSheetTab from './CheatSheetTab.jsx'
import ScoutingTab from './ScoutingTab.jsx'
import DepthChartTab from './DepthChartTab.jsx'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import PlayerSlideout from './PlayerSlideout.jsx'
import TeamSlideout from './TeamSlideout.jsx'
import OddsCalculator from './OddsCalculator.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/)
  const headers = headerLine.split(',')
  return lines.map((line) => {
    const values = line.split(',')
    const row = {}
    headers.forEach((h, i) => {
      row[h] = values[i]
    })
    return row
  })
}

function tierClass(tier) {
  switch (tier) {
    case 'Lock':
      return 'tier tier-lock'
    case 'Lean':
      return 'tier tier-lean'
    case 'Fringe':
      return 'tier tier-fringe'
    default:
      return 'tier tier-fade'
  }
}

// Item 5, PROMPT_SixPoints_SeasonKickoff_Prep.md: the live site was confirmed serving a full
// 2025 backtest with no on-screen indicator it wasn't current -- mounted in the header (visible
// on every tab, not just All Matchups) so staleness is never silently invisible. Reads the real
// `generated_at`/season/week matchup_engine.py now writes into all_matchups_latest.json itself.
function DataFreshnessBanner() {
  const [meta, setMeta] = useState(null)

  useEffect(() => {
    fetch('/data/all_matchups_latest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setMeta({ season: d.season, week: d.week, generatedAt: d.generated_at }))
      .catch(() => {})
  }, [])

  if (!meta) return null
  const generated = meta.generatedAt ? new Date(meta.generatedAt) : null
  return (
    <p className="data-freshness">
      Data as of: {meta.season} Week {meta.week}
      {generated && ` · generated ${generated.toLocaleString()}`}
    </p>
  )
}

function AllMatchups() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/data/all_matchups_latest.json')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  if (error) {
    return (
      <p className="empty-state">
        No matchup data yet ({error}). Run <code>python matchup_engine.py --season 2025 --week N</code> from
        the project root to generate <code>public/data/all_matchups_latest.json</code>.
      </p>
    )
  }
  return <AllMatchupsTable data={data} />
}

function AllMatchupsTable({ data }) {
  const [position, setPosition] = useState('all')
  const [team, setTeam] = useState('all')
  const [opponent, setOpponent] = useState('all')
  const [search, setSearch] = useState('')

  const teams = useMemo(
    () => [...new Set((data?.matchups || []).map((m) => m.team))].filter(Boolean).sort(),
    [data]
  )
  const filtered = useMemo(() => {
    if (!data) return []
    return data.matchups
      .filter((m) => position === 'all' || m.position === position)
      .filter((m) => team === 'all' || m.team === team)
      .filter((m) => opponent === 'all' || m.opponent === opponent)
      .filter((m) => !search || m.player_name.toLowerCase().includes(search.toLowerCase()))
  }, [data, position, team, opponent, search])

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtered, 'zone_score', 'desc')

  if (!data) return <p className="empty-state">Loading...</p>

  const thProps = { sortKey, sortDir, onSort: toggleSort }

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
        <label style={{ minWidth: 110 }}>
          Opponent
          <select value={opponent} onChange={(e) => setOpponent(e.target.value)}>
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
        Season {data.season}, Week {data.week} &middot; {sorted.length} of {data.matchups.length} matchups
        &middot; all weights are v1 first-guesses, unvalidated beyond the Track Record backtest
        below &middot; click a column header to sort
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
              <SortTh label="gTD" sortKeyName="gtd" {...thProps} />
              <SortTh label="Explosive" sortKeyName="explosive_score" {...thProps} />
              <SortTh label="Green Light" sortKeyName="green_light" {...thProps} />
              <SortTh label="Zone Score" sortKeyName="zone_score" {...thProps} />
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
                  <button className="team-link" onClick={() => openTeamSlide({ team: m.team })}>
                    {m.team}
                  </button>
                </td>
                <td>
                  <button className="team-link" onClick={() => openTeamSlide({ team: m.opponent, context: 'defense' })}>
                    {m.opponent}
                  </button>
                </td>
                <td>{m.position}</td>
                <td>{Number(m.usage_sig).toFixed(1)}</td>
                <td>{Number(m.gtd).toFixed(1)}</td>
                <td>{Number(m.explosive_score).toFixed(1)}</td>
                <td>{Number(m.green_light).toFixed(1)}</td>
                <td className="zone-score">{Number(m.zone_score).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TrackRecord() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/data/track_record.csv')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.text()
      })
      .then((text) => setRows(parseCsv(text)))
      .catch((e) => setError(e.message))
  }, [])

  const tierStats = useMemo(() => {
    if (!rows) return []
    const order = ['Fade', 'Fringe', 'Lean', 'Lock']
    const groups = {}
    for (const r of rows) {
      const tier = r.predicted_tier
      if (!groups[tier]) groups[tier] = { n: 0, hits: 0 }
      groups[tier].n += 1
      if (r.hit === 'True') groups[tier].hits += 1
    }
    return order
      .filter((t) => groups[t])
      .map((t) => ({
        tier: t,
        n: groups[t].n,
        hitRate: groups[t].hits / groups[t].n,
      }))
  }, [rows])

  const weekOptions = useMemo(() => {
    if (!rows) return []
    const seen = new Set()
    const opts = []
    for (const r of rows) {
      const key = `${r.season}-${r.week}`
      if (seen.has(key)) continue
      seen.add(key)
      opts.push({ key, season: r.season, week: Number(r.week) })
    }
    return opts.sort((a, b) => b.season - a.season || b.week - a.week)
  }, [rows])

  const [selectedWeek, setSelectedWeek] = useState('all')

  const weekRows = useMemo(() => {
    if (!rows || selectedWeek === 'all') return []
    // parseCsv keeps every field as a string -- useSort's numeric branch only kicks in for
    // non-strings, so zone_score/actual_tds need coercing here or they'd sort lexicographically
    // ("9" > "10") instead of numerically.
    return rows
      .filter((r) => `${r.season}-${r.week}` === selectedWeek)
      .map((r) => ({ ...r, zone_score: Number(r.zone_score), actual_tds: Number(r.actual_tds) }))
  }, [rows, selectedWeek])

  if (error) {
    return (
      <p className="empty-state">
        No track record data yet ({error}). Run{' '}
        <code>python matchup_engine.py --season 2025 --backtest</code> from the project root to generate
        <code> public/data/track_record.csv</code>.
      </p>
    )
  }
  if (!rows) return <p className="empty-state">Loading...</p>

  return (
    <div>
      <p className="meta-line">
        {rows.length} scored player-weeks tracked against real outcomes &middot; every Zone Score
        prediction this app has ever made gets logged here, hit or miss
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Predicted Tier</th>
              <th>Sample Size</th>
              <th>Actual TD Hit Rate</th>
            </tr>
          </thead>
          <tbody>
            {tierStats.map((s) => (
              <tr key={s.tier}>
                <td>
                  <span className={tierClass(s.tier)}>{s.tier}</span>
                </td>
                <td>{s.n}</td>
                <td>{(s.hitRate * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta-line small">
        Hit rate should climb monotonically Fade &rarr; Fringe &rarr; Lean &rarr; Lock. If it doesn't,
        the scoring weights need correcting -- that's what this tab is for.
      </p>

      <div className="calc-block" style={{ marginTop: 24, marginBottom: 12 }}>
        <label>
          Browse a specific week's backfilled predictions
          <select value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}>
            <option value="all">Select a week...</option>
            {weekOptions.map((w) => (
              <option key={w.key} value={w.key}>
                {w.season} &middot; Week {w.week}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selectedWeek !== 'all' && <WeekDrillDown rows={weekRows} />}
    </div>
  )
}

function WeekDrillDown({ rows }) {
  const [position, setPosition] = useState('all')
  const [team, setTeam] = useState('all')
  const [search, setSearch] = useState('')

  const teams = useMemo(() => [...new Set(rows.map((r) => r.team))].filter(Boolean).sort(), [rows])
  const filtered = useMemo(() => {
    return rows
      .filter((r) => position === 'all' || r.position === position)
      .filter((r) => team === 'all' || r.team === team)
      .filter((r) => !search || r.player_name.toLowerCase().includes(search.toLowerCase()))
  }, [rows, position, team, search])

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtered, 'zone_score', 'desc')
  const thProps = { sortKey, sortDir, onSort: toggleSort }

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
      <p className="meta-line">{sorted.length} of {rows.length} predictions this week</p>
      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <SortTh label="Team" sortKeyName="team" {...thProps} />
            <SortTh label="Player" sortKeyName="player_name" {...thProps} />
            <SortTh label="Pos" sortKeyName="position" {...thProps} />
            <SortTh label="Opp" sortKeyName="opponent" {...thProps} />
            <SortTh label="Zone Score" sortKeyName="zone_score" {...thProps} />
            <SortTh label="Predicted Tier" sortKeyName="predicted_tier" {...thProps} />
            <SortTh label="Actual TDs" sortKeyName="actual_tds" {...thProps} />
            <th>Hit</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i}>
              <td>
                <button className="team-link" onClick={() => openTeamSlide({ team: r.team })}>
                  {r.team}
                </button>
              </td>
              <td>
                <div
                  className="player-cell"
                  onClick={() => openPlayerSlide({ player_id: r.player_id, player_name: r.player_name, team: r.team, opponent: r.opponent, position: r.position })}
                >
                  <PlayerAvatar playerId={r.player_id} name={r.player_name} />
                  {r.player_name}
                </div>
              </td>
              <td>{r.position}</td>
              <td>
                <button className="team-link" onClick={() => openTeamSlide({ team: r.opponent, context: 'defense' })}>
                  {r.opponent}
                </button>
              </td>
              <td className="zone-score">{Number(r.zone_score).toFixed(1)}</td>
              <td>
                <span className={tierClass(r.predicted_tier)}>{r.predicted_tier}</span>
              </td>
              <td>{r.actual_tds}</td>
              <td>{r.hit === 'True' ? '✓' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}


export default function App() {
  const [tab, setTab] = useState('matchups')
  const [showOddsCalc, setShowOddsCalc] = useState(false)

  return (
    <div className="app">
      <header>
        <div className="header-row">
          <img src="/logo.png" alt="Six Points" className="logo" />
          <h1>Six Points</h1>
          <button
            className="odds-calc-toggle"
            onClick={() => setShowOddsCalc(true)}
            title="Odds Calculator"
            aria-label="Open Odds Calculator"
          >
            🧮
          </button>
        </div>
        <p className="tagline">NFL touchdown intelligence, weekly cadence, real backtests only.</p>
        <DataFreshnessBanner />
      </header>
      <TDMarquee onClick={() => setTab('tdtracker')} />
      <nav className="tabs">
        <button className={tab === 'matchups' ? 'active' : ''} onClick={() => setTab('matchups')}>
          All Matchups
        </button>
        <button className={tab === 'paydirt' ? 'active' : ''} onClick={() => setTab('paydirt')}>
          Paydirt Lab
        </button>
        <button className={tab === 'yardage' ? 'active' : ''} onClick={() => setTab('yardage')}>
          Yardage Lab
        </button>
        <button className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>
          Live
        </button>
        <button className={tab === 'tdtracker' ? 'active' : ''} onClick={() => setTab('tdtracker')}>
          TD Tracker
        </button>
        <button className={tab === 'track' ? 'active' : ''} onClick={() => setTab('track')}>
          Track Record
        </button>
        <button className={tab === 'pairs' ? 'active' : ''} onClick={() => setTab('pairs')}>
          Pairs
        </button>
        <button className={tab === 'weather' ? 'active' : ''} onClick={() => setTab('weather')}>
          Weather
        </button>
        <button className={tab === 'splits' ? 'active' : ''} onClick={() => setTab('splits')}>
          Splits
        </button>
        <button className={tab === 'cheatsheet' ? 'active' : ''} onClick={() => setTab('cheatsheet')}>
          Cheat Sheets
        </button>
        <button className={tab === 'scouting' ? 'active' : ''} onClick={() => setTab('scouting')}>
          Scouting
        </button>
        <button className={tab === 'depthchart' ? 'active' : ''} onClick={() => setTab('depthchart')}>
          Depth Charts
        </button>
        {/* Odds Calculator is deliberately not a nav tab -- surfaced via the 🧮 header button
            as a slideout instead, matching how Going Yard itself surfaces its own odds
            calculator (a button that opens a slideout, not a dedicated page). */}
      </nav>
      <main>
        {tab === 'matchups' && <AllMatchups />}
        {tab === 'paydirt' && <PaydirtLab />}
        {tab === 'yardage' && <YardageLab />}
        {tab === 'live' && <LiveTab />}
        {tab === 'tdtracker' && <TDTracker />}
        {tab === 'track' && <TrackRecord />}
        {tab === 'pairs' && <PairsPage />}
        {tab === 'weather' && <WeatherTab />}
        {tab === 'splits' && <SplitsTab />}
        {tab === 'cheatsheet' && <CheatSheetTab />}
        {tab === 'scouting' && <ScoutingTab />}
        {tab === 'depthchart' && <DepthChartTab />}
      </main>
      <PlayerSlideout />
      <TeamSlideout />
      {showOddsCalc && (
        <>
          <div className="slideout-backdrop" onClick={() => setShowOddsCalc(false)} />
          <div className="slideout-panel">
            <div className="slideout-header">
              <div className="slideout-header-info">
                <h2>🧮 Odds Calculator</h2>
                <div className="sub">Sport-agnostic American-odds math -- Manual, Parlay, Round Robin</div>
              </div>
              <button className="slideout-close" onClick={() => setShowOddsCalc(false)} aria-label="Close">
                &times;
              </button>
            </div>
            <div className="slideout-body">
              <OddsCalculator />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

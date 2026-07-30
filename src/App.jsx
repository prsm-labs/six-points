import { useEffect, useMemo, useState } from 'react'
import './App.css'

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
  if (!data) return <p className="empty-state">Loading...</p>

  return (
    <div>
      <p className="meta-line">
        Season {data.season}, Week {data.week} &middot; {data.matchups.length} matchups &middot; all
        weights are v1 first-guesses, unvalidated beyond the Track Record backtest below
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Opp</th>
              <th>Pos</th>
              <th>Usage Sig</th>
              <th>gTD</th>
              <th>Explosive</th>
              <th>Green Light</th>
              <th>Zone Score</th>
            </tr>
          </thead>
          <tbody>
            {data.matchups.map((m, i) => (
              <tr key={i}>
                <td>{m.team}</td>
                <td>{m.opponent}</td>
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
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('matchups')

  return (
    <div className="app">
      <header>
        <h1>Six Points</h1>
        <p className="tagline">NFL touchdown intelligence, weekly cadence, real backtests only.</p>
      </header>
      <nav className="tabs">
        <button className={tab === 'matchups' ? 'active' : ''} onClick={() => setTab('matchups')}>
          All Matchups
        </button>
        <button className={tab === 'track' ? 'active' : ''} onClick={() => setTab('track')}>
          Track Record
        </button>
      </nav>
      <main>{tab === 'matchups' ? <AllMatchups /> : <TrackRecord />}</main>
    </div>
  )
}

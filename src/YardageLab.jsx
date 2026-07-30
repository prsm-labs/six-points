import { useEffect, useRef, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'

function percentile(values, p) {
  const sorted = values.slice().sort((a, b) => a - b)
  const idx = Math.floor(p * (sorted.length - 1))
  return sorted[idx]
}

export default function YardageLab() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('loading')
  const workerRef = useRef(null)

  useEffect(() => {
    fetch('/data/all_matchups_latest.json')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then((data) => {
        const players = data.matchups.filter((p) => p.touches_per_game > 0)
        const avgTouches = players.reduce((a, p) => a + p.touches_per_game, 0) / (players.length || 1)
        const avgYpt = players.reduce((a, p) => a + p.ypt, 0) / (players.length || 1)

        setStatus('simulating')
        const worker = new Worker(new URL('./workers/yardageWorker.js', import.meta.url), {
          type: 'module',
        })
        workerRef.current = worker
        worker.onmessage = (e) => {
          const simMap = Object.fromEntries(e.data.map((r) => [r.player_id, r.sim_yard_pct]))
          const merged = players.map((p) => {
            const onFieldScore = Math.max(
              0,
              Math.min(99, 50 + (p.touches_per_game - avgTouches) * 3 + (p.ypt - avgYpt) * 2)
            )
            // Simple point estimate (touches x yards-per-touch) -- not the same thing as
            // SimYard%, which is a probability of clearing a threshold. This is "what to
            // actually expect," the sim is "how likely is a specific bar to be cleared."
            const estYards = Math.round(p.touches_per_game * p.ypt * 10) / 10
            return {
              ...p,
              sim_yard_pct: simMap[p.player_id] ?? 0,
              on_field_score: onFieldScore,
              est_yards: estYards,
            }
          })

          const onFieldCut = percentile(merged.map((p) => p.on_field_score), 0.75)
          const simCut = percentile(merged.map((p) => p.sim_yard_pct), 0.75)
          merged.forEach((p) => {
            p.yardage_signal = p.on_field_score >= onFieldCut && p.opp_def_rank_pct >= 60 && p.sim_yard_pct >= simCut
          })
          merged.sort((a, b) => b.sim_yard_pct - a.sim_yard_pct)
          setRows(merged)
          setStatus('done')
          worker.terminate()
        }
        worker.postMessage({ players })
      })
      .catch((e) => setError(e.message))

    return () => workerRef.current?.terminate()
  }, [])

  if (error) {
    return (
      <p className="empty-state">
        No matchup data yet ({error}). Run <code>python matchup_engine.py --season 2025 --week N</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!rows) {
    return (
      <p className="empty-state">
        {status === 'simulating' ? 'Running 10,000 sims per player...' : 'Loading...'}
      </p>
    )
  }

  return <YardageTable rows={rows} />
}

function thresholdFor(position) {
  if (position === 'QB') return 225
  if (position === 'RB') return 60
  return 75
}

function YardageTable({ rows }) {
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, 'sim_yard_pct', 'desc')
  const thProps = { sortKey, sortDir, onSort: toggleSort }

  return (
    <div>
      <p className="meta-line">
        {rows.length} players simulated &middot; threshold is 60+ rush yds (RB), 75+ rec yds
        (WR/TE), 225+ pass yds (QB) &middot; Yardage Signal gate is empirical (top-quartile
        OnFieldScore + SimYard%, MatchupScore &ge; 60) &middot; Est. Yards is a simple point
        estimate (touches/game &times; yards/touch), SimYard% is the probability of actually
        clearing that player's threshold &middot; click a column header to sort
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh label="Team" sortKeyName="team" {...thProps} />
              <SortTh label="Opp" sortKeyName="opponent" {...thProps} />
              <SortTh label="Player" sortKeyName="player_name" {...thProps} />
              <SortTh label="Pos" sortKeyName="position" {...thProps} />
              <SortTh label="Touches/G" sortKeyName="touches_per_game" {...thProps} />
              <SortTh label="Yds/Touch" sortKeyName="ypt" {...thProps} />
              <SortTh label="Est. Yards" sortKeyName="est_yards" {...thProps} />
              <SortTh label="Threshold" sortKeyName="position" {...thProps} />
              <SortTh label="OnFieldScore" sortKeyName="on_field_score" {...thProps} />
              <SortTh label="MatchupScore" sortKeyName="opp_def_rank_pct" {...thProps} />
              <SortTh label="SimYard%" sortKeyName="sim_yard_pct" {...thProps} />
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={i}>
                <td>
                  <button className="team-link" onClick={() => openTeamSlide({ team: p.team })}>
                    {p.team}
                  </button>
                </td>
                <td>
                  <button className="team-link" onClick={() => openTeamSlide({ team: p.opponent, context: 'defense' })}>
                    {p.opponent}
                  </button>
                </td>
                <td>
                  <div className="player-cell" onClick={() => openPlayerSlide(p)}>
                    <PlayerAvatar playerId={p.player_id} name={p.player_name} />
                    {p.player_name}
                  </div>
                </td>
                <td>{p.position}</td>
                <td>{Number(p.touches_per_game).toFixed(1)}</td>
                <td>{Number(p.ypt).toFixed(1)}</td>
                <td className="zone-score">{p.est_yards.toFixed(1)}</td>
                <td>{thresholdFor(p.position)}+</td>
                <td>{p.on_field_score.toFixed(1)}</td>
                <td>{Number(p.opp_def_rank_pct).toFixed(1)}</td>
                <td>{p.sim_yard_pct.toFixed(1)}%</td>
                <td>{p.yardage_signal ? <span className="tier tier-lean">Yardage</span> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

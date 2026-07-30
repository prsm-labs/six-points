import { useEffect, useRef, useState } from 'react'

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
            return { ...p, sim_yard_pct: simMap[p.player_id] ?? 0, on_field_score: onFieldScore }
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

  return (
    <div>
      <p className="meta-line">
        {rows.length} players simulated &middot; threshold is 60+ rush yds (RB), 75+ rec yds
        (WR/TE), 225+ pass yds (QB) &middot; Yardage Signal gate is empirical (top-quartile
        OnFieldScore + SimYard%, MatchupScore &ge; 60)
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Opp</th>
              <th>Player</th>
              <th>Pos</th>
              <th>Touches/G</th>
              <th>Yds/Touch</th>
              <th>OnFieldScore</th>
              <th>MatchupScore</th>
              <th>SimYard%</th>
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={i}>
                <td>{p.team}</td>
                <td>{p.opponent}</td>
                <td>{p.player_name}</td>
                <td>{p.position}</td>
                <td>{Number(p.touches_per_game).toFixed(1)}</td>
                <td>{Number(p.ypt).toFixed(1)}</td>
                <td>{p.on_field_score.toFixed(1)}</td>
                <td>{Number(p.opp_def_rank_pct).toFixed(1)}</td>
                <td className="zone-score">{p.sim_yard_pct.toFixed(1)}%</td>
                <td>{p.yardage_signal ? <span className="tier tier-lean">Yardage</span> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

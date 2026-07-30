import { useEffect, useRef, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'

function eligiblePlayers(matchups) {
  // Concept doc §7 item 3: TD opportunity is gated by role before the game starts, harder
  // than Barrel Lab's eligibility check -- must be a top-2 red-zone touch option on the team.
  const byTeam = {}
  for (const p of matchups) {
    if (!p.redzone_touches_per_game) continue
    if (!byTeam[p.team]) byTeam[p.team] = []
    byTeam[p.team].push(p)
  }
  const eligible = []
  for (const team of Object.keys(byTeam)) {
    const ranked = byTeam[team]
      .slice()
      .sort((a, b) => b.redzone_touches_per_game - a.redzone_touches_per_game)
      .slice(0, 2)
    eligible.push(...ranked)
  }
  return eligible
}

function percentile(values, p) {
  const sorted = values.slice().sort((a, b) => a - b)
  const idx = Math.floor(p * (sorted.length - 1))
  return sorted[idx]
}

export default function PaydirtLab() {
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
        const eligible = eligiblePlayers(data.matchups)
        const rates = data.matchups.map((p) => p.opp_td_rate_allowed).filter(Boolean)
        const leagueAvgTdRateAllowed = rates.reduce((a, b) => a + b, 0) / (rates.length || 1)

        setStatus('simulating')
        const worker = new Worker(new URL('./workers/paydirtWorker.js', import.meta.url), {
          type: 'module',
        })
        workerRef.current = worker
        worker.onmessage = (e) => {
          const simMap = Object.fromEntries(e.data.map((r) => [r.player_id, r.sim_td_pct]))
          const merged = eligible.map((p) => ({ ...p, sim_td_pct: simMap[p.player_id] ?? 0 }))

          const trueTdCut = percentile(merged.map((p) => p.gtd), 0.75)
          const simCut = percentile(merged.map((p) => p.sim_td_pct), 0.75)
          merged.forEach((p) => {
            p.paydirt_signal = p.gtd >= trueTdCut && p.opp_def_rank_pct >= 60 && p.sim_td_pct >= simCut
          })
          merged.sort((a, b) => b.sim_td_pct - a.sim_td_pct)
          setRows(merged)
          setStatus('done')
          worker.terminate()
        }
        worker.postMessage({ players: eligible, leagueAvgTdRateAllowed })
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

  return <PaydirtTable rows={rows} />
}

function PaydirtTable({ rows }) {
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, 'sim_td_pct', 'desc')
  const thProps = { sortKey, sortDir, onSort: toggleSort }

  return (
    <div>
      <p className="meta-line">
        {rows.length} eligible players (top-2 red-zone touch option per team) &middot; SimTD% from
        10,000 simulated games each &middot; Paydirt Signal gate is empirical (top-quartile
        TrueTDScore + SimTD%, MatchupScore &ge; 60) since no absolute threshold has been validated
        yet &middot; click a column header to sort
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
              <SortTh label="RZ Touches/G" sortKeyName="redzone_touches_per_game" {...thProps} />
              <SortTh label="TrueTDScore" sortKeyName="gtd" {...thProps} />
              <SortTh label="MatchupScore" sortKeyName="opp_def_rank_pct" {...thProps} />
              <SortTh label="SimTD%" sortKeyName="sim_td_pct" {...thProps} />
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={i}>
                <td>{p.team}</td>
                <td>{p.opponent}</td>
                <td>
                  <div className="player-cell">
                    <PlayerAvatar playerId={p.player_id} name={p.player_name} />
                    {p.player_name}
                  </div>
                </td>
                <td>{p.position}</td>
                <td>{Number(p.touches_per_game).toFixed(1)}</td>
                <td>{Number(p.redzone_touches_per_game).toFixed(1)}</td>
                <td>{Number(p.gtd).toFixed(1)}</td>
                <td>{Number(p.opp_def_rank_pct).toFixed(1)}</td>
                <td className="zone-score">{p.sim_td_pct.toFixed(1)}%</td>
                <td>{p.paydirt_signal ? <span className="tier tier-lock">Paydirt</span> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

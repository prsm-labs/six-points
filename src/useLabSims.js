import { useEffect, useRef, useState } from 'react'

// Shared Monte Carlo data-fetch/eligibility/gate logic for Paydirt Lab and Yardage Lab --
// extracted so Cheat Sheets can reuse the exact same real computed sim results (per the response
// doc's explicit instruction: "reusing Paydirt Lab's own eligible-player pool and score rather
// than recomputing anything") instead of a second, potentially-drifting copy of the simulation.

function percentile(values, p) {
  const sorted = values.slice().sort((a, b) => a - b)
  const idx = Math.floor(p * (sorted.length - 1))
  return sorted[idx]
}

function eligiblePaydirtPlayers(matchups) {
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

export function usePaydirtSims() {
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
        const eligible = eligiblePaydirtPlayers(data.matchups)
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

  return { rows, error, status }
}

export function useYardageSims() {
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

  return { rows, error, status }
}

export function thresholdFor(position) {
  if (position === 'QB') return 225
  if (position === 'RB') return 60
  return 75
}

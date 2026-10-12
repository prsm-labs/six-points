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

// Paydirt pool (2026-10-12, user: "only picking 4 players per game"): every player with a red-zone
// role (>= PAYDIRT_MIN_RZ red-zone touches/game, not Out/Doubtful, has 2026 touches) -- ~18 per game, holding ~86% of
// the week's real TD scorers in the 2023-25 backtest vs 34% for the old top-2-per-team pool.
// Paydirt Signal = the slate's top PAYDIRT_SIGNAL_N by the grade model's TD %.
export const PAYDIRT_MIN_RZ = 0.3
export const PAYDIRT_SIGNAL_N = 15

// piecewise-linear lookup through isotonic calibration knots (same as matchup_engine._calibrate)
function interp(x, knots) {
  if (!knots?.x?.length) return x
  const { x: xs, y: ys } = knots
  if (x <= xs[0]) return ys[0]
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const t = xs[i] === xs[i - 1] ? 0 : (x - xs[i - 1]) / (xs[i] - xs[i - 1])
      return ys[i - 1] + t * (ys[i] - ys[i - 1])
    }
  }
  return ys[ys.length - 1]
}

function eligiblePaydirtPlayers(matchups) {
  if (matchups.some((p) => p.p_td != null)) {
    // thin_sample = no 2026 touches yet (scored off last season only) -- never in the backtest pool
    return matchups.filter((p) => !p.thin_sample && (p.redzone_touches_per_game ?? 0) >= PAYDIRT_MIN_RZ && (p.injury_gate ?? 1) >= 0.75)
  }
  // pre-grade-model slate: the original top-2 red-zone players per team
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

          // Paydirt Signal = the slate's top 15 by the grade model's TD % (grade model since
          // 2026-10-11; wider pool + top-15 rule 2026-10-12). Backtest numbers for both pools live in
          // grade_model.json -> validation.paydirt.pools. Falls back to the old gate only if this
          // week's slate predates the grade model.
          const graded = merged.some((p) => p.p_td != null)
          if (graded) {
            merged.sort((a, b) => (b.p_td ?? 0) - (a.p_td ?? 0))
            merged.forEach((p, i) => {
              p.paydirt_signal = i < PAYDIRT_SIGNAL_N
            })
          } else {
            const trueTdCut = percentile(merged.map((p) => p.gtd), 0.75)
            const simCut = percentile(merged.map((p) => p.sim_td_pct), 0.75)
            merged.forEach((p) => {
              p.paydirt_signal = p.gtd >= trueTdCut && p.opp_def_rank_pct >= 60 && p.sim_td_pct >= simCut
            })
            merged.sort((a, b) => b.sim_td_pct - a.sim_td_pct)
          }
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

export const YARDAGE_SIGNAL_N = 15

export function useYardageSims() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('loading')
  const workerRef = useRef(null)

  useEffect(() => {
    Promise.all([
      fetch('/data/all_matchups_latest.json').then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      }),
      fetch('/data/grade_model.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([data, model]) => {
        // Yardage Lab (2026-10-12): RB / WR / TE only -- every threshold here is scrimmage yards, and a
        // QB's 225 line was passing yards the old sim never modeled. Line % = P(scrimmage yards >= line)
        // from Est. Yards (usage + the opponent's per-position yardage leak) and the held-out spread of
        // actual / estimated yards (grade_model.json -> yards.by_position[pos].ratio_quantiles).
        const yards = model?.yards
        const players = data.matchups.filter((p) => p.touches_per_game > 0 && (!yards || (yards.lines?.[p.position] != null && !p.thin_sample)))
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
            const estYards = p.est_yards != null ? p.est_yards : Math.round(p.touches_per_game * p.ypt * 10) / 10
            const q = yards?.by_position?.[p.position]?.ratio_quantiles
            const line = yards?.lines?.[p.position]
            const rawLine = q && line != null && p.est_yards != null
              ? q.filter((r) => (p.est_yards + 5) * r - 5 >= line).length / q.length
              : null
            const linePct = rawLine != null ? interp(rawLine, yards.line_calibration) : null
            return {
              ...p,
              sim_yard_pct: simMap[p.player_id] ?? 0,
              on_field_score: onFieldScore,
              est_yards: estYards,
              line_pct: linePct,
            }
          })

          if (merged.some((p) => p.line_pct != null)) {
            // Yardage Signal = the slate's top 15 by Line % among players not Out/Doubtful
            // (backtest vs the old gate: grade_model.json -> validation.yardage_lab)
            merged.sort((a, b) => (b.line_pct ?? -1) - (a.line_pct ?? -1))
            let n = 0
            merged.forEach((p) => {
              p.yardage_signal = (p.injury_gate ?? 1) >= 0.75 && p.line_pct != null && n < YARDAGE_SIGNAL_N
              if (p.yardage_signal) n += 1
            })
          } else {
            const onFieldCut = percentile(merged.map((p) => p.on_field_score), 0.75)
            const simCut = percentile(merged.map((p) => p.sim_yard_pct), 0.75)
            merged.forEach((p) => {
              p.yardage_signal = p.on_field_score >= onFieldCut && p.opp_def_rank_pct >= 60 && p.sim_yard_pct >= simCut
            })
            merged.sort((a, b) => b.sim_yard_pct - a.sim_yard_pct)
          }
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

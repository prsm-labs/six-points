// Real, validated v1 game simulation -- team-level plays/pass-rate/TD-rate Monte Carlo, player
// stats allocated by real touch shares. See PROMPT_SixPoints_GameSimulation_Scope.md for the
// full architecture rationale and matchup_engine.py's build_team_pace/build_team_scoring_and_
// efficiency docstrings for the real validation behind each input (trailing plays/game, trailing
// pass YPA, and the team-TD-rate blend are all real, verified signals against the full 2025
// season; Vegas implied_team_total is deliberately NOT used to drive TD count -- real-verified
// wrong-signed at both the player level, session 9's own zone_score regression, and the team
// level, checked before building this).
//
// Model per Monte Carlo iteration, per team:
// 1. total_plays ~ Normal(plays_per_game, plays_std), clipped [40, 90] -- both real, trailing.
// 2. pass_plays = round(total_plays * (pass_rate + small real jitter)), rush_plays = the rest.
// 3. num_tds ~ Poisson(0.5*own real off_td_avg + 0.5*opponent's real def_td_allowed_avg).
// 4. rush_plays allocated across real rushers by real carry_share (weighted random draw);
//    each rush's yards ~ Normal(league_ypc, league_ypc*0.9) -- LEAGUE rate, not team-specific,
//    because team-specific rush efficiency does NOT persist game to game (real-verified,
//    corr 0.036) while the league rate is the only real, defensible anchor available.
// 5. pass_plays (targets) allocated across real receivers by real target_share; each target
//    completes with that player's own real catch_rate; a completion's yards ~ Normal centered
//    on that player's own real (yards_per_target / catch_rate).
// 6. num_tds allocated across the roster weighted by each player's real usage_sig (their own
//    red-zone role share, already computed and validated elsewhere in this app) -- an "any_td"
//    credit, not attributed to a specific simulated play (this app's own real actual_tds
//    convention already works the same way).
//
// Explicitly NOT modeled: field goals, PATs, defense/special-teams scoring, turnovers,
// game-clock/score-state effects on play calling. See the scope doc's own "suggested build
// order" -- this is deliberately the lighter v1, not full drive-by-drive simulation.
//
// Pressure rate (added 2026-09-28): real, validated per matchup_engine.py's build_team_
// scoring_and_efficiency docstring. Each pass play's pressure probability is the same real
// blend validated there -- 0.5*offense's own trailing press_allowed + 0.5*opponent defense's
// own trailing press_generated (blend corr 0.201 vs a real game's actual pressure rate,
// beats either single factor). The PRESSURE_* constants below are the real per-play ratios
// found checking the complete 2025 season split by was_pressure: unpressured 69.66% comp /
// 7.44 YPA / 0% sack; pressured 35.18% comp / 2.72 YPA / 23.42% sack, mean sack yardage -6.48
// (std 3.73, n=1287). A pressured pass play is resolved BEFORE picking a receiver: it's either
// a sack (team-level yardage loss, no target/receiver credited -- matches how nflverse itself
// records sacks) or a suppressed-but-live target (receiver's own catch_rate/yards scaled by
// the real pressured:unpressured ratio, not a flat override, so a player's own real efficiency
// still comes through). TD allocation is untouched -- it's already a validated team-level
// Poisson draw independent of per-play mechanics; layering a pressure-based TD suppression on
// top would compound two separate probabilistic models without a real per-play-to-TD link
// having been checked, so that's deliberately out of scope for this pass.
const PRESSURE_COMPLETION_MULT = 0.505 // 35.18% / 69.66%, real 2025 season
const PRESSURE_YPA_MULT = 0.365 // 2.72 / 7.44 YPA, real 2025 season
const PRESSURE_SACK_RATE = 0.234 // share of pressured pass plays that are sacks, real 2025 season
const SACK_YARDS_MEAN = -6.48
const SACK_YARDS_STD = 3.73

function randn() {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function samplePoisson(lambda) {
  if (lambda <= 0) return 0
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k += 1
    p *= Math.random()
  } while (p > L)
  return k - 1
}

function weightedChoice(items, weights, totalWeight) {
  let r = Math.random() * totalWeight
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

const SIMS = 3000

function simulateTeam(teamInfo, rosterPlayers, leagueYpc, oppTeamInfo) {
  const stats = {}
  for (const p of rosterPlayers) {
    stats[p.player_id] = { carries: 0, rushYards: 0, targets: 0, receptions: 0, recYards: 0, tdSum: 0, tdHits: 0 }
  }

  const pressureRate = Math.max(0, Math.min(1,
    0.5 * (teamInfo.press_allowed ?? 0.291) + 0.5 * (oppTeamInfo?.press_generated ?? 0.291)
  ))

  const rushers = rosterPlayers.filter((p) => p.carry_share > 0)
  const rushWeights = rushers.map((p) => p.carry_share)
  const rushTotal = rushWeights.reduce((a, b) => a + b, 0)
  const receivers = rosterPlayers.filter((p) => p.target_share > 0)
  const recWeights = receivers.map((p) => p.target_share)
  const recTotal = recWeights.reduce((a, b) => a + b, 0)
  const tdCandidates = rosterPlayers.filter((p) => p.usage_sig > 0)
  const tdWeights = tdCandidates.map((p) => p.usage_sig)
  const tdTotal = tdWeights.reduce((a, b) => a + b, 0)

  let teamPlaysSum = 0
  let teamPassPlaysSum = 0
  let teamCompletionsSum = 0
  let teamPassYardsSum = 0
  let teamSacksSum = 0

  for (let sim = 0; sim < SIMS; sim++) {
    const totalPlays = Math.max(40, Math.min(90, Math.round(teamInfo.plays_per_game + randn() * teamInfo.plays_std)))
    const passRate = Math.max(0.25, Math.min(0.75, teamInfo.pass_rate + randn() * 0.05))
    const passPlays = Math.round(totalPlays * passRate)
    const rushPlays = totalPlays - passPlays
    teamPlaysSum += totalPlays
    teamPassPlaysSum += passPlays

    const tdThisSim = {}
    if (rushTotal > 0) {
      for (let i = 0; i < rushPlays; i++) {
        const rusher = weightedChoice(rushers, rushWeights, rushTotal)
        const yards = Math.max(-3, leagueYpc + randn() * leagueYpc * 0.9)
        stats[rusher.player_id].carries += 1
        stats[rusher.player_id].rushYards += yards
      }
    }
    if (recTotal > 0) {
      for (let i = 0; i < passPlays; i++) {
        const isPressured = Math.random() < pressureRate
        if (isPressured && Math.random() < PRESSURE_SACK_RATE) {
          // Real: a sack has no receiver/target charted at all (the ball is never thrown) --
          // team-level yardage loss only, no player's target/catch stats move.
          teamSacksSum += 1
          teamPassYardsSum += Math.min(-1, SACK_YARDS_MEAN + randn() * SACK_YARDS_STD)
          continue
        }
        const receiver = weightedChoice(receivers, recWeights, recTotal)
        stats[receiver.player_id].targets += 1
        const catchRate = (receiver.catch_rate || 0.6) * (isPressured ? PRESSURE_COMPLETION_MULT : 1)
        if (Math.random() < catchRate) {
          const baseMeanYards = receiver.catch_rate > 0 ? receiver.yards_per_target / receiver.catch_rate : 8
          const meanCatchYards = baseMeanYards * (isPressured ? PRESSURE_YPA_MULT : 1)
          const yards = Math.max(0, meanCatchYards + randn() * Math.max(3, meanCatchYards * 0.6))
          stats[receiver.player_id].receptions += 1
          stats[receiver.player_id].recYards += yards
          teamCompletionsSum += 1
          teamPassYardsSum += yards
        }
      }
    }
    const numTds = samplePoisson(Math.max(0, 0.5 * teamInfo.off_td_avg + 0.5 * teamInfo.def_td_allowed_avg))
    if (tdTotal > 0) {
      for (let i = 0; i < numTds; i++) {
        const scorer = weightedChoice(tdCandidates, tdWeights, tdTotal)
        stats[scorer.player_id].tdSum += 1
        tdThisSim[scorer.player_id] = true
      }
    }
    for (const pid of Object.keys(tdThisSim)) stats[pid].tdHits += 1
  }

  const players = rosterPlayers
    .map((p) => {
      const s = stats[p.player_id]
      return {
        player_id: p.player_id,
        carries: Math.round((s.carries / SIMS) * 10) / 10,
        rush_yards: Math.round(s.rushYards / SIMS),
        targets: Math.round((s.targets / SIMS) * 10) / 10,
        receptions: Math.round((s.receptions / SIMS) * 10) / 10,
        rec_yards: Math.round(s.recYards / SIMS),
        mean_tds: Math.round((s.tdSum / SIMS) * 100) / 100,
        td_pct: Math.round((s.tdHits / SIMS) * 1000) / 10,
      }
    })
    .filter((r) => r.carries >= 0.1 || r.targets >= 0.1 || r.mean_tds >= 0.01)
    .sort((a, b) => b.mean_tds - a.mean_tds || (b.rush_yards + b.rec_yards) - (a.rush_yards + a.rec_yards))

  return {
    players,
    team: {
      mean_plays: Math.round((teamPlaysSum / SIMS) * 10) / 10,
      mean_pass_plays: Math.round((teamPassPlaysSum / SIMS) * 10) / 10,
      mean_completions: Math.round((teamCompletionsSum / SIMS) * 10) / 10,
      mean_pass_yards: Math.round(teamPassYardsSum / SIMS),
      mean_sacks: Math.round((teamSacksSum / SIMS) * 10) / 10,
    },
  }
}

self.onmessage = (e) => {
  const { home, away, leagueYpc } = e.data
  const result = {
    home: simulateTeam(home.teamInfo, home.players, leagueYpc, away.teamInfo),
    away: simulateTeam(away.teamInfo, away.players, leagueYpc, home.teamInfo),
  }
  self.postMessage(result)
}

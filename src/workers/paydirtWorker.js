// Paydirt Lab Monte Carlo -- mirrors Going Yard's Barrel Lab shape (10,000 simulated
// touch-sequences per player), adapted per concept doc §4. Runs off the main thread since
// 10,000 sims x ~500 players would jank the UI otherwise.
//
// Model: touches this game ~ Poisson(touches_per_game). TD probability per touch is the
// player's own recent td_rate_per_touch, adjusted multiplicatively by how the matchup compares
// to league-average TD rate allowed at that position. SimTD% = P(>=1 TD | touches, adjusted rate).
// This is a first-guess model, not validated beyond the Track Record backtest -- see CLAUDE.md.

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

function simulateOne(player, leagueAvgTdRateAllowed) {
  const touchesPerGame = player.touches_per_game || 0
  const tdRate = player.td_rate_per_touch || 0
  const oppRate = player.opp_td_rate_allowed || leagueAvgTdRateAllowed
  const matchupMultiplier = Math.min(2.0, Math.max(0.5, oppRate / (leagueAvgTdRateAllowed || 0.042)))
  const adjustedRate = Math.min(0.5, tdRate * matchupMultiplier)

  const SIMS = 10000
  let hits = 0
  for (let i = 0; i < SIMS; i++) {
    const touches = samplePoisson(touchesPerGame)
    if (touches === 0) continue
    const probNoTd = Math.pow(1 - adjustedRate, touches)
    if (Math.random() > probNoTd) hits += 1
  }
  return Math.round((hits / SIMS) * 1000) / 10
}

self.onmessage = (e) => {
  const { players, leagueAvgTdRateAllowed } = e.data
  const results = players.map((p) => ({
    player_id: p.player_id,
    sim_td_pct: simulateOne(p, leagueAvgTdRateAllowed),
  }))
  self.postMessage(results)
}

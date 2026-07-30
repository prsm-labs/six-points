// Yardage Lab Monte Carlo (concept doc §5): a cumulative, lower-bar stat that doesn't need one
// big play, just volume x decent efficiency.
//
// Model: touches this game ~ Poisson(touches_per_game). Yards-per-touch modeled as Exponential
// with mean = player's real trailing ypt (captures football's fat-tailed big-play skew better
// than a Normal would). SimYard% = P(sum of per-touch yards >= threshold).

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

function sampleExponential(mean) {
  if (mean <= 0) return 0
  return -mean * Math.log(1 - Math.random())
}

function thresholdFor(position) {
  if (position === 'QB') return 225
  if (position === 'RB') return 60
  return 75 // WR / TE
}

function simulateOne(player) {
  const touchesPerGame = player.touches_per_game || 0
  const ypt = player.ypt || 0
  const threshold = thresholdFor(player.position)

  const SIMS = 10000
  let hits = 0
  for (let i = 0; i < SIMS; i++) {
    const touches = samplePoisson(touchesPerGame)
    let yards = 0
    for (let t = 0; t < touches; t++) {
      yards += sampleExponential(ypt)
    }
    if (yards >= threshold) hits += 1
  }
  return Math.round((hits / SIMS) * 1000) / 10
}

self.onmessage = (e) => {
  const { players } = e.data
  const results = players.map((p) => ({
    player_id: p.player_id,
    sim_yard_pct: simulateOne(p),
  }))
  self.postMessage(results)
}

// Shared season/windowed aggregation over player_game_logs.json -- used by the Splits
// leaderboard and momentum views. No new data source: this is exactly the raw material
// six_points_build.md §9 already flagged as sufficient for a first pass.

function sum(games, key) {
  return games.reduce((a, g) => a + (g[key] || 0), 0)
}

export function aggregateGames(games) {
  const g = games.length
  const passYards = sum(games, 'pass_yards')
  const rushYards = sum(games, 'rush_yards')
  const recYards = sum(games, 'rec_yards')
  const anyTd = sum(games, 'any_td')
  const touches = sum(games, 'rush_att') + sum(games, 'targets')
  return {
    games: g,
    pass_att: sum(games, 'pass_att'),
    pass_cmp: sum(games, 'pass_cmp'),
    pass_yards: passYards,
    pass_td: sum(games, 'pass_td'),
    interceptions: sum(games, 'interceptions'),
    rush_att: sum(games, 'rush_att'),
    rush_yards: rushYards,
    rush_td: sum(games, 'rush_td'),
    targets: sum(games, 'targets'),
    receptions: sum(games, 'receptions'),
    rec_yards: recYards,
    rec_td: sum(games, 'rec_td'),
    any_td: anyTd,
    total_yards: passYards + rushYards + recYards,
    touches,
    touches_per_game: g ? touches / g : 0,
    yards_per_game: g ? (passYards + rushYards + recYards) / g : 0,
    td_per_game: g ? anyTd / g : 0,
  }
}

// "Starter" is a display/filter label only -- it never feeds any score/grade formula, just helps
// a viewer separate the every-week players from committee/
// backup roles when scanning a leaderboard.
export function roleLabel(position, agg) {
  if (position === 'QB') return agg.pass_att / (agg.games || 1) >= 10 ? 'Starter' : 'Reserve'
  if (position === 'RB') return agg.touches_per_game >= 8 ? 'Starter' : 'Committee'
  return agg.targets / (agg.games || 1) >= 4 ? 'Starter' : 'Reserve'
}

export function currentTdStreak(games) {
  // Most-recent-first walk: how many games in a row (ending with the latest) had a TD.
  const recent = [...games].reverse()
  let streak = 0
  for (const g of recent) {
    if ((g.any_td || 0) > 0) streak += 1
    else break
  }
  return streak
}

export function buildLeaderboard(gameLogs, directory, window) {
  const rows = []
  for (const [playerId, games] of Object.entries(gameLogs)) {
    const entry = directory[playerId]
    if (!entry || !entry.position) continue
    const windowedGames = window === 'season' ? games : games.slice(-window)
    if (windowedGames.length === 0) continue
    const agg = aggregateGames(windowedGames)
    rows.push({
      playerId,
      name: entry.name,
      position: entry.position,
      team: games[games.length - 1]?.team || '', // most recent game's team -- correct across a
                                                    // mid-season trade, unlike a static team field
      role: roleLabel(entry.position, agg),
      streak: currentTdStreak(games),
      ...agg,
    })
  }
  return rows
}

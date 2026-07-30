// Our season_schedule.json games have nflverse game_ids ("2025_18_CAR_TB"), not ESPN's numeric
// event ids -- and ESPN's own scoringPlays feed (/api/summary) is keyed by their event id, not
// ours. This resolves nflverse game -> ESPN event id by querying ESPN's scoreboard for that
// game's real date and matching team abbreviations (via team_stats.json's espn_abbr, since
// nflverse and ESPN disagree on some, e.g. LA/LAR, WAS/WSH -- same mismatch already solved for
// the team-slideout external link).

async function fetchScoreboard(dateYYYYMMDD) {
  const proxied = await fetch(`/api/scoreboard?dates=${dateYYYYMMDD}`).catch(() => null)
  if (proxied && proxied.ok) return proxied.json()
  // Local `vite dev` fallback, same pattern as LiveThemes.jsx -- ESPN's scoreboard is public,
  // no key needed, so a direct client-side call is safe here (unlike weather.js).
  const direct = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dateYYYYMMDD}`
  )
  return direct.json()
}

export async function resolveEventIds(games, teamStats) {
  const byDate = {}
  for (const g of games) {
    if (!g.gameday) continue
    const ymd = g.gameday.replaceAll('-', '')
    if (!byDate[ymd]) byDate[ymd] = []
    byDate[ymd].push(g)
  }

  const results = {}
  for (const [ymd, dateGames] of Object.entries(byDate)) {
    let scoreboard
    try {
      scoreboard = await fetchScoreboard(ymd)
    } catch {
      continue
    }
    const events = scoreboard.events || []
    for (const g of dateGames) {
      const homeAbbr = teamStats[g.home_team]?.espn_abbr
      const awayAbbr = teamStats[g.away_team]?.espn_abbr
      if (!homeAbbr || !awayAbbr) continue
      const match = events.find((e) => {
        const competitors = e.competitions?.[0]?.competitors || []
        const abbrs = competitors.map((c) => c.team?.abbreviation?.toLowerCase())
        return abbrs.includes(homeAbbr) && abbrs.includes(awayAbbr)
      })
      if (match) results[g.game_id] = match.id
    }
  }
  return results
}

import { useEffect, useState } from 'react'
import { resolveEventIds } from './espnGameResolver.js'
import { parseScoringPlay } from './scoringPlays.js'

// Shared by TDTracker.jsx and TDMarquee.jsx -- both need "every real TD for week N," just
// presented differently (full sortable table vs. a compact scrolling strip).

async function fetchSummary(eventId) {
  const proxied = await fetch(`/api/summary?event=${eventId}`).catch(() => null)
  if (proxied && proxied.ok) return proxied.json()
  // Direct-ESPN fallback (plain `vite dev`, no /api) -- same real wallclock join api/summary.js
  // does server-side, done here client-side instead since the proxy is being skipped entirely.
  const direct = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`
  )
  const data = await direct.json()
  const wallclockMap = {}
  for (const d of data.drives?.previous || []) {
    for (const p of d.plays || []) {
      if (p.id && p.wallclock) wallclockMap[p.id] = p.wallclock
    }
  }
  return {
    scoringPlays: (data.scoringPlays || []).map((p) => ({ ...p, wallclock: wallclockMap[p.id] || null })),
  }
}

export function useWeekTDs(week, games, teamStats) {
  const [tds, setTds] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!week || !games || !teamStats) return
    setTds(null)
    const weekGames = games.filter((g) => g.week === week)

    resolveEventIds(weekGames, teamStats)
      .then(async (eventIds) => {
        const rows = []
        for (const g of weekGames) {
          const eventId = eventIds[g.game_id]
          if (!eventId) continue
          try {
            const data = await fetchSummary(eventId)
            for (const play of data.scoringPlays || []) {
              const parsed = parseScoringPlay(play)
              if (!parsed.isTouchdown) continue
              rows.push({
                ...parsed,
                game: `${g.away_team} @ ${g.home_team}`,
                gameId: g.game_id,
                gameday: g.gameday,
              })
            }
          } catch {
            // one game's summary failing shouldn't blank the whole week
          }
        }
        setTds(rows)
      })
      .catch((e) => setError(e.message))
  }, [week, games, teamStats])

  return { tds, error }
}

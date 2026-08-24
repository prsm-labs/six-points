import { useEffect, useRef, useState } from 'react'
import { resolveEventIds } from './espnGameResolver.js'

// NFL's real pre-game lineup-confirmation equivalent is the ~90-minute pre-kickoff window before
// each Sunday's games, when injury/inactive status is genuinely still resolving in real time --
// this is the NFL analog of Going Yard's LINEUP_STATUS live-confirmation cache (a rolling,
// live-polled status per player close to game time, distinct from the static weekly report).
//
// Verified live 2026-08-24: ESPN's /api/summary?event=<id> response has a real `injuries` array
// (one entry per team, each with a real per-player `status`/`type`/`details` block) that reflects
// the team's CURRENT real injury report, not historically pinned to whichever specific game you
// query -- confirmed by checking it against a Feb-2026 completed game and seeing today's real
// (Aug 2026) date on the entries. That's exactly the live, always-current signal this needs.
// What could NOT be verified: whether ESPN separately exposes the literal official "inactive
// list" (announced ~90 min before kickoff, can include healthy scratches, not just injured
// players) as a distinct field -- no such field was found. This poller re-polls the same live
// injury-status feed on a short interval instead, which is the freshest real signal actually
// available, disclosed honestly as such rather than overclaiming a literal inactive-list feed.
const POLL_INTERVAL_MS = 60000

// Returns the already-slimmed shape api/summary.js's slimInjuries() produces:
// [{ team, injuries: [{ name, position, status, detail }] }]. The direct-fetch fallback (local
// `vite dev`, no Vercel functions running) gets the same shape applied client-side, so callers
// never need to branch on which path served the response.
async function fetchLiveInjuries(eventId) {
  const proxied = await fetch(`/api/summary?event=${eventId}`).catch(() => null)
  if (proxied && proxied.ok) {
    const data = await proxied.json()
    if (data.injuries) return data.injuries
  }
  const direct = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`
  )
  const data = await direct.json()
  return (data.injuries || []).map((teamEntry) => ({
    team: teamEntry.team?.abbreviation || '',
    injuries: (teamEntry.injuries || []).map((inj) => ({
      name: inj.athlete?.displayName || '',
      position: inj.athlete?.position?.abbreviation || '',
      status: inj.status || '',
      detail: inj.details?.type && inj.details.type !== 'Undisclosed' ? inj.details.type : null,
    })),
  }))
}

function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useLiveInactives(schedule, teamStats) {
  const [rows, setRows] = useState([])
  const [lastConfirmed, setLastConfirmed] = useState(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)

  const todaysGames = schedule ? schedule.games.filter((g) => g.gameday === todayYMD()) : []

  useEffect(() => {
    if (!schedule || !teamStats || todaysGames.length === 0) return

    async function poll() {
      setChecking(true)
      try {
        const eventIds = await resolveEventIds(todaysGames, teamStats)
        const allRows = []
        for (const g of todaysGames) {
          const eventId = eventIds[g.game_id]
          if (!eventId) continue
          const injuries = await fetchLiveInjuries(eventId)
          for (const teamEntry of injuries) {
            for (const inj of teamEntry.injuries || []) {
              allRows.push({ team: teamEntry.team, ...inj })
            }
          }
        }
        setRows(allRows)
        setLastConfirmed(new Date())
        setError(null)
      } catch (e) {
        setError(e.message)
      } finally {
        setChecking(false)
      }
    }

    poll()
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, teamStats])

  return { rows, lastConfirmed, checking, error, gamesToday: todaysGames.length }
}

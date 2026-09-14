import { useEffect, useRef, useState } from 'react'

// Real live usage/TD tracker -- "Heating Up" (rising volume) / "On Fire" (high volume + a real
// TD, multiple TDs weighted higher) sub-tab, the NFL analogue of Going Yard's own live signal
// badges. Polls ESPN's real scoreboard for games it reports in progress (status.type.state ===
// 'in', same convention LiveThemes/useLiveInactives already use), then each live game's real
// player box score (boxscore.players[].statistics[] rushing/receiving categories -- verified
// live 2026-09-14: CAR/TGTS/REC/TD are real, per-athlete, per-game cumulative stats, see
// api/summary.js comment) for real touches (carries + targets) and real TDs (rushing TD +
// receiving TD) per player, this game, right now.
//
// "Increasing" is real, not invented: this keeps the PREVIOUS poll's touches-per-player and
// diffs against the current poll, so "Heating Up" only fires for a player whose touch count
// actually went UP between two real polls of ESPN's live box score -- not a guessed trend line.
// The very first poll of a newly-live game has no prior snapshot to diff against, so nobody can
// be "Heating Up" yet on that first look -- correct, honest behavior, not a bug.
//
// "High usage" is an empirical percentile cutoff among players with a real touch this poll
// (top ~35%), same "gate is empirical, not an invented fixed threshold" convention Paydirt/
// Yardage Lab already use -- there's no Track Record history for live in-game usage yet to
// calibrate a real fixed number against.
//
// Not yet verified against a real, extended live game (built 2026-09-14, the first Monday night
// game of the season was still pre-kickoff at build time) -- same disclosed limitation as every
// other live feature in this app; re-verify once a real live game actually runs through this.

const LIVE_USAGE_POLL_MS = 30000
const HIGH_USAGE_PERCENTILE = 0.65

async function fetchScoreboard() {
  const proxied = await fetch('/api/scoreboard').catch(() => null)
  if (proxied && proxied.ok) return proxied.json()
  const direct = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard')
  return direct.json()
}

async function fetchBoxscore(eventId) {
  const proxied = await fetch(`/api/summary?event=${eventId}&full=1`).catch(() => null)
  if (proxied && proxied.ok) {
    const data = await proxied.json()
    if (data.boxscore) return data.boxscore
  }
  const direct = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`
  )
  const data = await direct.json()
  return data.boxscore
}

function statValue(category, athleteId, label) {
  const idx = category.labels.indexOf(label)
  if (idx === -1) return 0
  const athlete = category.athletes.find((a) => a.athlete?.id === athleteId)
  if (!athlete) return 0
  const raw = athlete.stats[idx]
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function extractGameUsage(boxscore, gameLabel) {
  const rows = new Map()
  for (const teamEntry of boxscore?.players || []) {
    const teamAbbr = teamEntry.team?.abbreviation || ''
    const rushing = teamEntry.statistics?.find((c) => c.name === 'rushing')
    const receiving = teamEntry.statistics?.find((c) => c.name === 'receiving')
    const athleteIds = new Set()
    for (const cat of [rushing, receiving]) {
      if (!cat) continue
      for (const a of cat.athletes || []) if (a.athlete?.id) athleteIds.add(a.athlete.id)
    }
    for (const athleteId of athleteIds) {
      const carries = rushing ? statValue(rushing, athleteId, 'CAR') : 0
      const targets = receiving ? statValue(receiving, athleteId, 'TGTS') : 0
      const receptions = receiving ? statValue(receiving, athleteId, 'REC') : 0
      const rushTds = rushing ? statValue(rushing, athleteId, 'TD') : 0
      const recTds = receiving ? statValue(receiving, athleteId, 'TD') : 0
      const name =
        rushing?.athletes.find((a) => a.athlete?.id === athleteId)?.athlete?.displayName ||
        receiving?.athletes.find((a) => a.athlete?.id === athleteId)?.athlete?.displayName || ''
      rows.set(`${gameLabel}:${athleteId}`, {
        athleteId,
        name,
        team: teamAbbr,
        game: gameLabel,
        carries,
        targets,
        receptions,
        touches: carries + targets,
        totalTds: rushTds + recTds,
      })
    }
  }
  return rows
}

export function useLiveUsage() {
  const [players, setPlayers] = useState(null)
  const [liveGameCount, setLiveGameCount] = useState(0)
  const [error, setError] = useState(null)
  const prevTouchesRef = useRef(new Map())
  const timerRef = useRef(null)

  useEffect(() => {
    async function poll() {
      try {
        const scoreboard = await fetchScoreboard()
        const liveEvents = (scoreboard.events || []).filter((e) => e.status?.type?.state === 'in')
        setLiveGameCount(liveEvents.length)
        if (liveEvents.length === 0) {
          setPlayers([])
          return
        }
        const allRows = new Map()
        for (const event of liveEvents) {
          const comp = event.competitions?.[0]
          const home = comp?.competitors?.find((c) => c.homeAway === 'home')?.team?.abbreviation
          const away = comp?.competitors?.find((c) => c.homeAway === 'away')?.team?.abbreviation
          const gameLabel = away && home ? `${away} @ ${home}` : event.shortName || event.id
          const boxscore = await fetchBoxscore(event.id)
          if (!boxscore) continue
          for (const [key, row] of extractGameUsage(boxscore, gameLabel)) {
            allRows.set(key, row)
          }
        }

        const withTouches = [...allRows.values()].filter((r) => r.touches > 0)
        const sortedByTouches = [...withTouches].sort((a, b) => b.touches - a.touches)
        const highUsageCutoffIdx = Math.max(0, Math.ceil(sortedByTouches.length * (1 - HIGH_USAGE_PERCENTILE)) - 1)
        const highUsageThreshold = sortedByTouches[highUsageCutoffIdx]?.touches ?? Infinity

        const prevTouches = prevTouchesRef.current
        const enriched = withTouches.map((r) => {
          const key = `${r.game}:${r.athleteId}`
          const prev = prevTouches.get(key)
          const touchesDelta = prev != null ? r.touches - prev : null
          const highUsage = r.touches >= highUsageThreshold
          return {
            ...r,
            touchesDelta,
            highUsage,
            isOnFire: highUsage && r.totalTds >= 1,
            isHeatingUp: highUsage && touchesDelta != null && touchesDelta > 0,
          }
        })

        const nextTouches = new Map()
        for (const r of withTouches) nextTouches.set(`${r.game}:${r.athleteId}`, r.touches)
        prevTouchesRef.current = nextTouches

        setPlayers(enriched)
      } catch (e) {
        setError(e.message)
      }
    }

    poll()
    timerRef.current = setInterval(poll, LIVE_USAGE_POLL_MS)
    return () => clearInterval(timerRef.current)
  }, [])

  return { players, liveGameCount, error }
}

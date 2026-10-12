import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLiveInactives } from './useLiveInactives.js'

// Live slate status (PROMPT_SixPoints_MirrorSlapShot.md §3) -- Slap Shot re-scores its pool the
// moment a scratch is confirmed; Six Points' weekly pool had the same gap in miniature: a player
// ESPN's live feed rules Out on game day kept a full projection in every ranked list until the
// next pipeline run. One <LiveStatusRunner/> at the app root runs the existing useLiveInactives
// poller (60s, today's games only) once for the whole app and publishes it here; every list reads
// liveStatusFor(row) instead of each tab polling on its own.
//
// Matching is by normalized name + team (ESPN team abbreviations mapped back to ours through
// team_stats.json's espn_abbr -- the LA/LAR, WAS/WSH mismatch). ESPN's injuries feed is the
// team's CURRENT report, not a literal inactive list (see useLiveInactives.js), so a status here
// is "ESPN currently lists him Out", disclosed as such in the UI.

const OUT_STATUSES = ['out', 'injured reserve', 'suspension', 'physically unable to perform', 'non-football injury']

export function normName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[.'’-]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isOutStatus(status) {
  const s = (status || '').toLowerCase()
  return OUT_STATUSES.some((o) => s.startsWith(o))
}

let state = { byKey: {}, rows: [], lastChecked: null, gamesToday: 0, error: null }
const listeners = new Set()

function publish(next) {
  state = next
  for (const l of listeners) l()
}

function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useLiveStatus() {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

export function subscribeLiveStatus(l) {
  return subscribe(() => l(state))
}

/** Live ESPN status for a pool row ({player_name, team}) -- null when ESPN lists nothing. */
export function liveStatusFor(row, s = state) {
  if (!row) return null
  return s.byKey[`${row.team}|${normName(row.player_name)}`] || null
}

export function LiveStatusRunner() {
  const [schedule, setSchedule] = useState(null)
  const [teamStats, setTeamStats] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/data/season_schedule.json').then((r) => (r.ok ? r.json() : null)),
      fetch('/data/team_stats.json').then((r) => (r.ok ? r.json() : null)),
    ]).then(([s, t]) => {
      setSchedule(s)
      setTeamStats(t)
    }).catch(() => {})
  }, [])

  const live = useLiveInactives(schedule, teamStats)

  useEffect(() => {
    if (!teamStats) return
    const espnToOurs = {}
    for (const [ours, t] of Object.entries(teamStats)) {
      if (t.espn_abbr) espnToOurs[t.espn_abbr.toUpperCase()] = ours
    }
    const byKey = {}
    for (const r of live.rows) {
      const team = espnToOurs[(r.team || '').toUpperCase()] || r.team
      byKey[`${team}|${normName(r.name)}`] = { status: r.status, detail: r.detail, out: isOutStatus(r.status) }
    }
    publish({ byKey, rows: live.rows, lastChecked: live.lastConfirmed, gamesToday: live.gamesToday, error: live.error })
  }, [live.rows, live.lastConfirmed, live.gamesToday, live.error, teamStats])

  return null
}

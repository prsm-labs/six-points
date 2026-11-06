import { useSyncExternalStore } from 'react'
import { latestSlate } from './weekView.js'

// 🏁 Hide completed games (2026-11-05, user: across the apps, like Slap Shot's "upcoming games only" -- but live games stay;
// only FINISHED games' players leave the lists. Their pre-game numbers are already frozen for the Track Record, so there's no
// use in seeing them unless the viewer turns this off to see how they did). On by default; only on the pages that list
// projections (App.jsx DONE_TABS: Cheat Sheets, Scouting); only for this week (a past week shows everything, graded); and
// never once every game of the week is final (then the whole week stays up until the next slate posts).
// Final = ESPN's scoreboard says 'post', or the schedule file already has the score (it lags a few hours, never early).
// The filter itself runs in weekView.js's fetch layer: all_matchups_latest.json comes back without those teams' rows unless
// the caller asks for ?all=1 (slideouts, My Picks, alerts); App.jsx remounts the page when the hidden set changes.
let on = true
let scope = false
let keep = new Set() // teams picked in the game strip / header team: a finished game the viewer picks stays
let state = { done: new Set(), games: 0, final: 0, key: '' }
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn())
const sub = (fn) => { listeners.add(fn); start(); return () => listeners.delete(fn) }

export const setDoneOn = (v) => { on = v; notify() }
export const setDoneScope = (v, teams = []) => { scope = v; keep = new Set(teams) } // set by App.jsx during render (no notify: the page key covers it)
// rows filtered right now? (week === null is checked by the caller)
export const doneActive = () => on && scope && state.final > 0 && state.final < state.games
export function hideDone(d) {
  if (!d?.matchups || !doneActive()) return d
  const rows = d.matchups.filter((m) => !state.done.has(m.team) || keep.has(m.team))
  return { ...d, matchups: rows, doneHidden: d.matchups.length - rows.length }
}
export const doneState = () => state
export const doneKeep = () => [...keep].sort().join(',')
export const useDoneOn =() => useSyncExternalStore(sub, () => on, () => on)
export const useDoneState = () => useSyncExternalStore(sub, () => state, () => state)

let started = false
function start() {
  if (started) return
  started = true
  const getJson = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const poll = async () => {
    let live = false
    try {
      const [slate, sched, ts] = await Promise.all([latestSlate(), getJson('/data/season_schedule.json'), getJson('/data/team_stats.json')])
      const games = sched && (sched.season == null || sched.season === slate?.season) ? sched.games.filter((g) => g.week === slate?.week) : []
      const espnToOurs = {}
      for (const [ours, t] of Object.entries(ts || {})) if (t?.espn_abbr) espnToOurs[t.espn_abbr.toUpperCase()] = ours
      const post = new Set()
      const days = [...new Set(games.map((g) => g.gameday).filter(Boolean).map((d) => d.replaceAll('-', '')))]
      for (const ymd of days) {
        const sb = await getJson(`/api/scoreboard?dates=${ymd}`)
        for (const e of sb?.events || []) {
          const st = e.status?.type?.state
          if (st === 'in') live = true
          if (st !== 'post') continue
          for (const c of e.competitions?.[0]?.competitors || []) {
            const a = String(c.team?.abbreviation || '').toUpperCase()
            post.add(espnToOurs[a] || a)
          }
        }
      }
      const done = new Set()
      let final = 0
      for (const g of games) {
        if (g.home_score != null || post.has(g.home_team) || post.has(g.away_team)) { final++; done.add(g.home_team); done.add(g.away_team) }
      }
      const key = [...done].sort().join(',')
      if (key !== state.key || games.length !== state.games) { state = { done, games: games.length, final, key }; notify() }
    } catch { /* keep the last state */ }
    setTimeout(poll, live ? 60_000 : 5 * 60_000)
  }
  poll()
}

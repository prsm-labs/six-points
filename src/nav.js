// 2026-10-23 (user: tap a Schedule game / the slideout's matchup for its box score): ask the app to open Live -> Box Scores
// on a game. focus = { week, gameId (nflverse game_id) } -- Box Scores opens that week with that game.
import { useSyncExternalStore } from 'react'
import { closePlayerSlide, closeTeamSlide } from './slideouts.js'

function makeStore(initial) {
  let state = initial
  const listeners = new Set()
  return {
    get: () => state,
    set: (v) => { state = v; listeners.forEach((fn) => fn()) },
    use: () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => state, () => state),
  }
}

export const tabRequest = makeStore(null)
export const liveFocus = makeStore(null)
export function openGame(focus) {
  liveFocus.set({ ...focus, at: Date.now() })
  tabRequest.set({ tab: 'live', at: Date.now() })
  closePlayerSlide()
  closeTeamSlide()
}

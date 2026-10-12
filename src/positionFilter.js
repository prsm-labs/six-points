import { useSyncExternalStore } from 'react'

// App-wide position filter (PROMPT_SixPoints_MirrorSlapShot.md §2) -- the same one-store-every-tab
// pattern as Slap Shot's lib/positionFilter.js and this app's own MatchupContext. Pick a position
// once in the chip row under the matchup cards and every wired-in table narrows to it.
export const POSITIONS = ['all', 'QB', 'RB', 'WR', 'TE']
const KEY = 'sixpoints.position.v1'

let current = 'all'
try {
  const saved = sessionStorage.getItem(KEY)
  if (POSITIONS.includes(saved)) current = saved
} catch {
  // storage unavailable -- default to all
}
const listeners = new Set()

export function setPosition(p) {
  current = POSITIONS.includes(p) ? p : 'all'
  try {
    sessionStorage.setItem(KEY, current)
  } catch {
    // ignore
  }
  for (const l of listeners) l()
}

function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function usePosition() {
  return useSyncExternalStore(subscribe, () => current, () => current)
}

export function matchesPosition(position, selected) {
  return selected === 'all' || position === selected
}

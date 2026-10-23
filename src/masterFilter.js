import { useSyncExternalStore } from 'react'
import { setListFilter, useListFilters } from './listFilters.js'

// 2026-10-23 (user: one header team dropdown + player search that filters the whole app, replacing the per-page boxes):
// the team lives here, the search is the shared list-filter search (listFilters.js). useMatchup() (MatchupContext.jsx) turns
// a picked team into a team-only selection, so every page wired to the game strip follows it too.
let team = null
const listeners = new Set()
export function setMasterTeam(t) {
  team = t && t !== 'all' ? t : null
  listeners.forEach((fn) => fn())
}
export const useMasterTeam = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => team, () => team)
export const useMasterSearch = () => useListFilters().search
export const setMasterSearch = (v) => setListFilter('search', v)

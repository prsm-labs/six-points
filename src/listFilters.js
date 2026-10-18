// Shared list filters for All Matchups / Paydirt Lab / Yardage Lab / Game Ladder (Slap Shot's lib/listFilters.js,
// 2026-10-18 revamp) -- one app-wide selection (like the matchup and position filters), so narrowing the list on one
// page carries to the others.
import { useSyncExternalStore } from 'react'
import { matchesSearch } from './teamSearch.js'

export const TD_OPTIONS = [null, 10, 20, 30, 40]
export const GRADE_OPTIONS = [null, 'A', 'B', 'C'] // "B" = B or better (A+ / A / A- / B)
const GRADE_ORDER = ['A+', 'A', 'A-', 'B', 'C', 'D', 'F']

const DEFAULTS = { minTd: null, minGrade: null, soft: false, breakout: false, hot: false, role: false, value: false, hideQ: false, search: '' }
let state = { ...DEFAULTS }
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn())

export function setListFilter(key, value) {
  state = { ...state, [key]: value }
  notify()
}
export function clearListFilters() {
  state = { ...DEFAULTS }
  notify()
}
export function activeFilterCount(f) {
  return Object.keys(DEFAULTS).filter((k) => f[k] !== DEFAULTS[k]).length
}
export function useListFilters() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, () => state, () => state)
}

export function applyListFilters(list, f) {
  if (!list) return list
  return list.filter((m) =>
    (f.minTd == null || (m.p_td ?? 0) * 100 >= f.minTd)
    && (f.minGrade == null || (GRADE_ORDER.indexOf(m.grade) > -1 && GRADE_ORDER.indexOf(m.grade) <= GRADE_ORDER.indexOf(f.minGrade === 'B' ? 'B' : f.minGrade === 'A' ? 'A-' : 'C')))
    && (!f.soft || m.def_tier === 'soft')
    && (!f.breakout || m.breakout)
    && (!f.hot || m.hotHand)
    && (!f.role || (m.role_gain ?? 0) >= 1)
    && (!f.value || (m.edge ?? -99) >= 3)
    && (!f.hideQ || !m.week_status)
    && matchesSearch(f.search, [m.player_name], [m.team, m.opponent]))
}

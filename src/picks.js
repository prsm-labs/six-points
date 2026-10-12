import { useSyncExternalStore } from 'react'

// My Picks (PROMPT_SixPoints_MirrorSlapShot.md §8) -- Slap Shot's lib/picks.js pattern: localStorage
// only, no account, one category per player, synced across open tabs via the `storage` event.
// Every read/write is wrapped -- private windows / blocked storage just mean picks don't persist.
const KEY = 'sixpoints.picks.v1'

export const PICK_CATEGORIES = [
  { id: 'anytime_td', label: 'Anytime TD' },
  { id: 'yards_100', label: '100+ Yards' },
  { id: 'first_td', label: 'First TD' },
  { id: 'breakout', label: 'Breakout' },
  { id: 'longshot', label: 'Longshot' },
  { id: 'favorite', label: 'Favorite' },
]

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

let picks = read()
const listeners = new Set()

function emit() {
  for (const l of listeners) l()
}

function write(next) {
  picks = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage unavailable -- picks still work for this page view
  }
  emit()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      picks = read()
      emit()
    }
  })
}

function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function usePicks() {
  return useSyncExternalStore(subscribe, () => picks, () => picks)
}

/** player: any matchup row ({player_id, player_name, team, opponent, position, ...}) */
export function setPick(player, category) {
  const next = { ...picks }
  if (!category) {
    delete next[player.player_id]
  } else {
    next[player.player_id] = {
      player_id: player.player_id,
      player_name: player.player_name,
      team: player.team,
      opponent: player.opponent,
      position: player.position,
      category,
      week: player.week ?? null,
      season: player.season ?? null,
      p_td: player.p_td ?? null,
      p_100: player.p_100 ?? null,
      grade: player.grade ?? null,
      added_at: new Date().toISOString(),
    }
  }
  write(next)
}

export function clearPicks() {
  write({})
}

export function picksToCsv(list) {
  const cols = ['player_name', 'team', 'opponent', 'position', 'category', 'season', 'week', 'grade', 'p_td', 'p_100', 'added_at']
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...list.map((p) => cols.map((c) => esc(p[c])).join(','))].join('\n')
}

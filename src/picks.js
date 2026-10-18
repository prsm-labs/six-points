import { useSyncExternalStore } from 'react'

// My Picks (PROMPT_SixPoints_MirrorSlapShot.md §8) -- Slap Shot's lib/picks.js pattern: localStorage
// only, no account, one category per player, synced across open tabs via the `storage` event.
// Every read/write is wrapped -- private windows / blocked storage just mean picks don't persist.
// 2026-10-18 revamp: the category list now mirrors Slap Shot's one-for-one with football props (Slap Shot's
// Point -> 100+ Yards, Shots (3+) -> King of the End Zone, the DraftKings MNF promo), each with an emoji and a
// Gambly prop (gambly.js PICK_PROP). Old saved categories are migrated on load.
const KEY = 'sixpoints.picks.v1'

export const PICK_TYPES = [
  { key: 'fav', label: 'Favorite', emoji: '⭐' },
  { key: 'anytime', label: 'Anytime TD', emoji: '🏈' },
  { key: 'td2', label: '2+ TDs', emoji: '🏈🏈' },
  { key: 'yds100', label: '100+ Yards', emoji: '💨' },
  { key: 'kote', label: 'King of the End Zone', emoji: '👑' },
  { key: 'first', label: 'First TD', emoji: '🥇' },
  { key: 'dark', label: 'Dark Horse', emoji: '🐎' },
  { key: 'long', label: 'Longshot', emoji: '🎲' },
  { key: 'hot', label: 'Hot Hand', emoji: '🔥' },
]
export const PICK_TYPE = Object.fromEntries(PICK_TYPES.map((t) => [t.key, t]))
// kept for older imports: [{ id, label }]
export const PICK_CATEGORIES = PICK_TYPES.map((t) => ({ id: t.key, label: t.label }))
const MIGRATE = { anytime_td: 'anytime', yards_100: 'yds100', first_td: 'first', breakout: 'hot', longshot: 'long', favorite: 'fav' }

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object') return {}
    for (const p of Object.values(parsed)) {
      if (p && MIGRATE[p.category]) p.category = MIGRATE[p.category]
    }
    return parsed
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

/** player: any matchup row ({player_id, player_name, team, opponent, position, ...}); category null removes. */
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
      p_td2: player.p_td2 ?? null,
      grade: player.grade ?? null,
      book: player.bookBest ?? player.book ?? null,
      added_at: player.added_at || new Date().toISOString(),
    }
  }
  write(next)
}

export function removePick(playerId) {
  if (!picks[playerId]) return
  const next = { ...picks }
  delete next[playerId]
  write(next)
}

export function clearPicks() {
  write({})
}

export function picksToCsv(list) {
  const cols = ['player_name', 'team', 'opponent', 'position', 'category', 'season', 'week', 'grade', 'p_td', 'p_td2', 'p_100', 'book', 'added_at']
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...list.map((p) => cols.map((c) => esc(c === 'category' ? PICK_TYPE[p[c]]?.label || p[c] : p[c])).join(','))].join('\n')
}

import { useSyncExternalStore } from 'react'

// In-app alerts (PROMPT_SixPoints_MirrorSlapShot.md §10) -- Slap Shot's lib/alerts.js approach:
// a drop-down banner + bell history while the site is open. No service worker, VAPID keys or
// subscription store, so none of PROMPT_SixPoints_PushNotifications_Scope.md's open questions
// apply. Real push (site closed) stays scoped-but-unbuilt.
const MAX = 60
let state = { list: [], unseen: 0, toast: null }
const listeners = new Set()

function emit(next) {
  state = next
  for (const l of listeners) l()
}

function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useAlerts() {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

/** alert: { id, type: 'td' | 'status', title, body, playerIds: [] , picked: bool } */
export function pushAlert(alert) {
  if (state.list.some((a) => a.id === alert.id)) return
  const a = { ...alert, time: new Date() }
  emit({ list: [a, ...state.list].slice(0, MAX), unseen: state.unseen + 1, toast: a })
}

export function dismissToast() {
  emit({ ...state, toast: null })
}

export function markSeen() {
  emit({ ...state, unseen: 0 })
}

export function clearAlerts() {
  emit({ list: [], unseen: 0, toast: null })
}

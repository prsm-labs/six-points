import { useEffect, useState } from 'react'
import { enrichSlate } from './slateCore.js'

// One shared, cached load of this week's slate (Slap Shot's lib/data.js useScoredPool pattern, 2026-10-18 revamp):
// all_matchups_latest.json + this week's anytime TD odds (public/data/odds/<season>-wk<week>.json, build_odds.py)
// merged onto each player row by slateCore.js (also used by the lock scripts). Odds are CONTEXT ONLY -- they never
// feed the grade (user, 2026-10-18). See slateCore.js for m.book / m.edge / m.hotHand.
// 2026-10-23: one cached slate per picked week (weekView.js serves a past week's file through fetch)
import { viewWeek } from './weekView.js'
import { doneActive, doneKeep, doneState } from './doneGames.js'
const caches = {}

async function fetchJson(url) {
  try {
    const r = await fetch(url)
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

// 2026-11-05: { all: true } = every game, finished ones included (slideouts, My Picks, alerts); otherwise this week's
// completed games are left out while 🏁 Hide completed games is on (doneGames.js) -- one cache per hidden set.
export function loadSlate({ all = false } = {}) {
  const live = viewWeek() == null
  const k = `${viewWeek() ?? 'now'}|${all || !live || !doneActive() ? 'all' : doneState().key}|${doneKeep()}`
  if (caches[k]) return caches[k]
  caches[k] = (async () => {
    const data = await fetchJson(all ? '/data/all_matchups_latest.json?all=1' : '/data/all_matchups_latest.json')
    if (!data) return null
    const odds = await fetchJson(`/data/odds/${data.season}-wk${data.week}.json`)
    return { ...enrichSlate(data, odds), past: Boolean(data.past), replay: Boolean(data.replay) }
  })()
  return caches[k]
}

export function useSlate({ all = false } = {}) {
  const [slate, setSlate] = useState(null)
  useEffect(() => {
    let alive = true
    loadSlate({ all }).then((s) => alive && setSlate(s || { matchups: [], not_playing: [], error: true }))
    return () => { alive = false }
  }, [])
  return slate
}

export const pct = (p, d = 1) => (p == null || Number.isNaN(Number(p)) ? '—' : `${(Number(p) * 100).toFixed(d)}%`)

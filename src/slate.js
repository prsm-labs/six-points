import { useEffect, useState } from 'react'
import { enrichSlate } from './slateCore.js'

// One shared, cached load of this week's slate (Slap Shot's lib/data.js useScoredPool pattern, 2026-10-18 revamp):
// all_matchups_latest.json + this week's anytime TD odds (public/data/odds/<season>-wk<week>.json, build_odds.py)
// merged onto each player row by slateCore.js (also used by the lock scripts). Odds are CONTEXT ONLY -- they never
// feed the grade (user, 2026-10-18). See slateCore.js for m.book / m.edge / m.hotHand.
let cache = null

async function fetchJson(url) {
  try {
    const r = await fetch(url)
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

export function loadSlate() {
  if (cache) return cache
  cache = (async () => {
    const data = await fetchJson('/data/all_matchups_latest.json')
    if (!data) return null
    const odds = await fetchJson(`/data/odds/${data.season}-wk${data.week}.json`)
    return enrichSlate(data, odds)
  })()
  return cache
}

export function useSlate() {
  const [slate, setSlate] = useState(null)
  useEffect(() => {
    let alive = true
    loadSlate().then((s) => alive && setSlate(s || { matchups: [], not_playing: [], error: true }))
    return () => { alive = false }
  }, [])
  return slate
}

export const pct = (p, d = 1) => (p == null || Number.isNaN(Number(p)) ? '—' : `${(Number(p) * 100).toFixed(d)}%`)

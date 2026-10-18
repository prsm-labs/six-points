import { useEffect, useState } from 'react'

// One shared, cached load of this week's slate (Slap Shot's lib/data.js useScoredPool pattern, 2026-10-18 revamp):
// all_matchups_latest.json + this week's anytime TD odds (public/data/odds/<season>-wk<week>.json, build_odds.py)
// merged onto each player row. Odds are CONTEXT ONLY -- they never feed the grade (user, 2026-10-18).
//   m.book  = { best, bestBook, bestImplied, medianImplied, books, links }   (missing = not priced yet)
//   m.edge  = our TD % minus the best price's implied %, in points (>= VALUE_EDGE = value)
//   m.hotHand = scored a TD in the last 3 games and NOT in the week's top 25% by TD % (backtest 2023-25: this
//               group scored 1.33x what the model said, every season; 2026 wks 2-5 1.16x)
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
    const rows = data.matchups || []
    const tdRank = [...rows].map((m) => m.p_td ?? 0).sort((a, b) => a - b)
    const pctOf = (v) => {
      let lo = 0
      let hi = tdRank.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (tdRank[mid] < v) lo = mid + 1
        else hi = mid
      }
      return tdRank.length ? lo / tdRank.length : 0
    }
    const enrich = (m) => {
      const book = odds?.players?.[m.player_id] || null
      const tdPct = m.p_td != null ? m.p_td * 100 : null
      const td_pct_rank = m.p_td != null ? pctOf(m.p_td) : null
      return {
        ...m,
        book,
        bookBest: book?.best ?? null,
        bookImplied: book?.bestImplied ?? null,
        edge: book && tdPct != null ? Math.round((tdPct - book.bestImplied) * 10) / 10 : null,
        td_pct_rank,
        hotHand: (m.td_l3 ?? 0) > 0 && td_pct_rank != null && td_pct_rank < 0.75,
      }
    }
    return {
      ...data,
      matchups: rows.map(enrich),
      not_playing: (data.not_playing || []).map(enrich),
      odds,
    }
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

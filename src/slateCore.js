// Pure (no React) slate enrichment shared by the browser (slate.js) and the lock scripts (scripts/*.mjs), so a locked
// board is built from exactly what the page shows. 2026-10-18 revamp.
//   m.book / m.edge  -- this week's anytime TD price (odds/<season>-wk<week>.json) and our TD % minus its implied %
//   m.hotHand        -- a TD in his last 3 games and outside the week's top 25% by TD % (beat the model 1.3x, 2023-25)
export function enrichSlate(data, odds) {
  const rows = data?.matchups || []
  const tdRank = rows.map((m) => m.p_td ?? 0).sort((a, b) => a - b)
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
    const tdPctRank = m.p_td != null ? pctOf(m.p_td) : null
    return {
      ...m,
      book,
      bookBest: book?.best ?? null,
      bookImplied: book?.bestImplied ?? null,
      edge: book && tdPct != null ? Math.round((tdPct - book.bestImplied) * 10) / 10 : null,
      td_pct_rank: tdPctRank,
      hotHand: (m.td_l3 ?? 0) > 0 && tdPctRank != null && tdPctRank < 0.75,
    }
  }
  return { ...data, matchups: rows.map(enrich), not_playing: (data?.not_playing || []).map(enrich), odds }
}

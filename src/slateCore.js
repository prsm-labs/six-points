// Pure (no React) slate enrichment shared by the browser (slate.js) and the lock scripts (scripts/*.mjs), so a locked
// board is built from exactly what the page shows. 2026-10-18 revamp.
//   m.book / m.edge  -- this week's anytime TD price (odds/<season>-wk<week>.json) and our TD % minus its implied %
//   m.market         -- context-only market check: half our TD %, half the book's, vig out (market.js, 2026-10-26)
//   m.hotHand        -- a TD in his last 3 games and outside the week's top 25% by TD % (beat the model 1.3x, 2023-25)
//   m.yds_rank / yds_n / yds_tier -- the opponent's rank among this week's defenses in yards allowed to his position
//                    (mu_yds_idx, 1 = softest), thirds = soft / neutral / tough (2026-10-19)

// Yards-vs-position ranks (2026-10-19, user: separate rankings vs RB / WR / TE yards, not just vs TDs). mu_yds_idx is the
// engine's yards allowed to the position vs league average (this season, shrunk toward last season + league); it's the
// same for every player facing that defense at that position. Returns Map 'OPP|POS' -> { rank, n, idx, tier }.
import { marketPct } from './market.js'

export const YDS_POSITIONS = ['RB', 'WR', 'TE']
export function ydsDefRanks(rows) {
  const by = {}
  for (const m of rows || []) {
    if (!YDS_POSITIONS.includes(m.position) || m.mu_yds_idx == null || !m.opponent) continue
    ;(by[m.position] ||= new Map()).set(m.opponent, Number(m.mu_yds_idx))
  }
  const out = new Map()
  for (const [pos, byOpp] of Object.entries(by)) {
    const vals = [...byOpp.values()]
    const n = vals.length
    for (const [opp, idx] of byOpp) {
      const rank = 1 + vals.filter((v) => v > idx).length
      out.set(`${opp}|${pos}`, { rank, n, idx, tier: rank <= n / 3 ? 'soft' : rank > (2 * n) / 3 ? 'tough' : 'neutral' })
    }
  }
  return out
}

export function enrichSlate(data, odds) {
  const rows = data?.matchups || []
  const ydsRanks = ydsDefRanks(rows)
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
    const yr = ydsRanks.get(`${m.opponent}|${m.position}`)
    return {
      ...m,
      book,
      bookBest: book?.best ?? null,
      bookImplied: book?.bestImplied ?? null,
      edge: book && tdPct != null ? Math.round((tdPct - book.bestImplied) * 10) / 10 : null,
      market: book ? marketPct(tdPct, book) : null,
      td_pct_rank: tdPctRank,
      hotHand: (m.td_l3 ?? 0) > 0 && tdPctRank != null && tdPctRank < 0.75,
      yds_rank: yr?.rank ?? null,
      yds_n: yr?.n ?? null,
      yds_tier: yr?.tier ?? null,
    }
  }
  return { ...data, matchups: rows.map(enrich), not_playing: (data?.not_playing || []).map(enrich), odds }
}

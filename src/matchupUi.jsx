import { useEffect, useState } from 'react'

// Position matchup / role-leak display (2026-10-12). Reads the engine's build_matchup_features
// columns from all_matchups_latest.json:
//   mu_pct    0-100 percentile, within position, of how many yards this opponent gives up to this
//             player's role (his targets deep/short and carries, at the yards per target / carry the
//             defense allows that position). 100 = softest. Replaces the old MatchupScore
//             (opp_def_rank_pct), whose >= 60 gate showed no TD lift in the 2023-25 backtest.
//   mu_yds    how many of the player's Est. Yards come from the matchup (+ soft, - tough), sized by
//             the held-out yards model -- RB/TE matchups held up all 3 seasons, WR was inconsistent.
//   mu_*_idx  what the defense allows the position vs league average (1.20 = 20% more).

export function muTier(m) {
  if (m?.mu_pct == null) return null
  if (m.mu_pct > 200 / 3) return 'Soft'
  if (m.mu_pct < 100 / 3) return 'Tough'
  return 'Neutral'
}

const pctDiff = (x) => Math.round((Number(x) - 1) * 100)

/** The defense's notable allowances for this player's position, biggest first (|diff| >= 10%). */
export function leakParts(m) {
  if (!m) return []
  const pos = m.position
  const recv = (m.tg_pg ?? 0) >= (m.ca_pg ?? 0)
  const items = []
  const add = (idx, label) => {
    if (idx == null) return
    const d = pctDiff(idx)
    if (Math.abs(d) >= 10) items.push({ d, text: `${d > 0 ? '+' : ''}${d}% ${label}` })
  }
  if (pos === 'RB') {
    add(m.mu_car_idx, 'RB carries')
    add(m.mu_ypc_idx, 'RB yds/carry')
    add(m.mu_tgt_idx, 'RB targets')
  } else if (pos === 'WR' || pos === 'TE') {
    add(m.mu_tgt_idx, `${pos} targets`)
    if ((m.deep_share ?? 0) >= 0.25) add(m.mu_deep_ypt_idx, `${pos} deep yds/target`)
    add(m.mu_short_ypt_idx, `${pos} short yds/target`)
  } else if (pos === 'QB') {
    add(m.mu_car_idx, 'QB rushes')
    add(m.mu_ypc_idx, 'QB yds/rush')
  }
  if (!recv || pos === 'TE') add(m.mu_rz_idx, `${pos} red-zone touches`)
  add(m.mu_td_idx, `${pos} TDs`)
  return items.sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
}

export function leakSummary(m, max = 3) {
  const parts = leakParts(m).slice(0, max).map((p) => p.text)
  return parts.length ? `${m.opponent} allows ${parts.join(', ')} vs league average` : `${m?.opponent ?? 'Opponent'} is near league average vs ${m?.position ?? 'this position'}`
}

export function fmtYds(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}`
}

/** Compact matchup chip: tier + matchup yards, the leak breakdown on hover. */
export function MatchupCell({ m, showYds = true }) {
  const tier = muTier(m)
  if (!tier) return <span className="meta-line small">—</span>
  return (
    <span className={`mu-chip mu-${tier.toLowerCase()}`} title={`${tier} matchup (${Math.round(m.mu_pct)}th pct vs ${m.position}). ${leakSummary(m)}.`}>
      {tier}
      {showYds && m.mu_yds != null && <span className="mu-yds">{fmtYds(m.mu_yds)}</span>}
    </span>
  )
}

/** Red-zone matchup for TD views: red-zone touches allowed to the position vs league. */
export function RzMatchupCell({ m }) {
  if (m?.mu_rz_idx == null) return <span className="meta-line small">—</span>
  const d = pctDiff(m.mu_rz_idx)
  const td = m.mu_td_idx != null ? pctDiff(m.mu_td_idx) : null
  return (
    <span className={d >= 10 ? 'mu-chip mu-soft' : d <= -10 ? 'mu-chip mu-tough' : 'mu-chip mu-neutral'}
      title={`${m.opponent} allows ${d >= 0 ? '+' : ''}${d}% red-zone touches${td != null ? ` and ${td >= 0 ? '+' : ''}${td}% TDs` : ''} to ${m.position}s vs league average (this season, shrunk toward last season + league).`}>
      {d >= 0 ? '+' : ''}{d}%
    </span>
  )
}

// Roster availability + vacated roles (2026-10-12). The engine now builds the slate from ESPN's live
// rosters: injured reserve, practice squad, released / traded and Out players are taken off it (listed in
// all_matchups_latest.json -> not_playing), and each absent player's trailing carries / targets / red-zone
// touches are handed to the teammates still playing, in proportion to their own share:
//   depth_label   RB1 / WR2 ... from ESPN's current depth chart, among available players
//   role_gain     touches / game inherited from absent teammates; role_gain_rz the red-zone part
//   role_yds      the part of Est. Yards that comes from that inherited role (held-out yards model)
//   vac_from      who it comes from, e.g. "De'Von Achane (Injured Reserve)"

export function DepthTag({ m }) {
  if (!m?.depth_label) return null
  return <span className="depth-tag" title="ESPN depth chart, among players available this week">{m.depth_label}</span>
}

export function roleSummary(m) {
  if (!m?.vac_from || ((m.role_gain ?? 0) < 0.5 && (m.role_gain_rz ?? 0) < 0.1)) return null
  const parts = [`+${Number(m.role_gain).toFixed(1)} touches/g`]
  if ((m.role_gain_rz ?? 0) >= 0.1) parts.push(`+${Number(m.role_gain_rz).toFixed(1)} red-zone`)
  if (m.role_yds != null && Math.abs(m.role_yds) >= 1) parts.push(`${fmtYds(m.role_yds)} est. yds`)
  return `Inherits ${parts.join(', ')} from ${m.vac_from}`
}

/** "+4.1 role" chip when absent teammates' usage flows to this player (1+ touch or 0.3+ red-zone touches
 *  a game; smaller gains only show in the slideout / Key Matchups text). "new" = an absence this week. */
// 2026-10-26: 🔙 starter back (build_role_check.py) rides along with the role chip so every list / card shows it
function StarterBackTag({ m }) {
  const b = m.starterBack
  if (!b) return null
  return <span className="starter-back" title={`${b.name} is back${b.q ? ' (Questionable)' : ''} after missing ${b.out} game${b.out === 1 ? '' : 's'} — ${m.player_name ? `${m.player_name}'s` : 'his'} recent usage came without him. Proceed with caution; kept out of Top Picks / PRISM Picks`}>🔙 </span>
}

export function RoleChip({ m }) {
  const text = roleSummary(m)
  if (!text || ((m.role_gain ?? 0) < 1 && (m.role_gain_rz ?? 0) < 0.3)) return <StarterBackTag m={m} />
  const isNew = (m.role_gain_new ?? 0) >= 0.5
  return (
    <><StarterBackTag m={m} /><span className="role-chip" title={`${text}. Their trailing usage is split among the teammates still playing, by each one's own share; "new" marks absences that started this week, which the trailing averages haven't absorbed yet.`}>
      {(m.role_gain ?? 0) >= 1 ? `+${Number(m.role_gain).toFixed(1)} role` : `+${Number(m.role_gain_rz).toFixed(1)} RZ`}{isNew ? ' (new)' : ''}
    </span></>
  )
}

let modelPromise = null
/** grade_model.json, fetched once per page load (validation numbers for the lab notes). */
export function useGradeModel() {
  const [model, setModel] = useState(null)
  useEffect(() => {
    if (!modelPromise) modelPromise = fetch('/data/grade_model.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)
    let alive = true
    modelPromise.then((m) => alive && setModel(m))
    return () => { alive = false }
  }, [])
  return model
}

export const pct1 = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`)

// 2026-11-11 Quick read (QuickRead.jsx, shared with CourtIQ / Slap Shot / Final Lap): the slideout's short "why" box. Only
// tested factors speak, biggest first, at most 4:
//   tested edges (edges.js, beat or missed our chance every held-out season 2023-25): sized by their held-out points; the market
//   team total is labelled as market context (not-Vegas rule: never in the grade);
//   grade / Est. Yards inputs (already inside his numbers): the TD-defense third, the yards matchup for RB / TE (WR yards
//   matchup is context only -> left out), inherited touches from teammates out, 🔙 starter back, 🪑? depth check, hot hand.
// Not here on purpose: H2H, home / road, who-scores-by-role, scheme splits (tested as noise; still in the folded sections).
import { pickLines } from './QuickRead.jsx'
import { EDGES } from './edges.js'

const ord = (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const sgn = (x) => (x >= 0 ? `+${x}` : `−${-x}`)
const EDGE_PTS = { hightotal: 4.8, lowtotal: -5.3, qbchange: -4.6, wind: -3.6, missedlast: -6.6 }
const EDGE_TEXT = {
  hightotal: () => 'High team total (market)',
  lowtotal: () => 'Low team total (market)',
  qbchange: (m) => `${m.team} starting a different QB than usual`,
  wind: () => '15+ mph wind (yardage)',
  missedlast: () => "Missed his team's last game",
}

export function quickReadNfl(m, keys = []) {
  if (!m || m.p_td == null) return null
  const c = []
  for (const k of keys) {
    const e = EDGES.find((x) => x.v === k), w = EDGE_PTS[k]
    if (e && w) c.push({ dir: w > 0 ? 'up' : 'down', w, text: `${e.label.split(' ')[0]} ${EDGE_TEXT[k](m)}: ran ${sgn(w)} pts vs our chance` })
  }
  if (m.starterBack) c.push({ dir: 'warn', w: 4, text: `${m.starterBack.name} is back: his extra usage may shrink` })
  if (m.roleFlag === 'backup') c.push({ dir: 'warn', w: 3.5, text: `Depth chart has him ${m.depth_label}: treat his numbers as an upper bound` })
  if (m.vac_from && (m.role_gain >= 1 || m.role_gain_rz >= 0.3)) {
    const who = String(m.vac_from).replace(/\s*\(.*$/, '')
    const what = m.role_gain >= 1 ? `+${Number(m.role_gain).toFixed(1)} touches a game` : `+${Number(m.role_gain_rz).toFixed(1)} red-zone touches a game`
    c.push({ dir: 'up', w: m.role_gain >= 3 ? 3 : 2, text: `${what} with ${who} out` })
  }
  if (m.def_rank && m.def_n && m.def_tier && m.def_tier !== 'mid' && m.def_tier !== 'middle') {
    const soft = m.def_tier === 'soft'
    const r = soft ? m.def_rank : m.def_n - m.def_rank + 1
    if (m.def_tier === 'soft' || m.def_tier === 'tough') c.push({ dir: soft ? 'up' : 'down', w: r <= 5 ? 2.5 : 1.5, text: `${soft ? 'Soft' : 'Tough'} TD matchup: ${m.opponent} ${ord(r)} ${soft ? 'softest' : 'toughest'}` })
  }
  if (m.mu_yds != null && Math.abs(m.mu_yds) >= 4 && (m.position === 'RB' || m.position === 'TE')) {
    const y = Math.round(m.mu_yds)
    c.push({ dir: y > 0 ? 'up' : 'down', w: Math.min(3, Math.abs(y) / 4), text: `Yards matchup: ${sgn(y)} est. yds vs ${m.opponent}` })
  }
  if (m.hotHand) c.push({ dir: 'up', w: 1.5, text: 'Scored last game while outside the top 25%: hot hand' })
  const yds = m.position !== 'QB' && m.est_yards != null ? ` · Est. ${Math.round(m.est_yards)} yds` : ''
  return {
    title: `Quick read · ${m.home_or_away === '@' ? '@' : 'vs'} ${m.opponent}`,
    lines: pickLines(c),
    chances: `TD ${pct(m.p_td)}${m.p_td2 != null ? ` · 2+ TDs ${pct(m.p_td2)}` : ''}${yds}`,
    note: 'Plain lines are already in his numbers; emoji lines are tested spots that ran past (or under) our chances.',
  }
}

// 2026-10-28 Opp D (user: see who has a big chance AND faces a bad defense, on every list, filterable -- same column in
// CourtIQ / Slap Shot). The engine's own TD-defense rank (m.def_rank of m.def_n this week's defenses, 1 = softest; the
// defense factor inside the grade) and its thirds (m.def_tier). Team level: defense-vs-position added nothing for TDs.
import { rankWhere } from './gradeUi.jsx'

export const DEF_TIERS = [
  { v: 'soft', label: '🟢 Soft', title: "Opponent in this week's softest third of TD defenses" },
  { v: 'neutral', label: 'Average' },
  { v: 'tough', label: '🔴 Tough', title: "Opponent in this week's stingiest third of TD defenses" },
]

export const oppDefTier = (m) => (m.def_rank ? m.def_tier || 'neutral' : null)

export function OppDefCell({ m }) {
  if (!m?.def_rank || !m.def_n) return <td className="num">—</td>
  return (
    <td className="nowrap" title={`${m.opponent} TD defense: #${m.def_rank} softest of ${m.def_n} this week`}>
      <span className={`mu-chip mu-${m.def_tier || 'neutral'}`}>{rankWhere(m.def_rank, m.def_n)}</span>
    </td>
  )
}

export const OPP_DEF_NOTE = "Opp D = the opponent's rank among this week's defenses by TDs allowed (the defense factor inside the grade). Green = softest third, red = stingiest third."

import { useEffect, useState } from 'react'
import { POSITIONS, setPosition, usePosition } from './positionFilter.js'
import { liveStatusFor, useLiveStatus } from './liveStatus.js'

// Shared UI for the grade model (PROMPT_SixPoints_MirrorSlapShot.md §1), Breakout Watch (§6),
// the app-wide position chips (§2) and live slate status (§3).

export function fmtPct(p, digits = 0) {
  if (p == null || Number.isNaN(Number(p))) return '—'
  return `${(Number(p) * 100).toFixed(digits)}%`
}

const GRADE_CLASS = { 'A+': 'g-aplus', A: 'g-a', 'A-': 'g-aminus', B: 'g-b', C: 'g-c', D: 'g-d', F: 'g-f' }
export const GRADE_ORDER = ['A+', 'A', 'A-', 'B', 'C', 'D', 'F']

// Matchup line for a grade (2026-10-18, Slap Shot's grade tooltip + DVP_NOTE). def_* come from the engine: the
// opponent's TD-defense index is the defense factor INSIDE the grade; position splits are context only.
export const DVP_NOTE = "Defense factor in the grade = the opponent's TDs allowed (team level, shrunk toward last season). "
  + 'Defense-vs-position splits and position "leaks" are shown as context only: 14 defense measures were tested on top of '
  + 'the model over 2023-25 and none added anything for TDs (they do move estimated yards a little).'
export function matchupText(m) {
  if (!m?.def_rank) return null
  const tier = m.def_tier === 'soft' ? 'soft ▲' : m.def_tier === 'tough' ? 'tough ▼' : 'middle third'
  return `Matchup: ${m.opponent} TD defense #${m.def_rank} softest of ${m.def_n} this week (${tier})`
}
// Who scores vs this defense (2026-10-19, user: "D keys on Kittle, the TE2 gets open"): the opponent's TDs allowed
// this season by the scorer's role on his team (TE1 / TE2 ...), next to a typical defense over the same games.
// Context only: over 2023-25 a defense's past TDs by role didn't repeat, and backups behind a star, backups vs a
// defense weak at the position, and primetime depth players all scored no more than the grade said.
export const ROLE_NOTE = "Context only, not in the grade: tested over 2023-25, a defense's past TDs by role don't repeat, and "
  + "backups behind a star, backups vs a defense weak at the position, and primetime depth players scored no more than the grade said."
const ROLE_ORDER = { RB: ['RB1', 'RB2', 'RB3+'], WR: ['WR1', 'WR2', 'WR3', 'WR4+'], TE: ['TE1', 'TE2', 'TE3+'] }
export function roleLabel(m) {
  const order = ROLE_ORDER[m?.position]
  if (!order || !m.use_rank) return null
  return order[Math.min(m.use_rank, order.length) - 1]
}
export function whoScoresText(m) {
  const order = ROLE_ORDER[m?.position]
  if (!order || !m.opp_role_tds || !m.opp_games) return null
  const allowed = order.map((k) => `${k} ${m.opp_role_tds[k] || 0}`).join(' · ')
  const typical = order.map((k) => `${k} ${((m.role_td_avg?.[k] || 0) * m.opp_games).toFixed(1)}`).join(' · ')
  const mine = roleLabel(m)
  return `Who scores vs ${m.opponent} (${m.position} TDs, ${m.opp_games} games): ${allowed} — typical defense ${typical}${mine ? ` · he's his team's ${mine} by usage` : ''}`
}
export function gradeTooltip(m) {
  if (!m?.grade) return undefined
  const top = m.grade_pct != null ? `top ${Math.max(1, Math.round((1 - m.grade_pct) * 100))}% of this week's pool` : ''
  const probs = [m.p_td != null && `TD ${fmtPct(m.p_td, 1)}`, m.p_td2 != null && `2+ TDs ${fmtPct(m.p_td2, 1)}`, m.p_100 != null && `100+ yds ${fmtPct(m.p_100, 1)}`].filter(Boolean).join(' · ')
  return [`Grade ${m.grade}${top ? ` — ${top}` : ''}`, probs, matchupText(m), whoScoresText(m), DVP_NOTE].filter(Boolean).join(String.fromCharCode(10))
}

/** m (optional): the player row -- adds the ▲ / ▼ matchup marker (soft / tough TD defense) and the full tooltip. */
export function GradeBadge({ grade, title, m }) {
  if (!grade) return <span className="meta-line small">—</span>
  const tier = m?.def_tier
  return (
    <span className={`grade-badge ${GRADE_CLASS[grade] || ''}`} title={m ? gradeTooltip(m) : title}>
      {grade}
      {tier === 'soft' && <span className="mu-mark soft">▲</span>}
      {tier === 'tough' && <span className="mu-mark tough">▼</span>}
    </span>
  )
}

export function BreakoutBadge({ m }) {
  if (!m?.breakout) return null
  return (
    <span
      className={m.soft_matchup ? 'breakout-badge soft' : 'breakout-badge'}
      title={`Breakout Watch: last-3-week touches ${Number(m.form_ratio).toFixed(2)}x his season rate, outside the week's top 15% by grade${m.soft_matchup ? ', facing a top-third yardage matchup for his role and position' : ''}`}
    >
      📈{m.soft_matchup ? ' soft' : ''}
    </span>
  )
}

/** Small "OUT" tag when ESPN's live game-day feed lists the player Out. */
export function LiveStatusTag({ m }) {
  const live = useLiveStatus()
  const st = liveStatusFor(m, live)
  if (!st) return null
  return (
    <span className={st.out ? 'live-status out' : 'live-status'} title={`ESPN live: ${st.status}${st.detail ? ` (${st.detail})` : ''}`}>
      {st.out ? 'OUT' : st.status.slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Hide/flag rows ESPN's live feed currently lists Out. */
export function useLiveOutFilter() {
  const live = useLiveStatus()
  return (m) => {
    const st = liveStatusFor(m, live)
    return !(st && st.out)
  }
}

export function PositionChips() {
  const pos = usePosition()
  return (
    <div className="position-chips" role="group" aria-label="Position filter (all tabs)">
      <span className="meta-line small" style={{ margin: 0 }}>Position</span>
      {POSITIONS.map((p) => (
        <button key={p} className={pos === p ? 'active' : ''} onClick={() => setPosition(p)}>
          {p === 'all' ? 'All' : p}
        </button>
      ))}
    </div>
  )
}

/** Slap Shot's SlateStatus banner, NFL calendar: pool build time, live injury check, Out calls. */
export function SlateStatus({ data }) {
  const live = useLiveStatus()
  const [open, setOpen] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000)
    return () => clearInterval(t)
  }, [])
  const [npOpen, setNpOpen] = useState(false)
  if (!data) return null
  const outRows = data.matchups.filter((m) => liveStatusFor(m, live)?.out)
  const built = data.generated_at ? new Date(data.generated_at) : null
  // 2026-10-12: players the engine took off the slate (ESPN roster: IR / practice squad / released / traded,
  // or Out on this week's report), biggest roles first
  const notPlaying = [...(data.not_playing || [])].sort((a, b) => (b.touches_per_game ?? 0) - (a.touches_per_game ?? 0))
  const checked = data.roster_checked_at ? new Date(data.roster_checked_at) : null
  return (
    <div className="slate-status">
      <span>
        Week {data.week} pool built {built ? built.toLocaleString() : '—'}
      </span>
      {data.roster_source && (
        <span title="Who is on the slate: ESPN's live team rosters and depth charts (nflverse weekly rosters as the fallback). Injured reserve, practice squad, released / traded and Out players are removed and their role goes to the teammates still playing.">
          Rosters checked {checked ? checked.toLocaleString() : '—'} ({data.roster_source === 'espn' ? 'ESPN' : 'nflverse'})
        </span>
      )}
      {notPlaying.length > 0 && (
        <button className="team-link" onClick={() => setNpOpen((o) => !o)}>
          {notPlaying.length} not playing (IR, Out, practice squad…) {npOpen ? '▴' : '▾'}
        </button>
      )}
      {npOpen && (
        <div className="slate-status-detail not-playing-list">
          {notPlaying.map((m) => (
            <div key={`${m.team}-${m.player_id}`}>
              {m.player_name} ({m.team} {m.position}) <span className="reason">{m.absent_reason}</span>
            </div>
          ))}
        </div>
      )}
      <span>
        {live.gamesToday > 0
          ? `Live injury check ${live.lastChecked ? live.lastChecked.toLocaleTimeString() : '…'} (${live.gamesToday} game${live.gamesToday === 1 ? '' : 's'} today)`
          : 'No games today, so no live injury check'}
      </span>
      {outRows.length > 0 && (
        <button className="team-link" onClick={() => setOpen((o) => !o)}>
          {outRows.length} listed Out by ESPN (live) {open ? '▴' : '▾'}
        </button>
      )}
      {open && (
        <div className="slate-status-detail">
          {outRows.map((m) => (
            <div key={m.player_id}>{m.player_name} ({m.team} {m.position}): {liveStatusFor(m, live).status}, hidden from ranked lists</div>
          ))}
        </div>
      )}
    </div>
  )
}

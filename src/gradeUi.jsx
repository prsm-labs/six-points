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

export function GradeBadge({ grade, title }) {
  if (!grade) return <span className="meta-line small">—</span>
  return <span className={`grade-badge ${GRADE_CLASS[grade] || ''}`} title={title}>{grade}</span>
}

export function BreakoutBadge({ m }) {
  if (!m?.breakout) return null
  return (
    <span
      className={m.soft_matchup ? 'breakout-badge soft' : 'breakout-badge'}
      title={`Breakout Watch: last-3-week touches ${Number(m.form_ratio).toFixed(2)}x his season rate, outside the week's top 15% by grade${m.soft_matchup ? ', facing a defense in the top third for TDs allowed to his position' : ''}`}
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
  if (!data) return null
  const outRows = data.matchups.filter((m) => liveStatusFor(m, live)?.out)
  const built = data.generated_at ? new Date(data.generated_at) : null
  return (
    <div className="slate-status">
      <span>
        Week {data.week} pool built {built ? built.toLocaleString() : '—'}
      </span>
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

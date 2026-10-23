import { useState } from 'react'
import { activeFilterCount, clearListFilters, GRADE_OPTIONS, setListFilter, TD_OPTIONS, useListFilters } from './listFilters.js'

// Collapsible filter bar for the long player lists (Slap Shot's components/ListFilters.jsx; listFilters.js holds the
// shared state). Each toggle's tooltip says whether it's a tested signal or context.
export default function ListFilters({ shown, total }) {
  const f = useListFilters()
  const [open, setOpen] = useState(false)
  const n = activeFilterCount(f)
  const pill = (active, label, onClick, title) => (
    <button key={label} title={title} className={`pill-btn ${active ? 'active' : ''}`} onClick={onClick}>{label}</button>
  )
  return (
    <div className="card list-filters">
      <div className="list-filters-row">
        <button className="pill-btn" onClick={() => setOpen((v) => !v)}>⚙ Filters{n ? ` (${n})` : ''} {open ? '▲' : '▼'}</button>
        {/* 2026-10-23: the player / team search moved to the header (MasterFilter) -- one search for the whole app */}
        {shown != null && <span className="meta-line small" style={{ margin: 0 }}>{shown} of {total} players</span>}
        {n > 0 && <button className="pill-btn" onClick={clearListFilters}>✕ Clear</button>}
      </div>
      {open && (
        <div className="list-filters-body">
          <div className="pill-row">
            {TD_OPTIONS.map((g) => pill(f.minTd === g, g ? `TD ${g}%+` : 'Any TD %', () => setListFilter('minTd', g)))}
          </div>
          <div className="pill-row">
            {GRADE_OPTIONS.map((g) => pill(f.minGrade === g, g ? `Grade ${g} or better` : 'Any grade', () => setListFilter('minGrade', g)))}
          </div>
          <div className="pill-row">
            {pill(f.soft, '▲ Soft TD defense', () => setListFilter('soft', !f.soft), "Opponent in this week's softest third by TDs allowed (the defense factor inside the grade)")}
            {pill(f.hot, '🔥 Hot hand', () => setListFilter('hot', !f.hot), 'Scored a TD in his last 3 games and NOT a top-25% TD chance this week -- this group scored 1.33x what the model said in 2023-25 (every season)')}
            {pill(f.breakout, '🚀 Breakout Watch', () => setListFilter('breakout', !f.breakout), "Touches last 3 games 1.2x+ his season rate, outside the week's top 15% -- backtested lift")}
            {pill(f.role, '+ Role gain', () => setListFilter('role', !f.role), 'Inherits 1+ touch a game from an injured / inactive teammate')}
            {pill(f.value, '💰 Value vs book', () => setListFilter('value', !f.value), 'Our TD % at least 3 points above the chance the best sportsbook price implies (context, never a grade input)')}
            {pill(f.hideQ, 'Hide Questionable / Doubtful', () => setListFilter('hideQ', !f.hideQ), 'Only players with no injury designation this week')}
          </div>
        </div>
      )}
    </div>
  )
}

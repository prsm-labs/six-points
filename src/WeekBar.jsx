import { Component, useEffect, useState } from 'react'
import { gradeRecord, latestSlate, setViewWeek, useViewWeek, weekIndex } from './weekView.js'
import { useMatchup } from './MatchupContext.jsx'

// 📅 Week picker bar (2026-10-23) -- above the game strip. See weekView.js for how a past week is served to every page.
const md = (d) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })

export default function WeekBar() {
  const week = useViewWeek()
  const [opts, setOpts] = useState(null)
  const { setSelectedMatchup } = useMatchup()
  useEffect(() => {
    Promise.all([latestSlate(), gradeRecord(), weekIndex(), fetch('/data/season_schedule.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)])
      .then(([latest, rec, idx, sched]) => {
        if (!latest) return
        const span = (w) => {
          const days = (sched?.games || []).filter((g) => g.week === w).map((g) => g.gameday).filter(Boolean).sort()
          return days.length ? `${md(days[0])} – ${md(days[days.length - 1])}` : ''
        }
        const saved = new Set((idx?.weeks || []).filter((x) => x.season === latest.season).map((x) => x.week))
        const past = [...new Set([...rec.filter((r) => Number(r.season) === latest.season).map((r) => Number(r.week)), ...saved])]
          .filter((w) => w < latest.week).sort((a, b) => b - a)
        setOpts({ current: latest.week, currentSpan: span(latest.week), past: past.map((w) => ({ w, span: span(w), saved: saved.has(w) })) })
      })
  }, [])
  const pick = (v) => { setSelectedMatchup?.(null); setViewWeek(v || null); try { window.scrollTo({ top: 0 }) } catch { /* ignore */ } }
  if (!opts || (!opts.past.length && !week)) return null
  const cur = opts.past.find((o) => o.w === week)
  return (
    <div className={`date-bar ${week ? 'past' : ''}`}>
      <label className="date-pick">
        <span aria-hidden="true">📅</span>
        <select value={week || ''} onChange={(e) => pick(e.target.value)} aria-label="Pick a week">
          <option value="">This week · Week {opts.current}{opts.currentSpan ? ` (${opts.currentSpan})` : ''}</option>
          {opts.past.map((o) => <option key={o.w} value={o.w}>Week {o.w}{o.span ? ` (${o.span})` : ''}</option>)}
        </select>
      </label>
      {week ? (
        <span className="date-note">
          Viewing <b>Week {week}</b>{cur?.span ? ` (${cur.span})` : ''} — {cur?.saved ? 'the slate as it was locked before Sunday kickoff' : 'grades and chances as graded that week (saved before the full slate was kept, so some columns are empty)'}, with how it played out.
          <button className="link-btn" onClick={() => pick(null)}>Back to this week ✕</button>
        </span>
      ) : <span className="meta-line small" style={{ margin: 0 }}>Pick a past week to see its slate, picks and results</span>}
    </div>
  )
}

// A page that can't draw a past week (it needs inputs the saved week doesn't keep) says so instead of breaking the app.
export class PastWeekGuard extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err) { console.warn('[PastWeekGuard]', err?.message, String(err?.stack || '').slice(0, 300)) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <p className="meta-line">
        {this.props.past ? "This page can't be shown for a past week — the saved week doesn't keep everything it needs. " : 'This page hit a problem loading. '}
        {this.props.past && <button className="link-btn" onClick={() => setViewWeek(null)}>Back to this week</button>}
      </p>
    )
  }
}

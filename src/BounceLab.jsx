import { useEffect, useMemo, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide } from './slideouts.js'
import { useMatchup, isInSelectedMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import { setPosition, usePosition } from './positionFilter.js'
import { useSlate } from './slate.js'

// 📈 Bounce-back (2026-10-27, user: "due for a boom" -- tested first; CourtIQ has the same tab). The mirror of 🧊 Fade:
// nfl_project/build_bounce.py -> public/data/bounce.json. Est. Yards well ABOVE his last-3 average; held out 2023-25 he
// finished above that average 69.8% of the time (all players ~51%; a cold streak with no model 69% only at the far end).
// They beat Est. Yards itself only ~45% -- back to his level, not past it. The big number = how often past picks that far
// above hit.
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const RESULT = { hit: '✅', miss: '✗', void: 'DNP' }

export default function BounceLab() {
  const [d, setD] = useState(undefined)
  useEffect(() => {
    fetch('/data/bounce.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null))
  }, [])
  const slate = useSlate()
  const position = usePosition()
  const { selectedMatchup } = useMatchup()
  const wk = d?.weeks?.find((w) => w.week === d.week)
  const byId = useMemo(() => new Map((slate?.matchups || []).map((m) => [m.player_id, m])), [slate])
  const rows = useMemo(() => (wk?.picks || [])
    .filter((f) => position === 'all' || f.pos === position)
    .filter((f) => !selectedMatchup || isInSelectedMatchup(selectedMatchup, f.team))
    .map((f) => ({ ...f, gap: f.est - f.line })), [wk, position, selectedMatchup])
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, 'z', 'desc')
  const th = { sortKey, sortDir, onSort: toggleSort }
  if (d === undefined) return <p className="empty-state">Loading...</p>
  if (!d) return <p className="empty-state">No bounce-back data yet.</p>
  const bt = d.backtest
  const past = d.weeks.filter((w) => w.week < d.week && w.picks.some((f) => f.result)).slice(-1)
  return (
    <div>
      <p className="meta-line">
        📈 <b>Bounce-backs</b>: RBs / WRs / TEs whose Est. Yards this week sit well <b>above their last-3 average</b> — a cold
        stretch the model doesn't buy. A bounce-back hits when he finishes above that average. Backtest 2023-25, each season held
        out: <b>{pct(bt.hits / bt.n)}</b> of {bt.n} hit (every player: ~{pct(bt.baseline)})
        {d.live?.n ? <> · this season {d.live.hits}/{d.live.n}</> : null}. They're <b>back to normal, not due to explode</b>: they
        beat Est. Yards itself only {pct(bt.beatEst)} of the time. Picks freeze at kickoff. Not a lock.
      </p>
      <div className="calc-block" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, maxWidth: 'none', marginBottom: 12 }}>
        <label style={{ minWidth: 110 }}>
          Position
          <select value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="all">All</option><option value="RB">RB</option><option value="WR">WR</option><option value="TE">TE</option>
          </select>
        </label>
      </div>
      <MatchupFilterNote />
      {sorted.length === 0 ? <p className="empty-state">No bounce-backs {wk ? 'match this filter' : 'this week yet'}.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <SortTh label="Player" sortKeyName="name" className="sticky-col" {...th} />
              <SortTh label="Pos" sortKeyName="pos" {...th} />
              <SortTh label="Opp" sortKeyName="opp" {...th} />
              <SortTh label="Last-3 avg" sortKeyName="line" {...th} />
              <SortTh label="Est. Yards" sortKeyName="est" {...th} />
              <SortTh label="Gap" sortKeyName="gap" {...th} />
              <SortTh label="Past bounce-backs hit" sortKeyName="track" {...th} />
              <th>Why</th>
              <th>Result</th>
            </tr></thead>
            <tbody>
              {sorted.map((f) => {
                const m = byId.get(f.player_id)
                return (
                  <tr key={f.player_id}>
                    <td className="sticky-col">
                      <span className="player-cell" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: m ? 'pointer' : 'default' }} onClick={() => m && openPlayerSlide(m)}>
                        <PlayerAvatar playerId={f.player_id} name={f.name} /> {f.name}
                      </span>
                      <div className="meta-line small" style={{ margin: 0 }}>{f.team}{f.depth ? ` · ${f.depth}` : ''}</div>
                    </td>
                    <td>{f.pos}</td>
                    <td>{f.opp}</td>
                    <td className="num">Over {f.line.toFixed(1)}</td>
                    <td className="num"><b>{f.est.toFixed(1)}</b></td>
                    <td className="num">+{f.gap.toFixed(1)}</td>
                    <td className="num"><b>{pct(f.track)}</b></td>
                    <td className="small">{f.why.join(' · ')}<div className="meta-line small" style={{ margin: 0 }}>This season: {f.games.join(', ')}</div></td>
                    <td className="small">{f.result ? `${RESULT[f.result]}${f.actual != null ? ` ${f.actual}` : ''}` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="meta-line small">
        Past bounce-backs by gap (Est. Yards − last-3 avg, scaled): {bt.bands.map(([lo, hi, n, h]) => `${lo}${hi < 99 ? `–${hi}` : '+'}: ${h}/${n} (${pct(h / n)})`).join(' · ')}.
      </p>
      {past.length > 0 && (
        <details className="prism-past">
          <summary>Last week</summary>
          {past.map((w) => {
            const g = w.picks.filter((f) => f.result === 'hit' || f.result === 'miss')
            return (
              <div key={w.week} className="prism-past-row">
                <b>Week {w.week}</b> {g.filter((f) => f.result === 'hit').length}/{g.length}
                <span className="meta-line small"> {w.picks.map((f) => `${RESULT[f.result] || '…'} ${f.name} o${f.line.toFixed(0)}${f.actual != null ? ` (${f.actual})` : ''}`).join(' · ')}</span>
              </div>
            )
          })}
        </details>
      )}
    </div>
  )
}

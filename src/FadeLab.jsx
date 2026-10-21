import { useEffect, useMemo, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide } from './slideouts.js'
import { useMatchup, isInSelectedMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import { setPosition, usePosition } from './positionFilter.js'
import { useSlate } from './slate.js'

// 🧊 Fade (2026-10-21, user: players running above their usual, or in a bad matchup -- tested first; CourtIQ has the
// same tab). nfl_project/build_fades.py -> public/data/fades.json. Fading a player because he's been HOT lost in the
// held-out test; what held is Est. Yards well below his season average (he finishes under that average far more often
// than the ~53% of all players). The big number = how often past fades that far below hit.
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const RESULT = { hit: '✅', miss: '✗', void: 'DNP' }

export default function FadeLab() {
  const [d, setD] = useState(undefined)
  useEffect(() => {
    fetch('/data/fades.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null))
  }, [])
  const slate = useSlate()
  const position = usePosition()
  const { selectedMatchup } = useMatchup()
  const wk = d?.weeks?.find((w) => w.week === d.week)
  const byId = useMemo(() => new Map((slate?.matchups || []).map((m) => [m.player_id, m])), [slate])
  const rows = useMemo(() => (wk?.fades || [])
    .filter((f) => position === 'all' || f.pos === position)
    .filter((f) => !selectedMatchup || isInSelectedMatchup(selectedMatchup, f.team))
    .map((f) => ({ ...f, gap: f.line - f.est })), [wk, position, selectedMatchup])
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, 'z', 'desc')
  const th = { sortKey, sortDir, onSort: toggleSort }
  if (d === undefined) return <p className="empty-state">Loading...</p>
  if (!d) return <p className="empty-state">No fade data yet.</p>
  const bt = d.backtest
  const past = d.weeks.filter((w) => w.week !== d.week && w.fades.some((f) => f.result)).reverse()
  return (
    <div>
      <p className="meta-line">
        🧊 <b>Fades</b>: RBs / WRs / TEs whose Est. Yards this week sit well <b>below their season average</b> (scrimmage yards
        per game this season, 3+ games). A fade hits when he finishes under that average. Backtest 2023-25, each season held out:{' '}
        <b>{pct(bt.hits / bt.n)}</b> of {bt.n} fades hit (every player: ~{pct(bt.baseline)})
        {d.live?.n ? <> · this season {d.live.hits}/{d.live.n}</> : null}. Fading a player just because his last 3 games were big{' '}
        <b>lost</b> in the same test ({bt.naive}), so a hot streak alone never puts him here. Fades freeze at kickoff. Not a lock.
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
      {sorted.length === 0 ? <p className="empty-state">No fades {wk ? 'match this filter' : 'this week yet'}.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <SortTh label="Player" sortKeyName="name" className="sticky-col" {...th} />
              <SortTh label="Pos" sortKeyName="pos" {...th} />
              <SortTh label="Opp" sortKeyName="opp" {...th} />
              <SortTh label="Season avg" sortKeyName="line" {...th} />
              <SortTh label="Est. Yards" sortKeyName="est" {...th} />
              <SortTh label="Gap" sortKeyName="gap" {...th} />
              <SortTh label="Past fades hit" sortKeyName="track" {...th} />
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
                    <td className="num">Under {f.line.toFixed(1)}</td>
                    <td className="num"><b>{f.est.toFixed(1)}</b></td>
                    <td className="num">−{f.gap.toFixed(1)}</td>
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
        Past fades by gap (season avg − Est. Yards, scaled): {bt.bands.map(([lo, hi, n, h]) => `${lo}${hi < 99 ? `–${hi}` : '+'}: ${h}/${n} (${pct(h / n)})`).join(' · ')}.
      </p>
      {past.length > 0 && (
        <details className="prism-past">
          <summary>Past weeks</summary>
          {past.map((w) => {
            const g = w.fades.filter((f) => f.result === 'hit' || f.result === 'miss')
            return (
              <div key={w.week} className="prism-past-row">
                <b>Week {w.week}</b> {g.filter((f) => f.result === 'hit').length}/{g.length}
                <span className="meta-line small"> {w.fades.map((f) => `${RESULT[f.result] || '…'} ${f.name} u${f.line.toFixed(0)}${f.actual != null ? ` (${f.actual})` : ''}`).join(' · ')}</span>
              </div>
            )
          })}
        </details>
      )}
    </div>
  )
}

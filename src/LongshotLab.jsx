import { useEffect, useMemo, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide } from './slideouts.js'
import { useMatchup, isInSelectedMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import { usePosition } from './positionFilter.js'
import { useSlate } from './slate.js'
import { LIST_MAX, rec1 } from './listMax.js'

// 🎯 Long-shot creators (2026-11-07, user: Slap Shot's list, for Six Points). nfl_project/build_longshot.py -> public/data/longshot.json.
// RBs / WRs / TEs with a 12-30% TD chance this week, ranked by red-zone touches a game over the last 3 weeks (carries + targets inside
// the 20) vs the other players at his position; top 8. Held out 2023-25 (live grade model): scored 27.6% of 384 (said 24.7%), above
// what we said in 2 of 3 seasons; 92% WR / TE. Shown % = the TD chance everywhere else in the app (unchanged).
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const RESULT = { hit: '✅', miss: '✗', void: 'DNP' }
const POS_WORD = { RB: 'RBs', WR: 'WRs', TE: 'TEs' }

export function useLongshot(week) {
  const [d, setD] = useState(undefined)
  useEffect(() => {
    fetch('/data/longshot.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null))
  }, [week])
  return d
}

export const longshotWhy = (f) => `${f.rz3.toFixed(1)} red-zone touches a game lately (#${f.rank} of ${f.of} ${POS_WORD[f.pos] || f.pos}; season ${f.rzSeason.toFixed(1)})`

export default function LongshotLab() {
  const slate = useSlate()
  const d = useLongshot(slate?.week)
  const position = usePosition()
  const { selectedMatchup } = useMatchup()
  const wk = d?.weeks?.find((w) => w.week === d.week)
  const byId = useMemo(() => new Map((slate?.matchups || []).map((m) => [m.player_id, m])), [slate])
  const rows = useMemo(() => (wk?.picks || [])
    .filter((f) => byId.has(f.player_id) || f.result)
    .filter((f) => position === 'all' || f.pos === position)
    .filter((f) => !selectedMatchup || isInSelectedMatchup(selectedMatchup, f.team)), [wk, byId, position, selectedMatchup])
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, 'pct', 'desc')
  const th = { sortKey, sortDir, onSort: toggleSort }
  if (d === undefined) return <p className="empty-state">Loading...</p>
  if (!d) return <p className="empty-state">No long-shot data yet.</p>
  const bt = d.backtest
  const rec = { all: rec1(d.weeks, (w) => w.picks), live: rec1((d.weeks || []).filter((w) => w.week >= d.liveFromWeek), (w) => w.picks) } // 2026-11-12: each week's #1 only
  const past = d.weeks.filter((w) => w.week < d.week && w.picks.some((f) => f.result))
  return (
    <div>
      <p className="meta-line">
        🎯 <b>Long-shot creators</b>: sorted by TD chance, the lists are the lead backs and WR1s; a tight end or WR2 at 15-25% sits far
        down. This keeps RBs / WRs / TEs at a <b>12-30% TD chance</b> this week and ranks them by <b>red-zone touches a game over the last
        3 weeks</b> (carries + targets inside the 20) against the other players at their position.
        Backtest 2023-25, each season held out: <b>{pct(bt.hits / bt.n)}</b> of {bt.n} scored (we said {pct(bt.said)}) — a little more than
        we said in 2 of 3 seasons, even in the third; {pct(bt.positions.WR + bt.positions.TE)} WRs / TEs. Ranked by chance instead, the same
        band scored {pct(bt.byChance.hit)} (said {pct(bt.byChance.said)}).
        {rec?.all?.n ? <> This season (weeks 6-{d.liveFromWeek - 1} replayed from the frozen week slates): <b>{rec.all.hits}/{rec.all.n}</b> (said {pct(rec.all.said)}).</> : null}
        {rec?.live?.n ? <> Live since week {d.liveFromWeek}: <b>{rec.live.hits}/{rec.live.n}</b>.</> : null}
        {' '}About 1 in 4 — a lean on small samples, so the chance shown isn't changed. Picks freeze at kickoff. Not a lock.
      </p>
      <MatchupFilterNote />
      {sorted.length === 0 ? <p className="empty-state">No long-shot creators {wk ? 'match this filter' : 'this week yet'}.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <SortTh label="Player" sortKeyName="name" className="sticky-col" {...th} />
              <SortTh label="Pos" sortKeyName="pos" {...th} />
              <SortTh label="Opp" sortKeyName="opp" {...th} />
              <SortTh label="TD chance" sortKeyName="chance" {...th} />
              <SortTh label="RZ touches / g, L3" sortKeyName="pct" {...th} />
              <SortTh label="Touches / g, L3" sortKeyName="tch3" {...th} />
              <th>Why</th>
              <th>Result</th>
            </tr></thead>
            <tbody>
              {sorted.slice(0, LIST_MAX).map((f) => {
                const m = byId.get(f.player_id)
                return (
                  <tr key={f.player_id}>
                    <td className="sticky-col">
                      <span className="player-cell" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: m ? 'pointer' : 'default' }} onClick={() => m && openPlayerSlide(m)}>
                        <PlayerAvatar playerId={f.player_id} name={f.name} /> {f.name}
                      </span>
                      <div className="meta-line small" style={{ margin: 0 }}>{f.team}{m?.depth_label ? ` · ${m.depth_label}` : ''}</div>
                    </td>
                    <td>{f.pos}</td>
                    <td>{f.opp}</td>
                    <td className="num"><b>{pct(f.chance)}</b></td>
                    <td className="num">{f.rz3.toFixed(1)} <span className="meta-line small">#{f.rank}/{f.of}</span></td>
                    <td className="num">{f.tch3.toFixed(1)}</td>
                    <td className="small">{longshotWhy(f)}</td>
                    <td className="small">{f.result ? `${RESULT[f.result]}${f.actual != null ? ` ${f.actual} TD` : ''}` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {past.length > 0 && (
        <details className="prism-past">
          <summary>Past weeks</summary>
          {[...past].reverse().map((w) => {
            const g = w.picks.filter((f) => f.result === 'hit' || f.result === 'miss')
            return (
              <div key={w.week} className="prism-past-row">
                <b>Week {w.week}</b>{w.replay ? ' (replay)' : ''} {g.filter((f) => f.result === 'hit').length}/{g.length}
                <span className="meta-line small"> {w.picks.map((f) => `${RESULT[f.result] || '…'} ${f.name} ${pct(f.chance)}`).join(' · ')}</span>
              </div>
            )
          })}
        </details>
      )}
    </div>
  )
}

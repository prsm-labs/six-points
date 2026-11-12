import { useEffect, useMemo, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide } from './slideouts.js'
import { useMatchup, isInSelectedMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import { setPosition, usePosition } from './positionFilter.js'
import { useSlate } from './slate.js'
import { LIST_MAX, rec1 } from './listMax.js'

// 🔦 Under the radar (2026-11-02, user: Gibbs is the obvious TD every week and priced like it -- find the guy nobody is talking
// about whose numbers say he's primed). nfl_project/build_radar.py -> public/data/radar.json. RBs / WRs / TEs who scored in
// <= 25% of their last 8 games with a 20%+ TD chance this week (the Risk Slider's calibrated chance), top 10 by chance minus
// his own rate. Held out 2023-25: scored 33.4% of 470 (said 32.2%) vs their own rate 10.9%; 59% WR / TE. Defense vs position
// stays noise; role-leak boosts were tested and are already in the chance.
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const RESULT = { hit: '✅', miss: '✗', void: 'DNP' }

export function useRadar(week) {
  const [d, setD] = useState(undefined)
  useEffect(() => {
    fetch('/data/radar.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null))
  }, [week])
  return d
}

export default function RadarLab() {
  const slate = useSlate()
  const d = useRadar(slate?.week)
  const position = usePosition()
  const { selectedMatchup } = useMatchup()
  const wk = d?.weeks?.find((w) => w.week === d.week)
  const byId = useMemo(() => new Map((slate?.matchups || []).map((m) => [m.player_id, m])), [slate])
  const rows = useMemo(() => (wk?.picks || [])
    .filter((f) => byId.has(f.player_id))
    .filter((f) => position === 'all' || f.pos === position)
    .filter((f) => !selectedMatchup || isInSelectedMatchup(selectedMatchup, f.team)), [wk, byId, position, selectedMatchup])
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, 'lift', 'desc')
  const th = { sortKey, sortDir, onSort: toggleSort }
  if (d === undefined) return <p className="empty-state">Loading...</p>
  if (!d) return <p className="empty-state">No under-the-radar data yet.</p>
  const bt = d.backtest
  const rec = { all: rec1(d.weeks, (w) => w.picks), live: rec1((d.weeks || []).filter((w) => w.week >= d.liveFromWeek), (w) => w.picks) } // 2026-11-12: each week's #1 only
  const past = d.weeks.filter((w) => w.week < d.week && w.picks.some((f) => f.result))
  return (
    <div>
      <p className="meta-line">
        🔦 <b>Under the radar</b>: RBs / WRs / TEs who have scored in <b>2 or fewer of their last 8 games</b> — so nobody is
        talking about them — but have a <b>20%+ TD chance this week</b>. The 10 where this week beats their usual by the most.
        Backtest 2023-25, each season held out: <b>{pct(bt.hits / bt.n)}</b> of {bt.n} scored (said {pct(bt.said)}) while those
        players had scored in {pct(bt.own)} of their recent games; {pct((bt.positions.WR + (bt.positions.TE || 0)) / bt.n)} were WRs / TEs (the
        top-10 TD chance list is 94% RBs). Opponent vs position stays noise; teammates out and rising touches are already in the
        chance (a boost on top didn't hold). Shown % = the 🎚️ Risk Slider anytime-TD chance. Picks freeze at kickoff.
        {rec?.all?.n ? <> This season (weeks 6-{d.liveFromWeek - 1} replayed from the frozen line boards): <b>{rec.all.hits}/{rec.all.n}</b> (said {pct(rec.all.said)}).</> : null}
        {rec?.live?.n ? <> Live since week {d.liveFromWeek}: <b>{rec.live.hits}/{rec.live.n}</b>.</> : null} Not a lock.
      </p>
      {/* 2026-11-05: position comes from the app-wide Position dropdown under the game strip (this page's own copy removed) */}
      <MatchupFilterNote />
      {sorted.length === 0 ? <p className="empty-state">Nobody under the radar {wk ? 'matches this filter' : 'this week yet'}.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <SortTh label="Player" sortKeyName="name" className="sticky-col" {...th} />
              <SortTh label="Pos" sortKeyName="pos" {...th} />
              <SortTh label="Opp" sortKeyName="opp" {...th} />
              <SortTh label="TD chance" sortKeyName="chance" {...th} />
              <SortTh label="Scored, last 8" sortKeyName="own" {...th} />
              <SortTh label="Above his usual" sortKeyName="lift" {...th} />
              <th>Last 7 (TDs)</th>
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
                    <td className="num">{f.hits}/{f.n}</td>
                    <td className="num">+{Math.round(f.lift * 100)} pts</td>
                    <td className="num small">{f.recent.map((g, i) => <span key={i} style={{ color: g[2] > 0 ? 'var(--accent, #2fae5c)' : 'var(--muted, #888)' }}>{g[2]}{i < f.recent.length - 1 ? ' · ' : ''}</span>)}</td>
                    <td className="small">{f.why.join(' · ')}</td>
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

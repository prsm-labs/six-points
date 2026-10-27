import { useMemo } from 'react'
import { useSlate } from './slate.js'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide } from './slideouts.js'
import { useMatchup, isInSelectedMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import ListFilters from './ListFilters.jsx'
import { applyListFilters, useFilterContext, useListFilters } from './listFilters.js'
import { matchesPosition, usePosition } from './positionFilter.js'
import { recentOf, useLineWeek } from './lineBoard.js'
import RiskBoard from './RiskBoard.jsx'

// 🎚️ Risk slider (2026-10-27, user: a slider in Scouting from safe to long shot -- the player list shows the props in that chance
// range, tap a player for his whole ladder; plus L7 green / red strips). Ladders from nfl_project/build_line_board.py: scrimmage
// yards 10-150, anytime TD, 2+ TDs for RBs / WRs / TEs, each player's frozen at his kickoff and graded after.
const STATS = [{ k: 'YDS', label: 'Scrim yds' }, { k: 'TD', label: 'Anytime TD' }, { k: 'TD2', label: '2+ TDs' }]
const lineLabel = (st, T) => (st === 'YDS' ? `${T}+ yds` : st === 'TD' ? 'Anytime TD' : '2+ TDs')

export default function RiskSliderTab() {
  const slate = useSlate()
  const position = usePosition()
  const { selectedMatchup } = useMatchup()
  const f = useListFilters()
  const fctx = useFilterContext(slate)
  const { meta, week } = useLineWeek(slate)
  const base = useMemo(() => (slate?.matchups || [])
    .filter((m) => matchesPosition(m.position, position))
    .filter((m) => !selectedMatchup || isInSelectedMatchup(selectedMatchup, m.team)), [slate, position, selectedMatchup])
  const shown = useMemo(() => (slate?.matchups ? applyListFilters(base, f, fctx) : []), [slate, base, f, fctx])

  const players = useMemo(() => {
    const byId = new Map(shown.map((m) => [m.player_id, m]))
    return (week?.players || []).filter((p) => byId.has(p.id)).map((p) => {
      const m = byId.get(p.id)
      return {
        id: p.id, n: p.n, lines: p.lines, recent: recentOf(p.recent), proj: { YDS: p.est }, actual: p.actual,
        cell: (
          <span className="player-cell" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => openPlayerSlide(m)}>
            <PlayerAvatar playerId={p.id} name={p.name} />
            <span>{p.name}<div className="meta-line small" style={{ margin: 0 }}>{p.team} vs {p.opp} · {p.pos}{p.status ? ` · ${p.status}` : ''}</div></span>
          </span>
        ),
      }
    })
  }, [shown, week])

  if (!slate) return <p className="empty-state">Loading this week's slate…</p>
  if (week === undefined) return <p className="empty-state">Loading the line board…</p>
  if (!week) return <p className="empty-state">No line board for week {slate.week} — it starts with week 6 (the first frozen slate).</p>
  return (
    <div>
      <div className="section-head">
        <h2>🎚️ Risk Slider</h2>
        <p className="meta-line">Week {slate.week} · every RB / WR / TE ladder, from safe to long shot</p>
      </div>
      <MatchupFilterNote />
      <ListFilters shown={players.length} total={(week.players || []).length} base={base} ctx={fctx} />
      <RiskBoard players={players} stats={STATS} model={meta?.model} live={meta?.live} lineLabel={lineLabel} past
        storeKey="sixpoints.risk" pillClass="pill-btn" stickyClass="sticky-col" lastLabel="L8" unit="week"
        intro={<>🎚️ Slide from <b>Safe</b> (lines he clears most weeks) to <b>Long shot</b> (rare lines that pay off big). Every RB / WR / TE
          gets a ladder — scrimmage yards 10-150, anytime TD, 2+ TDs — priced from his Est. Yards / TD chance and how often he cleared each
          line in his last 8 games (last season counts early on). Backtest 2023-25 (168,583 held-out lines): every chance band within about a
          point of what it said; NFL weeks are small, so the top of a range can run a few points under (see the backtest line below the
          slider). Ladders freeze at each kickoff. Tap a prop for his whole ladder; L7 = his last 7 games against that line. QBs aren't
          projected for yards; players with fewer than 4 games in the window aren't listed{week.skipped ? ` (${week.skipped} this week)` : ''}. Not a lock.</>} />
    </div>
  )
}

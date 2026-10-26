import { useMemo } from 'react'
import { useSlate } from './slate.js'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import PickButton from './PickButton.jsx'
import { BreakoutBadge, fmtPct, GradeBadge, LiveStatusTag, SlateStatus, useLiveOutFilter } from './gradeUi.jsx'
import { DepthTag, MatchupCell, RoleChip } from './matchupUi.jsx'
import { BestPriceLink, EdgeCell, MarketCell, StatePicker } from './BetLink.jsx'
import { booksText } from './bookOdds.js'
import ListFilters from './ListFilters.jsx'
import { applyListFilters, useFilterContext, useListFilters } from './listFilters.js'
import { matchesPosition, usePosition } from './positionFilter.js'
import { isInSelectedMatchup, useMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import { HotHandTag, dvpRanks } from './revampUi.jsx'
import { H2HBadge, H2H_NOTE, VENUE_NOTE, h2hFor, useH2H, venueFor } from './h2h.jsx'

// All Matchups (Slap Shot's tabs/AllMatchupsTab.jsx, 2026-10-18 revamp): this week's slate ranked by the grade model,
// one row per player with the defense he's facing, his recent form, the book's price and our edge. Matchup-first --
// season stat dumps live on Splits. The original Zone Score stack is still here (⚙️ to show / hide any column).
export default function AllMatchupsTab() {
  const slate = useSlate()
  const position = usePosition()
  const { selectedMatchup } = useMatchup()
  const f = useListFilters()
  const notOut = useLiveOutFilter()
  const h2hData = useH2H()

  const rows = useMemo(() => {
    if (!slate?.matchups) return null
    const dvp = dvpRanks(slate.matchups)
    return slate.matchups.map((m) => {
      const d = dvp.get(`${m.opponent}|${m.position}`)
      const h = h2hFor(h2hData, m), v = venueFor(h2hData, m)
      return { ...m, dvp: d, dvpSoft: d ? d.of + 1 - d.rank : null, td_l3: m.td_l3 ?? null,
        h2h: h, h2hScore: h?.letter ? h.score : null, ha: v, haScore: v?.letter ? v.score : null }
    })
  }, [slate, h2hData])
  // 2026-10-25 FilterPanel: base = before the panel's filters (its pill counts); fctx = this week's picks + team rest
  const fctx = useFilterContext(slate)
  const base = useMemo(() => (rows || [])
    .filter((m) => matchesPosition(m.position, position))
    .filter((m) => !selectedMatchup || isInSelectedMatchup(selectedMatchup, m.team))
    .filter((m) => notOut(m)), [rows, position, selectedMatchup, notOut])
  const shown = useMemo(() => (rows ? applyListFilters(base, f, fctx) : []), [rows, base, f, fctx])
  const { sorted, sortKey, sortDir, toggleSort } = useSort(shown, 'grade_score', 'desc')
  const th = { sortKey, sortDir, onSort: toggleSort }

  if (!slate) return <p className="empty-state">Loading this week's slate…</p>
  if (slate.error) return <p className="empty-state">No slate data yet — the Tuesday engine run writes it.</p>

  return (
    <div>
      <div className="section-head">
        <h2>🏈 All Matchups</h2>
        <p className="meta-line">Week {slate.week} · every available QB / RB / WR / TE, ranked by the grade model — who they face and how that changes things</p>
      </div>
      <div className="note">
        ℹ️ <strong>Grade, TD %, 2+ TD % and 100+ %</strong> come from the backtested grade model (role, red-zone share, recent
        form, team scoring environment, vacated roles). ▲ / ▼ on a grade = facing one of this week's softest / stingiest
        third of TD defenses — the defense factor inside the grade. <strong>D vs Pos</strong> and the yards <strong>Matchup</strong> chip
        are context: position splits added nothing for TDs over 2023-25. <strong>Book Odds / vs Book</strong> = best anytime TD price
        (priced once a week: Thursday for TNF, Saturday for Sunday / Monday) and our TD % minus its implied chance — not a value
        signal: where we and the book disagree, the book has been closer. <strong>Market %</strong> = half our TD %, half the
        book's (vig out), which beat both. All context only, never in the grade. Hover anything for details; ⚙️ in the first header picks columns.
      </div>
      <SlateStatus data={slate} />
      <MatchupFilterNote />
      <ListFilters shown={sorted.length} total={rows.length} base={base} ctx={fctx} />
      <div className="toolbar-row"><StatePicker /></div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh label="Player" sortKeyName="player_name" className="sticky-col" {...th} />
              <SortTh label="Opp" sortKeyName="opponent" {...th} />
              <SortTh label="Grade" sortKeyName="grade_score" {...th} />
              <SortTh label="TD %" sortKeyName="p_td" {...th} />
              <SortTh label="2+ TD %" sortKeyName="p_td2" {...th} />
              <SortTh label="100+ %" sortKeyName="p_100" {...th} />
              <SortTh label="Book Odds" sortKeyName="bookImplied" {...th} />
              <SortTh label="vs Book" sortKeyName="edge" {...th} />
              <SortTh label="Market %" sortKeyName="market" {...th} />
              <SortTh label="Est. Yds" sortKeyName="est_yards" {...th} />
              <SortTh label="TDs L3" sortKeyName="td_l3" {...th} />
              <SortTh label="Touch/g L3" sortKeyName="l3_tpg_s" {...th} />
              <SortTh label="RZ/g" sortKeyName="redzone_touches_per_game" {...th} />
              <SortTh label="Snap %" sortKeyName="snap_pct_avg" {...th} />
              <SortTh label="Matchup" sortKeyName="mu_pct" {...th} />
              <SortTh label="D vs Pos" sortKeyName="dvpSoft" {...th} />
              <SortTh label="Zone Score" sortKeyName="zone_score" {...th} />
              <SortTh label="H2H" sortKeyName="h2hScore" {...th} />
              <SortTh label="H/A" sortKeyName="haScore" {...th} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr key={`${m.player_id}-${m.team}`}>
                <td className="sticky-col">
                  <div className="player-cell" onClick={() => openPlayerSlide(m)}>
                    <PlayerAvatar playerId={m.player_id} name={m.player_name} />
                    <div>
                      <span>{m.player_name}</span> <PickButton player={m} compact />
                      <div className="cell-sub">
                        {m.team} · {m.position}<DepthTag m={m} />{m.roleFlag && <span title={`Depth chart ${m.depth_label}, below his usage rank, ${m.teamGp} team games — kept out of Top Picks`}> 🪑?</span>}{!m.roleFlag && m.teamGp === 0 && <span title={`No games with ${m.team} yet${m.lastTeam && m.lastTeam !== m.team ? ` (last season ${m.lastTeam})` : ''}`}> 📅</span>} <BreakoutBadge m={m} /> <HotHandTag m={m} /> <RoleChip m={m} /> <LiveStatusTag m={m} />
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <button className="team-link" onClick={() => openTeamSlide({ team: m.opponent, context: 'defense' })}>{m.opponent}</button>
                </td>
                <td><GradeBadge grade={m.grade} m={m} /></td>
                <td className="num">{fmtPct(m.p_td, 1)}</td>
                <td className="num">{fmtPct(m.p_td2, 1)}</td>
                <td className="num">{fmtPct(m.p_100, 1)}</td>
                <td className="num nowrap" title={booksText(m.book)}><BestPriceLink book={m.book} /></td>
                <td className="num"><EdgeCell m={m} /></td>
                <td className="num"><MarketCell m={m} /></td>
                <td className="num">{m.est_yards != null ? Number(m.est_yards).toFixed(0) : '—'}</td>
                <td className="num" title={m.td_last != null ? `TDs in his last 3 games played (last game: ${m.td_last})` : undefined}>{m.td_l3 ?? '—'}</td>
                <td className="num" title={m.touches_per_game != null ? `Season ${Number(m.touches_per_game).toFixed(1)} / game` : undefined}>
                  {m.l3_tpg_s != null ? Number(m.l3_tpg_s).toFixed(1) : '—'}
                  {m.form_ratio != null && m.form_ratio >= 1.2 && <span className="form-up" title={`${Number(m.form_ratio).toFixed(2)}x his season rate`}> ↑</span>}
                </td>
                <td className="num">{m.redzone_touches_per_game != null ? Number(m.redzone_touches_per_game).toFixed(2) : '—'}</td>
                <td className="num">{m.snap_pct_avg != null ? `${Math.round(m.snap_pct_avg * 100)}%` : '—'}</td>
                <td><MatchupCell m={m} /></td>
                <td className="num nowrap" title={m.dvp ? `${m.opponent} allows ${(m.dvp.rate * 100).toFixed(1)}% TD rate per touch to ${m.position}s — #${m.dvp.rank} most of ${m.dvp.of} defenses on this slate. Context only.` : undefined}>
                  {m.dvp ? <>#{m.dvp.rank}<span className="meta-line small"> of {m.dvp.of}</span></> : '—'}
                </td>
                <td className="num zone-score">{Number(m.zone_score).toFixed(1)}</td>
                <td title={H2H_NOTE}><H2HBadge h={m.h2h} /></td>
                <td title={VENUE_NOTE}><H2HBadge h={m.ha} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

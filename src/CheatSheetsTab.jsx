import { useMemo, useState } from 'react'
import { useSlate } from './slate.js'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import PickButton from './PickButton.jsx'
import { defRankText, fmtPct, GradeBadge, LiveStatusTag, SlateStatus, useLiveOutFilter } from './gradeUi.jsx'
import { DepthTag, RoleChip } from './matchupUi.jsx'
import { HotHandTag } from './revampUi.jsx'
import { booksText, edgeClass, edgeText, fmtAmerican, fmtEdge, VALUE_EDGE } from './bookOdds.js'
import { StatePicker } from './BetLink.jsx'
import { matchesPosition, usePosition } from './positionFilter.js'
import { isInSelectedMatchup, useMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import CheatSheetTab from './CheatSheetTab.jsx'

// 📋 Cheat Sheets (Slap Shot's tabs/CheatSheetsTab.jsx, 2026-10-18 revamp): this week's quick reads -- top candidates
// per prop, value vs the book, and the defenses worth attacking -- with injury / roster status. Each list is graded
// later in Track Record > Cheat Sheets (hit vs what the model expected).
const STATUS_FILTERS = [['all', 'All'], ['notOut', 'Hide OUT (live)'], ['healthy', 'No injury tag']]

function ListCard({ title, sub, items, renderRow, prop = 'td' }) {
  return (
    <div className="card cheat-list">
      <div className="cheat-list-title">{title}</div>
      <div className="meta-line small">{sub}</div>
      {items.length === 0 && <div className="meta-line small">Nobody matches these filters yet.</div>}
      {items.map((m, i) => (
        <div key={m.player_id} className="cheat-row" onClick={() => openPlayerSlide(m)}>
          <div className="cheat-row-main">
            <span className="meta-line small">{i + 1}.</span>
            <PlayerAvatar playerId={m.player_id} name={m.player_name} />
            <div style={{ minWidth: 0 }}>
              <div>
                {m.player_name} <span className="meta-line small">({m.team})</span> <GradeBadge grade={m.grade} m={m} /> <HotHandTag m={m} /> <RoleChip m={m} /> <LiveStatusTag m={m} />
                {' '}<PickButton player={m} compact prop={prop} />
              </div>
              <div className="meta-line small" style={{ margin: 0 }}>
                {m.position}<DepthTag m={m} /> vs {m.opponent}{defRankText(m) ? ` · ${defRankText(m)}` : ''}
                {m.book ? ` · ${fmtAmerican(m.book.best)} ${m.book.bestBook}` : ''}
              </div>
            </div>
          </div>
          <span className="cheat-row-stat">{renderRow(m)}</span>
        </div>
      ))}
    </div>
  )
}

function QuickReads() {
  const slate = useSlate()
  const position = usePosition()
  const { selectedMatchup } = useMatchup()
  const [statusFilter, setStatusFilter] = useState('notOut')
  const notOut = useLiveOutFilter()

  const pool = useMemo(() => {
    if (!slate?.matchups) return []
    return slate.matchups
      .filter((m) => matchesPosition(m.position, position))
      .filter((m) => !selectedMatchup || isInSelectedMatchup(selectedMatchup, m.team))
      .filter((m) => statusFilter === 'all' || (statusFilter === 'notOut' ? notOut(m) : notOut(m) && !m.week_status))
  }, [slate, position, selectedMatchup, statusFilter, notOut])

  if (!slate) return <p className="empty-state">Loading…</p>
  const top = (key, n = 5, filter = () => true) => [...pool].filter(filter).sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)).slice(0, n)
  const tdC = top('p_td')
  const td2C = top('p_td2')
  const ydsC = top('p_100')
  const hot = top('p_td', 5, (m) => m.hotHand)
  const priced = pool.filter((m) => m.edge != null)
  const bestValue = [...priced].filter((m) => m.edge >= VALUE_EDGE).sort((a, b) => b.edge - a.edge).slice(0, 5)
  const overvalued = [...priced].filter((m) => m.edge < 0).sort((a, b) => a.edge - b.edge).slice(0, 5)
  const edgeRow = (m) => (
    <span title={`${edgeText(m)}\n${booksText(m.book)}`} className="edge-stack">
      <span className={edgeClass(m.edge)}>{fmtEdge(m.edge)}</span>
      <span className="meta-line small">{fmtPct(m.p_td)} vs {m.book.bestImplied}% · {fmtAmerican(m.book.best)}</span>
    </span>
  )
  // 🔓 defenses to attack (Slap Shot's "Most Attackable Goalies"): opponents ranked by TDs allowed (the defense factor
  // inside the grade), with the best TD chance among the players facing them
  const defenses = (() => {
    const by = new Map()
    for (const m of pool) {
      if (!m.def_rank) continue
      const d = by.get(m.opponent) || { team: m.opponent, attackedBy: m.team, rank: m.def_rank, of: m.def_n, idx: m.def_td_idx, tier: m.def_tier, best: null }
      if (!d.best || (m.p_td ?? 0) > (d.best.p_td ?? 0)) d.best = m
      by.set(m.opponent, d)
    }
    return [...by.values()].sort((a, b) => a.rank - b.rank).slice(0, 8)
  })()
  const priceCount = priced.length

  return (
    <div>
      <SlateStatus data={slate} />
      <div className="note">
        ℹ️ Lists use the grade model's chances (TD %, 2+ TD %, 100+ yds %). 🔥 = scored in his last 3 games and not a top-25%
        TD chance (beat the model 1.3x over 2023-25). ▲ / ▼ = facing a soft / tough TD defense this week. Book prices: best
        anytime TD price, pulled once a week (Thursday for TNF, Saturday for Sunday / Monday)
        {priceCount ? ` — ${priceCount} players priced so far.` : ' — none priced yet this week.'}
      </div>
      <div className="pill-row">
        {STATUS_FILTERS.map(([k, label]) => (
          <button key={k} className={`pill-btn ${statusFilter === k ? 'active' : ''}`} onClick={() => setStatusFilter(k)}>{label}</button>
        ))}
        <StatePicker />
      </div>
      <MatchupFilterNote />
      <div className="grid-cards">
        <ListCard title="🏈 TD Candidates" sub="Top 5 by chance to score a TD" items={tdC} renderRow={(m) => fmtPct(m.p_td, 1)} />
        <ListCard title="🏈🏈 2+ TD Candidates" sub="Top 5 by chance of 2+ TDs" items={td2C} prop="td2" renderRow={(m) => fmtPct(m.p_td2, 1)} />
        <ListCard title="💨 100+ Yard Candidates" sub="Top 5 by chance of 100+ scrimmage yards" items={ydsC} prop="yds100" renderRow={(m) => fmtPct(m.p_100, 1)} />
        <ListCard title="🔥 Hot Hands" sub="Scored in the last 3 games, outside the week's top 25% — the group that beat the model" items={hot} renderRow={(m) => fmtPct(m.p_td, 1)} />
        {priced.length > 0 && (
          <>
            <ListCard title="💰 Best Value vs Book" sub="Anytime TD: our chance most above the best sportsbook price" items={bestValue} renderRow={edgeRow} />
            <ListCard title="📉 Overvalued by Books" sub="Priced shorter than our chance supports — the popular names to fade" items={overvalued} renderRow={edgeRow} />
          </>
        )}
        <div className="card cheat-list">
          <div className="cheat-list-title">🔓 Most Attackable Defenses This Week</div>
          <div className="meta-line small">Ranked by TDs allowed (shrunk toward last season) — the defense factor inside every grade</div>
          {defenses.map((d) => (
            <div key={d.team} className="cheat-row" onClick={() => openTeamSlide({ team: d.team, context: 'defense' })}>
              <div className="cheat-row-main">
                <span className="meta-line small">#{d.rank}</span>
                <div>
                  <div>{d.team} defense {d.tier === 'soft' ? '▲' : ''} <span className="meta-line small">· target {d.attackedBy}</span></div>
                  <div className="meta-line small" style={{ margin: 0 }}>
                    allows {d.idx != null ? `${Math.round((d.idx - 1) * 100) >= 0 ? '+' : ''}${Math.round((d.idx - 1) * 100)}% TDs vs average` : '—'}
                    {d.best ? ` · best look: ${d.best.player_name} ${fmtPct(d.best.p_td)}` : ''}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function CheatSheetsTab() {
  const [view, setView] = useState('main')
  return (
    <div>
      <div className="section-head">
        <h2>📋 Cheat Sheets</h2>
        <p className="meta-line">This week's quick reads — top candidates, value vs the book and the defenses worth attacking, with injury status</p>
      </div>
      <div className="pill-row hub-row">
        <button className={`pill-btn ${view === 'main' ? 'active' : ''}`} onClick={() => setView('main')}>📋 Quick reads</button>
        <button className={`pill-btn ${view === 'classic' ? 'active' : ''}`} onClick={() => setView('classic')}>📚 Lab lists</button>
      </div>
      {view === 'main' ? <QuickReads /> : <CheatSheetTab />}
    </div>
  )
}

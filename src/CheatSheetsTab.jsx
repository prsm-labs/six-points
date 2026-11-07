import { useEffect, useMemo, useState } from 'react'
import ViewPicker from './ViewPicker.jsx'
import { useSlate } from './slate.js'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import PickButton from './PickButton.jsx'
import { defRankText, fmtPct, GradeBadge, LiveStatusTag, rankWhere, SlateStatus, useLiveOutFilter, YDS_NOTE, ydsRankText, ydsRankTitle } from './gradeUi.jsx'
import { ydsDefRanks, YDS_POSITIONS } from './slateCore.js'
import { DepthTag, RoleChip } from './matchupUi.jsx'
import { HotHandTag } from './revampUi.jsx'
import { booksText, edgeClass, edgeText, fmtAmerican, fmtEdge, VALUE_EDGE } from './bookOdds.js'
import { StatePicker } from './BetLink.jsx'
import { matchesPosition, usePosition } from './positionFilter.js'
import { isInSelectedMatchup, useMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import CheatSheetTab from './CheatSheetTab.jsx'
import PrismPicks from './PrismPicks.jsx'
import { useMasterSearch } from './masterFilter.js'
import { useRadar } from './RadarLab.jsx'
import { useLongshot } from './LongshotLab.jsx'
import { matchesSearch } from './teamSearch.js'
import ShortList from './ShortList.jsx'

// 📋 Cheat Sheets (Slap Shot's tabs/CheatSheetsTab.jsx, 2026-10-18 revamp): this week's quick reads -- top candidates
// per prop, ours vs the book (context), and the defenses worth attacking -- with injury / roster status. Each list is graded
// later in Track Record > Cheat Sheets (hit vs what the model expected).
const STATUS_FILTERS = [['all', 'All'], ['notOut', 'Hide OUT (live)'], ['healthy', 'No injury tag']]

// defense tag per list: TD lists show the TD-defense rank, yardage lists the yards-vs-position rank (2026-10-19)
const DEF_TAGS = {
  td: (m) => [defRankText(m), undefined],
  yds: (m) => [ydsRankText(m), ydsRankTitle(m)],
}
// 2026-11-03 Soft D / Tough D badge (user: soft / tough matchup badges on the prop cheat sheets): the card's own defense tier
// (TD lists: TD defense thirds; yardage lists: yards allowed to his position). Context only -- the chance already counts it.
const DEF_TIER = { td: (m) => m.def_tier, yds: (m) => m.yds_tier }
function DefBadge({ tier, title }) {
  if (tier !== 'soft' && tier !== 'tough') return null
  return <span className={`def-badge ${tier}`} title={title}>{tier === 'soft' ? 'Soft D' : 'Tough D'}</span>
}

// 2026-10-23 past week (📅 week picker): his real line that week and ✅ / ✗ for the card's bet (TD lists: scored; yards: 100+).
function ActualMark({ m, prop }) {
  const a = m.actual
  if (!a) return null
  const ok = prop === 'bounce' ? (a.yds != null ? a.yds > m._bline : null) : prop === 'yds100' ? (a.yds != null ? a.yds >= 100 : null) : a.tds == null ? null : prop === 'td2' ? a.tds >= 2 : a.tds >= 1
  return (
    <span className="actual-line">
      {a.tds ?? 0} TD · {a.yds ?? 0} yds{ok != null && <span className={`hit-mark ${ok ? 'hit' : 'miss'}`}>{ok ? ' ✅' : ' ✗'}</span>}
    </span>
  )
}

function ListCard({ title, sub, items, renderRow, prop = 'td', defTag = 'td' }) {
  return (
    <div className="card cheat-list">
      <div className="cheat-list-title">{title}</div>
      <div className="meta-line small">{sub}</div>
      {items.length === 0 && <div className="meta-line small">Nobody matches these filters yet.</div>}
      {items.map((m, i) => {
        const [defText, defTitle] = DEF_TAGS[defTag](m)
        return (
        <div key={m.player_id} className="cheat-row" onClick={() => openPlayerSlide(m)}>
          <div className="cheat-row-main">
            <span className="meta-line small">{i + 1}.</span>
            <PlayerAvatar playerId={m.player_id} name={m.player_name} />
            <div style={{ minWidth: 0 }}>
              <div>
                {m.player_name} <span className="meta-line small">({m.team})</span> <GradeBadge grade={m.grade} m={m} /> <HotHandTag m={m} /> <RoleChip m={m} /> <LiveStatusTag m={m} />
                {' '}<PickButton player={m} compact prop={prop} />
                {' '}<DefBadge tier={DEF_TIER[defTag](m)} title={`${defText || ''}. Context — the chance already counts the defense`} />
              </div>
              <div className="meta-line small" style={{ margin: 0 }}>
                {m.position}<DepthTag m={m} /> vs {m.opponent}{defText && <span title={defTitle}>{` · ${defText}`}</span>}
                {m.book ? ` · ${fmtAmerican(m.book.best)} ${m.book.bestBook}` : ''}
              </div>
            </div>
          </div>
          <span className="cheat-row-stat">{renderRow(m)}<ActualMark m={m} prop={prop} /></span>
        </div>
        )
      })}
    </div>
  )
}

function QuickReads() {
  const slate = useSlate()
  const position = usePosition()
  const { selectedMatchup } = useMatchup()
  const search = useMasterSearch()
  const [statusFilter, setStatusFilter] = useState('notOut')
  const notOut = useLiveOutFilter()
  // 2026-10-27 📈 Bounce-backs (build_bounce.py): this week's top 5 by gap, players in the filtered pool only
  const [bounce, setBounce] = useState(null)
  useEffect(() => { fetch('/data/bounce.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then(setBounce).catch(() => setBounce(null)) }, [slate?.week])
  const radar = useRadar(slate?.week)  // 2026-11-02 🔦 Under the radar (build_radar.py)
  const longshot = useLongshot(slate?.week)  // 2026-11-07 🎯 Long-shot creators (build_longshot.py)
  // 2026-11-05 ⚡ This week's short list: PRISM Pick, mid-range, under the radar, bounce-back, long shot (the top of each tested list)
  const [pp, setPp] = useState(null)
  useEffect(() => { fetch('/data/prism_picks.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then(setPp).catch(() => setPp(null)) }, [slate?.week])

  const pool = useMemo(() => {
    if (!slate?.matchups) return []
    return slate.matchups
      .filter((m) => matchesPosition(m.position, position))
      .filter((m) => !selectedMatchup || isInSelectedMatchup(selectedMatchup, m.team))
      .filter((m) => matchesSearch(search, [m.player_name], [m.team, m.opponent])) // 2026-10-23: header search
      .filter((m) => statusFilter === 'all' || (statusFilter === 'notOut' ? notOut(m) : notOut(m) && !m.week_status))
  }, [slate, position, selectedMatchup, statusFilter, notOut])

  if (!slate) return <p className="empty-state">Loading…</p>
  const top = (key, n = 5, filter = () => true) => [...pool].filter(filter).sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)).slice(0, n)
  const tdC = top('p_td')
  const td2C = top('p_td2')
  const ydsC = top('p_100')
  const hot = top('p_td', 5, (m) => m.hotHand)
  const poolById = new Map(pool.map((m) => [m.player_id, m]))
  const bounceTop = (bounce?.weeks?.find((w) => w.week === slate.week)?.picks || []).filter((f) => poolById.has(f.player_id)).slice(0, 5)
    .map((f) => ({ ...poolById.get(f.player_id), _bline: f.line, _best: f.est, _btrack: f.track }))
  const radarTop = (radar?.weeks?.find((w) => w.week === slate.week)?.picks || []).filter((f) => poolById.has(f.player_id)).slice(0, 5)
    .map((f) => ({ ...poolById.get(f.player_id), _rchance: f.chance, _rhits: f.hits, _rn: f.n }))
  const longTop = (longshot?.weeks?.find((w) => w.week === slate.week)?.picks || []).filter((f) => poolById.has(f.player_id)).slice(0, 5)
    .map((f) => ({ ...poolById.get(f.player_id), _lchance: f.chance, _lrz: f.rz3, _lrank: f.rank, _lof: f.of }))
  const pc = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
  const vs = (m) => `${m.position} · ${m.team} vs ${m.opponent}`
  const ppw = pp?.weeks?.find((w) => w.week === slate.week)
  const ppItem = (arr, tag, cls) => (arr || []).filter((x) => poolById.has(x.player_id)).slice(0, 5).map((c) => {
    const m = poolById.get(c.player_id)
    return { key: `${cls}-${c.player_id}`, tag, tagCls: cls, name: c.name, team: vs(m), line: c.label, big: pc(c.track), bigSub: 'track record',
      why: `Est. ${c.est} yds · ${c.stat && c.stat !== 'YDS' ? 'scored' : 'cleared'} it in ${c.last[1]} of his last ${c.last[0]}`, result: c.result,
      onOpen: () => openPlayerSlide(m), action: <PickButton player={m} compact prop={c.label} /> }
  })
  const shortItems = [
    ppItem(ppw?.picks, '💎 PRISM Pick', 'safe'),
    ppItem(ppw?.tiers?.mid, '⚖️ Mid-range', 'mid'),
    radarTop.map((r0) => ({ key: `radar-${r0.player_id}`, tag: '🔦 Under the radar', tagCls: 'radar', name: r0.player_name, team: vs(r0), line: 'Anytime TD',
      big: pc(r0._rchance), bigSub: `his ${pc(r0._rhits / Math.max(1, r0._rn))}`, why: `scored in ${r0._rhits} of his last ${r0._rn}`,
      onOpen: () => openPlayerSlide(r0), action: <PickButton player={r0} compact prop="td" /> })),
    bounceTop.map((b0) => ({ key: `bounce-${b0.player_id}`, tag: '📈 Bounce-back', tagCls: 'edge', name: b0.player_name, team: vs(b0), line: `Over ${b0._bline} yds`,
      big: pc(b0._btrack), bigSub: 'track record', why: `Est. ${b0._best} yds — projected well above his last 3`,
      onOpen: () => openPlayerSlide(b0), action: <PickButton player={b0} compact prop="yds100" /> })),
    ppItem(ppw?.tiers?.long, '🌠 Long shot', 'long'),
  ]
  const priced = pool.filter((m) => m.edge != null)
  const bestValue = [...priced].filter((m) => m.edge >= VALUE_EDGE).sort((a, b) => b.edge - a.edge).slice(0, 5)
  const overvalued = [...priced].filter((m) => m.edge < 0).sort((a, b) => a.edge - b.edge).slice(0, 5)
  const edgeRow = (m) => (
    <span title={`${edgeText(m)}\n${booksText(m.book)}`} className="edge-stack">
      <span className={edgeClass(m.edge)}>mkt {m.market}%</span>
      <span className="meta-line small">{fmtPct(m.p_td)} vs {m.book.bestImplied}% ({fmtEdge(m.edge)}) · {fmtAmerican(m.book.best)}</span>
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
      <ShortList items={shortItems} past={slate.week !== pp?.week && pp != null} sub="The top look from each tested list below — one player each. Tap a name for his card." />
      <PrismPicks slate={slate} notOut={notOut} />
      <div className="note">
        ℹ️ Lists use the grade model's chances (TD %, 2+ TD %, 100+ yds %). 🔥 = scored in his last 3 games and not a top-25%
        TD chance (beat the model 1.3x over 2023-25). ▲ / ▼ = facing a soft / tough TD defense this week. Book prices: best
        anytime TD price, pulled once a week (Thursday for TNF, Saturday for Sunday / Monday)
        {priceCount ? ` — ${priceCount} players priced so far.` : ' — none priced yet this week.'}
      </div>
      {/* 2026-11-05 (user: single-choice button rows -> dropdowns; buttons only where several can be picked) */}
      <div className="vp-row">
        <ViewPicker select compact label="Injuries" options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
        <StatePicker />
      </div>
      <MatchupFilterNote />
      <div className="grid-cards">
        <ListCard title="🏈 TD Candidates" sub="Top 5 by chance to score a TD" items={tdC} renderRow={(m) => fmtPct(m.p_td, 1)} />
        <ListCard title="🔦 Under the radar" sub={`Scored in 2 or fewer of his last 8, 20%+ TD chance this week — ranked by how far this week beats his usual. Backtest: ${radar?.backtest ? Math.round((radar.backtest.hits / radar.backtest.n) * 100) : 33}% scored vs their own ${radar?.backtest ? Math.round(radar.backtest.own * 100) : 11}% · Scouting → Under the radar`} items={radarTop}
          renderRow={(m) => <span className="edge-stack"><b>{fmtPct(m._rchance, 0)}</b><span className="meta-line small">scored {m._rhits} of last {m._rn}</span></span>} />
        <ListCard title="🎯 Long-shot creators" sub={`12-30% TD chance, ranked by red-zone touches a game over the last 3 weeks vs his position. Backtest: ${longshot?.backtest ? Math.round((longshot.backtest.hits / longshot.backtest.n) * 100) : 28}% scored (said ${longshot?.backtest ? Math.round(longshot.backtest.said * 100) : 25}%) · Scouting → Long-shot creators`} items={longTop}
          renderRow={(m) => <span className="edge-stack"><b>{fmtPct(m._lchance, 0)}</b><span className="meta-line small">{m._lrz.toFixed(1)} RZ/g · #{m._lrank} of {m._lof}</span></span>} />
        <ListCard title="🏈🏈 2+ TD Candidates" sub="Top 5 by chance of 2+ TDs" items={td2C} prop="td2" renderRow={(m) => fmtPct(m.p_td2, 1)} />
        <ListCard title="💨 100+ Yard Candidates" sub="Top 5 by chance of 100+ scrimmage yards · defense tag = yards allowed to his position" items={ydsC} prop="yds100" defTag="yds" renderRow={(m) => fmtPct(m.p_100, 1)} />
        <ListCard title="📈 Bounce-backs" sub={`Est. Yards well above his last 3 games: ${bounce?.backtest ? Math.round((bounce.backtest.hits / bounce.backtest.n) * 100) : 70}% of past bounce-backs finished above that average (back to his level, not past it)`} items={bounceTop} prop="bounce" defTag="yds"
          renderRow={(m) => <span className="edge-stack"><b>{fmtPct(m._btrack, 0)}</b><span className="meta-line small">over {m._bline.toFixed(0)} yds · est {m._best.toFixed(0)}</span></span>} />
        <ListCard title="🔥 Hot Hands" sub="Scored in the last 3 games, outside the week's top 25% — the group that beat the model" items={hot} renderRow={(m) => fmtPct(m.p_td, 1)} />
        {priced.length > 0 && (
          <>
            <ListCard title="📖 We Rate Higher Than the Book" sub="Anytime TD, our chance most above the best price. Context, not value: in week 7 this group scored at the book's number (we said 24.5%, book 17.2%, 17.0% scored). mkt = market check" items={bestValue} renderRow={edgeRow} />
            <ListCard title="📖 Book Rates Higher Than Us" sub="Priced shorter than our chance. Not a fade: in week 7 these scored nearer the book's number (we said 14.8%, book 20.3%, 18.7% scored). mkt = market check" items={overvalued} renderRow={edgeRow} />
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
      <DefenseRankTable />
    </div>
  )
}

// 🧱 Defense rankings by category (2026-10-19, user: "wouldn't there be different levels of rankings per team / category?"):
// every defense on this week's slate, ranked among this week's defenses vs TDs (team level, the factor in the grade) and
// vs RB / WR / TE yards (mu_yds_idx). Ranked over the whole slate; the matchup filter only narrows which rows show.
const RANK_COLS = [['td', 'vs TDs'], ...YDS_POSITIONS.map((p) => [p, `vs ${p} yds`])]
function DefenseRankTable() {
  const slate = useSlate()
  const { selectedMatchup } = useMatchup()
  const [sortBy, setSortBy] = useState('td')
  const [sortDir, setSortDir] = useState(1) // 1 = softest first, -1 = toughest first; tap the same column again to flip
  const sortOn = (k) => {
    if (k === sortBy) setSortDir((d) => -d)
    else { setSortBy(k); setSortDir(1) }
  }
  const rows = useMemo(() => {
    const all = slate?.matchups || []
    const yds = ydsDefRanks(all)
    const by = new Map()
    for (const m of all) {
      if (!m.opponent || by.has(m.opponent)) continue
      const r = { team: m.opponent, vs: m.team, td: m.def_rank ? { rank: m.def_rank, n: m.def_n, idx: m.def_td_idx, tier: m.def_tier } : null }
      for (const p of YDS_POSITIONS) r[p] = yds.get(`${m.opponent}|${p}`) || null
      by.set(m.opponent, r)
    }
    return [...by.values()].filter((r) => !selectedMatchup || isInSelectedMatchup(selectedMatchup, r.vs))
  }, [slate, selectedMatchup])
  if (!rows.length) return null
  const sorted = [...rows].sort((a, b) => {
    const ra = a[sortBy]?.rank, rb = b[sortBy]?.rank
    if (ra == null || rb == null) return (ra == null) - (rb == null) // missing ranks last either way
    return sortDir * (ra - rb)
  })
  const cell = (c, key) => {
    if (!c) return <td key={key} className="meta-line small">—</td>
    const d = c.idx != null ? Math.round((c.idx - 1) * 100) : null
    return (
      <td key={key} title={`#${c.rank} softest of ${c.n} this week${d != null ? ` · allows ${d >= 0 ? '+' : ''}${d}% vs league average` : ''}`}>
        <span className={`mu-chip mu-${c.tier === 'soft' ? 'soft' : c.tier === 'tough' ? 'tough' : 'neutral'}`}>{rankWhere(c.rank, c.n)}</span>
        {d != null && <span className="meta-line small"> {d >= 0 ? '+' : ''}{d}%</span>}
      </td>
    )
  }
  return (
    <div className="card cheat-list" style={{ marginTop: 12 }}>
      <div className="cheat-list-title">🧱 Defense Rankings by Category</div>
      <div className="meta-line small">
        Every defense this week, ranked among this week's defenses. A defense can be
        soft in one place and tough in another — use the TD column for TD picks and the yards columns for yardage picks.
        TDs = team TDs allowed (the defense factor in every grade). {YDS_NOTE} Tap a column to sort softest first (↓), tap it again for toughest first (↑).
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="sticky-col">Defense</th>
              {RANK_COLS.map(([k, label]) => (
                <th key={k} onClick={() => sortOn(k)} style={{ cursor: 'pointer' }} title="Tap to sort, tap again to flip"
                  aria-sort={sortBy === k ? (sortDir === 1 ? 'ascending' : 'descending') : 'none'}>
                  {label}{sortBy === k ? (sortDir === 1 ? ' ↓' : ' ↑') : ''}{k === 'WR' ? ' *' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.team}>
                <td className="sticky-col">
                  <button className="team-link" onClick={() => openTeamSlide({ team: r.team, context: 'defense' })}>{r.team}</button>
                  <span className="meta-line small"> vs {r.vs}</span>
                </td>
                {RANK_COLS.map(([k]) => cell(r[k], k))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="meta-line small">* WR yards: context only, not in Est. Yards. No QB rush / pass-yards ranking yet — Six Points doesn't project QB yards.</div>
    </div>
  )
}

export default function CheatSheetsTab() {
  const [view, setView] = useState('main')
  return (
    <div>
      <div className="section-head">
        <h2>📋 Cheat Sheets</h2>
        <p className="meta-line">This week's quick reads — top candidates, ours vs the book and the defenses worth attacking, with injury status</p>
      </div>
      <div className="pill-row hub-row">
        <button className={`pill-btn ${view === 'main' ? 'active' : ''}`} onClick={() => setView('main')}>📋 Quick reads</button>
        <button className={`pill-btn ${view === 'classic' ? 'active' : ''}`} onClick={() => setView('classic')}>📚 Lab lists</button>
      </div>
      {view === 'main' ? <QuickReads /> : <CheatSheetTab />}
    </div>
  )
}

import { Fragment, useEffect, useMemo, useState } from 'react'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { isInSelectedMatchup, useMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import { setPosition, usePosition } from './positionFilter.js'
import { useMasterSearch, useMasterTeam } from './masterFilter.js'

// 📊 Stats (2026-10-20, user: "a 'stats' or 'splits' page that shows a player and teams stats throughout the year.
// Filterable and searchable by team and/or player"). Every player's and team's regular-season line from play-by-play
// (build_stats.py -> stats_book.json, weekly with the engine): totals or per game, for the season, last 3 / 5 games, or
// home / away. Tap a row for the game-by-game log. Context only -- nothing on this page is in a grade.
//
// Man / zone / blitz and offense-type (play action, shotgun, heavy personnel) matchups were backtested 2023-25 on top of
// the model the same day: nothing held up, so they're not in projections; last season's man / zone / blitz line (the
// old Scheme Fit data, scheme_splits.json) shows in a player's game log as context.

const WINDOWS = [['season', 'Season'], ['l3', 'Last 3'], ['l5', 'Last 5'], ['home', 'Home'], ['away', 'Away']]
const POS = ['all', 'QB', 'RB', 'WR', 'TE']

// player columns: [key, label, tooltip, decimals, kind] kind: sum (total or per game), rate (computed), max, avg
const P = {
  g: ['G', 'Games played', 0, 'count'],
  snap: ['Snap %', 'Average share of offensive snaps', 0, 'avg'],
  cmp: ['Cmp', 'Completions', 0, 'sum'],
  att: ['Att', 'Pass attempts (sacks not counted)', 0, 'sum'],
  cpct: ['Cmp %', 'Completion %', 1, 'rate'],
  pyds: ['Pass yds', 'Passing yards', 0, 'sum'],
  ypa: ['Y/A', 'Passing yards per attempt', 1, 'rate'],
  ptd: ['Pass TD', 'Passing TDs', 0, 'sum'],
  int: ['INT', 'Interceptions', 0, 'sum'],
  sk: ['Sk', 'Times sacked', 0, 'sum'],
  car: ['Car', 'Carries', 0, 'sum'],
  ryds: ['Rush yds', 'Rushing yards', 0, 'sum'],
  ypc: ['YPC', 'Yards per carry', 1, 'rate'],
  rtd: ['Rush TD', 'Rushing TDs', 0, 'sum'],
  rlng: ['Long', 'Longest run', 0, 'max'],
  tgt: ['Tgt', 'Targets', 0, 'sum'],
  rec: ['Rec', 'Receptions', 0, 'sum'],
  recyds: ['Rec yds', 'Receiving yards', 0, 'sum'],
  ypr: ['Y/Rec', 'Yards per reception', 1, 'rate'],
  rectd: ['Rec TD', 'Receiving TDs', 0, 'sum'],
  reclng: ['Long', 'Longest catch', 0, 'max'],
  air: ['Air yds', 'Air yards on his targets (how far downfield the ball was thrown)', 0, 'sum'],
  rz: ['RZ', 'Red-zone touches: carries + targets inside the 20', 0, 'sum'],
  x20: ['20+', 'Plays of 20+ yards (runs + catches)', 0, 'sum'],
  fl: ['FL', 'Fumbles lost', 0, 'sum'],
  scrim: ['Scrim yds', 'Rushing + receiving yards', 0, 'sum'],
  td: ['TD', 'Rushing + receiving TDs', 0, 'sum'],
  epa: ['EPA', 'Expected points added on his plays (passes, runs, targets)', 1, 'sum'],
}
const PCOLS = {
  all: ['g', 'snap', 'pyds', 'car', 'ryds', 'tgt', 'rec', 'recyds', 'scrim', 'rz', 'x20', 'td'],
  QB: ['g', 'cmp', 'att', 'cpct', 'pyds', 'ypa', 'ptd', 'int', 'sk', 'car', 'ryds', 'rtd', 'epa'],
  RB: ['g', 'snap', 'car', 'ryds', 'ypc', 'rtd', 'rlng', 'tgt', 'rec', 'recyds', 'rectd', 'scrim', 'rz', 'x20', 'td', 'fl'],
  WR: ['g', 'snap', 'tgt', 'rec', 'recyds', 'ypr', 'rectd', 'reclng', 'air', 'rz', 'x20', 'car', 'ryds', 'td'],
  TE: ['g', 'snap', 'tgt', 'rec', 'recyds', 'ypr', 'rectd', 'reclng', 'air', 'rz', 'x20', 'td'],
}
// game-log bar stat + the sort used when the chosen column isn't in this position's set
const BAR = { QB: 'pyds', RB: 'scrim', WR: 'recyds', TE: 'recyds' }
const DEFAULT_SORT = { all: 'scrim', QB: 'pyds', RB: 'scrim', WR: 'recyds', TE: 'recyds' }

// team columns (index into the stat book's team line)
const T = {
  g: ['G', 'Games', 0], wl: ['W-L', 'Record in these games', 0],
  pts: ['Pts', 'Points', 1], plays: ['Plays', 'Offensive snaps (kneels / spikes not counted)', 1], yds: ['Yds', 'Total yards', 1],
  pyds: ['Pass', 'Passing yards (net of sacks)', 1], ryds: ['Rush', 'Rushing yards', 1], tds: ['TDs', 'Passing + rushing TDs', 1],
  to: ['TO', 'Turnovers (INT + fumbles lost)', 1], sk: ['Sk', 'Sacks', 1], epa: ['EPA/play', 'Expected points added per snap', 3],
  sr: ['Success', 'Success rate (plays that keep the offense on schedule)', 1], x20: ['20+', 'Plays of 20+ yards', 1],
  rzt: ['RZ trips', 'Drives with a snap inside the 20', 1], rztdp: ['RZ TD %', 'Red-zone trips that ended in a TD', 0],
  c3p: ['3rd %', 'Third downs converted', 0],
}
const TCOLS = ['g', 'wl', 'pts', 'plays', 'yds', 'pyds', 'ryds', 'tds', 'to', 'sk', 'epa', 'sr', 'x20', 'rzt', 'rztdp', 'c3p']

const inWindow = (games, w) => {
  if (w === 'home') return games.filter((g) => g.ha === 'vs')
  if (w === 'away') return games.filter((g) => g.ha === '@')
  if (w === 'l3') return games.slice(-3)
  if (w === 'l5') return games.slice(-5)
  return games
}

function playerLine(games, perGame) {
  const n = games.length
  const s = {}
  for (const k of Object.keys(P)) s[k] = 0
  let snapN = 0
  for (const g of games) {
    for (const k of Object.keys(P)) if (P[k][3] === 'sum') s[k] += g[k] || 0
    s.rlng = Math.max(s.rlng, g.rlng || 0)
    s.reclng = Math.max(s.reclng, g.reclng || 0)
    if (g.snap != null) { s.snap += g.snap; snapN += 1 }
  }
  const out = { ...s, g: n, snap: snapN ? s.snap / snapN : null }
  out.cpct = s.att ? (100 * s.cmp) / s.att : null
  out.ypa = s.att ? s.pyds / s.att : null
  out.ypc = s.car ? s.ryds / s.car : null
  out.ypr = s.rec ? s.recyds / s.rec : null
  if (perGame && n) for (const k of Object.keys(P)) if (P[k][3] === 'sum') out[k] = s[k] / n
  return out
}

function teamLine(games, side, perGame, cols) {
  const n = games.length
  const s = {}
  for (const c of cols) s[c] = 0
  let w = 0, l = 0, t = 0, epaPlays = 0, srPlays = 0
  for (const g of games) {
    const line = g[side]
    if (!line) continue
    cols.forEach((c, i) => {
      if (c === 'epa') epaPlays += (line[i] || 0) * (line[cols.indexOf('plays')] || 0)
      else if (c === 'sr') srPlays += (line[i] || 0) * (line[cols.indexOf('plays')] || 0)
      else s[c] += line[i] || 0
    })
    if (g.pf > g.pa) w += 1
    else if (g.pf < g.pa) l += 1
    else t += 1
  }
  const div = perGame && n ? n : 1
  const out = { g: n, wl: `${w}-${l}${t ? `-${t}` : ''}`, _w: w }
  for (const c of ['pts', 'plays', 'yds', 'pyds', 'ryds', 'tds', 'to', 'sk', 'x20', 'rzt']) out[c] = s[c] / div
  out.epa = s.plays ? epaPlays / s.plays : null
  out.sr = s.plays ? (100 * srPlays) / s.plays : null
  out.rztdp = s.rzt ? (100 * s.rztd) / s.rzt : null
  out.c3p = s.a3 ? (100 * s.c3) / s.a3 : null
  return out
}

const fmt = (v, dec) => (v == null || Number.isNaN(v) ? '—' : dec ? Number(v).toFixed(dec) : Math.round(v).toString())
const fmtEpa = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(3)}`)

function downloadCsv(name, header, rows) {
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  const text = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

function useSortState(initial) {
  const [key, setKey] = useState(initial)
  const [dir, setDir] = useState(-1) // -1 = high first; tap the same column again to flip
  const on = (k) => {
    if (k === key) setDir((d) => -d)
    else { setKey(k); setDir(-1) }
  }
  return { key, dir, on }
}

function Th({ k, label, title, s }) {
  return (
    <th title={`${title} — tap to sort, tap again to flip`} onClick={() => s.on(k)} style={{ cursor: 'pointer' }}
      aria-sort={s.key === k ? (s.dir === -1 ? 'descending' : 'ascending') : 'none'}>
      {label}{s.key === k ? (s.dir === -1 ? ' ↓' : ' ↑') : ''}
    </th>
  )
}

function Bars({ games, stat, label }) {
  const max = Math.max(1, ...games.map((g) => g[stat] || 0))
  return (
    <div className="stats-bars" aria-label={`${label} by game`}>
      {games.map((g) => (
        <div key={g.w} className="stats-bar" title={`Wk ${g.w} ${g.ha} ${g.opp}: ${fmt(g[stat])} ${label}`}>
          <span className="v">{fmt(g[stat])}</span>
          <span className="b" style={{ height: `${Math.max(2, (100 * (g[stat] || 0)) / max)}%` }} />
          <span className="x">{g.opp}</span>
        </div>
      ))}
    </div>
  )
}

function SchemeLine({ sp }) {
  if (!sp) return null
  const part = (k, label) => sp[k] ? `${label} ${sp[k].ypt?.toFixed(1)} yds/play, TD ${(sp[k].td_rate * 100).toFixed(1)}% (${sp[k].plays})` : null
  const bits = [part('man', 'vs man'), part('zone', 'vs zone'), part('blitz', 'vs blitz'), part('no_blitz', 'no blitz')].filter(Boolean)
  if (!bits.length) return null
  return (
    <p className="meta-line small">
      Last season by coverage (context — tested 2023-25, didn&apos;t improve projections): {bits.join(' · ')}
    </p>
  )
}

function PlayerLog({ p, cols, scheme }) {
  const bar = BAR[p.pos] || 'scrim'
  return (
    <div className="stats-log">
      <div className="stats-log-head">
        <strong>{p.n}</strong> <span className="meta-line small">{p.pos} · {p.t} · game log</span>
        <button className="pill-btn" onClick={() => openPlayerSlide({ player_id: p.id, player_name: p.n, team: p.t, position: p.pos })}>Player card</button>
      </div>
      <Bars games={p.games} stat={bar} label={P[bar][0]} />
      <SchemeLine sp={scheme} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Wk</th><th>Opp</th><th>Result</th>{cols.filter((c) => c !== 'g').map((c) => <th key={c} title={P[c][1]}>{P[c][0]}</th>)}</tr>
          </thead>
          <tbody>
            {[...p.games].reverse().map((g) => {
              const line = playerLine([g], false)
              return (
                <tr key={g.w}>
                  <td>{g.w}</td>
                  <td>{g.ha} {g.opp}{g.team !== p.t ? <span className="meta-line small"> ({g.team})</span> : null}</td>
                  <td>{g.pf > g.pa ? 'W' : g.pf < g.pa ? 'L' : 'T'} {g.pf}-{g.pa}</td>
                  {cols.filter((c) => c !== 'g').map((c) => <td key={c}>{fmt(line[c], P[c][2])}</td>)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TeamLog({ team, games, cols, side }) {
  return (
    <div className="stats-log">
      <div className="stats-log-head">
        <strong>{team}</strong> <span className="meta-line small">{side === 'o' ? 'offense' : 'allowed'} · game log</span>
        <button className="pill-btn" onClick={() => openTeamSlide({ team, context: side === 'x' ? 'defense' : undefined })}>Team card</button>
      </div>
      <Bars games={games.map((g) => ({ ...g, pts: g[side]?.[0] }))} stat="pts" label="points" />
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Wk</th><th>Opp</th><th>Result</th>{TCOLS.filter((c) => c !== 'g' && c !== 'wl').map((c) => <th key={c} title={T[c][1]}>{T[c][0]}</th>)}</tr>
          </thead>
          <tbody>
            {[...games].reverse().map((g) => {
              const line = teamLine([g], side, false, cols)
              return (
                <tr key={g.w}>
                  <td>{g.w}</td>
                  <td>{g.ha} {g.opp}</td>
                  <td>{g.pf > g.pa ? 'W' : g.pf < g.pa ? 'L' : 'T'} {g.pf}-{g.pa}</td>
                  {TCOLS.filter((c) => c !== 'g' && c !== 'wl').map((c) => <td key={c}>{c === 'epa' ? fmtEpa(line[c]) : fmt(line[c], T[c][2])}</td>)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function StatsTab() {
  const [book, setBook] = useState(null)
  const [scheme, setScheme] = useState(null)
  const [error, setError] = useState(null)
  const [view, setView] = useState('players')
  const [win, setWin] = useState('season')
  const [perGame, setPerGame] = useState(false)
  // 2026-10-23: team + search come from the header (MasterFilter); this page's own boxes were retired
  const team = useMasterTeam() || 'all'
  const query = useMasterSearch()
  const [minG, setMinG] = useState(1)
  const [side, setSide] = useState('o')
  const [open, setOpen] = useState(null)
  const position = usePosition()
  const pos = POS.includes(position) ? position : 'all'
  const { selectedMatchup } = useMatchup()
  const ps = useSortState('scrim')
  const ts = useSortState('pts')

  useEffect(() => {
    fetch('/data/stats_book.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setBook)
      .catch((e) => setError(e.message))
    fetch('/data/scheme_splits.json').then((r) => (r.ok ? r.json() : null)).then((d) => setScheme(d?.splits || null)).catch(() => {})
  }, [])

  const players = useMemo(() => {
    if (!book) return []
    const C = book.game_cols
    return Object.entries(book.players).map(([id, v]) => ({
      id, n: v.n, pos: v.pos, t: v.t,
      games: v.g.map((row) => Object.fromEntries(C.map((c, i) => [c, row[i]]))),
    }))
  }, [book])
  const teams = useMemo(() => (book ? Object.keys(book.teams).sort() : []), [book])

  if (error) return <p className="empty-state">No stats yet ({error}).</p>
  if (!book) return <p className="empty-state">Loading…</p>

  const q = query.trim().toLowerCase()
  const teamOk = (t) => (selectedMatchup ? isInSelectedMatchup(selectedMatchup, t) : team === 'all' || t === team)
  const winLabel = Object.fromEntries(WINDOWS)[win]

  let body
  if (view === 'players') {
    const cols = PCOLS[pos]
    const rows = players
      .filter((p) => (pos === 'all' || p.pos === pos) && teamOk(p.t) && (!q || p.n.toLowerCase().includes(q) || p.t.toLowerCase() === q))
      .map((p) => ({ ...p, line: playerLine(inWindow(p.games, win), perGame) }))
      .filter((p) => p.line.g >= minG)
    const sortKey = cols.includes(ps.key) ? ps.key : DEFAULT_SORT[pos]
    const sorted = [...rows].sort((a, b) => {
      const av = a.line[sortKey], bv = b.line[sortKey]
      if (av == null || bv == null) return (av == null) - (bv == null)
      return ps.dir === -1 ? bv - av : av - bv
    })
    const shown = sorted.slice(0, 300)
    const csv = () => downloadCsv(`six-points-player-stats-${win}${perGame ? '-per-game' : ''}.csv`,
      ['Player', 'Pos', 'Team', ...cols.map((c) => P[c][0])],
      sorted.map((p) => [p.n, p.pos, p.t, ...cols.map((c) => fmt(p.line[c], P[c][2]))]))
    body = (
      <>
        <p className="meta-line small">
          {sorted.length} players{sorted.length > shown.length ? ` (top ${shown.length} shown — search or filter to narrow)` : ''} ·{' '}
          {winLabel}{perGame ? ', per game' : ', totals'} · tap a row for his game log
          <button className="pill-btn" style={{ marginLeft: 8 }} onClick={csv}>⬇ CSV</button>
        </p>
        <div className="table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th className="sticky-col">Player</th><th>Pos</th><th>Team</th>
                {cols.map((c) => <Th key={c} k={c} label={P[c][0]} title={P[c][1]} s={{ ...ps, key: sortKey }} />)}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <Fragment key={p.id}>
                  <tr className={`stats-row ${open === p.id ? 'open' : ''}`} onClick={() => setOpen(open === p.id ? null : p.id)}>
                    <td className="sticky-col">
                      <div className="player-cell"><PlayerAvatar playerId={p.id} name={p.n} />{p.n}</div>
                    </td>
                    <td>{p.pos}</td>
                    <td>{p.t}</td>
                    {cols.map((c) => <td key={c} className={c === sortKey ? 'zone-score' : ''}>{fmt(p.line[c], c === 'g' || c === 'snap' ? 0 : perGame && P[c][3] === 'sum' ? 1 : P[c][2])}</td>)}
                  </tr>
                  {open === p.id && (
                    <tr className="stats-detail"><td colSpan={cols.length + 3}><PlayerLog p={p} cols={PCOLS[p.pos] || PCOLS.all} scheme={scheme?.[p.id]} /></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  } else {
    const cols = book.team_cols
    const rows = teams
      .filter((t) => teamOk(t) && (!q || t.toLowerCase().includes(q)))
      .map((t) => ({ team: t, games: book.teams[t], line: teamLine(inWindow(book.teams[t], win), side, perGame, cols) }))
    const k = TCOLS.includes(ts.key) ? ts.key : 'pts'
    const sorted = [...rows].sort((a, b) => {
      const av = k === 'wl' ? a.line._w : a.line[k], bv = k === 'wl' ? b.line._w : b.line[k]
      if (av == null || bv == null) return (av == null) - (bv == null)
      return ts.dir === -1 ? bv - av : av - bv
    })
    const show = (r, c) => (c === 'epa' ? fmtEpa(r.line[c]) : c === 'wl' ? r.line.wl : fmt(r.line[c], c === 'g' ? 0 : perGame || ['epa', 'sr', 'rztdp', 'c3p'].includes(c) ? T[c][2] : 0))
    const csv = () => downloadCsv(`six-points-team-stats-${side === 'o' ? 'offense' : 'allowed'}-${win}.csv`,
      ['Team', ...TCOLS.map((c) => T[c][0])], sorted.map((r) => [r.team, ...TCOLS.map((c) => show(r, c))]))
    body = (
      <>
        <div className="pill-row hub-row">
          {[['o', '⚔️ Offense'], ['x', '🛡️ Allowed (defense)']].map(([kk, label]) => (
            <button key={kk} className={`pill-btn ${side === kk ? 'active' : ''}`} onClick={() => setSide(kk)}>{label}</button>
          ))}
        </div>
        <p className="meta-line small">
          {winLabel}{perGame ? ', per game' : ', totals'} · {side === 'x' ? 'what each defense allowed' : 'what each offense gained'} · tap a team for its game log
          <button className="pill-btn" style={{ marginLeft: 8 }} onClick={csv}>⬇ CSV</button>
        </p>
        <div className="table-wrap">
          <table className="stats-table">
            <thead>
              <tr><th className="sticky-col">Team</th>{TCOLS.map((c) => <Th key={c} k={c} label={T[c][0]} title={T[c][1]} s={{ ...ts, key: k }} />)}</tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <Fragment key={r.team}>
                  <tr className={`stats-row ${open === r.team ? 'open' : ''}`} onClick={() => setOpen(open === r.team ? null : r.team)}>
                    <td className="sticky-col"><strong>{r.team}</strong></td>
                    {TCOLS.map((c) => <td key={c} className={c === k ? 'zone-score' : ''}>{show(r, c)}</td>)}
                  </tr>
                  {open === r.team && (
                    <tr className="stats-detail"><td colSpan={TCOLS.length + 1}><TeamLog team={r.team} games={inWindow(r.games, win)} cols={cols} side={side} /></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  }

  return (
    <div>
      <div className="section-head">
        <h2>📊 Stats</h2>
        <p className="meta-line">
          Every player and team, {book.season} regular season through week {book.through_week} — from play-by-play, updated weekly
        </p>
      </div>
      <div className="pill-row hub-row">
        {[['players', '👤 Players'], ['teams', '🏟️ Teams']].map(([k, label]) => (
          <button key={k} className={`pill-btn ${view === k ? 'active' : ''}`} onClick={() => { setView(k); setOpen(null) }}>{label}</button>
        ))}
      </div>
      <div className="pill-row">
        {WINDOWS.map(([k, label]) => (
          <button key={k} className={`pill-btn ${win === k ? 'active' : ''}`} onClick={() => setWin(k)}>{label}</button>
        ))}
        <button className={`pill-btn ${perGame ? 'active' : ''}`} onClick={() => setPerGame((v) => !v)}>{perGame ? 'Per game' : 'Totals'}</button>
      </div>
      <div className="stats-filters">
        {view === 'players' && (
          <select value={pos} onChange={(e) => setPosition(e.target.value)} aria-label="Position">
            {POS.map((p) => <option key={p} value={p}>{p === 'all' ? 'All positions' : p}</option>)}
          </select>
        )}
        {view === 'players' && (
          <label className="meta-line small">Min games <input type="number" min={0} max={17} value={minG} onChange={(e) => setMinG(Number(e.target.value) || 0)} style={{ width: 52 }} /></label>
        )}
      </div>
      <MatchupFilterNote />
      {body}
      <p className="meta-line small">
        Box-score rules: sacks aren&apos;t pass attempts, kneels count as carries. Snap % = average share of offensive
        snaps. Team EPA / success are per snap. Context only — nothing on this page is in a grade. Situational splits
        (down &amp; distance, day / night) and TD streaks are on 📊 Splits.
      </p>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useSlate } from './slate.js'
import { openTeamSlide } from './slideouts.js'
import { isInSelectedMatchup, useMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'

// 🏅 Rankings (2026-10-19, user: "a page for the full list of defense and offense rankings categories"). Every team's
// offense and defense, season to date per game, ranked 1-32 in each category (build_rankings.py ->
// team_rankings.json, refreshed with the weekly engine run). Rank 1 = best: the most for an offense, the fewest
// allowed for a defense -- so a defense near 32 is the soft one (▲). Context only, not in any grade.
const SIDES = [['off', '⚔️ Offense'], ['def', '🛡️ Defense']]

function fmt(cat, v) {
  if (v == null) return '—'
  if (cat.key === 'success') return `${(v * 100).toFixed(1)}%`
  if (cat.key === 'epa') return `${v >= 0 ? '+' : ''}${v.toFixed(3)}`
  return v.toFixed(1)
}

export default function RankingsTab() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [side, setSide] = useState('off')
  const [sortBy, setSortBy] = useState('points')
  const [sortDir, setSortDir] = useState(1) // 1 = best (#1) first, -1 = worst first; tap the same column again to flip
  const sortOn = (k) => {
    if (k === sortBy) setSortDir((d) => -d)
    else { setSortBy(k); setSortDir(1) }
  }
  const slate = useSlate()
  const { selectedMatchup } = useMatchup()

  useEffect(() => {
    fetch('/data/team_rankings.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  // this week's opponent for each team, from the slate
  const opp = useMemo(() => {
    const m = {}
    for (const r of slate?.matchups || []) if (r.team && r.opponent) m[r.team] = r.opponent
    return m
  }, [slate])

  if (error) return <p className="empty-state">No rankings yet ({error}).</p>
  if (!data) return <p className="empty-state">Loading…</p>
  const cats = data.categories
  const n = data.n_teams || 32
  const rows = Object.entries(data.teams)
    .map(([team, t]) => ({ team, ...t }))
    .filter((r) => !selectedMatchup || isInSelectedMatchup(selectedMatchup, r.team))
    .sort((a, b) => {
      const ra = a[side][sortBy]?.rank, rb = b[side][sortBy]?.rank
      if (ra == null || rb == null) return (ra == null) - (rb == null) // missing ranks last either way
      return sortDir * (ra - rb)
    })
  const highlight = (rank) => {
    if (!rank) return 'neutral'
    if (side === 'off') return rank <= n / 3 ? 'soft' : rank > (2 * n) / 3 ? 'tough' : 'neutral'
    return rank > (2 * n) / 3 ? 'soft' : rank <= n / 3 ? 'tough' : 'neutral' // defense: highlighted = gives up the most
  }

  return (
    <div>
      <div className="section-head">
        <h2>🏅 Rankings</h2>
        <p className="meta-line">
          Every offense and defense by category — {data.season} regular season through week {data.through_week}, per game
        </p>
      </div>
      <div className="pill-row hub-row">
        {SIDES.map(([k, label]) => (
          <button key={k} className={`pill-btn ${side === k ? 'active' : ''}`} onClick={() => setSide(k)}>{label}</button>
        ))}
      </div>
      <div className="note">
        ℹ️ Rank 1 = best: {side === 'off'
          ? 'the offense that gains the most. Highlighted = top third.'
          : 'the defense that allows the fewest. ▲ highlighted = bottom third, the soft defenses that give up the most.'}
        {' '}Season-to-date numbers as they happened (not adjusted for opponents or shrunk toward last season — the
        defense-vs-position numbers the yards model uses are on Cheat Sheets). Context only: nothing on this page is in a
        grade. Tap a column to sort best first (↓), tap it again for worst first (↑); tap a team for its full profile.
      </div>
      <MatchupFilterNote />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="sticky-col">Team</th>
              <th>This week</th>
              {cats.map((c) => (
                <th key={c.key} title={`${c.label} — tap to sort, tap again to flip`} onClick={() => sortOn(c.key)} style={{ cursor: 'pointer' }}
                  aria-sort={sortBy === c.key ? (sortDir === 1 ? 'ascending' : 'descending') : 'none'}>
                  {c.short}{sortBy === c.key ? (sortDir === 1 ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.team}>
                <td className="sticky-col">
                  <button className="team-link" onClick={() => openTeamSlide({ team: r.team, context: side === 'def' ? 'defense' : undefined })}>
                    {r.team}
                  </button>
                  <span className="meta-line small"> {r.games}g</span>
                </td>
                <td className="meta-line small">{opp[r.team] ? `vs ${opp[r.team]}` : 'bye'}</td>
                {cats.map((c) => {
                  const cell = r[side][c.key]
                  const h = highlight(cell?.rank)
                  return (
                    <td key={c.key} title={`${c.label}${side === 'def' ? ' allowed' : ''}: ${fmt(c, cell?.v)} per ${c.key === 'epa' || c.key === 'success' ? 'play' : 'game'} — #${cell?.rank} of ${n}`}>
                      <span className={`mu-chip mu-${h}`}>#{cell?.rank ?? '—'}{side === 'def' && h === 'soft' ? ' ▲' : ''}</span>
                      <span className="meta-line small"> {fmt(c, cell?.v)}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta-line small">
        Pts = points scored / allowed · TDs = passing + rushing TDs · Pass / Rush = yards · QB rush = QB rushing yards
        (scrambles included) · RB yds = RB rushing + receiving · WR / TE yds = receiving · RZ trips = drives with a snap
        inside the 20 · EPA/play and Success = per offensive snap · 20+ plays = gains of 20+ yards. Positions from nflverse
        rosters (FB counted as RB).
      </p>
    </div>
  )
}

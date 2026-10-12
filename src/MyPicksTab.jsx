import { useEffect, useMemo, useState } from 'react'
import { clearPicks, PICK_CATEGORIES, picksToCsv, setPick, usePicks } from './picks.js'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide } from './slideouts.js'
import { fmtPct, GradeBadge } from './gradeUi.jsx'
import { parseCsv } from './csv.js'

// My Picks (§8). Stored only in this browser. Once a pick's game is final and the weekly pipeline
// has graded it, the real result comes from grade_record.csv (TDs / scrimmage yards).
const CAT_LABEL = Object.fromEntries(PICK_CATEGORIES.map((c) => [c.id, c.label]))

function resultFor(pick, graded) {
  const r = graded[`${pick.season}-${pick.week}-${pick.player_id}`]
  if (!r) return null
  const tds = Number(r.tds)
  const yds = Number(r.scrim_yds)
  let hit = null
  if (pick.category === 'anytime_td' || pick.category === 'first_td' || pick.category === 'breakout' || pick.category === 'longshot') hit = tds > 0
  if (pick.category === 'yards_100') hit = yds >= 100
  return { tds, yds, hit }
}

export default function MyPicksTab() {
  const picks = usePicks()
  const [graded, setGraded] = useState({})
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    fetch('/data/grade_record.csv')
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => {
        const map = {}
        for (const r of t ? parseCsv(t) : []) map[`${r.season}-${r.week}-${r.player_id}`] = r
        setGraded(map)
      })
      .catch(() => {})
  }, [])

  const list = useMemo(
    () => Object.values(picks).sort((a, b) => (b.season || 0) - (a.season || 0) || (b.week || 0) - (a.week || 0) || a.player_name.localeCompare(b.player_name)),
    [picks]
  )

  function exportCsv() {
    const blob = new Blob([picksToCsv(list)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'six-points-my-picks.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (list.length === 0) {
    return (
      <p className="empty-state">
        No picks yet. Tap the <strong>+</strong> next to any player (All Matchups, Breakout Watch,
        Top Picks, or a player's slideout) to save them here with a category. Picks are stored only in
        this browser.
      </p>
    )
  }

  const settled = list.map((p) => resultFor(p, graded)).filter((r) => r && r.hit != null)
  const hits = settled.filter((r) => r.hit).length

  return (
    <div>
      <p className="meta-line">
        {list.length} pick{list.length === 1 ? '' : 's'} saved in this browser
        {settled.length > 0 && <> &middot; graded so far: {hits} of {settled.length} hit</>}
      </p>
      <div className="sub-tabs">
        <button onClick={exportCsv}>Export CSV</button>
        {!confirmClear && <button onClick={() => setConfirmClear(true)}>Clear all</button>}
        {confirmClear && (
          <>
            <button className="danger" onClick={() => { clearPicks(); setConfirmClear(false) }}>Yes, clear every pick</button>
            <button onClick={() => setConfirmClear(false)}>Cancel</button>
          </>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="sticky-col">Player</th>
              <th>Wk</th>
              <th>Matchup</th>
              <th>Pick</th>
              <th>Grade</th>
              <th>TD %</th>
              <th>100+ %</th>
              <th>Result</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const res = resultFor(p, graded)
              return (
                <tr key={p.player_id}>
                  <td className="sticky-col">
                    <div className="player-cell" onClick={() => openPlayerSlide(p)}>
                      <PlayerAvatar playerId={p.player_id} name={p.player_name} />
                      {p.player_name}
                    </div>
                  </td>
                  <td>{p.week ?? '—'}</td>
                  <td>{p.team} vs {p.opponent} &middot; {p.position}</td>
                  <td>
                    <select value={p.category} onChange={(e) => setPick(p, e.target.value)}>
                      {PICK_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </td>
                  <td><GradeBadge grade={p.grade} /></td>
                  <td>{fmtPct(p.p_td)}</td>
                  <td>{fmtPct(p.p_100)}</td>
                  <td>
                    {!res && <span className="meta-line small">pending</span>}
                    {res && (
                      <span className={res.hit === true ? 'hit-rate-good' : res.hit === false ? 'hit-rate-low' : ''}>
                        {res.hit === true ? '✓ ' : res.hit === false ? '✗ ' : ''}{res.tds} TD &middot; {res.yds} yds
                      </span>
                    )}
                  </td>
                  <td>
                    <button className="team-link" onClick={() => setPick(p, null)} title={`Remove ${CAT_LABEL[p.category]} pick`}>Remove</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="meta-line small">
        Results fill in after the Tuesday pipeline run grades the week (only for picks made on a
        week's slate). "Favorite" picks show the box line without a hit/miss call.
      </p>
    </div>
  )
}

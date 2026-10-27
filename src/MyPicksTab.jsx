import { useEffect, useMemo, useState } from 'react'
import { clearPicks, PICK_TYPE, PICK_TYPES, picksToCsv, removePick, setPick, usePicks } from './picks.js'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide } from './slideouts.js'
import { fmtPct, GradeBadge } from './gradeUi.jsx'
import { parseCsv } from './csv.js'
import { useSlate } from './slate.js'
import GamblyButton from './GamblyButton.jsx'
import { betLine, betText, PICK_PROP } from './gambly.js'
import { BestPriceLink, StatePicker } from './BetLink.jsx'
import PicksLive from './PicksLive.jsx'

// My Picks (Slap Shot's tabs/MyPicksTab.jsx layout, 2026-10-18 revamp): every player picked with a ＋ button
// (picks.js, saved in this browser), grouped by category, with this week's matchup + book price from the live slate,
// a Gambly button per pick and "All N as a parlay" per category, and a CSV export. Six Points extra kept: once a
// pick's game is final and the Tuesday pipeline has graded it, the real result comes from grade_record.csv.
function resultFor(pick, graded) {
  const r = graded[`${pick.season}-${pick.week}-${pick.player_id}`]
  if (!r) return null
  const tds = Number(r.tds)
  const yds = Number(r.scrim_yds)
  let hit = tds > 0
  if (pick.category === 'td2') hit = tds >= 2
  if (pick.category === 'yds100') hit = yds >= 100
  if (pick.category === 'fav') hit = null
  return { tds, yds, hit }
}

export default function MyPicksTab() {
  const picks = usePicks()
  const slate = useSlate()
  const [graded, setGraded] = useState({})
  const [confirmClear, setConfirmClear] = useState(false)
  // 2026-10-26 (user): 📡 Live = a box score of my picks vs our pre-game + live projections; By category = the old list
  const [view, setView] = useState('live')

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

  const live = useMemo(() => new Map([...(slate?.matchups || []), ...(slate?.not_playing || [])].map((m) => [m.player_id, m])), [slate])
  const list = useMemo(() => Object.values(picks).sort((a, b) => (a.added_at || '').localeCompare(b.added_at || '')), [picks])

  function exportCsv() {
    const blob = new Blob([picksToCsv(list)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'six-points-my-picks.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function clearAll() {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 4000)
      return
    }
    clearPicks()
    setConfirmClear(false)
  }

  const settled = list.map((p) => resultFor(p, graded)).filter((r) => r && r.hit != null)
  const hits = settled.filter((r) => r.hit).length

  return (
    <div>
      <div className="section-head">
        <h2>⭐ My Picks</h2>
        <p className="meta-line">Players you've tagged with the ＋ button — saved in this browser, with this week's matchup and book price</p>
      </div>

      {list.length > 0 && (
        <div className="sub-tabs">
          {[['live', '📡 Live'], ['cat', '🗂 By category']].map(([k, l]) => <button key={k} className={view === k ? 'active' : ''} onClick={() => setView(k)}>{l}</button>)}
        </div>
      )}
      {view === 'live' && list.length > 0 && slate && <PicksLive slate={slate} picks={list} />}
      {(view === 'cat' || !list.length) && <>

      {list.length > 0 && (
        <div className="sub-tabs">
          <button onClick={exportCsv}>⬇ Export CSV</button>
          <button onClick={clearAll} className={confirmClear ? 'danger' : ''}>{confirmClear ? `Click again to clear all ${list.length}` : 'Clear'}</button>
          <StatePicker />
          {settled.length > 0 && <span className="meta-line small" style={{ alignSelf: 'center' }}>graded so far: {hits} of {settled.length} hit</span>}
        </div>
      )}

      <div className="card">
        <strong>Categories</strong>
        <div className="pick-cat-grid">
          {PICK_TYPES.map((t) => <span key={t.key}>{t.emoji} {t.label}</span>)}
        </div>
        <p className="meta-line small">One category per player — picking another replaces it, picking the same one again removes it.
          👑 King of the End Zone = DraftKings' longest-TD promo (Monday / primetime games); its bet is an anytime TD.</p>
      </div>

      {list.length === 0 && (
        <p className="empty-state">
          No picks yet. Tap the ＋ next to any player on Cheat Sheets, Top Picks, Scouting (All Matchups, Paydirt Lab,
          Yardage Lab, Game Ladder), 1st TD, King of the End Zone or a player's slideout.
        </p>
      )}

      {PICK_TYPES.map((t) => {
        const rows = list.filter((pk) => pk.category === t.key)
        if (!rows.length) return null
        return (
          <div key={t.key} className="card">
            <div className="pick-cat-head">
              <span>{t.emoji} {t.label} <span className="meta-line small">({rows.length})</span></span>
              {rows.length > 1 && (
                <GamblyButton compact={false} label={`All ${rows.length} as a parlay`}
                  text={betText(rows.map((pk) => betLine(pk, PICK_PROP[pk.category] || 'td')))} />
              )}
            </div>
            {rows.map((pk) => {
              const m = live.get(pk.player_id)
              const res = resultFor(pk, graded)
              const sameWeek = m && m.week === pk.week
              return (
                <div key={pk.player_id} className="pick-row">
                  <div className="player-cell pick-row-main" onClick={() => openPlayerSlide(m || pk)}>
                    <PlayerAvatar playerId={pk.player_id} name={pk.player_name} />
                    <div>
                      <span>{pk.player_name}</span> {(m?.grade || pk.grade) && <GradeBadge grade={sameWeek ? m.grade : pk.grade} />}
                      {m?.absent_reason && <span className="out-tag" title={m.absent_reason}> OUT</span>}
                      <div className="meta-line small" style={{ margin: 0 }}>
                        {pk.team} vs {pk.opponent} · {pk.position} · wk {pk.week ?? '—'}
                        {sameWeek && <> · TD {fmtPct(m.p_td)}{m.p_td2 != null && <> · 2+ {fmtPct(m.p_td2)}</>} · 100+ {fmtPct(m.p_100)}</>}
                      </div>
                    </div>
                  </div>
                  {sameWeek && <span className="pick-book"><BestPriceLink book={m.book} /></span>}
                  <span className="pick-result">
                    {!res && <span className="meta-line small">pending</span>}
                    {res && (
                      <span className={res.hit === true ? 'hit-rate-good' : res.hit === false ? 'hit-rate-low' : ''}>
                        {res.hit === true ? '✓ ' : res.hit === false ? '✗ ' : ''}{res.tds} TD · {res.yds} yds
                      </span>
                    )}
                  </span>
                  <select value={pk.category} onChange={(e) => setPick(pk, e.target.value)}>
                    {PICK_TYPES.map((o) => <option key={o.key} value={o.key}>{o.emoji} {o.label}</option>)}
                  </select>
                  <GamblyButton text={betLine(pk, PICK_PROP[pk.category] || 'td')} />
                  <button className="team-link" title="Remove" onClick={() => removePick(pk.player_id)}>✕</button>
                </div>
              )
            })}
          </div>
        )
      })}
      {list.length > 0 && (
        <p className="meta-line small">
          Results fill in after the Tuesday pipeline grades the week. First TD and King of the End Zone picks are graded as
          "scored a TD" here (the play-by-play order isn't in the ledger). {PICK_TYPE.fav.emoji} Favorites show the box line without a call.
        </p>
      )}
      </>}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useMatchup } from './MatchupContext.jsx'
import { TeamLogo } from './BoxScoreTab.jsx'
import { openGame } from './nav.js'
import { viewWeek } from './weekView.js'

// 📅 Schedule (2026-10-23 rebuild, user: "change six points schedule page format to match the other two apps because that
// single line row looks strange" + tap a game for its box score). Same layout as CourtIQ's / Slap Shot's Schedule: a day
// card per game day, each game a row -- status (Final / live clock / kickoff ET), both teams with logos and scores (winner
// bold), and for started games the passing / rushing / receiving leaders from ESPN's scoreboard (TV before kickoff). Weeks
// are the NFL's: ◀ / ▶ or pick one; a team picker narrows to its games; the header game strip narrows to that matchup.
// Tap a game -> Live > Box Scores on it. Kickoff times are nflverse's (Eastern). Live status polls every 30 s.
// (The old one-line table version is kept as ScheduleTab_BKUP_261023_0947.jsx.)
const POLL_MS = 30000
const kickoff = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'} ET`
}
const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
const todayEt = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const ESPN = { LA: 'LAR', WAS: 'WSH' }

function currentWeekOf(games) {
  const today = todayEt()
  const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b)
  for (const wk of weeks) {
    const days = games.filter((g) => g.week === wk).map((g) => g.gameday).filter(Boolean).sort()
    if (days.length && today <= days[days.length - 1]) return wk
  }
  return weeks[weeks.length - 1] || 1
}

async function scoreboard(ymd) {
  const r = await fetch(`/api/scoreboard?dates=${ymd}`).catch(() => null)
  if (r?.ok) return r.json()
  const d = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${ymd}`).catch(() => null)
  return d?.ok ? d.json() : null
}

// ESPN event per nflverse game (by team pair): state, clock text, scores, leaders, TV
function useEspnWeek(games) {
  const [byGame, setByGame] = useState({})
  useEffect(() => {
    setByGame({})
    if (!games.length) return undefined
    let alive = true
    let timer = null
    const load = async () => {
      const dates = [...new Set(games.map((g) => g.gameday).filter((d) => d && d <= todayEt()).map((d) => d.replaceAll('-', '')))]
      const out = {}
      let live = false
      await Promise.all(dates.map(async (ymd) => {
        const sb = await scoreboard(ymd)
        for (const e of sb?.events || []) {
          const c = e.competitions?.[0]
          const abbrs = (c?.competitors || []).map((x) => x.team?.abbreviation)
          const g = games.find((x) => abbrs.includes(ESPN[x.home_team] || x.home_team) && abbrs.includes(ESPN[x.away_team] || x.away_team))
          if (!g) continue
          const side = (ha) => c.competitors.find((x) => x.homeAway === ha)
          const state = e.status?.type?.state
          if (state === 'in') live = true
          out[g.game_id] = {
            state, detail: e.status?.type?.shortDetail, homeScore: Number(side('home')?.score ?? 0), awayScore: Number(side('away')?.score ?? 0),
            leaders: (c.leaders || []).map((l) => ({ name: l.leaders?.[0]?.athlete?.shortName, line: l.leaders?.[0]?.displayValue, cat: l.name })).filter((l) => l.name),
            tv: [...new Set((c.broadcasts || []).flatMap((b) => b.names || []))].join(', ') || null,
          }
        }
      }))
      if (!alive) return
      setByGame(out)
      if (live) timer = setTimeout(load, POLL_MS)
    }
    load()
    return () => { alive = false; clearTimeout(timer) }
  }, [games])
  return byGame
}

const CAT = { passingYards: 'pass', rushingYards: 'rush', receivingYards: 'rec' }

function GameRow({ g, e, focus }) {
  const final = g.home_score != null || e?.state === 'post'
  const live = !final && e?.state === 'in'
  const started = final || live
  const hs = g.home_score ?? e?.homeScore, as = g.away_score ?? e?.awayScore
  const side = (team, score, win) => (
    <div className={`sch-team ${final && win ? 'win' : ''} ${focus?.includes(team) ? 'focus' : ''}`}>
      <TeamLogo team={team} size={18} />
      <span className="sch-abbr">{team}</span>
      {started && <b className="sch-score">{score}</b>}
    </div>
  )
  const open = () => openGame({ week: g.week, gameId: g.game_id })
  return (
    <div className="sch-row clickable" role="button" tabIndex={0} title="Open the box score" onClick={open} onKeyDown={(ev) => ev.key === 'Enter' && open()}>
      <div className={`sch-status ${live ? 'live' : ''}`}>{live ? `● ${e.detail}` : final ? (/OT/.test(e?.detail || '') ? 'Final / OT' : 'Final') : kickoff(g.gametime)}</div>
      <div className="sch-teams">{side(g.away_team, as, as > hs)}{side(g.home_team, hs, hs > as)}</div>
      <div className="sch-side">
        {started && e?.leaders?.length
          ? e.leaders.map((l) => <span key={l.cat}>{l.name} <span className="sch-cat">{CAT[l.cat] || ''}</span> {l.line}</span>)
          : <span className="sch-cat">{e?.tv || ''}</span>}
      </div>
    </div>
  )
}

export default function ScheduleTab() {
  const [schedule, setSchedule] = useState(null)
  const [error, setError] = useState(null)
  const [week, setWeek] = useState(null)
  // 2026-10-23: the team comes from the header (MasterFilter) or the game strip; this page's own picker was retired
  const { selectedMatchup } = useMatchup()
  const team = selectedMatchup?.teamOnly ? selectedMatchup.home : ''
  useEffect(() => {
    fetch('/data/season_schedule.json')
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json() })
      .then((d) => { setSchedule(d); setWeek(viewWeek() ?? currentWeekOf(d.games)) })
      .catch((e) => setError(e.message))
  }, [])
  const weeks = useMemo(() => (schedule ? [...new Set(schedule.games.map((g) => g.week))].sort((a, b) => a - b) : []), [schedule])
  const teams = useMemo(() => (schedule ? [...new Set(schedule.games.flatMap((g) => [g.home_team, g.away_team]))].sort() : []), [schedule])
  const current = schedule ? currentWeekOf(schedule.games) : null
  const weekGames = useMemo(() => (schedule && week ? schedule.games.filter((g) => g.week === week) : []), [schedule, week])
  const espn = useEspnWeek(weekGames)
  const focus = selectedMatchup ? [selectedMatchup.away, selectedMatchup.home] : null
  const shown = weekGames.filter((g) => !focus || focus.includes(g.home_team) || focus.includes(g.away_team))
  const days = [...new Set(shown.map((g) => g.gameday))].sort()
  const rec = team ? shown.filter((g) => g.home_score != null).reduce((r, g) => {
    const mine = g.home_team === team ? g.home_score : g.away_score
    const theirs = g.home_team === team ? g.away_score : g.home_score
    return mine > theirs ? { ...r, w: r.w + 1 } : mine < theirs ? { ...r, l: r.l + 1 } : { ...r, t: r.t + 1 }
  }, { w: 0, l: 0, t: 0 }) : null
  if (error) return <p className="empty-state">No schedule data yet ({error}).</p>
  if (!schedule || !week) return <p className="empty-state">Loading...</p>
  const allDays = weekGames.map((g) => g.gameday).filter(Boolean).sort()
  const md = (d) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })
  const span = allDays.length ? `${md(allDays[0])} – ${md(allDays[allDays.length - 1])}` : ''
  const count = (d) => shown.filter((g) => g.gameday === d).length
  return (
    <div>
      <div className="card sch-nav">
        <button className="pill-btn" onClick={() => setWeek(Math.max(weeks[0], week - 1))} aria-label="Previous week">◀</button>
        <select className="sch-week-pick" value={week} onChange={(e) => setWeek(Number(e.target.value))} aria-label="Week">
          {weeks.map((w) => <option key={w} value={w}>Week {w}{w === current ? ' (this week)' : ''}</option>)}
        </select>
        <button className="pill-btn" onClick={() => setWeek(Math.min(weeks[weeks.length - 1], week + 1))} aria-label="Next week">▶</button>
        <span className="sch-range">{span}</span>
        {week !== current && <button className="pill-btn" onClick={() => setWeek(current)}>This week</button>}
      </div>
      {!team && selectedMatchup && !selectedMatchup.teamOnly && <p className="meta-line small">Showing {selectedMatchup.away} @ {selectedMatchup.home} (the game strip above) -- tap All games to clear.</p>}
      {rec && rec.w + rec.l + rec.t > 0 && <p className="meta-line small">{team}: {rec.w}-{rec.l}{rec.t ? `-${rec.t}` : ''} in the finished games shown.</p>}
      {!days.length && <p className="empty-state">No games{focus ? ' for this team' : ''} in Week {week}{team ? ' (bye week?)' : ''}.</p>}
      {days.map((d) => (
        <div key={d} className={`card sch-day ${d === todayEt() ? 'today' : ''}`}>
          <div className="sch-day-head">
            <b>{dayLabel(d)}</b>
            {d === todayEt() && <span className="sch-today">TODAY</span>}
            <span className="sch-cat">{count(d)} game{count(d) > 1 ? 's' : ''}</span>
          </div>
          {shown.filter((g) => g.gameday === d).sort((a, b) => String(a.gametime).localeCompare(String(b.gametime))).map((g) => <GameRow key={g.game_id} g={g} e={espn[g.game_id]} focus={focus} />)}
        </div>
      ))}
      <p className="meta-line small">Kickoffs are Eastern. Leaders are each game's top passer, rusher and receiver (ESPN), refreshed every 30 seconds while a game is live. Tap a game for its box score.</p>
    </div>
  )
}

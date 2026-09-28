import { useEffect, useState } from 'react'
import { useMatchup } from './MatchupContext.jsx'

// Always-visible row of this week's real matchups -- click one to cross-filter every wired-in
// table on every tab to just those two teams (see MatchupContext.jsx). Click the same one again,
// or the Clear button, to go back to each table's own independent filter.
//
// Live score/clock/possession (added same session, requested directly): reuses the exact same
// real ESPN scoreboard proxy + team-abbreviation matching ScheduleTab.jsx's own live-status
// poller already uses (event.competitions[0].competitors[].team.abbreviation matches directly
// against season_schedule.json's home_team/away_team for the large majority of teams -- same
// convention, not a new crosswalk). Possession indicator mirrors FieldTracker.jsx's own real
// 🏈-next-to-the-team-with-the-ball convention.

const LIVE_POLL_INTERVAL_MS = 30000

async function fetchScoreboard(dateYYYYMMDD) {
  const proxied = await fetch(`/api/scoreboard?dates=${dateYYYYMMDD}`).catch(() => null)
  if (proxied && proxied.ok) return proxied.json()
  const direct = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dateYYYYMMDD}`
  )
  return direct.json()
}

export default function MatchupSelector() {
  const [games, setGames] = useState(null)
  const [liveByGame, setLiveByGame] = useState({})
  const { selectedMatchup, setSelectedMatchup } = useMatchup()

  useEffect(() => {
    Promise.all([
      fetch('/data/season_schedule.json').then((r) => (r.ok ? r.json() : null)),
      fetch('/data/all_matchups_latest.json').then((r) => (r.ok ? r.json() : null)),
    ]).then(([sched, mu]) => {
      if (!sched || !mu) return
      setGames(sched.games.filter((g) => g.week === mu.week))
    })
  }, [])

  useEffect(() => {
    if (!games || games.length === 0) return
    let cancelled = false
    async function poll() {
      const dates = [...new Set(games.map((g) => g.gameday).filter(Boolean).map((d) => d.replaceAll('-', '')))]
      const byGame = {}
      for (const ymd of dates) {
        try {
          const sb = await fetchScoreboard(ymd)
          for (const event of sb.events || []) {
            const comp = event.competitions?.[0]
            const competitors = comp?.competitors || []
            const home = competitors.find((c) => c.homeAway === 'home')
            const away = competitors.find((c) => c.homeAway === 'away')
            const abbrs = competitors.map((c) => c.team?.abbreviation)
            const match = games.find((g) => abbrs.includes(g.home_team) || abbrs.includes(g.away_team))
            if (!match) continue
            const statusType = event.status?.type
            byGame[match.game_id] = {
              state: statusType?.state || null,
              detail: statusType?.shortDetail || null,
              homeScore: home?.score,
              awayScore: away?.score,
              period: event.status?.period,
              clock: event.status?.displayClock,
              possessionTeamId: comp?.situation?.possession || null,
              homeTeamId: home?.team?.id,
              awayTeamId: away?.team?.id,
            }
          }
        } catch {
          // one date's scoreboard failing shouldn't blank the whole row
        }
      }
      if (!cancelled) setLiveByGame(byGame)
    }
    poll()
    const timer = setInterval(poll, LIVE_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [games])

  if (!games || games.length === 0) return null

  function toggle(g) {
    const isSame = selectedMatchup && selectedMatchup.home === g.home_team && selectedMatchup.away === g.away_team
    setSelectedMatchup(isSame ? null : { home: g.home_team, away: g.away_team })
  }

  return (
    <div className="matchup-selector">
      <span className="matchup-selector-label">This week:</span>
      <div className="matchup-selector-row">
        {games.map((g) => {
          const active = selectedMatchup && selectedMatchup.home === g.home_team && selectedMatchup.away === g.away_team
          const live = liveByGame[g.game_id]
          const isLive = live?.state === 'in'
          const isFinal = live?.state === 'post'
          const awayHasBall = live?.possessionTeamId && live.possessionTeamId === live.awayTeamId
          const homeHasBall = live?.possessionTeamId && live.possessionTeamId === live.homeTeamId
          return (
            <button
              key={g.game_id}
              className={active ? 'matchup-pill active' : 'matchup-pill'}
              onClick={() => toggle(g)}
              title={isLive ? `Q${live.period} ${live.clock}` : undefined}
            >
              {awayHasBall && <span className="matchup-pill-ball">&#127944;</span>}
              {g.away_team}{live ? ` ${live.awayScore}` : ''}
              {' @ '}
              {homeHasBall && <span className="matchup-pill-ball">&#127944;</span>}
              {g.home_team}{live ? ` ${live.homeScore}` : ''}
              {isLive && <span className="matchup-pill-live"> &middot; Q{live.period} {live.clock}</span>}
              {isFinal && <span className="matchup-pill-final"> &middot; Final</span>}
            </button>
          )
        })}
        {selectedMatchup && (
          <button className="matchup-pill matchup-pill-clear" onClick={() => setSelectedMatchup(null)}>
            Clear &times;
          </button>
        )}
      </div>
    </div>
  )
}

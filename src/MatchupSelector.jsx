import { useEffect, useState } from 'react'
import { useMatchup } from './MatchupContext.jsx'

// Always-visible horizontally-scrollable row of real matchup CARDS (redesigned from an earlier
// small-pill version per direct feedback + two real reference screenshots -- a Going Yard-style
// compact score card and a "sports alert"-style logo/score/status card). Click a card to
// cross-filter every wired-in table on every tab to just those two teams (see
// MatchupContext.jsx). Click the same card again, or Clear, to release every table back to its
// own independent filter.
//
// Live score/clock/possession: reuses the exact same real ESPN scoreboard proxy + team-
// abbreviation matching ScheduleTab.jsx's own live-status poller already uses. Possession
// indicator mirrors FieldTracker.jsx's own real 🏈-next-to-the-team-with-the-ball convention.
// Real per-game total yards (visible in the "sports alert" reference) is deliberately NOT
// included -- verified live that ESPN's lightweight scoreboard feed always returns an empty
// `statistics` array regardless of game state; getting real yardage would mean a much heavier
// per-game `/summary` call for every card in the row, not a free addition to the poll already
// running here.

const LIVE_POLL_INTERVAL_MS = 30000

async function fetchScoreboard(dateYYYYMMDD) {
  const proxied = await fetch(`/api/scoreboard?dates=${dateYYYYMMDD}`).catch(() => null)
  if (proxied && proxied.ok) return proxied.json()
  const direct = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dateYYYYMMDD}`
  )
  return direct.json()
}

function formatKickoff(gametime) {
  if (!gametime) return ''
  const [h, m] = gametime.split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m || 0).padStart(2, '0')} ${ampm}`
}

export default function MatchupSelector() {
  const [games, setGames] = useState(null)
  const [teamStats, setTeamStats] = useState(null)
  const [liveByGame, setLiveByGame] = useState({})
  const { selectedMatchup, setSelectedMatchup } = useMatchup()

  useEffect(() => {
    Promise.all([
      fetch('/data/season_schedule.json').then((r) => (r.ok ? r.json() : null)),
      fetch('/data/all_matchups_latest.json').then((r) => (r.ok ? r.json() : null)),
      fetch('/data/team_stats.json').then((r) => (r.ok ? r.json() : {})),
    ]).then(([sched, mu, ts]) => {
      if (!sched || !mu) return
      setGames(sched.games.filter((g) => g.week === mu.week))
      setTeamStats(ts || {})
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

  function TeamRow({ team, score, hasBall, bold }) {
    const logo = teamStats?.[team]?.logo
    return (
      <div className="matchup-card-team-row">
        {logo && <img src={logo} alt={team} className="matchup-card-logo" />}
        <span className={bold ? 'matchup-card-abbr bold' : 'matchup-card-abbr'}>{team}</span>
        {hasBall && <span className="matchup-card-ball">&#127944;</span>}
        <span className="matchup-card-score">{score ?? ''}</span>
      </div>
    )
  }

  return (
    <div className="matchup-selector">
      <div className="matchup-selector-row">
        {games.map((g) => {
          const active = selectedMatchup && selectedMatchup.home === g.home_team && selectedMatchup.away === g.away_team
          const live = liveByGame[g.game_id]
          const isLive = live?.state === 'in'
          const isFinal = live?.state === 'post'
          const awayHasBall = isLive && live?.possessionTeamId && live.possessionTeamId === live.awayTeamId
          const homeHasBall = isLive && live?.possessionTeamId && live.possessionTeamId === live.homeTeamId
          const homeLeads = live && Number(live.homeScore) > Number(live.awayScore)
          const awayLeads = live && Number(live.awayScore) > Number(live.homeScore)
          return (
            <button
              key={g.game_id}
              className={active ? 'matchup-card active' : 'matchup-card'}
              onClick={() => toggle(g)}
            >
              <TeamRow team={g.away_team} score={live?.awayScore} hasBall={awayHasBall} bold={awayLeads && isFinal} />
              <TeamRow team={g.home_team} score={live?.homeScore} hasBall={homeHasBall} bold={homeLeads && isFinal} />
              <div className="matchup-card-status">
                {isFinal ? 'Final' : isLive ? `Q${live.period} ${live.clock}` : formatKickoff(g.gametime) || g.gameday}
              </div>
            </button>
          )
        })}
        {selectedMatchup && (
          <button className="matchup-card matchup-card-clear" onClick={() => setSelectedMatchup(null)}>
            Clear &times;
          </button>
        )}
      </div>
    </div>
  )
}

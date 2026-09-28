import { useEffect, useMemo, useState } from 'react'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'

// "Key Matchups" -- requested directly against Going Yard's own feature of the same name. Real
// finding before building anything (grepped Going Yard's actual live source, same standing rule
// every feature in this app follows): Going Yard's "Is Key Matchup" flag is explicitly a HUMAN
// RESEARCHER'S manually-curated daily flag that "only exists in the All Matchups/Track Record
// pipeline, not a live matchup_engine.py field" (Going Yard's own App.jsx comment, ~line 28842) --
// there is no algorithm computing it, a person picks it. Six Points has no daily human curation
// step, so a literal port isn't possible -- this is a real, disclosed, computed APPROXIMATION
// instead: not "predicted to score" (zone_score already does that, and is now correctly
// usage-dominated per the real regression behind it -- see matchup_engine.py's zone_score
// comment), but "whose specific positional matchup this week is unusually favorable, weighted by
// how real a role they actually play" -- a genuinely different cut than the main leaderboard.
//
// matchupUpside = opp_def_rank_pct (this player's own position vs. this specific opponent,
// 0-100, already computed server-side) * (usage_sig / 14) -- a plush matchup with zero real role
// scores low, a real starter in a tough matchup scores low, only the combination of BOTH ranks
// high. Disclosed like every other v1 signal in this app: opp_def_rank_pct alone showed weak
// standalone correlation with actual_tds in the real regression that reweighted zone_score this
// session -- this is a real "which matchups look most favorable on paper" cut, not a validated
// prediction, same honest framing Cheat Sheets already uses for its own opinionated lists.
//
// thin_sample players (scored off a prior-season/position-average fallback, not real current
// data) are excluded -- "poised for a breakout given the matchup" implies a real current signal
// exists to reason about, not a rookie/unknown-role fallback number.

function matchupUpside(m) {
  return m.opp_def_rank_pct * (m.usage_sig / 14)
}

function PlayerCard({ m, rank }) {
  return (
    <div className="weather-card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--accent)', minWidth: 20 }}>{rank}</div>
      <PlayerAvatar playerId={m.player_id} name={m.player_name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="player-cell" style={{ padding: 0 }} onClick={() => openPlayerSlide(m)}>
          <strong>{m.player_name}</strong>
        </div>
        <div className="meta-line" style={{ margin: '2px 0' }}>{m.position} &middot; Usage Sig {Number(m.usage_sig).toFixed(1)}</div>
        <div className="meta-line small" style={{ margin: 0 }}>
          Matchup: {Number(m.opp_def_rank_pct).toFixed(0)}th pct vs {m.position} &middot;
          RZ Touches/G {Number(m.redzone_touches_per_game).toFixed(1)} &middot;
          1st TD% {Number(m.first_td_pct).toFixed(1)}%
        </div>
      </div>
    </div>
  )
}

function GameCard({ away, home, awayPlayers, homePlayers }) {
  return (
    <div className="table-wrap" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>
        <button className="team-link" onClick={() => openTeamSlide({ team: away })}>{away}</button>
        {' @ '}
        <button className="team-link" onClick={() => openTeamSlide({ team: home })}>{home}</button>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px', minWidth: 280 }}>
          <div className="meta-line small" style={{ margin: '0 0 6px', fontWeight: 700 }}>{away}</div>
          {awayPlayers.map((m, i) => <PlayerCard key={m.player_id} m={m} rank={i + 1} />)}
          {awayPlayers.length === 0 && <p className="empty-state">No qualifying players this week.</p>}
        </div>
        <div style={{ flex: '1 1 300px', minWidth: 280 }}>
          <div className="meta-line small" style={{ margin: '0 0 6px', fontWeight: 700 }}>{home}</div>
          {homePlayers.map((m, i) => <PlayerCard key={m.player_id} m={m} rank={i + 1} />)}
          {homePlayers.length === 0 && <p className="empty-state">No qualifying players this week.</p>}
        </div>
      </div>
    </div>
  )
}

export default function KeyMatchupsTab() {
  const [data, setData] = useState(null)
  const [schedule, setSchedule] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/data/all_matchups_latest.json').then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      }),
      fetch('/data/season_schedule.json').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([matchups, sched]) => {
        setData(matchups)
        setSchedule(sched)
      })
      .catch((e) => setError(e.message))
  }, [])

  const topByTeam = useMemo(() => {
    if (!data) return {}
    const eligible = data.matchups.filter((m) => !m.thin_sample && m.usage_sig > 0)
    const byTeam = {}
    for (const m of eligible) {
      if (!byTeam[m.team]) byTeam[m.team] = []
      byTeam[m.team].push(m)
    }
    for (const team of Object.keys(byTeam)) {
      byTeam[team] = byTeam[team]
        .sort((a, b) => matchupUpside(b) - matchupUpside(a))
        .slice(0, 3)
    }
    return byTeam
  }, [data])

  const games = useMemo(() => {
    if (!schedule || !data) return []
    const week = data.week
    return schedule.games.filter((g) => g.week === week)
  }, [schedule, data])

  if (error) {
    return (
      <p className="empty-state">
        No matchup data yet ({error}). Run <code>python matchup_engine.py --season 2026</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!data || !schedule) return <p className="empty-state">Loading...</p>

  return (
    <div>
      <p className="meta-line">
        Week {data.week} &middot; our own computed "which matchup looks most favorable on paper"
        cut -- top 3 per team by opponent defensive matchup (position-specific) weighted by real
        usage, not just top overall Zone Score &middot; NOT a port of Going Yard's own Key
        Matchup flag, which is a human researcher's daily manual pick with no algorithmic
        equivalent in that app either &middot; a favorable matchup on paper is not a validated
        prediction -- see the Track Record tab for how this app's real predictions have actually
        performed
      </p>
      {games.map((g) => (
        <GameCard
          key={g.game_id}
          away={g.away_team}
          home={g.home_team}
          awayPlayers={topByTeam[g.away_team] || []}
          homePlayers={topByTeam[g.home_team] || []}
        />
      ))}
    </div>
  )
}

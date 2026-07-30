import { useEffect, useMemo, useState } from 'react'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { usePaydirtSims, useYardageSims } from './useLabSims.js'

// Mirrors CheatSheetTab's real shape (Going Yard): a small number of top-5-style ranked lists,
// each answering one narrow question fast -- opinionated, not exhaustive. Deliberately NOT a
// sortable table -- that's what All Matchups/Paydirt Lab/Yardage Lab are for. Every section here
// reuses data/scores already computed elsewhere (Paydirt/Yardage Lab's own sims, All Matchups'
// usage_sig, team_stats.json's defense ranks) rather than recomputing anything new.

function Card({ rank, playerId, name, team, opponent, position, stat, statLabel, sub }) {
  return (
    <div className="cheat-card">
      <span className="cheat-rank">{rank}</span>
      <PlayerAvatar playerId={playerId} name={name} />
      <div className="cheat-card-body">
        <div
          className="player-cell"
          style={{ fontWeight: 700 }}
          onClick={() => openPlayerSlide({ player_id: playerId, player_name: name, team, opponent, position })}
        >
          {name}
        </div>
        <div className="meta-line" style={{ margin: 0 }}>
          <button className="team-link" onClick={(e) => { e.stopPropagation(); openTeamSlide({ team }) }}>{team}</button>
          {opponent && (
            <>
              {' vs '}
              <button className="team-link" onClick={(e) => { e.stopPropagation(); openTeamSlide({ team: opponent, context: 'defense' }) }}>
                {opponent}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="cheat-stat">
        <div className="zone-score" style={{ fontSize: '1.1rem' }}>{stat}</div>
        <div className="meta-line small" style={{ margin: 0 }}>{statLabel}</div>
        {sub && <div className="meta-line small" style={{ margin: 0 }}>{sub}</div>}
      </div>
    </div>
  )
}

function Section({ emoji, title, note, children }) {
  return (
    <div className="cheat-section">
      <div className="cheat-section-header">
        <span>{emoji}</span>
        <span style={{ fontWeight: 700 }}>{title}</span>
      </div>
      {note && <div className="meta-line small" style={{ marginBottom: 8 }}>{note}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function useDefenseStats() {
  const [matchups, setMatchups] = useState(null)
  const [teamStats, setTeamStats] = useState(null)
  useEffect(() => {
    Promise.all([
      fetch('/data/all_matchups_latest.json').then((r) => (r.ok ? r.json() : null)),
      fetch('/data/team_stats.json').then((r) => (r.ok ? r.json() : {})),
    ]).then(([m, t]) => {
      setMatchups(m)
      setTeamStats(t)
    })
  }, [])
  return { matchups, teamStats }
}

export default function CheatSheetTab() {
  const paydirt = usePaydirtSims()
  const yardage = useYardageSims()
  const { matchups, teamStats } = useDefenseStats()

  const tdCandidates = useMemo(() => {
    if (!paydirt.rows) return null
    return [...paydirt.rows].sort((a, b) => b.sim_td_pct - a.sim_td_pct).slice(0, 5)
  }, [paydirt.rows])

  const yardageCandidates = useMemo(() => {
    if (!yardage.rows) return null
    return [...yardage.rows].sort((a, b) => b.sim_yard_pct - a.sim_yard_pct).slice(0, 5)
  }, [yardage.rows])

  const highFloor = useMemo(() => {
    if (!matchups) return null
    return [...matchups.matchups].sort((a, b) => b.usage_sig - a.usage_sig).slice(0, 5)
  }, [matchups])

  const attackableDefenses = useMemo(() => {
    if (!matchups || !teamStats) return null
    const opponents = [...new Set(matchups.matchups.map((m) => m.opponent))]
    return opponents
      .map((abbr) => ({ abbr, stats: teamStats[abbr] }))
      .filter((t) => t.stats)
      .sort((a, b) => (b.stats.def_yards_allowed_rank || 0) - (a.stats.def_yards_allowed_rank || 0))
      .slice(0, 5)
  }, [matchups, teamStats])

  return (
    <div>
      <p className="meta-line">
        Top 5 per category, this week only &middot; opinionated and fast, not exhaustive --
        for the full sortable data behind each one, see Paydirt Lab / Yardage Lab / All Matchups
      </p>
      <div className="cheat-grid">
        <Section
          emoji="🏈"
          title="TD Candidates"
          note="Top 5 by SimTD% (Paydirt Lab's own eligible pool and sims, reused as-is)"
        >
          {!tdCandidates ? (
            <p className="empty-state">Simulating...</p>
          ) : (
            tdCandidates.map((p, i) => (
              <Card
                key={i}
                rank={i + 1}
                playerId={p.player_id}
                name={p.player_name}
                team={p.team}
                opponent={p.opponent}
                position={p.position}
                stat={`${p.sim_td_pct.toFixed(1)}%`}
                statLabel="SimTD%"
                sub={`TrueTDScore ${p.gtd.toFixed(1)}`}
              />
            ))
          )}
        </Section>

        <Section
          emoji="🏃"
          title="Yardage Threshold Candidates"
          note="Top 5 by SimYard% (Yardage Lab's own sims, reused as-is)"
        >
          {!yardageCandidates ? (
            <p className="empty-state">Simulating...</p>
          ) : (
            yardageCandidates.map((p, i) => (
              <Card
                key={i}
                rank={i + 1}
                playerId={p.player_id}
                name={p.player_name}
                team={p.team}
                opponent={p.opponent}
                position={p.position}
                stat={`${p.sim_yard_pct.toFixed(1)}%`}
                statLabel="SimYard%"
                sub={`Est. ${p.est_yards.toFixed(0)} yds`}
              />
            ))
          )}
        </Section>

        <Section
          emoji="🎯"
          title="Most Attackable Defenses"
          note="Top 5 weakest defenses among this week's real opponents (overall yards-allowed rank)"
        >
          {!attackableDefenses ? (
            <p className="empty-state">Loading...</p>
          ) : (
            attackableDefenses.map((t, i) => (
              <div className="cheat-card" key={i}>
                <span className="cheat-rank">{i + 1}</span>
                {t.stats.logo && <img src={t.stats.logo} alt={t.abbr} className="avatar" />}
                <div className="cheat-card-body">
                  <div style={{ fontWeight: 700 }}>
                    <button className="team-link" onClick={() => openTeamSlide({ team: t.abbr, context: 'defense' })}>
                      {t.stats.team_name}
                    </button>
                  </div>
                  <div className="meta-line" style={{ margin: 0 }}>{t.stats.record}</div>
                </div>
                <div className="cheat-stat">
                  <div className="zone-score" style={{ fontSize: '1.1rem' }}>#{t.stats.def_yards_allowed_rank}</div>
                  <div className="meta-line small" style={{ margin: 0 }}>NFL rank</div>
                </div>
              </div>
            ))
          )}
        </Section>

        <Section
          emoji="📈"
          title="High-Floor / High-Usage"
          note="Top 5 by Usage Sig regardless of TD upside -- gets a lot of opportunities even without big-play juice"
        >
          {!highFloor ? (
            <p className="empty-state">Loading...</p>
          ) : (
            highFloor.map((p, i) => (
              <Card
                key={i}
                rank={i + 1}
                playerId={p.player_id}
                name={p.player_name}
                team={p.team}
                opponent={p.opponent}
                position={p.position}
                stat={p.usage_sig.toFixed(1)}
                statLabel="Usage Sig"
                sub={`${p.touches_per_game.toFixed(1)} touches/g`}
              />
            ))
          )}
        </Section>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { openTeamSlide } from './slideouts.js'

// The "NFL" tab -- named the same way Going Yard's own equivalent tab is literally labeled "MLB"
// (PROMPT_SixPoints_GoingYardParity.md #4), not "Standings". Real division standings from
// team_stats.json's win/loss/streak/points-for-against per team (already-collected data, no new
// source) plus conference/division (real nflverse import_team_desc() team_conf/team_division
// fields, added to build_team_stats() this session -- verified live 2026-09-14: matches the real
// 8-division NFL structure, e.g. ARI -> NFC West).
//
// Playoff seeding rule (verified against a real, current source before hardcoding, per the
// doc's own explicit caution -- NOT assumed from memory): 7 teams per conference make the
// playoffs -- the 4 division winners seeded 1-4, plus the next-best 3 non-division-winners
// seeded 5-7 as wild cards. Only the #1 seed gets a bye (the other 2020+ expansion rule this
// doc named explicitly). Real NFL tiebreakers (head-to-head, division record, common games,
// strength of victory/schedule) are a large, separate rules set -- this uses win_pct then
// point_diff as a simple, disclosed tiebreak instead of the full official procedure, same
// "explicit disclosed simplification, not a hidden one" convention as Pairs' same-team proxy.
//
// A team with an unplayed game this week simply won't appear yet (team_stats.json only has
// entries for teams with at least one completed game) -- shown as a real, disclosed gap rather
// than backfilled with a guessed 0-0 record from a hardcoded 32-team list.

const CONFERENCES = ['AFC', 'NFC']

function sortKey(t) {
  return [t.win_pct, t.point_diff]
}

function cmpTeams(a, b) {
  if (b.win_pct !== a.win_pct) return b.win_pct - a.win_pct
  return b.point_diff - a.point_diff
}

function TeamCell({ abbr, team }) {
  return (
    <button className="team-link" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => openTeamSlide({ team: abbr })}>
      {team.logo && <img src={team.logo} alt={abbr} className="avatar" />}
      {team.team_name || abbr}
    </button>
  )
}

function StandingsTable({ teams }) {
  const byConference = useMemo(() => {
    const out = {}
    for (const conf of CONFERENCES) {
      const confTeams = Object.entries(teams).filter(([, t]) => t.conference === conf)
      const divisions = {}
      for (const [abbr, t] of confTeams) {
        const div = t.division || 'Unknown'
        if (!divisions[div]) divisions[div] = []
        divisions[div].push({ abbr, ...t })
      }
      for (const div of Object.keys(divisions)) {
        divisions[div].sort(cmpTeams)
      }
      out[conf] = divisions
    }
    return out
  }, [teams])

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      {CONFERENCES.map((conf) => (
        <div key={conf} style={{ flex: '1 1 460px', minWidth: 380 }}>
          <h3 style={{ margin: '4px 0 10px' }}>{conf}</h3>
          {Object.keys(byConference[conf] || {}).sort().map((div) => (
            <div key={div} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', margin: '0 0 4px' }}>{div}</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="sticky-col">Team</th>
                      <th>W-L</th>
                      <th>Pct</th>
                      <th>PF</th>
                      <th>PA</th>
                      <th>Diff</th>
                      <th>Streak</th>
                      <th>Home</th>
                      <th>Away</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byConference[conf][div].map((t, i) => (
                      <tr key={t.abbr}>
                        <td className="sticky-col">
                          {i === 0 && <span className="tier tier-lock" style={{ marginRight: 6 }}>Leader</span>}
                          <TeamCell abbr={t.abbr} team={t} />
                        </td>
                        <td>{t.record}</td>
                        <td>{t.win_pct.toFixed(3)}</td>
                        <td>{t.points_for}</td>
                        <td>{t.points_against}</td>
                        <td className={t.point_diff > 0 ? 'zone-score' : undefined}>{t.point_diff > 0 ? '+' : ''}{t.point_diff}</td>
                        <td>{t.streak}</td>
                        <td>{t.home_record}</td>
                        <td>{t.away_record}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function PlayoffPicture({ teams }) {
  const byConference = useMemo(() => {
    const out = {}
    for (const conf of CONFERENCES) {
      const confTeams = Object.entries(teams)
        .filter(([, t]) => t.conference === conf)
        .map(([abbr, t]) => ({ abbr, ...t }))
      const divisions = {}
      for (const t of confTeams) {
        const div = t.division || 'Unknown'
        if (!divisions[div]) divisions[div] = []
        divisions[div].push(t)
      }
      const leaders = Object.values(divisions)
        .map((teamsInDiv) => [...teamsInDiv].sort(cmpTeams)[0])
        .filter(Boolean)
        .sort(cmpTeams)
      const leaderAbbrs = new Set(leaders.map((t) => t.abbr))
      const wildcards = confTeams.filter((t) => !leaderAbbrs.has(t.abbr)).sort(cmpTeams).slice(0, 3)
      const seeded = [...leaders, ...wildcards]
      out[conf] = seeded
    }
    return out
  }, [teams])

  const anyTeams = Object.keys(teams).length > 0

  return (
    <div>
      <p className="meta-line">
        Seed 1-4: the 4 division winners, ranked by win pct (point differential as tiebreak) &middot;
        seed 5-7: the next-best 3 teams league-wide regardless of division &middot; only the #1
        seed gets a first-round bye &middot; this is "if the season ended today" -- with 1 week
        played, these seeds will move a great deal before they mean anything real
      </p>
      {!anyTeams && <p className="empty-state">No completed games yet this season.</p>}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {CONFERENCES.map((conf) => (
          <div key={conf} style={{ flex: '1 1 380px', minWidth: 320 }}>
            <h3 style={{ margin: '4px 0 10px' }}>{conf}</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Seed</th>
                    <th className="sticky-col">Team</th>
                    <th>W-L</th>
                    <th>Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {(byConference[conf] || []).map((t, i) => (
                    <tr key={t.abbr}>
                      <td>
                        {i + 1}
                        {i === 0 && <span className="meta-line small" style={{ margin: '0 0 0 4px' }}>(bye)</span>}
                      </td>
                      <td className="sticky-col"><TeamCell abbr={t.abbr} team={t} /></td>
                      <td>{t.record}</td>
                      <td className={t.point_diff > 0 ? 'zone-score' : undefined}>{t.point_diff > 0 ? '+' : ''}{t.point_diff}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function NFLTab() {
  const [teams, setTeams] = useState(null)
  const [error, setError] = useState(null)
  const [sub, setSub] = useState('standings')

  useEffect(() => {
    fetch('/data/team_stats.json')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then(setTeams)
      .catch((e) => setError(e.message))
  }, [])

  if (error) {
    return (
      <p className="empty-state">
        No team stats yet ({error}). Run <code>python matchup_engine.py --season 2026</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!teams) return <p className="empty-state">Loading...</p>

  return (
    <div>
      <div className="sub-tabs">
        <button className={sub === 'standings' ? 'active' : ''} onClick={() => setSub('standings')}>
          Standings
        </button>
        <button className={sub === 'playoffs' ? 'active' : ''} onClick={() => setSub('playoffs')}>
          Playoff Picture
        </button>
      </div>
      {sub === 'standings' && <StandingsTable teams={teams} />}
      {sub === 'playoffs' && <PlayoffPicture teams={teams} />}
    </div>
  )
}

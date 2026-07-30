import { useEffect, useState } from 'react'
import { subscribeTeamSlide, closeTeamSlide } from './slideouts.js'

// Mirrors AppTeamSlideout (spec §6): header w/ record, home/away/last-10/streak/point-diff pill
// row, offense/defense stat blocks.

export default function TeamSlideout() {
  const [team, setTeam] = useState(null)
  const [stats, setStats] = useState(null)

  useEffect(() => subscribeTeamSlide(setTeam), [])

  useEffect(() => {
    if (!team) return
    setStats(null)
    fetch('/data/team_stats.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((all) => setStats(all[team.team] || null))
  }, [team?.team])

  if (!team) return null

  return (
    <>
      <div className="slideout-backdrop" onClick={closeTeamSlide} />
      <div className="slideout-panel">
        <div className="slideout-header">
          {stats?.logo && <img src={stats.logo} alt={team.team} className="avatar" />}
          <div className="slideout-header-info">
            <h2>{stats?.team_name || team.team}</h2>
            <div className="sub">{team.team} &middot; {stats?.record || '—'}</div>
          </div>
          <button className="slideout-close" onClick={closeTeamSlide} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="slideout-body">
          {!stats ? (
            <p className="empty-state">Loading...</p>
          ) : (
            <>
              <div className="slideout-section">
                <h3>Record</h3>
                <div className="stat-grid">
                  <div className="stat-tile">
                    <div className="value">{stats.record}</div>
                    <div className="label">Overall</div>
                  </div>
                  <div className="stat-tile">
                    <div className="value">{stats.home_record}</div>
                    <div className="label">Home</div>
                  </div>
                  <div className="stat-tile">
                    <div className="value">{stats.away_record}</div>
                    <div className="label">Away</div>
                  </div>
                  <div className="stat-tile">
                    <div className="value">{stats.last10}</div>
                    <div className="label">Last 10</div>
                  </div>
                  <div className="stat-tile">
                    <div className="value">{stats.streak}</div>
                    <div className="label">Streak</div>
                  </div>
                  <div className="stat-tile">
                    <div className="value">{stats.point_diff > 0 ? '+' : ''}{stats.point_diff}</div>
                    <div className="label">Point Diff</div>
                  </div>
                </div>
              </div>

              <div className="slideout-section">
                <h3>Offense</h3>
                <div className="stat-grid">
                  <div className="stat-tile">
                    <div className="value">{stats.points_pg}</div>
                    <div className="label">Pts/G</div>
                  </div>
                  <div className="stat-tile">
                    <div className="value">{stats.off_yards_pg ?? '—'}</div>
                    <div className="label">Yds/G</div>
                  </div>
                  <div className="stat-tile">
                    <div className="value">{stats.pass_pct != null ? `${stats.pass_pct}%` : '—'}</div>
                    <div className="label">Pass Play %</div>
                  </div>
                </div>
              </div>

              <div className="slideout-section">
                <h3>Defense</h3>
                <div className="stat-grid">
                  <div className="stat-tile">
                    <div className="value">{stats.points_allowed_pg}</div>
                    <div className="label">Pts Allowed/G</div>
                  </div>
                  <div className="stat-tile">
                    <div className="value">{stats.def_yards_allowed_pg ?? '—'}</div>
                    <div className="label">Yds Allowed/G</div>
                  </div>
                  <div className="stat-tile">
                    <div className="value">#{stats.def_yards_allowed_rank ?? '—'}</div>
                    <div className="label">NFL Rank</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

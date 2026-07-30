import { useEffect, useState } from 'react'
import { subscribeTeamSlide, closeTeamSlide } from './slideouts.js'

// Mirrors AppTeamSlideout (spec §6): header w/ record, home/away/last-10/streak/point-diff pill
// row, offense/defense stat blocks. When opened from an "opponent" column (context: 'defense'),
// leads with the Defense section instead of Record -- clicking an opponent is asking "how good
// is their defense against this position," not "what's their overall record."

function RecordSection({ stats }) {
  return (
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
  )
}

function OffenseSection({ stats }) {
  return (
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
  )
}

function DefenseSection({ stats, emphasized }) {
  return (
    <div className="slideout-section">
      <h3>{emphasized ? 'Defense (this matchup)' : 'Defense'}</h3>
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="value">{stats.points_allowed_pg}</div>
          <div className="label">Pts Allowed/G</div>
        </div>
        <div className="stat-tile">
          <div className="value">{stats.def_yards_allowed_pg ?? '—'}</div>
          <div className="label">Total Yds/G</div>
        </div>
        <div className="stat-tile">
          <div className="value">#{stats.def_yards_allowed_rank ?? '—'}</div>
          <div className="label">Overall Rank</div>
        </div>
        <div className="stat-tile">
          <div className="value">{stats.pass_yards_allowed_pg ?? '—'}</div>
          <div className="label">Pass Yds/G</div>
        </div>
        <div className="stat-tile">
          <div className="value">#{stats.pass_def_rank ?? '—'}</div>
          <div className="label">Pass Def Rank</div>
        </div>
        <div className="stat-tile">
          <div className="value">{stats.pass_td_allowed ?? '—'}</div>
          <div className="label">Pass TD Allowed</div>
        </div>
        <div className="stat-tile">
          <div className="value">{stats.rush_yards_allowed_pg ?? '—'}</div>
          <div className="label">Rush Yds/G</div>
        </div>
        <div className="stat-tile">
          <div className="value">#{stats.rush_def_rank ?? '—'}</div>
          <div className="label">Rush Def Rank</div>
        </div>
        <div className="stat-tile">
          <div className="value">{stats.rush_td_allowed ?? '—'}</div>
          <div className="label">Rush TD Allowed</div>
        </div>
      </div>
    </div>
  )
}

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

  const isDefenseContext = team.context === 'defense'

  return (
    <>
      <div className="slideout-backdrop" onClick={closeTeamSlide} />
      <div className="slideout-panel">
        <div className="slideout-header">
          {stats?.logo && <img src={stats.logo} alt={team.team} className="avatar" />}
          <div className="slideout-header-info">
            <h2>{stats?.team_name || team.team}</h2>
            <div className="sub">
              {team.team} &middot; {stats?.record || '—'}
              {isDefenseContext && <span className="tier tier-fringe" style={{ marginLeft: 8 }}>Opponent Defense</span>}
            </div>
            {stats?.stats_url && (
              <a href={stats.stats_url} target="_blank" rel="noopener noreferrer" className="external-link">
                View on ESPN &rarr;
              </a>
            )}
          </div>
          <button className="slideout-close" onClick={closeTeamSlide} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="slideout-body">
          {!stats ? (
            <p className="empty-state">Loading...</p>
          ) : isDefenseContext ? (
            <>
              <DefenseSection stats={stats} emphasized />
              <RecordSection stats={stats} />
              <OffenseSection stats={stats} />
            </>
          ) : (
            <>
              <RecordSection stats={stats} />
              <OffenseSection stats={stats} />
              <DefenseSection stats={stats} />
            </>
          )}
        </div>
      </div>
    </>
  )
}

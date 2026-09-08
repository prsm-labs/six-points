import { useEffect, useMemo, useState } from 'react'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'

// Item 10, PROMPT_SixPoints_SeasonKickoff_Prep.md: a real depth-chart browse page, from
// matchup_engine.py's new depth_charts.json (import_depth_charts(), previously pulled nowhere in
// this app despite being verified live back in session 1). Status badges are deliberately
// Out/Doubtful/Questionable ONLY -- real, verified values already powering injury_report.json/
// Green Light's gate. NO IR/PUP/DTD badges: IR/PUP would need import_seasonal_rosters()'s
// status_description_abbr field, whose real values (A01/W03/P01/R01/R48/etc, confirmed live) have
// no independently-verifiable code-to-label mapping without an authoritative NFL transaction-code
// legend, and DTD isn't a real NFL term at all (it's MLB/NHL/NBA) -- see the doc's own explicit
// caution before building either.

const SKILL_POSITIONS = ['QB', 'RB', 'WR', 'TE']

export default function DepthChartTab() {
  const [depthCharts, setDepthCharts] = useState(null)
  const [injuryReport, setInjuryReport] = useState(null)
  const [error, setError] = useState(null)
  const [team, setTeam] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/data/depth_charts.json').then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      }),
      fetch('/data/injury_report.json').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([dc, inj]) => {
        setDepthCharts(dc)
        setInjuryReport(inj)
        const teams = Object.keys(dc.teams).sort()
        setTeam(teams[0])
      })
      .catch((e) => setError(e.message))
  }, [])

  // Real Out/Doubtful/Questionable status per player, from the most recent real week the
  // injury report has data for -- same real data InactivesTab/Green Light's gate already use.
  const statusByPlayer = useMemo(() => {
    if (!injuryReport) return {}
    const weeks = Object.keys(injuryReport.weeks).map(Number).sort((a, b) => b - a)
    const latestWithData = weeks.find((w) => (injuryReport.weeks[w] || []).length > 0)
    const rows = latestWithData != null ? injuryReport.weeks[latestWithData] : []
    const map = {}
    for (const r of rows) map[r.name] = r.status
    return map
  }, [injuryReport])

  if (error) {
    return (
      <p className="empty-state">
        No depth chart data yet ({error}). Run <code>python matchup_engine.py --season 2026 --week N</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!depthCharts) return <p className="empty-state">Loading...</p>

  const teams = Object.keys(depthCharts.teams).sort()
  const teamChart = team ? depthCharts.teams[team] : null
  const positions = teamChart
    ? SKILL_POSITIONS.filter((p) => teamChart[p]).concat(
        Object.keys(teamChart).filter((p) => !SKILL_POSITIONS.includes(p)).sort()
      )
    : []

  return (
    <div>
      <p className="meta-line">
        Real 2026 depth chart (import_depth_charts()) &middot; skill positions (QB/RB/WR/TE) up
        top since those are what the rest of the app has real stats for &middot; a status badge
        appears next to a player on the current real injury report (Out/Doubtful/Questionable)
      </p>
      <div className="calc-block" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, maxWidth: 'none', marginBottom: 16 }}>
        <label style={{ minWidth: 160 }}>
          Team
          <select value={team || ''} onChange={(e) => setTeam(e.target.value)}>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      {teamChart && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          {positions.map((pos) => (
            <div key={pos} style={{ flex: '1 1 220px', minWidth: 200 }}>
              <h4 style={{ margin: '0 0 6px' }}>{pos}</h4>
              <div className="table-wrap">
                <table>
                  <tbody>
                    {teamChart[pos].map((p, i) => {
                      const status = p.name ? statusByPlayer[p.name] : null
                      return (
                        <tr key={i}>
                          <td style={{ width: 24 }}>{p.pos_rank ?? '—'}</td>
                          <td>
                            <div
                              className="player-cell"
                              onClick={() => openPlayerSlide({ player_id: p.player_id, player_name: p.name, team, position: pos })}
                            >
                              <PlayerAvatar playerId={p.player_id} name={p.name} />
                              {p.name || 'Unknown'}
                            </div>
                          </td>
                          <td>
                            {status && (
                              <span className={status === 'Out' ? 'tier tier-fade' : status === 'Doubtful' ? 'tier tier-fringe' : 'tier tier-lean'}>
                                {status}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="meta-line" style={{ marginTop: 16 }}>
        <button className="team-link" onClick={() => openTeamSlide({ team })}>View {team} team page &rarr;</button>
      </p>
    </div>
  )
}

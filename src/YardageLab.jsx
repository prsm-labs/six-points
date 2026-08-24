import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { useYardageSims, thresholdFor } from './useLabSims.js'

export default function YardageLab() {
  const { rows, error, status } = useYardageSims()

  if (error) {
    return (
      <p className="empty-state">
        No matchup data yet ({error}). Run <code>python matchup_engine.py --season 2025 --week N</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!rows) {
    return (
      <p className="empty-state">
        {status === 'simulating' ? 'Running 10,000 sims per player...' : 'Loading...'}
      </p>
    )
  }

  return <YardageTable rows={rows} />
}

function YardageTable({ rows }) {
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, 'sim_yard_pct', 'desc')
  const thProps = { sortKey, sortDir, onSort: toggleSort }

  return (
    <div>
      <p className="meta-line">
        {rows.length} players simulated &middot; threshold is 60+ rush yds (RB), 75+ rec yds
        (WR/TE), 225+ pass yds (QB) &middot; Yardage Signal gate is empirical (top-quartile
        OnFieldScore + SimYard%, MatchupScore &ge; 60) &middot; Est. Yards is a simple point
        estimate (touches/game &times; yards/touch), SimYard% is the probability of actually
        clearing that player's threshold &middot; click a column header to sort
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh label="Team" sortKeyName="team" className="sticky-col" {...thProps} />
              <SortTh label="Opp" sortKeyName="opponent" {...thProps} />
              <SortTh label="Player" sortKeyName="player_name" {...thProps} />
              <SortTh label="Pos" sortKeyName="position" {...thProps} />
              <SortTh label="Touches/G" sortKeyName="touches_per_game" {...thProps} />
              <SortTh label="Yds/Touch" sortKeyName="ypt" {...thProps} />
              <SortTh label="Est. Yards" sortKeyName="est_yards" {...thProps} />
              <SortTh label="Threshold" sortKeyName="position" {...thProps} />
              <SortTh label="OnFieldScore" sortKeyName="on_field_score" {...thProps} />
              <SortTh label="MatchupScore" sortKeyName="opp_def_rank_pct" {...thProps} />
              <SortTh label="SimYard%" sortKeyName="sim_yard_pct" {...thProps} />
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={i}>
                <td className="sticky-col">
                  <button className="team-link" onClick={() => openTeamSlide({ team: p.team })}>
                    {p.team}
                  </button>
                </td>
                <td>
                  <button className="team-link" onClick={() => openTeamSlide({ team: p.opponent, context: 'defense' })}>
                    {p.opponent}
                  </button>
                </td>
                <td>
                  <div className="player-cell" onClick={() => openPlayerSlide(p)}>
                    <PlayerAvatar playerId={p.player_id} name={p.player_name} />
                    {p.player_name}
                  </div>
                </td>
                <td>{p.position}</td>
                <td>{Number(p.touches_per_game).toFixed(1)}</td>
                <td>{Number(p.ypt).toFixed(1)}</td>
                <td className="zone-score">{p.est_yards.toFixed(1)}</td>
                <td>{thresholdFor(p.position)}+</td>
                <td>{p.on_field_score.toFixed(1)}</td>
                <td>{Number(p.opp_def_rank_pct).toFixed(1)}</td>
                <td>{p.sim_yard_pct.toFixed(1)}%</td>
                <td>{p.yardage_signal ? <span className="tier tier-lean">Yardage</span> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

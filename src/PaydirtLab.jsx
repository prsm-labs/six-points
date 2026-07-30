import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { usePaydirtSims } from './useLabSims.js'

export default function PaydirtLab() {
  const { rows, error, status } = usePaydirtSims()

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

  return <PaydirtTable rows={rows} />
}

function PaydirtTable({ rows }) {
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, 'sim_td_pct', 'desc')
  const thProps = { sortKey, sortDir, onSort: toggleSort }

  return (
    <div>
      <p className="meta-line">
        {rows.length} eligible players (top-2 red-zone touch option per team) &middot; SimTD% from
        10,000 simulated games each &middot; Paydirt Signal gate is empirical (top-quartile
        TrueTDScore + SimTD%, MatchupScore &ge; 60) since no absolute threshold has been validated
        yet &middot; click a column header to sort
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh label="Team" sortKeyName="team" {...thProps} />
              <SortTh label="Opp" sortKeyName="opponent" {...thProps} />
              <SortTh label="Player" sortKeyName="player_name" {...thProps} />
              <SortTh label="Pos" sortKeyName="position" {...thProps} />
              <SortTh label="Touches/G" sortKeyName="touches_per_game" {...thProps} />
              <SortTh label="RZ Touches/G" sortKeyName="redzone_touches_per_game" {...thProps} />
              <SortTh label="TrueTDScore" sortKeyName="gtd" {...thProps} />
              <SortTh label="MatchupScore" sortKeyName="opp_def_rank_pct" {...thProps} />
              <SortTh label="SimTD%" sortKeyName="sim_td_pct" {...thProps} />
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={i}>
                <td>
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
                <td>{Number(p.redzone_touches_per_game).toFixed(1)}</td>
                <td>{Number(p.gtd).toFixed(1)}</td>
                <td>{Number(p.opp_def_rank_pct).toFixed(1)}</td>
                <td className="zone-score">{p.sim_td_pct.toFixed(1)}%</td>
                <td>{p.paydirt_signal ? <span className="tier tier-lock">Paydirt</span> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

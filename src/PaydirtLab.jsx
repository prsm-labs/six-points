import { useMemo, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { usePaydirtSims } from './useLabSims.js'
import { useMatchup, isInSelectedMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import { setPosition, usePosition } from './positionFilter.js'
import { fmtPct, GradeBadge } from './gradeUi.jsx'

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
  const position = usePosition() // app-wide (positionFilter.js) -- this dropdown and the chip row share one value
  const [team, setTeam] = useState('all')
  const [search, setSearch] = useState('')
  const { selectedMatchup } = useMatchup()

  const teams = useMemo(() => [...new Set(rows.map((r) => r.team))].filter(Boolean).sort(), [rows])
  const filtered = useMemo(() => {
    return rows
      .filter((r) => position === 'all' || r.position === position)
      .filter((r) => selectedMatchup ? isInSelectedMatchup(selectedMatchup, r.team) : (team === 'all' || r.team === team))
      .filter((r) => !search || r.player_name.toLowerCase().includes(search.toLowerCase()))
  }, [rows, position, team, search, selectedMatchup])

  const graded = rows.some((p) => p.p_td != null)
  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtered, graded ? 'p_td' : 'sim_td_pct', 'desc')
  const thProps = { sortKey, sortDir, onSort: toggleSort }

  return (
    <div>
      <div className="calc-block" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, maxWidth: 'none', marginBottom: 12 }}>
        <label style={{ minWidth: 110 }}>
          Position
          <select value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="all">All</option>
            <option value="QB">QB</option>
            <option value="RB">RB</option>
            <option value="WR">WR</option>
            <option value="TE">TE</option>
          </select>
        </label>
        <label style={{ minWidth: 110 }}>
          Team
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="all">All</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label style={{ flex: 1, minWidth: 160 }}>
          Player
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search player name..." />
        </label>
      </div>
      <MatchupFilterNote />
      <p className="meta-line">
        {sorted.length} of {rows.length} eligible players (top-2 red-zone touch option per team)
        {graded
          ? <> &middot; <strong>Paydirt Signal</strong> = top quarter of this pool by the grade model's
            TD % (switched from the old gTD + SimTD% + MatchupScore gate on 2026-10-11). Backtest
            2023-2025, same pool: 48.6% of signals scored (49% / 48% / 49% by season) vs 42.9% for the
            old gate and 32% for the whole pool</>
          : <> &middot; Paydirt Signal gate is empirical (top-quartile TrueTDScore + SimTD%,
            MatchupScore &ge; 60)</>}
        {' '}&middot; click a column header to sort
      </p>
      {graded && (
        <p className="meta-line small">
          SimTD% (10,000 simulated games each) is kept as a scenario number only. On 2023-2025 it ranked
          these players worse than the grade model (AUC .58 vs .68) and was badly spread: its top fifth
          said 63% and scored 40%, its bottom fifth said 4% and scored 22%.
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh label="Team" sortKeyName="team" className="sticky-col" {...thProps} />
              <SortTh label="Opp" sortKeyName="opponent" {...thProps} />
              <SortTh label="Player" sortKeyName="player_name" {...thProps} />
              <SortTh label="Pos" sortKeyName="position" {...thProps} />
              <SortTh label="Touches/G" sortKeyName="touches_per_game" {...thProps} />
              <SortTh label="RZ Touches/G" sortKeyName="redzone_touches_per_game" {...thProps} />
              <SortTh label="TrueTDScore" sortKeyName="gtd" {...thProps} />
              <SortTh label="MatchupScore" sortKeyName="opp_def_rank_pct" {...thProps} />
              {graded && <SortTh label="TD %" sortKeyName="p_td" {...thProps} />}
              <SortTh label="SimTD%" sortKeyName="sim_td_pct" {...thProps} />
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
                <td>{Number(p.redzone_touches_per_game).toFixed(1)}</td>
                <td>{Number(p.gtd).toFixed(1)}</td>
                <td>{Number(p.opp_def_rank_pct).toFixed(1)}</td>
                {graded && <td className="zone-score">{fmtPct(p.p_td)} <GradeBadge grade={p.grade} /></td>}
                <td className={graded ? undefined : 'zone-score'}>{p.sim_td_pct.toFixed(1)}%</td>
                <td>{p.paydirt_signal ? <span className="tier tier-lock">Paydirt</span> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

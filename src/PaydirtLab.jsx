import { useMemo, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { usePaydirtSims } from './useLabSims.js'
import { useMatchup, isInSelectedMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import { setPosition, usePosition } from './positionFilter.js'
import { fmtPct, GradeBadge } from './gradeUi.jsx'
import { DepthTag, RoleChip, RzMatchupCell, pct1, useGradeModel } from './matchupUi.jsx'
import { PAYDIRT_MIN_RZ, PAYDIRT_SIGNAL_N } from './useLabSims.js'
import PickButton from './PickButton.jsx'
import { useMasterSearch, useMasterTeam } from './masterFilter.js'

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
  const team = useMasterTeam() || 'all' // 2026-10-23: from the header (MasterFilter); this page's picker retired
  const search = useMasterSearch() // 2026-10-23: the header search; this page's box retired
  const { selectedMatchup } = useMatchup()
  const model = useGradeModel()
  const pools = model?.validation?.paydirt?.pools

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
      </div>
      <MatchupFilterNote />
      <p className="meta-line">
        {graded
          ? <>{sorted.length} of {rows.length} players with a red-zone role ({PAYDIRT_MIN_RZ}+ red-zone touches a game,
            has played this season, not Out/Doubtful) &middot; <strong>Paydirt Signal</strong> = the slate's top {PAYDIRT_SIGNAL_N} by the
            grade model's TD %</>
          : <>{sorted.length} of {rows.length} eligible players (top-2 red-zone touch option per team) &middot; Paydirt
            Signal gate is empirical (top-quartile TrueTDScore + SimTD%, MatchupScore &ge; 60)</>}
        {' '}&middot; click a column header to sort
      </p>
      {graded && pools?.length === 2 && (
        <p className="meta-line small">
          Backtest 2023-2025: this pool averaged {pools[1].players_per_slate} players a week and held{' '}
          {pct1(pools[1].share_of_td_scorers_in_pool)} of the players who actually scored, vs{' '}
          {pools[0].players_per_slate} and {pct1(pools[0].share_of_td_scorers_in_pool)} for the old top-2-per-team pool.
          The top {PAYDIRT_SIGNAL_N} scored {pct1(pools[1].signal_td_rate)} of the time
          ({Object.values(pools[1].signal_by_season).map((v) => pct1(v)).join(' / ')} by season). RZ Matchup = red-zone
          touches the opponent allows the position vs league average (hover for TDs allowed). It's one of TD %'s
          inputs, but a small one: held out, position matchups barely changed TD odds once a player's role was
          known -- they show up in yards (Yardage Lab).
        </p>
      )}
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
              <SortTh label="RZ Matchup" sortKeyName="mu_rz_idx" {...thProps} />
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
                    {p.player_name} <PickButton player={p} compact prop="td" /> <RoleChip m={p} />
                  </div>
                </td>
                <td>{p.position}<DepthTag m={p} /></td>
                <td>{Number(p.touches_per_game).toFixed(1)}</td>
                <td>{Number(p.redzone_touches_per_game).toFixed(1)}</td>
                <td>{Number(p.gtd).toFixed(1)}</td>
                <td><RzMatchupCell m={p} /></td>
                {graded && <td className="zone-score">{fmtPct(p.p_td)} <GradeBadge grade={p.grade} m={p} /></td>}
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

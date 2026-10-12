import { useMemo, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { useYardageSims, thresholdFor } from './useLabSims.js'
import { useMatchup, isInSelectedMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import { setPosition, usePosition } from './positionFilter.js'
import { DepthTag, MatchupCell, RoleChip, fmtYds, leakSummary, pct1, useGradeModel } from './matchupUi.jsx'
import { YARDAGE_SIGNAL_N } from './useLabSims.js'

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
  const position = usePosition() // app-wide (positionFilter.js) -- this dropdown and the chip row share one value
  const [team, setTeam] = useState('all')
  const [search, setSearch] = useState('')
  const { selectedMatchup } = useMatchup()
  const model = useGradeModel()
  const modeled = rows.some((r) => r.line_pct != null)

  const teams = useMemo(() => [...new Set(rows.map((r) => r.team))].filter(Boolean).sort(), [rows])
  const filtered = useMemo(() => {
    return rows
      .filter((r) => position === 'all' || r.position === position)
      .filter((r) => selectedMatchup ? isInSelectedMatchup(selectedMatchup, r.team) : (team === 'all' || r.team === team))
      .filter((r) => !search || r.player_name.toLowerCase().includes(search.toLowerCase()))
  }, [rows, position, team, search, selectedMatchup])

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtered, modeled ? 'line_pct' : 'sim_yard_pct', 'desc')
  const yv = model?.validation?.yards
  const ylab = model?.validation?.yardage_lab
  const terc = model?.validation?.matchup?.yards_vs_usage_by_tercile
  const thProps = { sortKey, sortDir, onSort: toggleSort }

  return (
    <div>
      <div className="calc-block" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, maxWidth: 'none', marginBottom: 12 }}>
        <label style={{ minWidth: 110 }}>
          Position
          <select value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="all">All</option>
            {!modeled && <option value="QB">QB</option>}
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
      {modeled ? (
        <>
          <p className="meta-line">
            {sorted.length} of {rows.length} RBs / WRs / TEs &middot; line is 60+ scrimmage yards (RB), 75+ (WR/TE)
            &middot; <strong>Est. Yards</strong> = his targets and carries at his own yards per target / carry, adjusted
            for what this opponent gives up to his position (deep vs short passes, yards per carry) &middot;
            <strong> Matchup</strong> = how soft that is for his role vs the rest of his position this week, and how many
            of his Est. Yards it adds or takes away (hover for the breakdown) &middot; <strong>Line %</strong> = chance
            he clears his line &middot; <strong>Yardage Signal</strong> = the slate's top {YARDAGE_SIGNAL_N} by Line %
          </p>
          {yv && ylab && terc && (
            <p className="meta-line small">
              Backtest 2023-2025, each season held out, actual yards minus the usage-only projection: RBs in soft
              matchups {Object.values(terc.RB?.soft || {}).map(fmtYds).join(' / ')} yds a game vs
              {' '}{Object.values(terc.RB?.tough || {}).map(fmtYds).join(' / ')} in tough ones; TEs
              {' '}{Object.values(terc.TE?.soft || {}).map(fmtYds).join(' / ')} vs {Object.values(terc.TE?.tough || {}).map(fmtYds).join(' / ')};
              WRs {Object.values(terc.WR?.soft || {}).map(fmtYds).join(' / ')} vs {Object.values(terc.WR?.tough || {}).map(fmtYds).join(' / ')}.
              Real but small next to a typical miss of {yv.RB?.with_matchup?.mae} yds (RB) / {yv.WR?.with_matchup?.mae} (WR),
              so it adjusts Est. Yards rather than driving it{yv.WR && !yv.WR.matchup_used
                ? ' -- for WRs it made held-out projections slightly worse, so WR matchups show a tier but add 0 yards'
                : ''}. Yardage Signal hit its line {pct1(ylab.gates?.[2]?.hit_rate)} of the time vs{' '}
              {pct1(ylab.gates?.[3]?.hit_rate)} for the old sim's own top {YARDAGE_SIGNAL_N}, {pct1(ylab.gates?.[1]?.hit_rate)} for
              the old OnFieldScore + MatchupScore + SimYard% gate and {pct1(ylab.gates?.[0]?.hit_rate)} for everyone in the lab.
              SimYard% (the old 10,000-game sim, no matchup) is kept for reference.
            </p>
          )}
        </>
      ) : (
        <p className="meta-line">
          {sorted.length} of {rows.length} players simulated &middot; threshold is 60+ rush yds
          (RB), 75+ rec yds (WR/TE), 225+ pass yds (QB) &middot; Yardage Signal gate is empirical
          (top-quartile OnFieldScore + SimYard%, MatchupScore &ge; 60) &middot; Est. Yards is a
          simple point estimate (touches/game &times; yards/touch), SimYard% is the probability of
          actually clearing that player's threshold &middot; click a column header to sort
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
              <SortTh label="Yds/Touch" sortKeyName="ypt" {...thProps} />
              <SortTh label="Est. Yards" sortKeyName="est_yards" {...thProps} />
              <SortTh label="Threshold" sortKeyName="position" {...thProps} />
              {modeled ? (
                <>
                  <SortTh label="Matchup" sortKeyName="mu_yds" {...thProps} />
                  <SortTh label="Line %" sortKeyName="line_pct" {...thProps} />
                </>
              ) : (
                <>
                  <SortTh label="OnFieldScore" sortKeyName="on_field_score" {...thProps} />
                  <SortTh label="MatchupScore" sortKeyName="opp_def_rank_pct" {...thProps} />
                </>
              )}
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
                    {p.player_name} <RoleChip m={p} />
                  </div>
                </td>
                <td>{p.position}<DepthTag m={p} /></td>
                <td>{Number(p.touches_per_game).toFixed(1)}</td>
                <td>{Number(p.ypt).toFixed(1)}</td>
                <td className="zone-score">{p.est_yards.toFixed(1)}</td>
                <td>{thresholdFor(p.position)}+</td>
                {modeled ? (
                  <>
                    <td><MatchupCell m={p} /></td>
                    <td className="zone-score" title={leakSummary(p)}>{p.line_pct != null ? `${Math.round(p.line_pct * 100)}%` : '—'}</td>
                  </>
                ) : (
                  <>
                    <td>{p.on_field_score.toFixed(1)}</td>
                    <td>{Number(p.opp_def_rank_pct).toFixed(1)}</td>
                  </>
                )}
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

import { useEffect, useMemo, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { useMatchup, isInSelectedMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'

// Role Report -- requested 2026-10-04 after the user showed a real props-tout breakdown
// ("x3.00 role leak", target share, longshot odds) and asked where in the app to get something
// like that. This is the half of it we can build HONESTLY off real, already-computed data: real
// season-to-date target_share/carry_share (compute_player_touch_shares, previously only
// consumed by Game Sim's own box-score projection, not surfaced as its own page) joined against
// usage_sig/zone_score/redzone_touches_per_game/opp_def_rank_pct (all_matchups_latest.json,
// already exported). No new pipeline computation -- purely a new client-side join + table over
// two files that already exist, same "reuse what's already computed" convention as Cheat
// Sheets/Red Zone.
//
// predicted_tier (Fade/Fringe/Lean/Lock) is computed here the same way score_week() computes it
// for track_record.csv: a within-week, league-wide percentile rank of zone_score, binned at
// 50/75/90 -- NOT a separate invented cutoff, the identical real methodology, just run
// client-side against this week's live matchups instead of a graded historical week.
//
// Deliberately NOT built here: the "vs. the betting market" half of that screenshot (the actual
// "leak" number, which compares a role projection against real sportsbook prop odds). This app
// has no player-prop odds data source at all -- see PROMPT_SixPoints_RoleLeak_PropsOdds_Scope.md
// for what that would actually require before it's built, same as Push Notifications got its own
// scope doc instead of a guessed implementation.

function tierClass(tier) {
  switch (tier) {
    case 'Lock':
      return 'tier tier-lock'
    case 'Lean':
      return 'tier tier-lean'
    case 'Fringe':
      return 'tier tier-fringe'
    default:
      return 'tier tier-fade'
  }
}

function withPredictedTier(matchups) {
  const sorted = [...matchups].sort((a, b) => a.zone_score - b.zone_score)
  const n = sorted.length
  const pctById = new Map()
  sorted.forEach((m, i) => {
    // match pandas' rank(pct=True) average-rank-for-ties behavior closely enough for display
    // purposes -- ties are rare at this precision and this is a display tier, not a scored field.
    pctById.set(m.player_id, (i + 1) / n)
  })
  return matchups.map((m) => {
    const pct = pctById.get(m.player_id) ?? 0
    let tier = 'Fade'
    if (pct > 0.9) tier = 'Lock'
    else if (pct > 0.75) tier = 'Lean'
    else if (pct > 0.5) tier = 'Fringe'
    return { ...m, predicted_tier: tier }
  })
}

export default function RoleReportTab() {
  const [matchupData, setMatchupData] = useState(null)
  const [simData, setSimData] = useState(null)
  const [error, setError] = useState(null)
  const [position, setPosition] = useState('all')
  const [team, setTeam] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/data/all_matchups_latest.json').then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      }),
      fetch('/data/game_sim_inputs.json').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([matchups, sim]) => {
        setMatchupData(matchups)
        setSimData(sim)
      })
      .catch((e) => setError(e.message))
  }, [])

  const rows = useMemo(() => {
    if (!matchupData) return []
    const shares = simData?.players || {}
    const withTiers = withPredictedTier(matchupData.matchups)
    return withTiers.map((m) => {
      const s = shares[m.player_id]
      return {
        ...m,
        target_share: s?.target_share ?? null,
        carry_share: s?.carry_share ?? null,
        catch_rate: s?.catch_rate ?? null,
      }
    })
  }, [matchupData, simData])

  const teams = useMemo(() => [...new Set(rows.map((r) => r.team))].sort(), [rows])
  const { selectedMatchup } = useMatchup()
  const filtered = useMemo(() => {
    return rows
      .filter((r) => position === 'all' || r.position === position)
      .filter((r) => selectedMatchup ? isInSelectedMatchup(selectedMatchup, r.team) : (team === 'all' || r.team === team))
      .filter((r) => !search || r.player_name.toLowerCase().includes(search.toLowerCase()))
  }, [rows, position, team, search, selectedMatchup])

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtered, 'zone_score', 'desc')
  const thProps = { sortKey, sortDir, onSort: toggleSort }

  if (error) {
    return (
      <p className="empty-state">
        No matchup data yet ({error}). Run <code>python matchup_engine.py --season 2026</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!matchupData) return <p className="empty-state">Loading...</p>

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
        Week {matchupData.week} &middot; real season-to-date target share / carry share
        (compute_player_touch_shares) joined against Usage Sig, opponent matchup percentile, and
        Zone Score &middot; Tier is the same within-week percentile cut Track Record grades
        against (top 10% Lock, next 15% Lean, next 25% Fringe, rest Fade) &middot; this is role/
        opportunity data, NOT a comparison against betting-market odds -- no player-prop odds
        feed exists in this app yet (see PROMPT_SixPoints_RoleLeak_PropsOdds_Scope.md)
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh label="Player" sortKeyName="player_name" className="sticky-col" {...thProps} />
              <SortTh label="Team" sortKeyName="team" {...thProps} />
              <SortTh label="Opp" sortKeyName="opponent" {...thProps} />
              <SortTh label="Pos" sortKeyName="position" {...thProps} />
              <SortTh label="Tier" sortKeyName="predicted_tier" {...thProps} />
              <SortTh label="Zone Score" sortKeyName="zone_score" {...thProps} />
              <SortTh label="Usage Sig" sortKeyName="usage_sig" {...thProps} />
              <SortTh label="Target Share" sortKeyName="target_share" {...thProps} />
              <SortTh label="Carry Share" sortKeyName="carry_share" {...thProps} />
              <SortTh label="RZ Touches/G" sortKeyName="redzone_touches_per_game" {...thProps} />
              <SortTh label="Opp Def %ile" sortKeyName="opp_def_rank_pct" {...thProps} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, i) => (
              <tr key={i}>
                <td className="sticky-col">
                  <div className="player-cell" onClick={() => openPlayerSlide(m)}>
                    <PlayerAvatar playerId={m.player_id} name={m.player_name} />
                    {m.player_name}
                    {m.thin_sample && <span className="meta-line small" style={{ marginLeft: 6 }}>(thin sample)</span>}
                  </div>
                </td>
                <td>
                  <button className="team-link" onClick={() => openTeamSlide({ team: m.team })}>{m.team}</button>
                </td>
                <td>
                  <button className="team-link" onClick={() => openTeamSlide({ team: m.opponent, context: 'defense' })}>{m.opponent}</button>
                </td>
                <td>{m.position}</td>
                <td><span className={tierClass(m.predicted_tier)}>{m.predicted_tier}</span></td>
                <td className="zone-score">{Number(m.zone_score).toFixed(1)}</td>
                <td>{Number(m.usage_sig).toFixed(1)}</td>
                <td>{m.target_share != null ? `${(m.target_share * 100).toFixed(1)}%` : '—'}</td>
                <td>{m.carry_share != null ? `${(m.carry_share * 100).toFixed(1)}%` : '—'}</td>
                <td>{Number(m.redzone_touches_per_game).toFixed(1)}</td>
                <td>{m.opp_def_rank_pct != null ? Number(m.opp_def_rank_pct).toFixed(0) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

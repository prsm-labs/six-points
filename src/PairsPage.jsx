import { useEffect, useMemo, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { useMatchup, isInSelectedMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import { useMasterSearch, useMasterTeam } from './masterFilter.js'

function buildPairs(matchups) {
  // Concept doc §8: stack two players exploiting the SAME scheme weakness, not just shared
  // form. Proxy used here (no route-tree/coverage-scheme data available yet): teammates facing
  // the same opponent who both individually clear a favorable-matchup bar are, by construction, both
  // exploiting the same defense's weakness that week. Bar (2026-10-12) = mu_pct >= 60, the position
  // yardage matchup for each player's own role (matchupUi.jsx); old opp_def_rank_pct only as fallback.
  const byTeam = {}
  for (const p of matchups) {
    if ((p.mu_pct ?? p.opp_def_rank_pct) < 60) continue
    if (!byTeam[p.team]) byTeam[p.team] = []
    byTeam[p.team].push(p)
  }

  const pairs = []
  for (const team of Object.keys(byTeam)) {
    const ranked = byTeam[team].sort((a, b) => b.zone_score - a.zone_score)
    for (let i = 0; i < ranked.length; i++) {
      for (let j = i + 1; j < ranked.length; j++) {
        pairs.push({
          team,
          opponent: ranked[i].opponent,
          playerA: ranked[i],
          playerB: ranked[j],
          combinedScore: ranked[i].zone_score + ranked[j].zone_score,
        })
      }
    }
  }
  return pairs.sort((a, b) => b.combinedScore - a.combinedScore).slice(0, 30)
}

export default function PairsPage() {
  const [pairs, setPairs] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/data/all_matchups_latest.json')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then((data) => setPairs(buildPairs(data.matchups)))
      .catch((e) => setError(e.message))
  }, [])

  if (error) {
    return (
      <p className="empty-state">
        No matchup data yet ({error}). Run <code>python matchup_engine.py --season 2025 --week N</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!pairs) return <p className="empty-state">Loading...</p>

  return <PairsTable pairs={pairs} />
}

function PairsTable({ pairs }) {
  const team = useMasterTeam() || 'all' // 2026-10-23: from the header (MasterFilter); this page's picker retired
  const search = useMasterSearch() // 2026-10-23: the header search; this page's box retired
  const { selectedMatchup } = useMatchup()

  const teams = useMemo(() => [...new Set(pairs.map((p) => p.team))].filter(Boolean).sort(), [pairs])
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return pairs
      .filter((p) => selectedMatchup ? isInSelectedMatchup(selectedMatchup, p.team) : (team === 'all' || p.team === team))
      .filter((p) => !q || p.playerA.player_name.toLowerCase().includes(q) || p.playerB.player_name.toLowerCase().includes(q))
  }, [pairs, team, search, selectedMatchup])

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtered, 'combinedScore', 'desc')
  const thProps = { sortKey, sortDir, onSort: toggleSort }

  return (
    <div>
      <div className="calc-block" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, maxWidth: 'none', marginBottom: 12 }}>
      </div>
      <MatchupFilterNote />
      <p className="meta-line">
        {sorted.length} of top {pairs.length} same-team pairs where both players individually
        have a favorable matchup for their own role (60th percentile or better vs their position:
        yards the opponent allows on the targets / carries each one actually gets) -- both exploiting
        the same defense that week &middot; click a column header to sort
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh label="Team" sortKeyName="team" {...thProps} />
              <SortTh label="Opp" sortKeyName="opponent" {...thProps} />
              <th>Player A</th>
              <th>Player B</th>
              <SortTh label="Combined Zone Score" sortKeyName="combinedScore" {...thProps} />
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
                  <div className="player-cell" onClick={() => openPlayerSlide(p.playerA)}>
                    <PlayerAvatar playerId={p.playerA.player_id} name={p.playerA.player_name} />
                    {p.playerA.player_name} ({p.playerA.position}) &middot;{' '}
                    {p.playerA.zone_score.toFixed(1)}
                  </div>
                </td>
                <td>
                  <div className="player-cell" onClick={() => openPlayerSlide(p.playerB)}>
                    <PlayerAvatar playerId={p.playerB.player_id} name={p.playerB.player_name} />
                    {p.playerB.player_name} ({p.playerB.position}) &middot;{' '}
                    {p.playerB.zone_score.toFixed(1)}
                  </div>
                </td>
                <td className="zone-score">{p.combinedScore.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

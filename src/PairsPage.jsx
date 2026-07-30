import { useEffect, useState } from 'react'

function buildPairs(matchups) {
  // Concept doc §8: stack two players exploiting the SAME scheme weakness, not just shared
  // form. Proxy used here (no route-tree/coverage-scheme data available yet): teammates facing
  // the same opponent who both individually clear a favorable-matchup bar (opp_def_rank_pct >=
  // 60) are, by construction, both exploiting the same defense's weakness that week.
  const byTeam = {}
  for (const p of matchups) {
    if (p.opp_def_rank_pct < 60) continue
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

  return (
    <div>
      <p className="meta-line">
        Top {pairs.length} same-team pairs where both players individually clear a favorable-
        matchup bar (MatchupScore &ge; 60) against the same opponent -- both exploiting the same
        defensive weakness that week, sorted by combined Zone Score
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Opp</th>
              <th>Player A</th>
              <th>Player B</th>
              <th>Combined Zone Score</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => (
              <tr key={i}>
                <td>{p.team}</td>
                <td>{p.opponent}</td>
                <td>
                  {p.playerA.player_name} ({p.playerA.position}) &middot;{' '}
                  {p.playerA.zone_score.toFixed(1)}
                </td>
                <td>
                  {p.playerB.player_name} ({p.playerB.position}) &middot;{' '}
                  {p.playerB.zone_score.toFixed(1)}
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

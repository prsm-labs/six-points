import { useEffect, useMemo, useState } from 'react'
import { useSort, SortTh } from './useSort.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'

// Season-long high-usage red-zone player page (a separate ask from the live Heating Up/On Fire
// tab -- this one's "throughout the season," not live-only). Reuses redzone_touches_per_game,
// already computed by matchup_engine.py's usage_sig pipeline and exported in
// all_matchups_latest.json -- no new data source or pipeline work needed, same "reuse the
// already-computed fields" convention Cheat Sheets follows for its own sections.

export default function RedZoneTab() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [position, setPosition] = useState('all')
  const [team, setTeam] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/data/all_matchups_latest.json')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    return data.matchups.filter((m) => m.redzone_touches_per_game > 0)
  }, [data])

  const teams = useMemo(() => [...new Set(rows.map((r) => r.team))].sort(), [rows])
  const filtered = useMemo(() => {
    return rows
      .filter((r) => position === 'all' || r.position === position)
      .filter((r) => team === 'all' || r.team === team)
      .filter((r) => !search || r.player_name.toLowerCase().includes(search.toLowerCase()))
  }, [rows, position, team, search])

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtered, 'redzone_touches_per_game', 'desc')
  const thProps = { sortKey, sortDir, onSort: toggleSort }

  if (error) {
    return (
      <p className="empty-state">
        No matchup data yet ({error}). Run <code>python matchup_engine.py --season 2026</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!data) return <p className="empty-state">Loading...</p>

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
      <p className="meta-line">
        {sorted.length} of {rows.length} players with a real red-zone touch this season &middot;
        redzone_touches_per_game is the same sample-size-shrunk, season-to-date figure that feeds
        Usage Sig &middot; click a column header to sort
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh label="Player" sortKeyName="player_name" className="sticky-col" {...thProps} />
              <SortTh label="Team" sortKeyName="team" {...thProps} />
              <SortTh label="Opp" sortKeyName="opponent" {...thProps} />
              <SortTh label="Pos" sortKeyName="position" {...thProps} />
              <SortTh label="RZ Touches/G" sortKeyName="redzone_touches_per_game" {...thProps} />
              <SortTh label="Touches/G" sortKeyName="touches_per_game" {...thProps} />
              <SortTh label="Usage Sig" sortKeyName="usage_sig" {...thProps} />
              <SortTh label="gTD" sortKeyName="gtd" {...thProps} />
              <SortTh label="Zone Score" sortKeyName="zone_score" {...thProps} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, i) => (
              <tr key={i}>
                <td className="sticky-col">
                  <div className="player-cell" onClick={() => openPlayerSlide(m)}>
                    <PlayerAvatar playerId={m.player_id} name={m.player_name} />
                    {m.player_name}
                  </div>
                </td>
                <td>
                  <button className="team-link" onClick={() => openTeamSlide({ team: m.team })}>{m.team}</button>
                </td>
                <td>
                  <button className="team-link" onClick={() => openTeamSlide({ team: m.opponent, context: 'defense' })}>{m.opponent}</button>
                </td>
                <td>{m.position}</td>
                <td className="zone-score">{Number(m.redzone_touches_per_game).toFixed(1)}</td>
                <td>{Number(m.touches_per_game).toFixed(1)}</td>
                <td>{Number(m.usage_sig).toFixed(1)}</td>
                <td>{Number(m.gtd).toFixed(1)}</td>
                <td>{Number(m.zone_score).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

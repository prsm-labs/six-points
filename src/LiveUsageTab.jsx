import { useLiveUsage } from './useLiveUsage.js'
import { usePlayerDirectory } from './PlayerDirectory.jsx'
import { openPlayerSlide } from './slideouts.js'

// "Heating Up" / "On Fire" -- live high-usage/TD badges, requested directly against Going
// Yard's own equivalent live signal badges. See useLiveUsage.js for the real data mechanics
// (real touches = carries + targets, real TD count, high-usage is an empirical percentile
// cutoff among currently-live players, "Heating Up" requires an actual real rise between two
// live polls). Not yet verified against a real, extended live game -- same disclosed limitation
// as every other live feature in this app.

function espnIdToPlayerMap(directory) {
  const map = new Map()
  for (const [playerId, info] of Object.entries(directory)) {
    const match = info.stats_url?.match(/\/id\/(\d+)\//)
    if (match) map.set(match[1], { playerId, name: info.name, position: info.position })
  }
  return map
}

function PlayerRow({ p, espnIdToPlayer }) {
  const match = espnIdToPlayer.get(p.athleteId)
  return (
    <tr>
      <td>
        {match ? (
          <button className="team-link" onClick={() => openPlayerSlide({ player_id: match.playerId, player_name: match.name, team: p.team, position: match.position })}>
            {p.name}
          </button>
        ) : p.name}
      </td>
      <td>{p.team}</td>
      <td>{p.game}</td>
      <td>{p.carries}</td>
      <td>{p.targets}</td>
      <td>{p.touches}</td>
      <td>
        {p.totalTds >= 1 && (
          <span className="tier tier-lock">{p.totalTds >= 2 ? `${p.totalTds}x TD` : 'TD'}</span>
        )}
      </td>
      <td>{p.touchesDelta != null && p.touchesDelta > 0 ? `+${p.touchesDelta} since last poll` : '—'}</td>
    </tr>
  )
}

function UsageTable({ rows, espnIdToPlayer, emptyText }) {
  if (rows.length === 0) return <p className="empty-state">{emptyText}</p>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th>Team</th>
            <th>Game</th>
            <th>Car</th>
            <th>Tgt</th>
            <th>Touches</th>
            <th>TD</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => <PlayerRow key={`${p.game}:${p.athleteId}`} p={p} espnIdToPlayer={espnIdToPlayer} />)}
        </tbody>
      </table>
    </div>
  )
}

export default function LiveUsageTab() {
  const { players, liveGameCount, error } = useLiveUsage()
  const directory = usePlayerDirectory()
  const espnIdToPlayer = espnIdToPlayerMap(directory)

  if (error) return <p className="empty-state">Couldn't load live usage ({error}).</p>
  if (players === null) return <p className="empty-state">Checking for live games...</p>
  if (liveGameCount === 0) {
    return <p className="empty-state">No games in progress right now -- Heating Up / On Fire only track real live games.</p>
  }

  const onFire = [...players].filter((p) => p.isOnFire).sort((a, b) => b.totalTds - a.totalTds || b.touches - a.touches)
  const heatingUp = [...players].filter((p) => p.isHeatingUp && !p.isOnFire).sort((a, b) => (b.touchesDelta || 0) - (a.touchesDelta || 0))

  return (
    <div>
      <p className="meta-line">
        {liveGameCount} game{liveGameCount === 1 ? '' : 's'} live right now &middot; polls real ESPN
        box scores every 30s &middot; "On Fire" = high real usage this game (top ~35% by real
        touches) AND at least 1 real TD, multi-TD scorers ranked first &middot; "Heating Up" = high
        real usage whose real touch count rose between the last two live polls
      </p>
      <h3 style={{ margin: '14px 0 6px' }}>On Fire</h3>
      <UsageTable rows={onFire} espnIdToPlayer={espnIdToPlayer} emptyText="No high-usage players with a live TD yet." />
      <h3 style={{ margin: '20px 0 6px' }}>Heating Up</h3>
      <UsageTable rows={heatingUp} espnIdToPlayer={espnIdToPlayer} emptyText="No player's real usage has risen between the last two polls yet." />
    </div>
  )
}

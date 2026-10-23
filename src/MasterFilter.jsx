import { setMasterSearch, setMasterTeam, useMasterSearch, useMasterTeam } from './masterFilter.js'
import { useMatchup } from './MatchupContext.jsx'

// 2026-10-23 (user): the master team + player filter in the header, next to the week picker -- it replaces the per-page search
// boxes and team pickers. Team narrows every page to that team (a game picked in the strip still wins); the search matches
// players by name and teams by code, city or nickname (teamSearch.js) on every list.
const TEAMS = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LA', 'LAC', 'LV', 'MIA',
  'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS']

export default function MasterFilter() {
  const team = useMasterTeam()
  const q = useMasterSearch()
  const { selectedMatchup } = useMatchup()
  return (
    <div className="master-filter">
      <select value={team || ''} onChange={(e) => setMasterTeam(e.target.value)} aria-label="Team" className={team ? 'on' : ''}>
        <option value="">All teams</option>
        {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <input type="search" className={q ? 'on' : ''} value={q} onChange={(e) => setMasterSearch(e.target.value)}
        placeholder="Search a player or team (Kelce, KC, Chiefs)" aria-label="Search players and teams" />
      {(team || q) && <button className="link-btn" onClick={() => { setMasterTeam(null); setMasterSearch('') }}>✕ Clear</button>}
      {team && selectedMatchup && !selectedMatchup.teamOnly && <span className="meta-line small" style={{ margin: 0 }}>(the game picked below wins)</span>}
    </div>
  )
}

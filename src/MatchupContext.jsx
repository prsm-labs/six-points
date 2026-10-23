import { createContext, useContext, useMemo, useState } from 'react'
import { useMasterTeam } from './masterFilter.js'

// Global "selected matchup" -- one shared home/away team pair, settable from the always-visible
// MatchupSelector row (mounted once at the app root, same "one global thing every tab can read"
// pattern as PlayerDirectoryProvider/slideouts.js already use in this app). Any table's own Team
// filter can subscribe via useMatchup() and, when a matchup is selected, show both of those
// teams' rows instead of its own local single-team dropdown -- selecting "NE @ SEA" once here
// cross-filters every wired-in table on every tab to just those two teams' players, without
// re-selecting a team on each page individually.
const MatchupContext = createContext({ selectedMatchup: null, setSelectedMatchup: () => {} })

export function MatchupProvider({ children }) {
  const [selectedMatchup, setSelectedMatchup] = useState(null)
  return (
    <MatchupContext.Provider value={{ selectedMatchup, setSelectedMatchup }}>
      {children}
    </MatchupContext.Provider>
  )
}

// 2026-10-23: with no game picked, the header's team (masterFilter.js) acts as a team-only selection { away: T, home: T,
// teamOnly: true } -- isInSelectedMatchup() then keeps that team's rows on every wired page.
export function useMatchup() {
  const ctx = useContext(MatchupContext)
  const team = useMasterTeam()
  return useMemo(() => (!ctx.selectedMatchup && team ? { ...ctx, selectedMatchup: { away: team, home: team, teamOnly: true } } : ctx), [ctx, team])
}

/** True if `team` is either side of the currently-selected global matchup. */
export function isInSelectedMatchup(selectedMatchup, team) {
  if (!selectedMatchup || !team) return false
  return team === selectedMatchup.home || team === selectedMatchup.away
}

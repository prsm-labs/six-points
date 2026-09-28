import { createContext, useContext, useState } from 'react'

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

export function useMatchup() {
  return useContext(MatchupContext)
}

/** True if `team` is either side of the currently-selected global matchup. */
export function isInSelectedMatchup(selectedMatchup, team) {
  if (!selectedMatchup || !team) return false
  return team === selectedMatchup.home || team === selectedMatchup.away
}

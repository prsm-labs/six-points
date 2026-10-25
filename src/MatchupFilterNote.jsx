import { gamesText, useMatchup } from './MatchupContext.jsx'

// Small shared indicator dropped into any table that's wired to the global matchup selector --
// makes it visible that the local Team dropdown is being overridden, and gives a one-click way
// back to manual control, rather than a silent override that's confusing to notice.
export default function MatchupFilterNote({ message }) {
  const { selectedMatchup, setSelectedMatchup } = useMatchup()
  if (!selectedMatchup || selectedMatchup.teamOnly) return null // the header's team filter shows its own state
  return (
    <p className="meta-line small" style={{ margin: '0 0 8px' }}>
      {selectedMatchup.games ? `Showing ${selectedMatchup.games.length} games: ${gamesText(selectedMatchup)} (multi-select in the game strip)` : message || `Showing ${selectedMatchup.away} @ ${selectedMatchup.home} (global matchup selection active, overriding the Team filter below)`}
      &middot;{' '}
      <button className="team-link" style={{ fontSize: 'inherit' }} onClick={() => setSelectedMatchup(null)}>
        Clear
      </button>
    </p>
  )
}

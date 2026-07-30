import { createContext, useContext, useEffect, useState } from 'react'

// Scoped directory (only players who actually appear in this season's data, ~560 of ~25k --
// see matchup_engine.py's build_player_directory) written to public/data/players.json.
// Loaded once at the app root, shared via context so every tab's table doesn't each fetch it.
const PlayerDirectoryContext = createContext({})

export function PlayerDirectoryProvider({ children }) {
  const [directory, setDirectory] = useState({})

  useEffect(() => {
    fetch('/data/players.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then(setDirectory)
      .catch(() => setDirectory({}))
  }, [])

  return (
    <PlayerDirectoryContext.Provider value={directory}>{children}</PlayerDirectoryContext.Provider>
  )
}

export function usePlayerDirectory() {
  return useContext(PlayerDirectoryContext)
}

function initials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function PlayerAvatar({ playerId, name }) {
  const directory = useContext(PlayerDirectoryContext)
  const entry = directory[playerId]
  const [failed, setFailed] = useState(false)
  const displayName = name || entry?.name || ''
  const headshot = entry?.headshot

  if (!headshot || failed) {
    return <span className="avatar avatar-fallback">{initials(displayName)}</span>
  }

  return (
    <img
      src={headshot}
      alt={displayName}
      className="avatar"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

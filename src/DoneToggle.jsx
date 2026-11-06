import { setDoneOn, useDoneOn, useDoneState } from './doneGames.js'

// 🏁 Hide completed games switch (doneGames.js) -- one line under the game strip on Cheat Sheets / Scouting, only while some
// (not all) of this week's games are final.
export default function DoneToggle() {
  const on = useDoneOn()
  const s = useDoneState()
  if (!(s.final > 0 && s.final < s.games)) return null
  const n = `${s.final} finished game${s.final === 1 ? '' : 's'}`
  return (
    <div className="done-toggle" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '6px 0', fontSize: 13 }}>
      <button className={`pill-btn ${on ? 'active' : ''}`} onClick={() => setDoneOn(!on)}>{on ? '🏁 Hide completed games ✓' : '🏁 Showing completed games'}</button>
      <span style={{ color: 'var(--muted, #8a93a6)' }}>{on ? `${n} hidden (live games stay). Tap to see how they did.` : `${n} shown with their pre-game numbers.`}</span>
    </div>
  )
}

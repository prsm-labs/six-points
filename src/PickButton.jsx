import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PICK_TYPE, PICK_TYPES, removePick, setPick, usePicks } from './picks.js'
import GamblyButton from './GamblyButton.jsx'
import { betLine } from './gambly.js'

// The [+] button that goes next to a player anywhere in the app (Slap Shot's components/PickButton.jsx). The
// category menu renders in a portal so it isn't clipped by .table-wrap's overflow or a slideout panel; it opens
// below the button, or above when there's no room. 2026-10-18: every pick button also carries Slap Shot's Gambly
// button for the page's prop (`prop`: td | td2 | first | yds100; null hides it).
const MENU_W = 200
const pageZoom = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1 // 2026-10-28 big-screen zoom (CSS --z)

export default function PickButton({ player, compact, prop = 'td' }) {
  const picks = usePicks()
  const current = player ? picks[player.player_id] : null
  const type = current ? PICK_TYPE[current.category] : null
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    const onMove = () => setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  if (!player?.player_id) return null

  function toggle(e) {
    e.stopPropagation()
    if (open) return setOpen(false)
    // measured in window pixels; the menu is placed in page pixels (they differ by the big-screen zoom)
    const z = pageZoom(), b = btnRef.current.getBoundingClientRect()
    const r = { left: b.left / z, top: b.top / z, bottom: b.bottom / z }
    const menuH = (PICK_TYPES.length + (current ? 2 : 1)) * 30 + 12
    const left = Math.min(Math.max(8, r.left), window.innerWidth / z - MENU_W - 8)
    const below = r.bottom + 4 + menuH <= window.innerHeight / z
    setPos({ left, top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - menuH) })
    setOpen(true)
  }

  const choose = (key) => {
    if (current?.category === key) removePick(player.player_id)
    else setPick(player, key)
    setOpen(false)
  }

  return (
    <span className="pick-wrap">
      <button
        ref={btnRef}
        className={current ? 'pick-btn picked' : 'pick-btn'}
        onClick={toggle}
        title={type ? `My pick: ${type.label}` : 'Add to My Picks'}
        aria-label={type ? `My pick: ${type.label}` : 'Add to My Picks'}
      >
        {type ? (compact ? type.emoji : `${type.emoji} ${type.label}`) : '＋'}
      </button>
      {prop && <GamblyButton text={betLine(player, prop)} />}
      {open && pos && createPortal(
        <div ref={menuRef} className="pick-menu" style={{ top: pos.top, left: pos.left, width: MENU_W }} onClick={(e) => e.stopPropagation()}>
          <div className="pick-menu-title">{player.player_name}</div>
          {PICK_TYPES.map((t) => (
            <button key={t.key} className={current?.category === t.key ? 'active' : ''} onClick={() => choose(t.key)}>
              {t.emoji} {t.label}{current?.category === t.key ? ' ✓' : ''}
            </button>
          ))}
          {current && (
            <button className="pick-remove" onClick={() => { removePick(player.player_id); setOpen(false) }}>
              ✕ Remove
            </button>
          )}
        </div>,
        document.body
      )}
    </span>
  )
}

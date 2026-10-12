import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PICK_CATEGORIES, setPick, usePicks } from './picks.js'

// The [+] button that goes next to a player anywhere in the app. The category menu renders in a
// portal so it isn't clipped by .table-wrap's overflow or a slideout panel (Slap Shot's approach).
export default function PickButton({ player, compact }) {
  const picks = usePicks()
  const current = player ? picks[player.player_id] : null
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (btnRef.current && btnRef.current.contains(e.target)) return
      if (e.target.closest && e.target.closest('.pick-menu')) return
      setOpen(false)
    }
    const closeOnScroll = () => setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [open])

  if (!player?.player_id) return null
  const label = current ? PICK_CATEGORIES.find((c) => c.id === current.category)?.label : null

  function toggle(e) {
    e.stopPropagation()
    const r = btnRef.current.getBoundingClientRect()
    const width = 170
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) })
    setOpen((o) => !o)
  }

  return (
    <>
      <button
        ref={btnRef}
        className={current ? 'pick-btn picked' : 'pick-btn'}
        onClick={toggle}
        title={current ? `My Pick: ${label}` : 'Add to My Picks'}
        aria-label={current ? `My Pick: ${label}` : 'Add to My Picks'}
      >
        {current ? (compact ? '✓' : `✓ ${label}`) : '+'}
      </button>
      {open && pos && createPortal(
        <div className="pick-menu" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
          <div className="pick-menu-title">{player.player_name}</div>
          {PICK_CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={current?.category === c.id ? 'active' : ''}
              onClick={() => {
                setPick(player, current?.category === c.id ? null : c.id)
                setOpen(false)
              }}
            >
              {c.label}
            </button>
          ))}
          {current && (
            <button className="pick-remove" onClick={() => { setPick(player, null); setOpen(false) }}>
              Remove pick
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  )
}

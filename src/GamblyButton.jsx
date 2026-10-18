import { useState } from 'react'
import { gamblyUrl } from './gambly.js'

// [G] button (Slap Shot's components/GamblyButton.jsx): copies `text` and opens Gambly's chat with it typed in.
// compact = logo only (tables). Never opens a slideout / row underneath (stopPropagation).
export default function GamblyButton({ text, compact = true, label = 'Gambly', title }) {
  const [done, setDone] = useState(false)
  if (!text) return null
  const go = async (e) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch {
      /* clipboard blocked: the bet is still typed into Gambly */
    }
    window.open(gamblyUrl(text), '_blank', 'noopener,noreferrer')
  }
  const tip = title || `Gambly: copies "${text.split('\n').join(' · ')}" and opens Gambly with it typed in`
  return (
    <button type="button" className={compact ? 'gambly-btn compact' : 'gambly-btn'} onClick={go} title={tip} aria-label={tip}>
      <img src="/brand/gambly.png" alt="" width={compact ? 12 : 14} height={compact ? 12 : 14} />
      {done ? '✓' : compact ? null : label}
    </button>
  )
}

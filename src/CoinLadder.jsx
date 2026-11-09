import { useState } from 'react'
import { betKey, gameOfTeam, isOpenPick, laddersOf, ticket, toggleSlip, useSlip, useWeek } from './coins.js'
import { tabRequest } from './nav.js'
import { closePlayerSlide } from './slideouts.js'
import Fold from './Fold.jsx'
import './Coins.css'

// 🪙 Degen Picks from the player slideout (2026-11-09, user: pick from Scouting without crowding the lists). One folded line; open it for
// his priced lines (this week's line board, the Risk Slider's numbers) as chips -- tap to put a line on the shared slip, tap again to remove.
export default function CoinLadder({ playerId }) {
  const wk = useWeek()
  const slip = useSlip()
  const [stat, setStat] = useState('TD')
  const lp = wk?.lines?.players?.find((x) => x.id === playerId)
  if (!wk || !lp || !wk.active.has(playerId)) return null
  const lad = laddersOf(lp)
  if (!Object.keys(lad).length) return null
  const open = isOpenPick(gameOfTeam(wk, lp.team)?.kickoff)
  const mine = slip.filter((t) => t.playerId === playerId)
  const st = lad[stat] ? stat : Object.keys(lad)[0]
  const ladder = (lad[st] || []).filter(([, ch]) => ch >= 0.05 && ch <= 0.95)
  const goSlip = () => { closePlayerSlide(); tabRequest.set({ tab: 'coins', at: Date.now() }) }
  return (
    <div className="slideout-section">
      <Fold more="Pick 🔻" less="Close 🔺" summary={<span>🪙 <b>Degen Picks</b> <span className="dp-muted dp-small">{!open ? '· his game has kicked off' : mine.length ? `· ${mine.length} of his on your slip` : '· add his lines to your slip'}</span></span>}>
        {open ? <>
          <div className="cl-stats">{['TD', 'YDS'].filter((k) => lad[k]).map((k) => <button key={k} type="button" className={`pill-btn ${st === k ? 'active' : ''}`} onClick={() => setStat(k)}>{k === 'TD' ? 'TD' : 'Yards'}</button>)}</div>
          <div className="cl-chips">
            {ladder.map(([T, ch]) => {
              const t = ticket(wk, lp, st, T, ch)
              const on = t && slip.some((x) => betKey(x) === betKey(t))
              return <button key={T} type="button" className={`cl-chip ${on ? 'on' : ''}`} disabled={!t} onClick={() => toggleSlip(t)} title={on ? 'On your slip: tap to remove' : 'Add to your Degen Picks slip'}><b>{st === 'TD' ? (T === 1 ? 'TD' : `${T}+ TD`) : `${T}+`}</b><span>{Math.round(ch * 100)}%</span></button>
            })}
            {!ladder.length && <span className="dp-muted dp-small">No priced lines for this stat.</span>}
          </div>
          <div className="dp-muted dp-small" style={{ marginTop: 6 }}>Our chance at each line (the Risk Slider's numbers). {slip.length > 0 && <button type="button" className="dp-link" onClick={goSlip}>Open your slip ({slip.length}) →</button>}</div>
        </> : <div className="dp-muted dp-small">Picks close at kickoff.</div>}
      </Fold>
    </div>
  )
}

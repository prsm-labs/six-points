import { useState } from 'react'
import LiveThemes from './LiveThemes.jsx'
import BoxScoreTab from './BoxScoreTab.jsx'
import InactivesTab from './InactivesTab.jsx'
import ScheduleTab from './ScheduleTab.jsx'
import LiveUsageTab from './LiveUsageTab.jsx'

// Live sub-nav: Schedule (item 9 -- a forward-looking week-by-week browse of the full real
// schedule), Themes (gap-based scoring-play clustering), Box Scores (real ESPN team + player
// box scores), Inactives (the weekly injury report), Heating Up (real live high-usage/TD
// badges, GoingYardParity.md follow-up request). Live Sim was scoped out as a bigger lift,
// lower priority than the rest of this batch.
export default function LiveTab() {
  const [sub, setSub] = useState('schedule')

  return (
    <div>
      <div className="sub-tabs">
        <button className={sub === 'schedule' ? 'active' : ''} onClick={() => setSub('schedule')}>
          Schedule
        </button>
        <button className={sub === 'themes' ? 'active' : ''} onClick={() => setSub('themes')}>
          Themes
        </button>
        <button className={sub === 'boxscores' ? 'active' : ''} onClick={() => setSub('boxscores')}>
          Box Scores
        </button>
        <button className={sub === 'inactives' ? 'active' : ''} onClick={() => setSub('inactives')}>
          Inactives
        </button>
        <button className={sub === 'heatingup' ? 'active' : ''} onClick={() => setSub('heatingup')}>
          Heating Up
        </button>
      </div>
      {sub === 'schedule' && <ScheduleTab onViewBoxScore={() => setSub('boxscores')} />}
      {sub === 'themes' && <LiveThemes />}
      {sub === 'boxscores' && <BoxScoreTab />}
      {sub === 'inactives' && <InactivesTab />}
      {sub === 'heatingup' && <LiveUsageTab />}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useWeekTDs } from './useWeekTDs.js'

// Compact always-visible scrolling strip, mounted globally (below the header, above the tab
// content) -- mirrors Going Yard's HRTicker mounting near the top of the app rather than being
// buried inside one tab. Clicking it jumps to the TD Tracker tab.
//
// Same honest caveat as everywhere else touching live data: there's no live 2026 game to tick
// through right now, so this shows the most recently scored week's real TDs (2025 backtest) as
// a demonstration of the real, working data path -- not a genuinely live-updating ticker until
// the 2026 season starts.

export default function TDMarquee({ onClick }) {
  const [schedule, setSchedule] = useState(null)
  const [teamStats, setTeamStats] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/data/season_schedule.json').then((r) => (r.ok ? r.json() : null)),
      fetch('/data/team_stats.json').then((r) => (r.ok ? r.json() : {})),
    ]).then(([sched, stats]) => {
      setSchedule(sched)
      setTeamStats(stats)
    })
  }, [])

  const { tds } = useWeekTDs(schedule?.latest_week, schedule?.games, teamStats)

  if (!tds || tds.length === 0) {
    return (
      <div className="ticker-wrap" onClick={onClick}>
        <div className="ticker-label">🏈 TD</div>
        <span className="meta-line" style={{ margin: '0 14px' }}>
          {tds === null ? 'Loading recent touchdowns...' : 'No touchdowns to show yet.'} · click for TD Tracker
        </span>
      </div>
    )
  }

  const items = [...tds, ...tds]
  const speed = Math.max(tds.length * 6, 30)

  return (
    <div className="ticker-wrap" onClick={onClick}>
      <div className="ticker-label">🏈 TD</div>
      <div style={{ overflow: 'hidden', flex: 1 }}>
        <div className="ticker-track" style={{ animationDuration: `${speed}s` }}>
          {items.map((td, i) => (
            <div className="ticker-item" key={i}>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>🏈</span>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{td.scorerName}</span>
              <span className="meta-line" style={{ margin: 0 }}>({td.teamAbbr})</span>
              <span>{td.tdTypeLabel}</span>
              {td.yards != null && <span style={{ color: 'var(--accent)' }}>{td.yards}yd</span>}
              <span className="meta-line" style={{ margin: 0 }}>{td.game}</span>
              <span className="ticker-sep">·</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useWeekTDs } from './useWeekTDs.js'

// Compact always-visible scrolling strip, mounted globally (below the header, above the tab
// content) so it's always on screen rather than buried inside one tab. Clicking it jumps to the
// TD Tracker tab. Styled like a real stadium scoreboard/stock ticker: fixed dark panel + a
// monospace font, independent of the app's own light/dark theme (see the ticker-* rules in
// App.css) -- so its text colors here are hardcoded to that dark panel, not the theme's
// `--muted`/`meta-line` tokens, which would go dark-on-dark in light mode.
//
// Same honest caveat as everywhere else touching live data: there's no live 2026 game to tick
// through right now, so this shows the most recently scored week's real TDs (2025 backtest) as
// a demonstration of the real, working data path -- not a genuinely live-updating ticker until
// the 2026 season starts.

const DIM = '#4f8f68'

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
        <span style={{ margin: '0 14px', color: DIM }}>
          {tds === null ? 'LOADING RECENT TOUCHDOWNS...' : 'NO TOUCHDOWNS TO SHOW YET.'} &middot; CLICK FOR TD TRACKER
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
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{td.scorerName.toUpperCase()}</span>
              <span style={{ color: DIM }}>({td.teamAbbr})</span>
              <span>{td.tdTypeLabel.toUpperCase()}</span>
              {td.yards != null && <span style={{ color: 'var(--accent)' }}>{td.yards}YD</span>}
              <span style={{ color: DIM }}>{td.game}</span>
              <span className="ticker-sep">&middot;</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

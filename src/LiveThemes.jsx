import { useEffect, useRef, useState } from 'react'
import { isTouchdown } from './scoringPlays.js'

// No live games exist right now -- the 2026 season doesn't start until 2026-09-09 (concept
// doc's own §9 caveat). This tab has two modes: "Live" (polls /api/scoreboard + /api/summary,
// will do nothing until real games exist) and "Replay" (walks through a REAL completed game's
// actual scoring-play sequence, timed to arrive one at a time, to prove the polling/clustering/
// notification code paths work correctly before there's anything live to test against). Replay
// uses the 2025 season finale (event 401772988, SEA 29 @ NE 13, verified live 2026-07-29) --
// real data, not synthetic.
const REPLAY_EVENT_ID = '401772988'
const CLUSTER_GAP_SECONDS = 180 // scoring plays within 3 game-minutes of each other = one "theme"

function parseClockToElapsed(period, clockDisplay) {
  const [mm, ss] = (clockDisplay || '0:00').split(':').map(Number)
  const remaining = mm * 60 + (ss || 0)
  return (period - 1) * 900 + (900 - remaining)
}

function clusterPlays(plays) {
  const sorted = plays
    .map((p) => ({
      ...p,
      elapsed: parseClockToElapsed(p.period?.number || 1, p.clock?.displayValue),
      text: p.text || '',
      isTd: isTouchdown(p),
    }))
    .sort((a, b) => a.elapsed - b.elapsed)

  const themes = []
  let current = null
  for (const play of sorted) {
    if (current && play.elapsed - current.lastElapsed <= CLUSTER_GAP_SECONDS) {
      current.plays.push(play)
      current.lastElapsed = play.elapsed
    } else {
      current = { plays: [play], lastElapsed: play.elapsed }
      themes.push(current)
    }
  }
  return themes
}

async function fetchSummary(eventId) {
  const proxied = await fetch(`/api/summary?event=${eventId}`).catch(() => null)
  if (proxied && proxied.ok) return proxied.json()
  // Local `vite dev` doesn't run Vercel serverless functions -- fall back to calling ESPN
  // directly for local testing. ESPN's site API already sends Access-Control-Allow-Origin: *
  // (verified live), so this works from a browser without a proxy; the /api/summary function
  // still exists for production (adds caching, insulates the frontend from ESPN changes).
  const direct = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`
  )
  const data = await direct.json()
  return { scoringPlays: data.scoringPlays || [] }
}

function notify(title, body) {
  if (typeof Notification === 'undefined') return
  if (Notification.permission === 'granted') {
    new Notification(title, { body })
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission()
  }
}

export default function LiveThemes() {
  const [mode, setMode] = useState('replay')
  const [revealed, setRevealed] = useState([])
  const [allPlays, setAllPlays] = useState(null)
  const [error, setError] = useState(null)
  const [notifLog, setNotifLog] = useState([])
  const timerRef = useRef(null)

  useEffect(() => {
    setRevealed([])
    setAllPlays(null)
    setError(null)
    setNotifLog([])
    clearInterval(timerRef.current)

    fetchSummary(REPLAY_EVENT_ID)
      .then((data) => setAllPlays(data.scoringPlays))
      .catch((e) => setError(e.message))

    return () => clearInterval(timerRef.current)
  }, [mode])

  useEffect(() => {
    if (!allPlays) return
    if (mode !== 'replay') return
    let i = 0
    timerRef.current = setInterval(() => {
      if (i >= allPlays.length) {
        clearInterval(timerRef.current)
        return
      }
      const play = allPlays[i]
      setRevealed((prev) => [...prev, play])
      if (isTouchdown(play)) {
        const msg = `Breakout Alert: ${play.text}`
        setNotifLog((prev) => [...prev, msg])
        notify('Six Points -- Breakout Alert', play.text)
      }
      i += 1
    }, 1500)
    return () => clearInterval(timerRef.current)
  }, [allPlays, mode])

  const themes = clusterPlays(mode === 'replay' ? revealed : allPlays || [])

  if (error) {
    return <p className="empty-state">Couldn't load scoring plays ({error}).</p>
  }

  return (
    <div>
      <div className="sub-tabs">
        <button className={mode === 'replay' ? 'active' : ''} onClick={() => setMode('replay')}>
          Replay (2025 season finale)
        </button>
        <button className={mode === 'live' ? 'active' : ''} onClick={() => setMode('live')}>
          Live (no games in-season yet)
        </button>
      </div>

      {mode === 'replay' && (
        <p className="meta-line">
          Replaying SEA @ NE's real scoring sequence, one play every 1.5s, to prove the
          gap-based clustering and Breakout Alert notification logic works -- since there are no
          real live games to test against right now (season starts 2026-09-09). This exact code
          path will run against genuinely live data once the season starts; nothing here changes
          at that point, only the data source does.
        </p>
      )}
      {mode === 'live' && (
        <p className="empty-state">
          No live games right now -- 2026 season starts 2026-09-09. This mode polls
          /api/scoreboard + /api/summary for today's real games once the season is underway.
        </p>
      )}

      {mode === 'replay' && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Theme</th>
                  <th>Plays</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {themes.map((theme, i) => (
                  <tr key={i}>
                    <td>
                      {theme.plays.length > 1 ? (
                        <span className="tier tier-lock">Flurry x{theme.plays.length}</span>
                      ) : (
                        <span className="tier tier-fringe">Isolated</span>
                      )}
                    </td>
                    <td>{theme.plays.map((p) => p.text).join(' | ')}</td>
                    <td>
                      {theme.plays[theme.plays.length - 1].awayScore} -{' '}
                      {theme.plays[theme.plays.length - 1].homeScore}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {notifLog.length > 0 && (
            <>
              <p className="meta-line small">Notification log (this session):</p>
              <ul className="notif-log">
                {notifLog.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
